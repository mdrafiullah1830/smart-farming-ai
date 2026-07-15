from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.farmer import Farmer
from app.models.all_models import DisasterAlert
from app.models.district import District
import uuid


router = APIRouter()


class DisasterAlertResponse(BaseModel):
    id: str
    alert_type: str
    severity: str
    title: str
    title_bn: str
    description: str
    description_bn: str
    affected_districts: List[str]
    start_time: str
    end_time: Optional[str]
    source: Optional[str]
    is_active: bool


class DisasterPredictionResponse(BaseModel):
    district: str
    district_bn: str
    risk_level: str
    risks: List[dict]
    recommendations: List[str]
    recommendations_bn: List[str]


def assess_disaster_risks(district: District) -> dict:
    risks = []
    recommendations = []
    recommendations_bn = []

    if district.climate_zone:
        if "coastal" in district.climate_zone.lower():
            risks.append({
                "type": "cyclone",
                "severity": "high",
                "probability": 0.3,
                "message": "Coastal area - cyclone risk",
                "message_bn": "উপকূলীয় এলাকা - ঘূর্ণিঝড় ঝুঁকি",
            })
            recommendations.append("Stay alert during cyclone season (April-June, October-November)")
            recommendations_bn.append("ঘূর্ণিঝড়ের মৌসুমে (এপ্রিল-জুন, অক্টোবর-নভেম্বর) সতর্ক থাকুন")

        if "flood" in district.climate_zone.lower() or district.area_sq_km and float(district.area_sq_km) < 2000:
            risks.append({
                "type": "flood",
                "severity": "medium",
                "probability": 0.4,
                "message": "Flood-prone area",
                "message_bn": "বন্যা-প্বণ্য এলাকা",
            })
            recommendations.append("Ensure proper drainage and flood protection")
            recommendations_bn.append("যথাযথ জল নিষ্কাশন এবং বন্যা সুরক্ষা নিশ্চিত করুন")

    if district.latitude and float(district.latitude) > 24:
        risks.append({
            "type": "cold_wave",
            "severity": "low",
            "probability": 0.2,
            "message": "Northern district - cold wave risk in winter",
            "message_bn": "উত্তরাঞ্চলীয় জেলা - শীতে মরুচ্ছায় ঝুঁকি",
        })
        recommendations.append("Protect sensitive crops during winter cold waves")
        recommendations_bn.append("শীতের মরুচ্ছায় সংবেদনশীল ফসল রক্ষা করুন")

    risk_level = "low"
    high_risks = sum(1 for r in risks if r["severity"] == "high")
    if high_risks > 0:
        risk_level = "high"
    elif len(risks) > 1:
        risk_level = "medium"

    return {
        "risk_level": risk_level,
        "risks": risks,
        "recommendations": recommendations,
        "recommendations_bn": recommendations_bn,
    }


@router.get("/alerts")
async def get_active_alerts(
    db: AsyncSession = Depends(get_db),
    current_user: Farmer = Depends(get_current_user),
):
    result = await db.execute(
        select(DisasterAlert)
        .where(DisasterAlert.is_active == True)
        .order_by(DisasterAlert.created_at.desc())
    )
    alerts = result.scalars().all()

    return {"alerts": [
        {
            "id": str(a.id),
            "type": a.alert_type,
            "severity": a.severity,
            "title": a.title,
            "title_bn": a.title_bn,
            "description": a.description,
            "description_bn": a.description_bn,
            "start_time": str(a.start_time),
            "end_time": str(a.end_time) if a.end_time else None,
            "source": a.source,
        }
        for a in alerts
    ]}


@router.get("/risk/{district_id}", response_model=DisasterPredictionResponse)
async def get_disaster_risk(
    district_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Farmer = Depends(get_current_user),
):
    result = await db.execute(select(District).where(District.id == district_id))
    district = result.scalar_one_or_none()
    if not district:
        raise HTTPException(status_code=404, detail="District not found")

    risk_assessment = assess_disaster_risks(district)

    return DisasterPredictionResponse(
        district=district.name,
        district_bn=district.name_bn,
        **risk_assessment,
    )


@router.get("/districts-risk")
async def get_all_districts_risk(
    db: AsyncSession = Depends(get_db),
    current_user: Farmer = Depends(get_current_user),
):
    result = await db.execute(select(District))
    districts = result.scalars().all()

    risk_data = []
    for d in districts:
        risk = assess_disaster_risks(d)
        risk_data.append({
            "district_id": str(d.id),
            "district_name": d.name_bn,
            "risk_level": risk["risk_level"],
            "risks": risk["risks"],
        })

    return {"districts": risk_data}
