from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.farmer import Farmer
from app.models.farm import Farm
from app.models.district import District
import uuid


router = APIRouter()


class FarmCreateRequest(BaseModel):
    name: str
    name_bn: Optional[str] = None
    district_id: Optional[str] = None
    upazila: Optional[str] = None
    union: Optional[str] = None
    village: Optional[str] = None
    latitude: float
    longitude: float
    area_acres: float
    soil_type: Optional[str] = None
    irrigation_type: Optional[str] = None
    water_source: Optional[str] = None


class FarmUpdateRequest(BaseModel):
    name: Optional[str] = None
    name_bn: Optional[str] = None
    district_id: Optional[str] = None
    upazila: Optional[str] = None
    union: Optional[str] = None
    village: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    area_acres: Optional[float] = None
    soil_type: Optional[str] = None
    irrigation_type: Optional[str] = None
    water_source: Optional[str] = None


class FarmResponse(BaseModel):
    id: str
    name: str
    name_bn: Optional[str]
    district: Optional[str]
    upazila: Optional[str]
    village: Optional[str]
    latitude: float
    longitude: float
    area_acres: float
    soil_type: Optional[str]
    irrigation_type: Optional[str]
    water_source: Optional[str]
    is_active: bool
    created_at: str


@router.post("/", response_model=FarmResponse, status_code=201)
async def create_farm(
    request: FarmCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: Farmer = Depends(get_current_user),
):
    district_name = None
    if request.district_id:
        dist_result = await db.execute(select(District).where(District.id == request.district_id))
        dist = dist_result.scalar_one_or_none()
        if dist:
            district_name = dist.name_bn

    farm = Farm(
        id=uuid.uuid4(),
        farmer_id=current_user.id,
        name=request.name,
        name_bn=request.name_bn,
        district_id=uuid.UUID(request.district_id) if request.district_id else None,
        upazila=request.upazila,
        union=request.union,
        village=request.village,
        latitude=request.latitude,
        longitude=request.longitude,
        area_acres=request.area_acres,
        soil_type=request.soil_type,
        irrigation_type=request.irrigation_type,
        water_source=request.water_source,
    )
    db.add(farm)
    await db.commit()
    await db.refresh(farm)

    return FarmResponse(
        id=str(farm.id),
        name=farm.name,
        name_bn=farm.name_bn,
        district=district_name,
        upazila=farm.upazila,
        village=farm.village,
        latitude=float(farm.latitude),
        longitude=float(farm.longitude),
        area_acres=float(farm.area_acres),
        soil_type=farm.soil_type,
        irrigation_type=farm.irrigation_type,
        water_source=farm.water_source,
        is_active=farm.is_active,
        created_at=str(farm.created_at),
    )


@router.get("/", response_model=List[FarmResponse])
async def list_farms(
    db: AsyncSession = Depends(get_db),
    current_user: Farmer = Depends(get_current_user),
):
    result = await db.execute(
        select(Farm)
        .where(Farm.farmer_id == current_user.id, Farm.is_active == True)
        .order_by(Farm.created_at.desc())
    )
    farms = result.scalars().all()

    response = []
    for f in farms:
        district_name = None
        if f.district_id:
            dist_result = await db.execute(select(District).where(District.id == f.district_id))
            dist = dist_result.scalar_one_or_none()
            district_name = dist.name_bn if dist else None

        response.append(FarmResponse(
            id=str(f.id),
            name=f.name,
            name_bn=f.name_bn,
            district=district_name,
            upazila=f.upazila,
            village=f.village,
            latitude=float(f.latitude),
            longitude=float(f.longitude),
            area_acres=float(f.area_acres),
            soil_type=f.soil_type,
            irrigation_type=f.irrigation_type,
            water_source=f.water_source,
            is_active=f.is_active,
            created_at=str(f.created_at),
        ))

    return response


@router.get("/{farm_id}", response_model=FarmResponse)
async def get_farm(
    farm_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Farmer = Depends(get_current_user),
):
    result = await db.execute(
        select(Farm).where(Farm.id == farm_id, Farm.farmer_id == current_user.id)
    )
    farm = result.scalar_one_or_none()
    if not farm:
        raise HTTPException(status_code=404, detail="Farm not found")

    district_name = None
    if farm.district_id:
        dist_result = await db.execute(select(District).where(District.id == farm.district_id))
        dist = dist_result.scalar_one_or_none()
        district_name = dist.name_bn if dist else None

    return FarmResponse(
        id=str(farm.id),
        name=farm.name,
        name_bn=farm.name_bn,
        district=district_name,
        upazila=farm.upazila,
        village=farm.village,
        latitude=float(farm.latitude),
        longitude=float(farm.longitude),
        area_acres=float(farm.area_acres),
        soil_type=farm.soil_type,
        irrigation_type=farm.irrigation_type,
        water_source=farm.water_source,
        is_active=farm.is_active,
        created_at=str(farm.created_at),
    )


@router.put("/{farm_id}", response_model=FarmResponse)
async def update_farm(
    farm_id: str,
    request: FarmUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: Farmer = Depends(get_current_user),
):
    result = await db.execute(
        select(Farm).where(Farm.id == farm_id, Farm.farmer_id == current_user.id)
    )
    farm = result.scalar_one_or_none()
    if not farm:
        raise HTTPException(status_code=404, detail="Farm not found")

    update_data = request.dict(exclude_unset=True)
    for key, value in update_data.items():
        if key == "district_id" and value:
            setattr(farm, key, uuid.UUID(value))
        else:
            setattr(farm, key, value)

    await db.commit()
    await db.refresh(farm)

    return FarmResponse(
        id=str(farm.id),
        name=farm.name,
        name_bn=farm.name_bn,
        district=None,
        upazila=farm.upazila,
        village=farm.village,
        latitude=float(farm.latitude),
        longitude=float(farm.longitude),
        area_acres=float(farm.area_acres),
        soil_type=farm.soil_type,
        irrigation_type=farm.irrigation_type,
        water_source=farm.water_source,
        is_active=farm.is_active,
        created_at=str(farm.created_at),
    )


@router.delete("/{farm_id}")
async def delete_farm(
    farm_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Farmer = Depends(get_current_user),
):
    result = await db.execute(
        select(Farm).where(Farm.id == farm_id, Farm.farmer_id == current_user.id)
    )
    farm = result.scalar_one_or_none()
    if not farm:
        raise HTTPException(status_code=404, detail="Farm not found")

    farm.is_active = False
    await db.commit()
    return {"message": "Farm deleted successfully"}
