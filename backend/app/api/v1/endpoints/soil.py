from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.farmer import Farmer
from app.models.all_models import SoilReport, Crop
import uuid


router = APIRouter()


class SoilAnalysisRequest(BaseModel):
    farm_id: str
    ph_level: float = Field(..., ge=0, le=14)
    nitrogen_mg_kg: Optional[float] = None
    phosphorus_mg_kg: Optional[float] = None
    potassium_mg_kg: Optional[float] = None
    organic_matter_pct: Optional[float] = None
    moisture_pct: Optional[float] = None
    electrical_conductivity: Optional[float] = None
    soil_type: Optional[str] = None


class FertilizerRecommendation(BaseModel):
    name: str
    name_bn: str
    amount_kg_per_acre: float
    timing: str
    purpose: str


class SoilAnalysisResponse(BaseModel):
    health_score: float
    health_label: str
    health_label_bn: str
    suitable_crops: List[dict]
    fertilizer_recommendations: List[FertilizerRecommendation]
    risk_indicators: List[dict]
    improvement_tips: List[str]
    improvement_tips_bn: List[str]


def calculate_soil_health_score(data: SoilAnalysisRequest) -> float:
    score = 50.0

    if data.ph_level is not None:
        if 6.0 <= data.ph_level <= 7.5:
            score += 15
        elif 5.5 <= data.ph_level <= 8.0:
            score += 8
        else:
            score -= 5

    if data.nitrogen_mg_kg is not None:
        if data.nitrogen_mg_kg > 40:
            score += 12
        elif data.nitrogen_mg_kg > 20:
            score += 6
        else:
            score -= 3

    if data.phosphorus_mg_kg is not None:
        if data.phosphorus_mg_kg > 25:
            score += 10
        elif data.phosphorus_mg_kg > 12:
            score += 5
        else:
            score -= 2

    if data.potassium_mg_kg is not None:
        if data.potassium_mg_kg > 150:
            score += 8
        elif data.potassium_mg_kg > 80:
            score += 4
        else:
            score -= 2

    if data.organic_matter_pct is not None:
        if data.organic_matter_pct > 3:
            score += 10
        elif data.organic_matter_pct > 1.5:
            score += 5
        else:
            score -= 3

    if data.moisture_pct is not None:
        if 20 <= data.moisture_pct <= 40:
            score += 5
        elif data.moisture_pct < 10 or data.moisture_pct > 60:
            score -= 5

    return max(0, min(100, score))


def get_health_label(score: float) -> tuple:
    if score >= 80:
        return "Excellent", "সেরা"
    elif score >= 60:
        return "Good", "ভালো"
    elif score >= 40:
        return "Moderate", "মাঝারি"
    elif score >= 20:
        return "Poor", "খারাপ"
    return "Critical", "সমস্যাজনক"


async def get_suitable_crops(data: SoilAnalysisRequest, db: AsyncSession) -> List[dict]:
    result = await db.execute(select(Crop).where(Crop.is_active == True))
    crops = result.scalars().all()
    suitable = []

    for crop in crops:
        score = 0
        if crop.min_ph and crop.max_ph and data.ph_level:
            if crop.min_ph <= data.ph_level <= crop.max_ph:
                score += 30
        if crop.min_temp and data.ph_level:
            score += 20
        if crop.min_rainfall_mm:
            score += 15
        if score > 30:
            suitable.append({
                "id": str(crop.id),
                "name": crop.name,
                "name_bn": crop.name_bn,
                "match_score": min(score, 100),
                "category": crop.category,
            })

    suitable.sort(key=lambda x: x["match_score"], reverse=True)
    return suitable[:5]


def generate_fertilizer_recommendations(data: SoilAnalysisRequest) -> List[FertilizerRecommendation]:
    recommendations = []

    if data.nitrogen_mg_kg is not None and data.nitrogen_mg_kg < 40:
        recommendations.append(FertilizerRecommendation(
            name="Urea",
            name_bn="ইউরিয়া",
            amount_kg_per_acre=50,
            timing="Sowing and 30 days after",
            purpose="Nitrogen supplementation",
        ))

    if data.phosphorus_mg_kg is not None and data.phosphorus_mg_kg < 25:
        recommendations.append(FertilizerRecommendation(
            name="TSP (Triple Super Phosphate)",
            name_bn="টিএসপি",
            amount_kg_per_acre=30,
            timing="At sowing time",
            purpose="Phosphorus supplementation",
        ))

    if data.potassium_mg_kg is not None and data.potassium_mg_kg < 150:
        recommendations.append(FertilizerRecommendation(
            name="MOP (Muriate of Potash)",
            name_bn="এমওপি",
            amount_kg_per_acre=20,
            timing="At sowing and mid-season",
            purpose="Potassium supplementation",
        ))

    if data.organic_matter_pct is not None and data.organic_matter_pct < 2:
        recommendations.append(FertilizerRecommendation(
            name="Compost / Vermicompost",
            name_bn="কম্পোস্ট / পোকামাকড় খাদ্য",
            amount_kg_per_acre=200,
            timing="Before land preparation",
            purpose="Improve organic matter",
        ))

    if not recommendations:
        recommendations.append(FertilizerRecommendation(
            name="Balanced NPK",
            name_bn="সুষম এনপিকে",
            amount_kg_per_acre=25,
            timing="Seasonal application",
            purpose="Maintain soil health",
        ))

    return recommendations


def get_risk_indicators(data: SoilAnalysisRequest) -> List[dict]:
    risks = []

    if data.ph_level and data.ph_level < 5.5:
        risks.append({"type": "acidic_soil", "severity": "high", "message": " Soil is too acidic", "message_bn": "মাটি অত্যধিক অম্লীয়"})
    elif data.ph_level and data.ph_level > 8.0:
        risks.append({"type": "alkaline_soil", "severity": "high", "message": "Soil is too alkaline", "message_bn": "মাটি অত্যধিক ক্ষারীয়"})

    if data.moisture_pct and data.moisture_pct < 10:
        risks.append({"type": "drought_risk", "severity": "medium", "message": "Low moisture - drought risk", "message_bn": "কম আর্দ্রতা - খরা ঝুঁকি"})

    if data.organic_matter_pct and data.organic_matter_pct < 1:
        risks.append({"type": "low_organic", "severity": "medium", "message": "Very low organic matter", "message_bn": "অত্যন্ত কম জৈব পদার্থ"})

    return risks


@router.post("/analyze", response_model=SoilAnalysisResponse)
async def analyze_soil(
    request: SoilAnalysisRequest,
    db: AsyncSession = Depends(get_db),
    current_user: Farmer = Depends(get_current_user),
):
    health_score = calculate_soil_health_score(request)
    health_label, health_label_bn = get_health_label(health_score)

    suitable_crops = await get_suitable_crops(request, db)
    fertilizer_recs = generate_fertilizer_recommendations(request)
    risk_indicators = get_risk_indicators(request)

    soil_report = SoilReport(
        id=uuid.uuid4(),
        farm_id=uuid.UUID(request.farm_id),
        farmer_id=current_user.id,
        ph_level=request.ph_level,
        nitrogen_mg_kg=request.nitrogen_mg_kg,
        phosphorus_mg_kg=request.phosphorus_mg_kg,
        potassium_mg_kg=request.potassium_mg_kg,
        organic_matter_pct=request.organic_matter_pct,
        moisture_pct=request.moisture_pct,
        electrical_conductivity=request.electrical_conductivity,
        soil_type=request.soil_type,
        health_score=health_score,
        suitable_crops=[c["name_bn"] for c in suitable_crops],
        fertilizer_recommendations=[r.dict() for r in fertilizer_recs],
        risk_indicators=risk_indicators,
    )
    db.add(soil_report)
    await db.commit()

    improvement_tips = [
        "Add organic compost regularly to improve soil structure",
        "Practice crop rotation to prevent nutrient depletion",
        "Use green manure crops during fallow periods",
        "Avoid over-tilling to prevent erosion",
        "Test soil annually for best results",
    ]

    improvement_tips_bn = [
        "মাটির গঠন উন্নত করতে নিয়মিত জৈব কম্পোস্ট যোগ করুন",
        "পুষ্টি হ্রাস রোধ করতে ফসল পর্যায়ক্রম অনুসরণ করুন",
        "বিশ্রামের সময় সবুজ ম্যানিউর ফসল ব্যবহার করুন",
        "ক্ষয় রোধ করতে অতিরিক্ত চাষ এড়িয়ে চলুন",
        "সেরা ফলাফলের জন্য বছরে একবার মাটি পরীক্ষা করুন",
    ]

    return SoilAnalysisResponse(
        health_score=health_score,
        health_label=health_label,
        health_label_bn=health_label_bn,
        suitable_crops=suitable_crops,
        fertilizer_recommendations=fertilizer_recs,
        risk_indicators=risk_indicators,
        improvement_tips=improvement_tips,
        improvement_tips_bn=improvement_tips_bn,
    )


@router.get("/reports")
async def get_soil_reports(
    farm_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: Farmer = Depends(get_current_user),
):
    query = select(SoilReport).where(SoilReport.farmer_id == current_user.id)
    if farm_id:
        query = query.where(SoilReport.farm_id == farm_id)
    query = query.order_by(SoilReport.created_at.desc()).limit(20)

    result = await db.execute(query)
    reports = result.scalars().all()

    return {"reports": [
        {
            "id": str(r.id),
            "health_score": float(r.health_score),
            "ph_level": float(r.ph_level),
            "suitable_crops": r.suitable_crops,
            "created_at": str(r.created_at),
        }
        for r in reports
    ]}
