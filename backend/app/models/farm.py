import uuid
from sqlalchemy import Column, String, DECIMAL, Boolean, DateTime, Text, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class Farm(Base):
    __tablename__ = "farms"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    farmer_id = Column(UUID(as_uuid=True), ForeignKey("farmers.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(200), nullable=False)
    name_bn = Column(String(200))
    district_id = Column(UUID(as_uuid=True), ForeignKey("districts.id"))
    upazila = Column(String(100))
    union = Column(String(100))
    village = Column(String(100))
    latitude = Column(DECIMAL(10, 8), nullable=False)
    longitude = Column(DECIMAL(11, 8), nullable=False)
    area_acres = Column(DECIMAL(10, 4), nullable=False)
    soil_type = Column(String(100))
    irrigation_type = Column(String(100))
    water_source = Column(String(100))
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    farmer = relationship("Farmer", back_populates="farms")
    district = relationship("District", back_populates="farms")
    soil_reports = relationship("SoilReport", back_populates="farm")
    disease_reports = relationship("DiseaseReport", back_populates="farm")
    yield_reports = relationship("YieldReport", back_populates="farm")
    crop_history = relationship("FarmCropHistory", back_populates="farm")
