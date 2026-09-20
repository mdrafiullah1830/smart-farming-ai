"""Shared request/response schemas for the ML routers.

Field ranges mirror `apps/worker-api/src/sensors.ts` validation and the
agronomic bounds used when the models were trained, so a request that passes
the API layer cannot be silently clipped by the model.
"""
from __future__ import annotations

from pydantic import BaseModel, Field


class CropRecommendRequest(BaseModel):
    temperature: float = Field(ge=-10, le=55, description="Mean air temperature (°C)")
    humidity: float = Field(ge=0, le=100, description="Relative humidity (%)")
    rainfall: float = Field(ge=0, le=1000, description="Seasonal rainfall (mm)")
    ph: float = Field(ge=3.0, le=10.0, description="Soil pH")
    nitrogen: float = Field(ge=0, le=300, description="Available N (kg/ha)")
    phosphorus: float = Field(ge=0, le=300, description="Available P (kg/ha)")
    potassium: float = Field(ge=0, le=300, description="Available K (kg/ha)")
    top_k: int = Field(default=5, ge=1, le=12)


class CropCandidate(BaseModel):
    crop: str
    confidence: float


class CropRecommendResponse(BaseModel):
    status: str
    message: str
    model: str | None = None
    recommendations: list[CropCandidate] | None = None


class YieldPredictRequest(BaseModel):
    crop: str = Field(min_length=1, max_length=40)
    temperature: float = Field(ge=-10, le=55)
    humidity: float = Field(ge=0, le=100)
    rainfall: float = Field(ge=0, le=1000)
    ph: float = Field(ge=3.0, le=10.0)
    nitrogen: float = Field(ge=0, le=300)
    area_acres: float = Field(gt=0, le=10000)
    irrigation_used: bool = False
    season: str = Field(default="kharif", max_length=20)


class YieldPredictResponse(BaseModel):
    status: str
    message: str
    model: str | None = None
    yield_per_acre: float | None = None
    total_yield: float | None = None


class MarketForecastRequest(BaseModel):
    crop: str = Field(min_length=1, max_length=40)
    history: list[float] = Field(min_length=7, max_length=180, description="Chronological prices, oldest first")
    days: int = Field(default=7, ge=1, le=30)


class MarketForecastResponse(BaseModel):
    status: str
    message: str
    model: str | None = None
    forecast: list[float] | None = None
    trend: str | None = None
