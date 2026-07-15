import uuid
from sqlalchemy import Column, String, DECIMAL, Boolean, DateTime, Text, BigInteger, ARRAY, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class District(Base):
    __tablename__ = "districts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(100), nullable=False)
    name_bn = Column(String(100), nullable=False)
    division = Column(String(100), nullable=False)
    division_bn = Column(String(100), nullable=False)
    latitude = Column(DECIMAL(10, 8), nullable=False)
    longitude = Column(DECIMAL(11, 8), nullable=False)
    area_sq_km = Column(DECIMAL(10, 2))
    population = Column(BigInteger)
    agricultural_land_pct = Column(DECIMAL(5, 2))
    soil_type = Column(String(100))
    climate_zone = Column(String(100))
    major_crops = Column(ARRAY(Text))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    farmers = relationship("Farmer", back_populates="district")
    farms = relationship("Farm", back_populates="district")
