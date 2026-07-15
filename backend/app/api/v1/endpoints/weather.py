"""
Weather Intelligence API Endpoints
Uses Open-Meteo API (free, no API key required)
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional
from datetime import datetime

from app.core.database import get_db
from app.core.security import get_current_user
from app.core.cache import weather_cache
from app.services.weather_service import (
    fetch_current_weather,
    fetch_hourly_forecast,
    fetch_weekly_forecast,
    search_locations,
    generate_weather_alerts,
    generate_farming_recommendations,
    generate_ai_insights,
    get_weather_info,
    get_wind_direction,
    get_uv_index_level,
)
from app.schemas.weather import (
    CurrentWeatherResponse,
    HourlyForecastResponse,
    HourlyForecastItem,
    WeeklyForecastResponse,
    DailyForecastItem,
    WeatherAlertsResponse,
    WeatherAlert,
    FarmingRecommendationsResponse,
    FarmingRecommendation,
    AIInsightsResponse,
    AIInsightAction,
    LocationSearchResponse,
    LocationSearchResult,
)

router = APIRouter()

WIND_DIRECTION_BN = {
    "N": "উত্তর", "NNE": "উত্তর-পূর্ব", "NE": "পূর্ব-উত্তর", "ENE": "পূর্ব",
    "E": "পূর্ব", "ESE": "পূর্ব-দক্ষিণ", "SE": "দক্ষিণ-পূর্ব", "SSE": "দক্ষিণ",
    "S": "দক্ষিণ", "SSW": "দক্ষিণ-পশ্চিম", "SW": "পশ্চিম-দক্ষিণ", "WSW": "পশ্চিম",
    "W": "পশ্চিম", "WNW": "পশ্চিম-উত্তর", "NW": "উত্তর-পশ্চিম", "NNW": "উত্তর",
}

DAY_NAMES_BN = {
    "Monday": "সোমবার", "Tuesday": "মঙ্গলবার", "Wednesday": "বুধবার",
    "Thursday": "বৃহস্পতিবার", "Friday": "শুক্রবার", "Saturday": "শনিবার", "Sunday": "রবিবার",
}


def get_location_name(lat: float, lon: float) -> tuple:
    """Get approximate location name from coordinates."""
    # Bangladesh approximate regions
    regions = [
        (23.81, 90.41, "Dhaka", "ঢাকা"),
        (22.35, 91.78, "Chittagong", "চট্টগ্রাম"),
        (24.37, 88.60, "Rajshahi", "রাজশাহী"),
        (22.82, 89.54, "Khulna", "খুলনা"),
        (24.90, 91.87, "Sylhet", "সিলেট"),
        (22.70, 90.35, "Barisal", "বরিশাল"),
        (25.75, 89.24, "Rangpur", "রংপুর"),
        (24.75, 90.40, "Mymensingh", "ময়মনসিংহ"),
    ]
    min_dist = float('inf')
    name_en, name_bn = "Unknown", "অজানা"
    for r_lat, r_lon, n_en, n_bn in regions:
        dist = ((lat - r_lat) ** 2 + (lon - r_lon) ** 2) ** 0.5
        if dist < min_dist:
            min_dist = dist
            name_en, name_bn = n_en, n_bn
    return name_en, name_bn


@router.get("/current", response_model=CurrentWeatherResponse)
async def get_current_weather(
    lat: float = Query(..., ge=-90, le=90, description="Latitude"),
    lon: float = Query(..., ge=-180, le=180, description="Longitude"),
):
    """
    Get current weather for any location.

    Returns real-time weather data including temperature, humidity,
    wind, pressure, UV index, and sunrise/sunset times.
    """
    # Try cache first
    cached = await weather_cache.get("current", lat, lon)
    if cached:
        return CurrentWeatherResponse(**cached)

    # Fetch from Open-Meteo
    data = await fetch_current_weather(lat, lon)
    if not data:
        raise HTTPException(status_code=503, detail="Weather service unavailable. Please try again.")

    current = data.get("current", {})
    daily = data.get("daily", {})

    weather_code = current.get("weather_code", 0)
    weather_info = get_weather_info(weather_code)
    wind_dir = get_wind_direction(current.get("wind_direction_10m", 0))
    uv_level = get_uv_index_level(current.get("uv_index", 0))

    sunrise = daily.get("sunrise", [""])[0] if daily.get("sunrise") else ""
    sunset = daily.get("sunset", [""])[0] if daily.get("sunset") else ""

    # Format times
    if sunrise:
        try:
            sunrise = datetime.fromisoformat(sunrise).strftime("%I:%M %p")
        except:
            pass
    if sunset:
        try:
            sunset = datetime.fromisoformat(sunset).strftime("%I:%M %p")
        except:
            pass

    loc_en, loc_bn = get_location_name(lat, lon)

    result = {
        "location": loc_en,
        "location_bn": loc_bn,
        "latitude": lat,
        "longitude": lon,
        "temperature": current.get("temperature_2m", 0),
        "feels_like": current.get("apparent_temperature", 0),
        "humidity": current.get("relative_humidity_2m", 0),
        "precipitation": current.get("precipitation", 0),
        "weather_code": weather_code,
        "condition": weather_info["condition"],
        "condition_bn": weather_info["condition_bn"],
        "icon": weather_info["icon"],
        "wind_speed": current.get("wind_speed_10m", 0),
        "wind_direction": wind_dir,
        "wind_direction_bn": WIND_DIRECTION_BN.get(wind_dir, wind_dir),
        "pressure": current.get("surface_pressure", 0),
        "uv_index": current.get("uv_index", 0),
        "uv_level": uv_level,
        "sunrise": sunrise,
        "sunset": sunset,
        "last_updated": datetime.now().strftime("%I:%M %p"),
    }

    # Cache result
    await weather_cache.set("current", lat, lon, result)

    return CurrentWeatherResponse(**result)


@router.get("/hourly", response_model=HourlyForecastResponse)
async def get_hourly_forecast(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    hours: int = Query(24, ge=1, le=72, description="Number of hours"),
):
    """
    Get hourly weather forecast for the next 24-72 hours.

    Returns temperature, precipitation probability, and conditions
    for each hour.
    """
    cached = await weather_cache.get("hourly", lat, lon)
    if cached:
        return HourlyForecastResponse(**cached)

    data = await fetch_hourly_forecast(lat, lon, hours)
    if not data:
        raise HTTPException(status_code=503, detail="Weather forecast service unavailable.")

    hourly = data.get("hourly", {})
    times = hourly.get("time", [])
    temps = hourly.get("temperature_2m", [])
    humidities = hourly.get("relative_humidity_2m", [])
    precip_probs = hourly.get("precipitation_probability", [])
    precipitations = hourly.get("precipitation", [])
    codes = hourly.get("weather_code", [])
    winds = hourly.get("wind_speed_10m", [])
    wind_dirs = hourly.get("wind_direction_10m", [])

    forecasts = []
    for i in range(min(len(times), hours)):
        code = codes[i] if i < len(codes) else 0
        info = get_weather_info(code)
        wind_dir = get_wind_direction(wind_dirs[i] if i < len(wind_dirs) else 0)

        forecasts.append(HourlyForecastItem(
            time=times[i] if i < len(times) else "",
            temperature=temps[i] if i < len(temps) else 0,
            humidity=humidities[i] if i < len(humidities) else 0,
            precipitation_probability=precip_probs[i] if i < len(precip_probs) else 0,
            precipitation=precipitations[i] if i < len(precipitations) else 0,
            weather_code=code,
            condition=info["condition"],
            condition_bn=info["condition_bn"],
            icon=info["icon"],
            wind_speed=winds[i] if i < len(winds) else 0,
            wind_direction=wind_dir,
        ))

    loc_en, loc_bn = get_location_name(lat, lon)
    result = {
        "location": loc_en,
        "location_bn": loc_bn,
        "latitude": lat,
        "longitude": lon,
        "forecasts": [f.model_dump() for f in forecasts],
    }

    await weather_cache.set("hourly", lat, lon, result)

    return HourlyForecastResponse(**result)


@router.get("/weekly", response_model=WeeklyForecastResponse)
async def get_weekly_forecast(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
):
    """
    Get 7-day weather forecast.

    Returns daily high/low temperatures, conditions, precipitation,
    and UV index for each day.
    """
    cached = await weather_cache.get("weekly", lat, lon)
    if cached:
        return WeeklyForecastResponse(**cached)

    data = await fetch_weekly_forecast(lat, lon)
    if not data:
        raise HTTPException(status_code=503, detail="Weather forecast service unavailable.")

    daily = data.get("daily", {})
    dates = daily.get("time", [])
    codes = daily.get("weather_code", [])
    max_temps = daily.get("temperature_2m_max", [])
    min_temps = daily.get("temperature_2m_min", [])
    precip_sums = daily.get("precipitation_sum", [])
    precip_probs = daily.get("precipitation_probability_max", [])
    wind_maxs = daily.get("wind_speed_10m_max", [])
    sunrises = daily.get("sunrise", [])
    sunsets = daily.get("sunset", [])
    uv_maxs = daily.get("uv_index_max", [])

    forecasts = []
    for i in range(min(len(dates), 7)):
        code = codes[i] if i < len(codes) else 0
        info = get_weather_info(code)

        # Get day name
        try:
            dt = datetime.fromisoformat(dates[i])
            day_name = dt.strftime("%A")
            day_name_bn = DAY_NAMES_BN.get(day_name, day_name)
            date_str = dt.strftime("%b %d")
        except:
            day_name = "Unknown"
            day_name_bn = "অজানা"
            date_str = dates[i] if i < len(dates) else ""

        sunrise = sunrises[i] if i < len(sunrises) else ""
        sunset = sunsets[i] if i < len(sunsets) else ""
        if sunrise:
            try:
                sunrise = datetime.fromisoformat(sunrise).strftime("%I:%M %p")
            except:
                pass
        if sunset:
            try:
                sunset = datetime.fromisoformat(sunset).strftime("%I:%M %p")
            except:
                pass

        forecasts.append(DailyForecastItem(
            date=date_str,
            day_name=day_name,
            day_name_bn=day_name_bn,
            weather_code=code,
            condition=info["condition"],
            condition_bn=info["condition_bn"],
            icon=info["icon"],
            temp_max=max_temps[i] if i < len(max_temps) else 0,
            temp_min=min_temps[i] if i < len(min_temps) else 0,
            precipitation_sum=precip_sums[i] if i < len(precip_sums) else 0,
            precipitation_probability=precip_probs[i] if i < len(precip_probs) else 0,
            wind_speed_max=wind_maxs[i] if i < len(wind_maxs) else 0,
            sunrise=sunrise,
            sunset=sunset,
            uv_index_max=uv_maxs[i] if i < len(uv_maxs) else 0,
        ))

    loc_en, loc_bn = get_location_name(lat, lon)
    result = {
        "location": loc_en,
        "location_bn": loc_bn,
        "latitude": lat,
        "longitude": lon,
        "forecasts": [f.model_dump() for f in forecasts],
    }

    await weather_cache.set("weekly", lat, lon, result)

    return WeeklyForecastResponse(**result)


@router.get("/alerts", response_model=WeatherAlertsResponse)
async def get_weather_alerts(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
):
    """
    Get weather alerts and warnings for a location.

    Returns alerts for heat waves, heavy rain, thunderstorms,
    high humidity, and other severe conditions.
    """
    cached = await weather_cache.get("alerts", lat, lon)
    if cached:
        return WeatherAlertsResponse(**cached)

    data = await fetch_current_weather(lat, lon)
    if not data:
        raise HTTPException(status_code=503, detail="Weather service unavailable.")

    current = data.get("current", {})
    alerts = generate_weather_alerts(current)

    loc_en, loc_bn = get_location_name(lat, lon)
    result = {
        "location": loc_en,
        "location_bn": loc_bn,
        "alerts": alerts,
        "count": len(alerts),
    }

    await weather_cache.set("alerts", lat, lon, result, ttl=300)  # 5 min cache for alerts

    return WeatherAlertsResponse(**result)


@router.get("/recommendations", response_model=FarmingRecommendationsResponse)
async def get_farming_recommendations(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
):
    """
    Get AI-powered farming recommendations based on current weather.

    Provides actionable advice for irrigation, disease prevention,
    crop protection, and field activities.
    """
    cached = await weather_cache.get("recommendations", lat, lon)
    if cached:
        return FarmingRecommendationsResponse(**cached)

    data = await fetch_current_weather(lat, lon)
    if not data:
        raise HTTPException(status_code=503, detail="Weather service unavailable.")

    current = data.get("current", {})
    recommendations = generate_farming_recommendations(current)

    loc_en, loc_bn = get_location_name(lat, lon)
    result = {
        "location": loc_en,
        "location_bn": loc_bn,
        "recommendations": recommendations,
        "count": len(recommendations),
    }

    await weather_cache.set("recommendations", lat, lon, result)

    return FarmingRecommendationsResponse(**result)


@router.get("/insights", response_model=AIInsightsResponse)
async def get_ai_insights(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
):
    """
    Get AI-powered weather insights for farmers.

    Returns today/tomorrow/weekly summaries and
    action suggestions based on weather conditions.
    """
    cached = await weather_cache.get("insights", lat, lon)
    if cached:
        return AIInsightsResponse(**cached)

    current_data = await fetch_current_weather(lat, lon)
    daily_data = await fetch_weekly_forecast(lat, lon)

    if not current_data:
        raise HTTPException(status_code=503, detail="Weather service unavailable.")

    current = current_data.get("current", {})
    daily = daily_data.get("daily", {}) if daily_data else None
    insights = generate_ai_insights(current, daily=daily)

    loc_en, loc_bn = get_location_name(lat, lon)

    result = {
        "location": loc_en,
        "location_bn": loc_bn,
        **insights,
    }

    await weather_cache.set("insights", lat, lon, result)

    return AIInsightsResponse(**result)


@router.get("/search", response_model=LocationSearchResponse)
async def search_weather_locations(
    name: str = Query(..., min_length=2, max_length=100, description="Location name"),
):
    """
    Search for locations by name.

    Returns matching locations with coordinates for weather queries.
    Supports English and Bangla names.
    """
    results = await search_locations(name)

    locations = []
    for r in results:
        locations.append(LocationSearchResult(
            id=r.get("id", 0),
            name=r.get("name", ""),
            name_bn=r.get("name", ""),
            latitude=r.get("latitude", 0),
            longitude=r.get("longitude", 0),
            country=r.get("country", "Bangladesh"),
            country_bn=r.get("country", "বাংলাদেশ"),
            admin1=r.get("admin1", ""),
            admin1_bn=r.get("admin1", ""),
        ))

    return LocationSearchResponse(
        query=name,
        results=locations,
        count=len(locations),
    )


@router.get("/location-search")
async def search_bd_locations(
    q: str = Query(..., min_length=1, max_length=100, description="Search query"),
):
    """
    Search Bangladesh locations (districts, upazilas, unions).

    Returns matching locations with coordinates.
    """
    results = await search_locations(q)

    # Also search in our built-in Bangladesh data
    from app.services.weather_service import WMO_CODES

    bd_locations = []
    for r in results:
        bd_locations.append({
            "id": r.get("id", 0),
            "name": r.get("name", ""),
            "latitude": r.get("latitude", 0),
            "longitude": r.get("longitude", 0),
            "country": r.get("country", "Bangladesh"),
            "admin1": r.get("admin1", ""),
        })

    return {
        "query": q,
        "results": bd_locations,
        "count": len(bd_locations),
    }
