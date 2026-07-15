from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from app.core.database import get_db
from app.models.farmer import Farmer
from app.models.district import District
import uuid


router = APIRouter()


class FarmerResponse(BaseModel):
    id: str
    phone: str
    full_name: str
    full_name_bn: str
    email: Optional[str]
    district: Optional[str]
    upazila: Optional[str]
    village: Optional[str]
    role: str
    is_verified: bool
    farm_count: int
    created_at: str


class FarmerUpdateRequest(BaseModel):
    full_name: Optional[str] = None
    full_name_bn: Optional[str] = None
    email: Optional[str] = None
    district_id: Optional[str] = None
    upazila: Optional[str] = None
    union: Optional[str] = None
    village: Optional[str] = None
    language_preference: Optional[str] = None


@router.get("/", response_model=List[FarmerResponse])
async def list_farmers(
    district_id: Optional[str] = None,
    role: Optional[str] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    query = select(Farmer).where(Farmer.is_active == True)
    if district_id:
        query = query.where(Farmer.district_id == district_id)
    if role:
        query = query.where(Farmer.role == role)
    query = query.offset(skip).limit(limit)

    result = await db.execute(query)
    farmers = result.scalars().all()

    response = []
    for f in farmers:
        from app.models.all_models import Farm
        farms_result = await db.execute(
            select(Farm).where(Farm.farmer_id == f.id, Farm.is_active == True)
        )
        farm_count = len(farms_result.scalars().all())

        district_name = None
        if f.district_id:
            dist_result = await db.execute(select(District).where(District.id == f.district_id))
            dist = dist_result.scalar_one_or_none()
            district_name = dist.name_bn if dist else None

        response.append(FarmerResponse(
            id=str(f.id),
            phone=f.phone,
            full_name=f.full_name,
            full_name_bn=f.full_name_bn,
            email=f.email,
            district=district_name,
            upazila=f.upazila,
            village=f.village,
            role=f.role,
            is_verified=f.is_verified,
            farm_count=farm_count,
            created_at=str(f.created_at),
        ))

    return response


@router.get("/{farmer_id}")
async def get_farmer(
    farmer_id: str,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Farmer).where(Farmer.id == farmer_id))
    farmer = result.scalar_one_or_none()
    if not farmer:
        raise HTTPException(status_code=404, detail="Farmer not found")

    district_name = None
    if farmer.district_id:
        dist_result = await db.execute(select(District).where(District.id == farmer.district_id))
        dist = dist_result.scalar_one_or_none()
        district_name = dist.name_bn if dist else None

    return {
        "id": str(farmer.id),
        "phone": farmer.phone,
        "full_name": farmer.full_name,
        "full_name_bn": farmer.full_name_bn,
        "email": farmer.email,
        "district": district_name,
        "upazila": farmer.upazila,
        "village": farmer.village,
        "role": farmer.role,
        "is_verified": farmer.is_verified,
        "language_preference": farmer.language_preference,
        "created_at": str(farmer.created_at),
    }


@router.get("/me/stats")
async def get_my_stats(
    db: AsyncSession = Depends(get_db),
):
    from app.models.all_models import Farm, SoilReport, DiseaseReport, YieldReport

    farms_result = await db.execute(
        select(Farm).where(Farm.is_active == True)
    )
    farms = farms_result.scalars().all()

    soil_result = await db.execute(select(SoilReport))
    soil_count = len(soil_result.scalars().all())

    disease_result = await db.execute(select(DiseaseReport))
    disease_count = len(disease_result.scalars().all())

    yield_result = await db.execute(select(YieldReport))
    yield_count = len(yield_result.scalars().all())

    total_area = sum(float(f.area_acres) for f in farms)

    return {
        "total_farms": len(farms),
        "total_area_acres": round(total_area, 2),
        "soil_reports": soil_count,
        "disease_reports": disease_count,
        "yield_reports": yield_count,
    }
