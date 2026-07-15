from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional, List
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.farmer import Farmer
from app.models.all_models import Crop, Farm, FarmCropHistory
import pickle
import os
from app.core.config import settings
import numpy as np


router = APIRouter()


class CropRecommendationRequest(BaseModel):
    farm_id: Optional[str] = None
    temperature: float
    humidity: float
    rainfall: float
    ph: float
    nitrogen: float
    phosphorus: float
    potassium: float
    season: str
    soil_type: Optional[str] = None
    area_acres: Optional[float] = None


class CropRecommendation(BaseModel):
    id: str
    name: str
    name_bn: str
    category: str
    confidence: float
    water_requirement_mm: float
    profit_score: float
    growing_season: str
    growth_duration_days: int
    expected_yield_per_acre: float
    avg_price_per_kg: float


class CropRecommendationResponse(BaseModel):
    recommendations: List[CropRecommendation]
    model_used: str
    input_summary: dict


def load_crop_model():
    model_path = settings.CROP_MODEL_PATH
    if os.path.exists(model_path):
        with open(model_path, "rb") as f:
            return pickle.load(f)
    return None


def predict_with_rules(data: CropRecommendationRequest) -> List[dict]:
    predictions = []

    crop_conditions = {
        "rice": {"temp": (20, 35), "rain": (100, 300), "ph": (5.5, 7.0), "season": ["kharif", "boro"]},
        "wheat": {"temp": (10, 25), "rain": (30, 100), "ph": (6.0, 7.5), "season": ["rabi"]},
        "jute": {"temp": (25, 35), "rain": (150, 250), "ph": (6.0, 7.5), "season": ["kharif"]},
        "potato": {"temp": (15, 25), "rain": (50, 100), "ph": (5.0, 6.5), "season": ["rabi"]},
        "onion": {"temp": (15, 25), "rain": (30, 80), "ph": (6.0, 7.0), "season": ["rabi"]},
        "tomato": {"temp": (20, 30), "rain": (40, 80), "ph": (6.0, 7.0), "season": ["rabi", "kharif"]},
        "chili": {"temp": (20, 30), "rain": (40, 80), "ph": (6.0, 7.0), "season": ["rabi"]},
        "mango": {"temp": (24, 30), "rain": (75, 200), "ph": (5.5, 7.5), "season": ["perennial"]},
        "litchi": {"temp": (20, 30), "rain": (100, 200), "ph": (6.0, 7.0), "season": ["perennial"]},
        "banana": {"temp": (25, 35), "rain": (100, 250), "ph": (6.0, 7.5), "season": ["perennial"]},
        "sugarcane": {"temp": (20, 35), "rain": (100, 180), "ph": (6.0, 7.5), "season": ["kharif"]},
        "mustard": {"temp": (10, 25), "rain": (30, 80), "ph": (6.0, 7.5), "season": ["rabi"]},
        "lentil": {"temp": (15, 25), "rain": (30, 80), "ph": (6.0, 7.5), "season": ["rabi"]},
        "groundnut": {"temp": (25, 30), "rain": (50, 100), "ph": (6.0, 7.0), "season": ["kharif"]},
        "sesame": {"temp": (25, 35), "rain": (50, 100), "ph": (5.5, 8.0), "season": ["kharif"]},
    }

    crop_scores = {}
    for crop_name, conditions in crop_conditions.items():
        score = 0
        max_score = 0

        temp_min, temp_max = conditions["temp"]
        max_score += 25
        if temp_min <= data.temperature <= temp_max:
            score += 25
        elif temp_min - 5 <= data.temperature <= temp_max + 5:
            score += 15

        rain_min, rain_max = conditions["rain"]
        max_score += 25
        if rain_min <= data.rainfall <= rain_max:
            score += 25
        elif rain_min * 0.5 <= data.rainfall <= rain_max * 1.5:
            score += 12

        ph_min, ph_max = conditions["ph"]
        max_score += 20
        if ph_min <= data.ph <= ph_max:
            score += 20
        elif ph_min - 0.5 <= data.ph <= ph_max + 0.5:
            score += 10

        max_score += 15
        if data.season.lower() in [s.lower() for s in conditions["season"]]:
            score += 15
        elif "perennial" in [s.lower() for s in conditions["season"]]:
            score += 10

        max_score += 15
        if data.nitrogen > 30:
            score += 15
        elif data.nitrogen > 15:
            score += 8

        crop_scores[crop_name] = (score / max_score) * 100

    sorted_crops = sorted(crop_scores.items(), key=lambda x: x[1], reverse=True)
    return sorted_crops[:5]


@router.post("/recommend", response_model=CropRecommendationResponse)
async def recommend_crops(
    request: CropRecommendationRequest,
    db: AsyncSession = Depends(get_db),
    current_user: Farmer = Depends(get_current_user),
):
    model = load_crop_model()
    model_used = "rule_based"

    if model:
        try:
            features = np.array([[
                request.temperature, request.humidity, request.rainfall,
                request.ph, request.nitrogen, request.phosphorus, request.potassium,
            ]])
            model_predictions = model.predict(features)
            model_used = "ml_model"
        except Exception:
            model_predictions = None

    rule_based = predict_with_rules(request)

    result = await db.execute(select(Crop).where(Crop.is_active == True))
    all_crops = {c.name.lower(): c for c in result.scalars().all()}

    recommendations = []
    for crop_name, score in rule_based:
        crop_data = all_crops.get(crop_name)
        if crop_data:
            recommendations.append(CropRecommendation(
                id=str(crop_data.id),
                name=crop_data.name,
                name_bn=crop_data.name_bn,
                category=crop_data.category,
                confidence=round(score / 100, 4),
                water_requirement_mm=float(crop_data.water_requirement_mm or 0),
                profit_score=round(score * 0.8, 2),
                growing_season=crop_data.growing_season,
                growth_duration_days=crop_data.growth_duration_days or 0,
                expected_yield_per_acre=float(crop_data.avg_yield_per_acre or 0),
                avg_price_per_kg=float(crop_data.avg_price_per_kg or 0),
            ))

    return CropRecommendationResponse(
        recommendations=recommendations,
        model_used=model_used,
        input_summary={
            "temperature": request.temperature,
            "humidity": request.humidity,
            "rainfall": request.rainfall,
            "ph": request.ph,
            "season": request.season,
        },
    )


@router.get("/")
async def list_crops(
    category: Optional[str] = None,
    season: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: Farmer = Depends(get_current_user),
):
    query = select(Crop).where(Crop.is_active == True)
    if category:
        query = query.where(Crop.category == category)
    if season:
        query = query.where(Crop.growing_season == season)

    result = await db.execute(query)
    crops = result.scalars().all()

    return {"crops": [
        {
            "id": str(c.id),
            "name": c.name,
            "name_bn": c.name_bn,
            "category": c.category,
            "season": c.growing_season,
            "growth_days": c.growth_duration_days,
            "avg_yield": float(c.avg_yield_per_acre or 0),
            "avg_price": float(c.avg_price_per_kg or 0),
        }
        for c in crops
    ]}


@router.get("/{crop_id}")
async def get_crop_detail(
    crop_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Farmer = Depends(get_current_user),
):
    result = await db.execute(select(Crop).where(Crop.id == crop_id))
    crop = result.scalar_one_or_none()
    if not crop:
        raise HTTPException(status_code=404, detail="Crop not found")

    return {
        "id": str(crop.id),
        "name": crop.name,
        "name_bn": crop.name_bn,
        "category": crop.category,
        "season": crop.growing_season,
        "temp_range": f"{crop.min_temp}°C - {crop.max_temp}°C",
        "rainfall_range": f"{crop.min_rainfall_mm}mm - {crop.max_rainfall_mm}mm",
        "ph_range": f"{crop.min_ph} - {crop.max_ph}",
        "growth_days": crop.growth_duration_days,
        "water_requirement": float(crop.water_requirement_mm or 0),
        "avg_yield_per_acre": float(crop.avg_yield_per_acre or 0),
        "avg_price_per_kg": float(crop.avg_price_per_kg or 0),
        "description": crop.description,
        "description_bn": crop.description_bn,
    }


@router.post("/rotation-advice")
async def get_crop_rotation(
    farm_id: str,
    season: str,
    db: AsyncSession = Depends(get_db),
    current_user: Farmer = Depends(get_current_user),
):
    result = await db.execute(
        select(FarmCropHistory)
        .where(FarmCropHistory.farm_id == farm_id)
        .order_by(FarmCropHistory.year.desc(), FarmCropHistory.season.desc())
        .limit(4)
    )
    history = result.scalars().all()

    previous_crops = [h.crop_id for h in history]
    result2 = await db.execute(select(Crop).where(Crop.is_active == True))
    all_crops = result2.scalars().all()

    recommendations = []
    for crop in all_crops:
        if crop.id not in previous_crops:
            recommendations.append({
                "name": crop.name,
                "name_bn": crop.name_bn,
                "reason": "Different from recently grown crops - improves soil health",
                "reason_bn": "সম্প্রতি চাষ করা ফসলের চেয়ে আলাদা - মাটির স্বাস্থ্য উন্নত করে",
            })

    return {
        "farm_id": farm_id,
        "season": season,
        "previous_crops": [str(c) for c in previous_crops],
        "recommendations": recommendations[:5],
    }
