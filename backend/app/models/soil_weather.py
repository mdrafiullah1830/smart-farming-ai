import uuid
from sqlalchemy import Column, String, DECIMAL, DateTime, Text, ForeignKey, Boolean
from sqlalchemy.dialects.postgresql import UUID, JSONB, ARRAY
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class SoilReport(Base):
    __tablename__ = "soil_reports"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    farm_id = Column(UUID(as_uuid=True), ForeignKey("farms.id", ondelete="CASCADE"), nullable=False)
    farmer_id = Column(UUID(as_uuid=True), ForeignKey("farmers.id"), nullable=False)
    ph_level = Column(DECIMAL(4, 2), nullable=False)
    nitrogen_mg_kg = Column(DECIMAL(8, 2))
    phosphorus_mg_kg = Column(DECIMAL(8, 2))
    potassium_mg_kg = Column(DECIMAL(8, 2))
    organic_matter_pct = Column(DECIMAL(5, 2))
    moisture_pct = Column(DECIMAL(5, 2))
    electrical_conductivity = Column(DECIMAL(6, 3))
    soil_type = Column(String(100))
    health_score = Column(DECIMAL(5, 2))
    suitable_crops = Column(ARRAY(Text))
    fertilizer_recommendations = Column(JSONB)
    risk_indicators = Column(JSONB)
    lab_report_url = Column(Text)
    notes = Column(Text)
    tested_at = Column(DateTime(timezone=True), server_default=func.now())
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    farm = relationship("Farm", back_populates="soil_reports")
    farmer = relationship("Farmer", back_populates="soil_reports")


class WeatherReport(Base):
    __tablename__ = "weather_reports"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    district_id = Column(UUID(as_uuid=True), ForeignKey("districts.id"), nullable=False)
    temperature_c = Column(DECIMAL(5, 2))
    feels_like_c = Column(DECIMAL(5, 2))
    humidity_pct = Column(DECIMAL(5, 2))
    pressure_hpa = Column(DECIMAL(7, 2))
    wind_speed_kmh = Column(DECIMAL(6, 2))
    wind_direction = Column(String(10))
    rainfall_mm = Column(DECIMAL(8, 2))
    cloud_cover_pct = Column(DECIMAL(5, 2))
    visibility_km = Column(DECIMAL(6, 2))
    uv_index = Column(DECIMAL(4, 2))
    weather_condition = Column(String(100))
    weather_condition_bn = Column(String(100))
    weather_icon = Column(String(50))
    sunrise = Column(String(10))
    sunset = Column(String(10))
    forecast_date = Column(DateTime)
    is_forecast = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    district = relationship("District")
