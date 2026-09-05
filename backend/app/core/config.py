from pydantic_settings import BaseSettings
from typing import List
import os


class Settings(BaseSettings):
    # Application
    APP_NAME: str = "Smart Farming AI Bangladesh"
    APP_VERSION: str = "1.0.0"
    APP_ENV: str = "production"
    DEBUG: bool = False
    SECRET_KEY: str = ""
    ALLOWED_HOSTS: List[str] = ["localhost", "127.0.0.1"]

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://smartfarming:password@localhost:5432/smart_farming_db"
    MONGODB_URL: str = "mongodb://localhost:27017"
    MONGODB_DB: str = "smart_farming_mongo"

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"
    REDIS_PASSWORD: str = ""

    # External APIs
    OPENWEATHER_API_KEY: str = ""
    GOOGLE_MAPS_API_KEY: str = ""
    OPENAI_API_KEY: str = ""
    OPENAI_MODEL: str = "gpt-4"

    # ML Models
    CROP_MODEL_PATH: str = "ai_models/trained_models/crop_recommendation.pkl"
    YIELD_MODEL_PATH: str = "ai_models/trained_models/yield_prediction.pkl"
    DISEASE_MODEL_PATH: str = "ai_models/trained_models/disease_detection.h5"
    MARKET_MODEL_PATH: str = "ai_models/trained_models/market_forecasting.pkl"

    # File Storage
    UPLOAD_DIR: str = "./uploads"
    MAX_UPLOAD_SIZE_MB: int = 10

    # CORS
    CORS_ORIGINS: List[str] = ["http://localhost:3000", "http://localhost:8080"]

    # Rate Limiting
    RATE_LIMIT_PER_MINUTE: int = 60

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
