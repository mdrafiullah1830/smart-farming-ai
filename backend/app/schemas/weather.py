"""Weather API Schemas - Pydantic models for request/response."""
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime


class LocationQuery(BaseModel):
    lat: float = Field(..., description="Latitude")
    lon: float = Field(..., description="Longitude")


class LocationSearchQuery(BaseModel):
    name: str = Field(..., min_length=2, max_length=100, description="Location name to search")


class CurrentWeatherResponse(BaseModel):
    location: str = Field(..., description="Location name")
    location_bn: str = Field(..., description="Location name in Bangla")
    latitude: float
    longitude: float
    temperature: float = Field(..., description="Temperature in Celsius")
    feels_like: float = Field(..., description="Feels like temperature in Celsius")
    humidity: int = Field(..., description="Humidity percentage")
    precipitation: float = Field(..., description="Precipitation in mm")
    weather_code: int = Field(..., description="WMO weather code")
    condition: str = Field(..., description="Weather condition in English")
    condition_bn: str = Field(..., description="Weather condition in Bangla")
    icon: str = Field(..., description="Weather icon emoji")
    wind_speed: float = Field(..., description="Wind speed in km/h")
    wind_direction: str = Field(..., description="Wind direction")
    wind_direction_bn: str = Field(..., description="Wind direction in Bangla")
    pressure: float = Field(..., description="Surface pressure in hPa")
    uv_index: float = Field(..., description="UV index")
    uv_level: str = Field(..., description="UV risk level")
    sunrise: str = Field(..., description="Sunrise time")
    sunset: str = Field(..., description="Sunset time")
    last_updated: str = Field(..., description="Last updated time")


class HourlyForecastItem(BaseModel):
    time: str = Field(..., description="Forecast time")
    temperature: float = Field(..., description="Temperature in Celsius")
    humidity: int = Field(..., description="Humidity percentage")
    precipitation_probability: int = Field(..., description="Precipitation probability %")
    precipitation: float = Field(..., description="Precipitation in mm")
    weather_code: int = Field(..., description="WMO weather code")
    condition: str = Field(..., description="Weather condition")
    condition_bn: str = Field(..., description="Weather condition in Bangla")
    icon: str = Field(..., description="Weather icon emoji")
    wind_speed: float = Field(..., description="Wind speed in km/h")
    wind_direction: str = Field(..., description="Wind direction")


class HourlyForecastResponse(BaseModel):
    location: str
    location_bn: str
    latitude: float
    longitude: float
    forecasts: List[HourlyForecastItem]


class DailyForecastItem(BaseModel):
    date: str = Field(..., description="Forecast date")
    day_name: str = Field(..., description="Day name in English")
    day_name_bn: str = Field(..., description="Day name in Bangla")
    weather_code: int = Field(..., description="WMO weather code")
    condition: str = Field(..., description="Weather condition")
    condition_bn: str = Field(..., description="Weather condition in Bangla")
    icon: str = Field(..., description="Weather icon emoji")
    temp_max: float = Field(..., description="Maximum temperature")
    temp_min: float = Field(..., description="Minimum temperature")
    precipitation_sum: float = Field(..., description="Total precipitation")
    precipitation_probability: int = Field(..., description="Precipitation probability %")
    wind_speed_max: float = Field(..., description="Maximum wind speed")
    sunrise: str = Field(..., description="Sunrise time")
    sunset: str = Field(..., description="Sunset time")
    uv_index_max: float = Field(..., description="Maximum UV index")


class WeeklyForecastResponse(BaseModel):
    location: str
    location_bn: str
    latitude: float
    longitude: float
    forecasts: List[DailyForecastItem]


class WeatherAlert(BaseModel):
    title: str
    title_bn: str
    description: str
    description_bn: str
    severity: str = Field(..., description="low, medium, high")
    icon: str


class WeatherAlertsResponse(BaseModel):
    location: str
    location_bn: str
    alerts: List[WeatherAlert]
    count: int


class FarmingRecommendation(BaseModel):
    title: str
    title_bn: str
    message: str
    message_bn: str
    icon: str
    priority: str = Field(..., description="low, medium, high")


class FarmingRecommendationsResponse(BaseModel):
    location: str
    location_bn: str
    recommendations: List[FarmingRecommendation]
    count: int


class AIInsightAction(BaseModel):
    action: str
    action_bn: str
    reason: str


class AIInsightsResponse(BaseModel):
    location: str
    location_bn: str
    today_summary: str
    today_summary_bn: str
    tomorrow_summary: str
    tomorrow_summary_bn: str
    weekly_summary: str
    weekly_summary_bn: str
    actions: List[AIInsightAction]


class LocationSearchResult(BaseModel):
    id: int
    name: str
    name_bn: str
    latitude: float
    longitude: float
    country: str
    country_bn: str
    admin1: Optional[str] = None
    admin1_bn: Optional[str] = None


class LocationSearchResponse(BaseModel):
    query: str
    results: List[LocationSearchResult]
    count: int
