import uuid
from sqlalchemy import Column, String, DECIMAL, Boolean, DateTime, Text, Integer
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from app.core.database import Base


class Crop(Base):
    __tablename__ = "crops"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(100), nullable=False)
    name_bn = Column(String(100), nullable=False)
    category = Column(String(50), nullable=False)
    growing_season = Column(String(50), nullable=False)
    min_temp = Column(DECIMAL(5, 2))
    max_temp = Column(DECIMAL(5, 2))
    min_rainfall_mm = Column(DECIMAL(8, 2))
    max_rainfall_mm = Column(DECIMAL(8, 2))
    min_ph = Column(DECIMAL(4, 2))
    max_ph = Column(DECIMAL(4, 2))
    growth_duration_days = Column(Integer)
    water_requirement_mm = Column(DECIMAL(8, 2))
    avg_yield_per_acre = Column(DECIMAL(10, 4))
    avg_price_per_kg = Column(DECIMAL(10, 2))
    image_url = Column(Text)
    description = Column(Text)
    description_bn = Column(Text)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
