from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.farmer import Farmer
from app.models.all_models import Crop, Farm, YieldReport, Prediction
import uuid
import numpy as np
import pickle
import os
from app.core.config import settings


router = APIRouter()


class YieldPredictionRequest(BaseModel):
    crop_id: str
    farm_id: Optional[str] = None
    area_acres: float = Field(..., gt=0)
    temperature: float
    humidity: float
    rainfall: float
    ph: float
    nitrogen: float
    irrigation_used: bool = False
    fertilizer_applied: Optional[str] = None
    season: str
    year: int


class YieldPredictionResponse(BaseModel):
    expected_yield: float
    yield_per_acre: float
    total_yield: float
    confidence: float
    risk_score: float
    risk_level: str
    revenue_estimate: float
    cost_estimate: float
    profit_estimate: float
    roi_estimate: float
    recommendations: List[str]
    recommendations_bn: List[str]


def load_yield_model():
    model_path = settings.YIELD_MODEL_PATH
    if os.path.exists(model_path):
        with open(model_path, "rb") as f:
            return pickle.load(f)
    return None


def predict_yield_rules(crop_name: str, data: YieldPredictionRequest) -> dict:
    base_yields = {
        "rice": 2.5, "wheat": 1.8, "jute": 8.0, "potato": 12.0,
        "onion": 8.0, "tomato": 10.0, "chili": 3.0, "mango": 15.0,
        "banana": 20.0, "sugarcane": 25.0, "mustard": 1.2, "lentil": 1.0,
    }

    base = base_yields.get(crop_name.lower(), 2.0)
    factor = 1.0

    if 20 <= data.temperature <= 30:
        factor *= 1.1
    elif data.temperature < 10 or data.temperature > 40:
        factor *= 0.7

    if 50 <= data.humidity <= 80:
        factor *= 1.05
    elif data.humidity < 30 or data.humidity > 95:
        factor *= 0.85

    if data.rainfall > 100:
        factor *= 1.1
    elif data.rainfall < 30:
        factor *= 0.8

    if 6.0 <= data.ph <= 7.5:
        factor *= 1.1
    elif data.ph < 5.0 or data.ph > 8.5:
        factor *= 0.7

    if data.irrigation_used:
        factor *= 1.15

    if data.nitrogen > 40:
        factor *= 1.1
    elif data.nitrogen < 15:
        factor *= 0.85

    yield_per_acre = round(base * factor, 4)
    total_yield = round(yield_per_acre * data.area_acres, 4)

    confidence = 0.75
    if data.irrigation_used:
        confidence += 0.05
    if data.nitrogen > 30:
        confidence += 0.05
    confidence = min(confidence, 0.95)

    risk_score = 0
    if data.temperature < 10 or data.temperature > 40:
        risk_score += 30
    if data.rainfall < 20:
        risk_score += 25
    if data.ph < 5.0 or data.ph > 8.5:
        risk_score += 20
    if data.humidity > 95:
        risk_score += 15

    risk_level = "low"
    if risk_score > 50:
        risk_level = "high"
    elif risk_score > 25:
        risk_level = "medium"

    return {
        "yield_per_acre": yield_per_acre,
        "total_yield": total_yield,
        "confidence": confidence,
        "risk_score": risk_score,
        "risk_level": risk_level,
    }


@router.post("/predict", response_model=YieldPredictionResponse)
async def predict_yield(
    request: YieldPredictionRequest,
    db: AsyncSession = Depends(get_db),
    current_user: Farmer = Depends(get_current_user),
):
    result = await db.execute(select(Crop).where(Crop.id == request.crop_id))
    crop = result.scalar_one_or_none()
    if not crop:
        raise HTTPException(status_code=404, detail="Crop not found")

    prediction = predict_yield_rules(crop.name, request)

    avg_price = float(crop.avg_price_per_kg or 20)
    revenue = round(prediction["total_yield"] * avg_price, 2)
    cost_per_acre = 15000
    if data.irrigation_used:
        cost_per_acre += 5000
    total_cost = round(cost_per_acre * request.area_acres, 2)
    profit = round(revenue - total_cost, 2)
    roi = round((profit / total_cost) * 100, 2) if total_cost > 0 else 0

    recommendations = [
        "Use balanced fertilizer for optimal yield",
        "Ensure proper water management",
        "Monitor for pest and disease regularly",
        "Apply organic matter to improve soil health",
    ]
    recommendations_bn = [
        "সেরা ফলনের জন্য সুষম সার ব্যবহার করুন",
        "যথাযথ জল ব্যবস্থাপনা নিশ্চিত করুন",
        "কীটপতঙ্গ এবং রোগ নিয়মিত পর্যবেক্ষণ করুন",
        "মাটির স্বাস্থ্য উন্নত করতে জৈব পদার্থ প্রয়োগ করুন",
    ]

    prediction_record = Prediction(
        id=uuid.uuid4(),
        farmer_id=current_user.id,
        farm_id=uuid.UUID(request.farm_id) if request.farm_id else None,
        prediction_type="yield_prediction",
        input_data=request.dict(),
        output_data=prediction,
        confidence_score=prediction["confidence"],
        model_name="rule_based_yield",
    )
    db.add(prediction_record)
    await db.commit()

    return YieldPredictionResponse(
        expected_yield=prediction["total_yield"],
        yield_per_acre=prediction["yield_per_acre"],
        total_yield=prediction["total_yield"],
        confidence=prediction["confidence"],
        risk_score=prediction["risk_score"],
        risk_level=prediction["risk_level"],
        revenue_estimate=revenue,
        cost_estimate=total_cost,
        profit_estimate=profit,
        roi_estimate=roi,
        recommendations=recommendations,
        recommendations_bn=recommendations_bn,
    )


@router.get("/history")
async def get_yield_history(
    farm_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: Farmer = Depends(get_current_user),
):
    query = select(YieldReport).where(YieldReport.farmer_id == current_user.id)
    if farm_id:
        query = query.where(YieldReport.farm_id == farm_id)
    query = query.order_by(YieldReport.created_at.desc()).limit(20)

    result = await db.execute(query)
    reports = result.scalars().all()

    return {"yields": [
        {
            "id": str(r.id),
            "crop_id": str(r.crop_id),
            "season": r.season,
            "year": r.year,
            "area_acres": float(r.area_acres),
            "yield_per_acre": float(r.yield_per_acre or 0),
            "revenue": float(r.total_revenue or 0),
            "profit": float(r.profit or 0),
        }
        for r in reports
    ]}
