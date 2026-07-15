"""Weather Database Models."""
from sqlalchemy import Column, String, Float, Integer, DateTime, Text, JSON
from sqlalchemy.sql import func
from app.core.database import Base


class WeatherCache(Base):
    """Cached weather data in PostgreSQL."""
    __tablename__ = "weather_cache"

    id = Column(Integer, primary_key=True, autoincrement=True)
    latitude = Column(Float, nullable=False, index=True)
    longitude = Column(Float, nullable=False, index=True)
    temperature = Column(Float)
    feels_like = Column(Float)
    humidity = Column(Integer)
    precipitation = Column(Float)
    weather_code = Column(Integer)
    condition = Column(String(100))
    condition_bn = Column(String(100))
    wind_speed = Column(Float)
    wind_direction = Column(String(10))
    pressure = Column(Float)
    uv_index = Column(Float)
    forecast_json = Column(JSON)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class WeatherAlert(Base):
    """Weather alerts stored in PostgreSQL."""
    __tablename__ = "weather_alerts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    title = Column(String(200), nullable=False)
    title_bn = Column(String(200), nullable=False)
    description = Column(Text)
    description_bn = Column(Text)
    severity = Column(String(20), nullable=False)  # low, medium, high
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    location_name = Column(String(200))
    location_name_bn = Column(String(200))
    is_active = Column(Integer, default=1)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    expires_at = Column(DateTime(timezone=True))


class WeatherRecommendation(Base):
    """Weather-based farming recommendations."""
    __tablename__ = "weather_recommendations"

    id = Column(Integer, primary_key=True, autoincrement=True)
    title = Column(String(200), nullable=False)
    title_bn = Column(String(200), nullable=False)
    message = Column(Text, nullable=False)
    message_bn = Column(Text, nullable=False)
    weather_code = Column(Integer)
    temp_min = Column(Float)
    temp_max = Column(Float)
    humidity_min = Column(Float)
    humidity_max = Column(Float)
    is_active = Column(Integer, default=1)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
