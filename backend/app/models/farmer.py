import uuid
from sqlalchemy import Column, String, DECIMAL, Boolean, DateTime, Text, Date, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class Farmer(Base):
    __tablename__ = "farmers"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    national_id = Column(String(20), unique=True)
    phone = Column(String(20), unique=True, nullable=False)
    email = Column(String(255))
    full_name = Column(String(200), nullable=False)
    full_name_bn = Column(String(200), nullable=False)
    date_of_birth = Column(Date)
    gender = Column(String(20))
    district_id = Column(UUID(as_uuid=True), ForeignKey("districts.id"))
    upazila = Column(String(100))
    union = Column(String(100))
    village = Column(String(100))
    address = Column(Text)
    profile_image_url = Column(Text)
    language_preference = Column(String(10), default="bn")
    is_verified = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)
    role = Column(String(20), default="farmer")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    district = relationship("District", back_populates="farmers")
    farms = relationship("Farm", back_populates="farmer")
    soil_reports = relationship("SoilReport", back_populates="farmer")
    disease_reports = relationship("DiseaseReport", back_populates="farmer")
    yield_reports = relationship("YieldReport", back_populates="farmer")
    notifications = relationship("Notification", back_populates="farmer")
    chat_history = relationship("ChatHistory", back_populates="farmer")
    voice_logs = relationship("VoiceLog", back_populates="farmer")
