from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, date
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.farmer import Farmer
from app.models.district import District
from app.models.all_models import (
    Farm, Crop, SoilReport, DiseaseReport, YieldReport,
    MarketPrice, Prediction, DisasterAlert, GovernmentAdvisory
)
import uuid


router = APIRouter()


class DistrictOverview(BaseModel):
    district_id: str
    district_name: str
    district_name_bn: str
    division: str
    latitude: float
    longitude: float
    farmer_count: int
    farm_count: int
    total_area_acres: float
    avg_health_score: float
    active_diseases: int
    avg_yield: float
    top_crops: List[dict]
    risk_level: str


class GovernmentDashboardResponse(BaseModel):
    total_districts: int
    total_farmers: int
    total_farms: int
    total_area_acres: float
    avg_health_score: float
    total_disease_reports: int
    active_disaster_alerts: int
    districts: List[DistrictOverview]
    crop_distribution: List[dict]
    yield_trends: List[dict]
    market_summary: List[dict]


class AdvisoryCreateRequest(BaseModel):
    title: str
    title_bn: str
    content: str
    content_bn: str
    advisory_type: str
    target_districts: List[str] = []
    target_crops: List[str] = []
    issued_by: str


@router.get("/dashboard", response_model=GovernmentDashboardResponse)
async def get_government_dashboard(
    db: AsyncSession = Depends(get_db),
    current_user: Farmer = Depends(get_current_user),
):
    districts_result = await db.execute(select(District))
    districts = districts_result.scalars().all()

    farmers_count_result = await db.execute(select(func.count(Farmer.id)))
    total_farmers = farmers_count_result.scalar()

    farms_count_result = await db.execute(select(func.count(Farm.id)))
    total_farms = farms_count_result.scalar()

    area_result = await db.execute(select(func.sum(Farm.area_acres)))
    total_area = float(area_result.scalar() or 0)

    health_result = await db.execute(select(func.avg(SoilReport.health_score)))
    avg_health = float(health_result.scalar() or 0)

    disease_count_result = await db.execute(
        select(func.count(DiseaseReport.id)).where(DiseaseReport.status == "pending")
    )
    total_diseases = disease_count_result.scalar()

    disaster_result = await db.execute(
        select(func.count(DisasterAlert.id)).where(DisasterAlert.is_active == True)
    )
    active_disasters = disaster_result.scalar()

    district_overviews = []
    for d in districts:
        farmer_count_result = await db.execute(
            select(func.count(Farmer.id)).where(Farmer.district_id == d.id)
        )
        farmer_count = farmer_count_result.scalar()

        farm_count_result = await db.execute(
            select(func.count(Farm.id)).where(Farm.district_id == d.id)
        )
        farm_count = farm_count_result.scalar()

        area_result = await db.execute(
            select(func.sum(Farm.area_acres)).where(Farm.district_id == d.id)
        )
        area = float(area_result.scalar() or 0)

        health_result = await db.execute(
            select(func.avg(SoilReport.health_score))
            .join(Farm, SoilReport.farm_id == Farm.id)
            .where(Farm.district_id == d.id)
        )
        health = float(health_result.scalar() or 0)

        disease_result = await db.execute(
            select(func.count(DiseaseReport.id))
            .join(Farm, DiseaseReport.farm_id == Farm.id)
            .where(Farm.district_id == d.id, DiseaseReport.status == "pending")
        )
        diseases = disease_result.scalar()

        risk_level = "low"
        if diseases > 10 or health < 40:
            risk_level = "high"
        elif diseases > 5 or health < 60:
            risk_level = "medium"

        district_overviews.append(DistrictOverview(
            district_id=str(d.id),
            district_name=d.name,
            district_name_bn=d.name_bn,
            division=d.division,
            latitude=float(d.latitude),
            longitude=float(d.longitude),
            farmer_count=farmer_count,
            farm_count=farm_count,
            total_area_acres=area,
            avg_health_score=health,
            active_diseases=diseases,
            avg_yield=0,
            top_crops=[],
            risk_level=risk_level,
        ))

    return GovernmentDashboardResponse(
        total_districts=len(districts),
        total_farmers=total_farmers,
        total_farms=total_farms,
        total_area_acres=total_area,
        avg_health_score=avg_health,
        total_disease_reports=total_diseases,
        active_disaster_alerts=active_disasters,
        districts=district_overviews,
        crop_distribution=[],
        yield_trends=[],
        market_summary=[],
    )


@router.get("/districts")
async def list_all_districts(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(District).order_by(District.name))
    districts = result.scalars().all()

    return {"districts": [
        {
            "id": str(d.id),
            "name": d.name,
            "name_bn": d.name_bn,
            "division": d.division,
            "latitude": float(d.latitude),
            "longitude": float(d.longitude),
        }
        for d in districts
    ]}


@router.get("/analytics/yield")
async def get_yield_analytics(
    district_id: Optional[str] = None,
    year: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    current_user: Farmer = Depends(get_current_user),
):
    query = select(YieldReport)
    if district_id:
        query = query.join(Farm, YieldReport.farm_id == Farm.id).where(Farm.district_id == district_id)
    if year:
        query = query.where(YieldReport.year == year)

    result = await db.execute(query)
    yields = result.scalars().all()

    return {"yields": [
        {
            "id": str(y.id),
            "crop_id": str(y.crop_id),
            "season": y.season,
            "year": y.year,
            "area_acres": float(y.area_acres),
            "yield_per_acre": float(y.yield_per_acre or 0),
            "revenue": float(y.total_revenue or 0),
            "profit": float(y.profit or 0),
        }
        for y in yields
    ]}


@router.get("/analytics/market")
async def get_market_analytics(
    days: int = 30,
    db: AsyncSession = Depends(get_db),
    current_user: Farmer = Depends(get_current_user),
):
    from datetime import timedelta
    start_date = date.today() - timedelta(days=days)

    result = await db.execute(
        select(MarketPrice)
        .where(MarketPrice.price_date >= start_date)
        .order_by(MarketPrice.price_date.desc())
    )
    prices = result.scalars().all()

    return {"market_data": [
        {
            "crop_id": str(p.crop_id),
            "price": float(p.price_per_kg),
            "date": str(p.price_date),
            "market": p.market_name,
            "trend": p.price_trend,
        }
        for p in prices
    ]}


@router.post("/advisories")
async def create_advisory(
    request: AdvisoryCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: Farmer = Depends(get_current_user),
):
    advisory = GovernmentAdvisory(
        id=uuid.uuid4(),
        title=request.title,
        title_bn=request.title_bn,
        content=request.content,
        content_bn=request.content_bn,
        advisory_type=request.advisory_type,
        target_districts=[uuid.UUID(d) for d in request.target_districts],
        target_crops=[uuid.UUID(c) for c in request.target_crops],
        issued_by=request.issued_by,
    )
    db.add(advisory)
    await db.commit()
    return {"message": "Advisory created", "id": str(advisory.id)}


@router.get("/advisories")
async def get_advisories(
    is_active: bool = True,
    db: AsyncSession = Depends(get_db),
    current_user: Farmer = Depends(get_current_user),
):
    query = select(GovernmentAdvisory).where(GovernmentAdvisory.is_active == is_active)
    query = query.order_by(GovernmentAdvisory.created_at.desc()).limit(20)

    result = await db.execute(query)
    advisories = result.scalars().all()

    return {"advisories": [
        {
            "id": str(a.id),
            "title": a.title,
            "title_bn": a.title_bn,
            "content": a.content,
            "content_bn": a.content_bn,
            "type": a.advisory_type,
            "issued_by": a.issued_by,
            "issued_at": str(a.issued_at),
        }
        for a in advisories
    ]}
