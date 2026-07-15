import uuid
from sqlalchemy import Column, String, DECIMAL, DateTime, Text, ForeignKey, Boolean, Integer, Date
from sqlalchemy.dialects.postgresql import UUID, JSONB, ARRAY
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base
from app.models.farmer import Farmer
from app.models.farm import Farm
from app.models.crop import Crop
from app.models.district import District
from app.models.soil_weather import SoilReport, WeatherReport


class MarketPrice(Base):
    __tablename__ = "market_prices"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    crop_id = Column(UUID(as_uuid=True), ForeignKey("crops.id"), nullable=False)
    district_id = Column(UUID(as_uuid=True), ForeignKey("districts.id"))
    market_name = Column(String(200))
    price_per_kg = Column(DECIMAL(10, 2), nullable=False)
    currency = Column(String(10), default="BDT")
    price_date = Column(Date, nullable=False)
    price_trend = Column(String(20))
    demand_level = Column(String(20))
    supply_level = Column(String(20))
    source = Column(String(200))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    crop = relationship("Crop")
    district = relationship("District")


class Prediction(Base):
    __tablename__ = "predictions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    farmer_id = Column(UUID(as_uuid=True), ForeignKey("farmers.id"))
    farm_id = Column(UUID(as_uuid=True), ForeignKey("farms.id"))
    prediction_type = Column(String(50), nullable=False)
    input_data = Column(JSONB, nullable=False)
    output_data = Column(JSONB, nullable=False)
    confidence_score = Column(DECIMAL(5, 4))
    model_version = Column(String(50))
    model_name = Column(String(100))
    is_active = Column(Boolean, default=True)
    expires_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class DiseaseReport(Base):
    __tablename__ = "disease_reports"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    farmer_id = Column(UUID(as_uuid=True), ForeignKey("farmers.id"), nullable=False)
    farm_id = Column(UUID(as_uuid=True), ForeignKey("farms.id"))
    crop_id = Column(UUID(as_uuid=True), ForeignKey("crops.id"))
    image_url = Column(Text, nullable=False)
    disease_name = Column(String(200))
    disease_name_bn = Column(String(200))
    confidence_score = Column(DECIMAL(5, 4))
    severity = Column(String(20))
    treatment_recommendations = Column(JSONB)
    affected_area_pct = Column(DECIMAL(5, 2))
    notes = Column(Text)
    status = Column(String(20), default="pending")
    detected_at = Column(DateTime(timezone=True), server_default=func.now())
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    farmer = relationship("Farmer", back_populates="disease_reports")
    farm = relationship("Farm", back_populates="disease_reports")
    crop = relationship("Crop")


class YieldReport(Base):
    __tablename__ = "yield_reports"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    farmer_id = Column(UUID(as_uuid=True), ForeignKey("farmers.id"), nullable=False)
    farm_id = Column(UUID(as_uuid=True), ForeignKey("farms.id"), nullable=False)
    crop_id = Column(UUID(as_uuid=True), ForeignKey("crops.id"), nullable=False)
    season = Column(String(50), nullable=False)
    year = Column(Integer, nullable=False)
    area_acres = Column(DECIMAL(10, 4), nullable=False)
    expected_yield = Column(DECIMAL(10, 4))
    actual_yield = Column(DECIMAL(10, 4))
    yield_per_acre = Column(DECIMAL(10, 4))
    total_revenue = Column(DECIMAL(12, 2))
    total_cost = Column(DECIMAL(12, 2))
    profit = Column(DECIMAL(12, 2))
    roi_pct = Column(DECIMAL(6, 2))
    irrigation_used = Column(Boolean, default=False)
    fertilizer_used = Column(Text)
    pesticide_used = Column(Text)
    notes = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    farmer = relationship("Farmer", back_populates="yield_reports")
    farm = relationship("Farm", back_populates="yield_reports")
    crop = relationship("Crop")


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    farmer_id = Column(UUID(as_uuid=True), ForeignKey("farmers.id"), nullable=False)
    title = Column(String(200), nullable=False)
    title_bn = Column(String(200), nullable=False)
    message = Column(Text, nullable=False)
    message_bn = Column(Text, nullable=False)
    notification_type = Column(String(50), nullable=False)
    severity = Column(String(20), default="info")
    is_read = Column(Boolean, default=False)
    action_url = Column(Text)
    extra_data = Column("metadata", JSONB)
    sent_via = Column(ARRAY(String(20)), default=["push"])
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    farmer = relationship("Farmer", back_populates="notifications")


class ChatHistory(Base):
    __tablename__ = "chat_history"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    farmer_id = Column(UUID(as_uuid=True), ForeignKey("farmers.id"), nullable=False)
    session_id = Column(UUID(as_uuid=True), nullable=False)
    role = Column(String(20), nullable=False)
    content = Column(Text, nullable=False)
    content_bn = Column(Text)
    language = Column(String(10), default="bn")
    intent = Column(String(100))
    entities = Column(JSONB)
    confidence = Column(DECIMAL(5, 4))
    tokens_used = Column(Integer)
    model_used = Column(String(100))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    farmer = relationship("Farmer", back_populates="chat_history")


class VoiceLog(Base):
    __tablename__ = "voice_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    farmer_id = Column(UUID(as_uuid=True), ForeignKey("farmers.id"), nullable=False)
    audio_url = Column(Text, nullable=False)
    transcription = Column(Text)
    transcription_language = Column(String(10), default="bn")
    response_text = Column(Text)
    response_audio_url = Column(Text)
    intent = Column(String(100))
    confidence = Column(DECIMAL(5, 4))
    duration_seconds = Column(DECIMAL(6, 2))
    processing_time_ms = Column(Integer)
    status = Column(String(20), default="processing")
    error_message = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    farmer = relationship("Farmer", back_populates="voice_logs")


class FarmCropHistory(Base):
    __tablename__ = "farm_crop_history"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    farm_id = Column(UUID(as_uuid=True), ForeignKey("farms.id", ondelete="CASCADE"), nullable=False)
    crop_id = Column(UUID(as_uuid=True), ForeignKey("crops.id"), nullable=False)
    season = Column(String(50), nullable=False)
    year = Column(Integer, nullable=False)
    area_acres = Column(DECIMAL(10, 4))
    yield_amount = Column(DECIMAL(10, 4))
    revenue = Column(DECIMAL(12, 2))
    notes = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    farm = relationship("Farm", back_populates="crop_history")
    crop = relationship("Crop")


class SatelliteData(Base):
    __tablename__ = "satellite_data"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    farm_id = Column(UUID(as_uuid=True), ForeignKey("farms.id"))
    district_id = Column(UUID(as_uuid=True), ForeignKey("districts.id"))
    capture_date = Column(Date, nullable=False)
    ndvi = Column(DECIMAL(5, 4))
    ndwi = Column(DECIMAL(5, 4))
    evi = Column(DECIMAL(5, 4))
    soil_moisture = Column(DECIMAL(5, 4))
    land_surface_temp = Column(DECIMAL(5, 2))
    vegetation_health = Column(String(20))
    stress_level = Column(String(20))
    image_url = Column(Text)
    source = Column(String(50), default="sentinel-2")
    extra_data = Column("metadata", JSONB)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    farm = relationship("Farm")
    district = relationship("District")


class DisasterAlert(Base):
    __tablename__ = "disaster_alerts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    alert_type = Column(String(50), nullable=False)
    severity = Column(String(20), nullable=False)
    title = Column(String(200), nullable=False)
    title_bn = Column(String(200), nullable=False)
    description = Column(Text, nullable=False)
    description_bn = Column(Text, nullable=False)
    affected_districts = Column(ARRAY(UUID(as_uuid=True)))
    start_time = Column(DateTime(timezone=True), nullable=False)
    end_time = Column(DateTime(timezone=True))
    source = Column(String(200))
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class GovernmentAdvisory(Base):
    __tablename__ = "government_advisories"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title = Column(String(300), nullable=False)
    title_bn = Column(String(300), nullable=False)
    content = Column(Text, nullable=False)
    content_bn = Column(Text, nullable=False)
    advisory_type = Column(String(50), nullable=False)
    target_districts = Column(ARRAY(UUID(as_uuid=True)))
    target_crops = Column(ARRAY(UUID(as_uuid=True)))
    issued_by = Column(String(200))
    issued_at = Column(DateTime(timezone=True), server_default=func.now())
    expires_at = Column(DateTime(timezone=True))
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())



