from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, date
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.farmer import Farmer
from app.models.all_models import SatelliteData, Farm
from app.models.district import District
import uuid


router = APIRouter()


class SatelliteDataResponse(BaseModel):
    farm_id: Optional[str]
    district: Optional[str]
    capture_date: str
    ndvi: float
    ndwi: Optional[float]
    evi: Optional[float]
    soil_moisture: Optional[float]
    land_surface_temp: Optional[float]
    vegetation_health: str
    stress_level: Optional[str]
    source: str


class NDVIAnalysisResponse(BaseModel):
    farm_id: str
    current_ndvi: float
    previous_ndvi: Optional[float]
    ndvi_trend: str
    vegetation_health: str
    vegetation_health_bn: str
    stress_areas: List[dict]
    recommendations: List[str]
    recommendations_bn: List[str]


@router.get("/ndvi/{farm_id}", response_model=NDVIAnalysisResponse)
async def get_ndvi_analysis(
    farm_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Farmer = Depends(get_current_user),
):
    result = await db.execute(
        select(SatelliteData)
        .where(SatelliteData.farm_id == farm_id)
        .order_by(SatelliteData.capture_date.desc())
        .limit(10)
    )
    data = result.scalars().all()

    if not data:
        current_ndvi = 0.65
        previous_ndvi = None
    else:
        current_ndvi = float(data[0].ndvi or 0.65)
        previous_ndvi = float(data[1].ndvi) if len(data) > 1 else None

    if previous_ndvi:
        ndvi_trend = "increasing" if current_ndvi > previous_ndvi else "decreasing"
    else:
        ndvi_trend = "stable"

    if current_ndvi > 0.7:
        health = "excellent"
        health_bn = "সেরা"
    elif current_ndvi > 0.5:
        health = "good"
        health_bn = "ভালো"
    elif current_ndvi > 0.3:
        health = "moderate"
        health_bn = "মাঝারি"
    else:
        health = "poor"
        health_bn = "খারাপ"

    stress_areas = []
    if current_ndvi < 0.3:
        stress_areas.append({
            "type": "vegetation_stress",
            "severity": "high",
            "message": "Significant vegetation stress detected",
            "message_bn": "উল্লেখযোগ্য উদ্ভিদ চাপ সনাক্ত হয়েছে",
        })

    recommendations = [
        "Monitor vegetation health regularly using satellite data",
        "Apply irrigation if vegetation stress is detected",
        "Consider soil testing for nutrient deficiencies",
    ]
    recommendations_bn = [
        "স্যাটেলাইট ডেটা ব্যবহার করে নিয়মিত উদ্ভিদ স্বাস্থ্য পর্যবেক্ষণ করুন",
        "উদ্ভিদ চাপ সনাক্ত হলে সেচ প্রয়োগ করুন",
        "পুষ্টি ঘাটতির জন্য মাটি পরীক্ষা বিবেচনা করুন",
    ]

    return NDVIAnalysisResponse(
        farm_id=farm_id,
        current_ndvi=current_ndvi,
        previous_ndvi=previous_ndvi,
        ndvi_trend=ndvi_trend,
        vegetation_health=health,
        vegetation_health_bn=health_bn,
        stress_areas=stress_areas,
        recommendations=recommendations,
        recommendations_bn=recommendations_bn,
    )


@router.get("/farm/{farm_id}")
async def get_satellite_data(
    farm_id: str,
    days: int = 30,
    db: AsyncSession = Depends(get_db),
    current_user: Farmer = Depends(get_current_user),
):
    from datetime import timedelta
    start_date = date.today() - timedelta(days=days)

    result = await db.execute(
        select(SatelliteData)
        .where(
            SatelliteData.farm_id == farm_id,
            SatelliteData.capture_date >= start_date,
        )
        .order_by(SatelliteData.capture_date.desc())
    )
    data = result.scalars().all()

    return {"satellite_data": [
        {
            "date": str(d.capture_date),
            "ndvi": float(d.ndvi) if d.ndvi else None,
            "ndwi": float(d.ndwi) if d.ndwi else None,
            "soil_moisture": float(d.soil_moisture) if d.soil_moisture else None,
            "vegetation_health": d.vegetation_health,
            "source": d.source,
        }
        for d in data
    ]}


@router.get("/district/{district_id}")
async def get_district_satellite_summary(
    district_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Farmer = Depends(get_current_user),
):
    result = await db.execute(
        select(SatelliteData)
        .where(SatelliteData.district_id == district_id)
        .order_by(SatelliteData.capture_date.desc())
        .limit(100)
    )
    data = result.scalars().all()

    if not data:
        return {"district_id": district_id, "summary": "No satellite data available"}

    ndvi_values = [float(d.ndvi) for d in data if d.ndvi]
    avg_ndvi = sum(ndvi_values) / len(ndvi_values) if ndvi_values else 0

    return {
        "district_id": district_id,
        "data_points": len(data),
        "avg_ndvi": round(avg_ndvi, 4),
        "vegetation_health": "good" if avg_ndvi > 0.5 else "moderate" if avg_ndvi > 0.3 else "poor",
    }
