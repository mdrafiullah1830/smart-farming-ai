"""
Weather Service - Open-Meteo API Integration
Free weather API, no API key required.
https://open-meteo.com/
"""
import httpx
import json
from datetime import datetime, timedelta
from typing import Optional, Dict, List, Any
from app.core.config import settings

OPEN_METEO_BASE = "https://api.open-meteo.com/v1"

# WMO Weather interpretation codes
WMO_CODES = {
    0: {"condition": "Clear", "condition_bn": "পরিষ্কার", "icon": "☀️"},
    1: {"condition": "Mainly Clear", "condition_bn": "মূলত পরিষ্কার", "icon": "🌤️"},
    2: {"condition": "Partly Cloudy", "condition_bn": "আংশিক মেঘলা", "icon": "⛅"},
    3: {"condition": "Overcast", "condition_bn": "মেঘাচ্ছন্ন", "icon": "☁️"},
    45: {"condition": "Fog", "condition_bn": "কুয়াশা", "icon": "🌫️"},
    48: {"condition": "Rime Fog", "condition_bn": "ঘন কুয়াশা", "icon": "🌫️"},
    51: {"condition": "Light Drizzle", "condition_bn": "হালকা গুঁড়ি বৃষ্টি", "icon": "🌦️"},
    53: {"condition": "Moderate Drizzle", "condition_bn": "মাঝারি গুঁড়ি বৃষ্টি", "icon": "🌦️"},
    55: {"condition": "Dense Drizzle", "condition_bn": "ঘন গুঁড়ি বৃষ্টি", "icon": "🌧️"},
    56: {"condition": "Freezing Drizzle", "condition_bn": "হিমশীতল গুঁড়ি বৃষ্টি", "icon": "🌧️"},
    57: {"condition": "Heavy Freezing Drizzle", "condition_bn": "ভারী হিমশীতল গুঁড়ি বৃষ্টি", "icon": "🌧️"},
    61: {"condition": "Light Rain", "condition_bn": "হালকা বৃষ্টি", "icon": "🌦️"},
    63: {"condition": "Moderate Rain", "condition_bn": "মাঝারি বৃষ্টি", "icon": "🌧️"},
    65: {"condition": "Heavy Rain", "condition_bn": "ভারী বৃষ্টি", "icon": "🌧️"},
    66: {"condition": "Light Freezing Rain", "condition_bn": "হালকা হিমশীতল বৃষ্টি", "icon": "🌧️"},
    67: {"condition": "Heavy Freezing Rain", "condition_bn": "ভারী হিমশীতল বৃষ্টি", "icon": "🌧️"},
    71: {"condition": "Light Snow", "condition_bn": "হালকা তুষারপাত", "icon": "❄️"},
    73: {"condition": "Moderate Snow", "condition_bn": "মাঝারি তুষারপাত", "icon": "❄️"},
    75: {"condition": "Heavy Snow", "condition_bn": "ভারী তুষারপাত", "icon": "❄️"},
    77: {"condition": "Snow Grains", "condition_bn": "তুষার কণা", "icon": "❄️"},
    80: {"condition": "Light Rain Showers", "condition_bn": "হালকা বৃষ্টির ঝাপটা", "icon": "🌦️"},
    81: {"condition": "Moderate Rain Showers", "condition_bn": "মাঝারি বৃষ্টির ঝাপটা", "icon": "🌧️"},
    82: {"condition": "Violent Rain Showers", "condition_bn": "তীব্র বৃষ্টির ঝাপটা", "icon": "⛈️"},
    85: {"condition": "Light Snow Showers", "condition_bn": "হালকা তুষার ঝাপটা", "icon": "🌨️"},
    86: {"condition": "Heavy Snow Showers", "condition_bn": "ভারী তুষার ঝাপটা", "icon": "🌨️"},
    95: {"condition": "Thunderstorm", "condition_bn": "বজ্রঝড়", "icon": "⛈️"},
    96: {"condition": "Thunderstorm with Hail", "condition_bn": "বজ্রঝড় ও শিলাবৃষ্টি", "icon": "⛈️"},
    99: {"condition": "Heavy Thunderstorm with Hail", "condition_bn": "ভারী বজ্রঝড় ও শিলাবৃষ্টি", "icon": "⛈️"},
}


def get_weather_info(code: int) -> Dict[str, str]:
    """Get weather condition info from WMO code."""
    return WMO_CODES.get(code, {"condition": "Unknown", "condition_bn": "অজানা", "icon": "❓"})


def get_wind_direction(deg: float) -> str:
    """Convert wind degree to direction."""
    directions = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
                  "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"]
    idx = round(deg / 22.5) % 16
    return directions[idx]


def get_uv_index_level(uv: float) -> str:
    """Get UV index risk level."""
    if uv <= 2:
        return "low"
    elif uv <= 5:
        return "moderate"
    elif uv <= 7:
        return "high"
    elif uv <= 10:
        return "very_high"
    return "extreme"


async def fetch_current_weather(lat: float, lon: float) -> Optional[Dict[str, Any]]:
    """Fetch current weather from Open-Meteo API."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                f"{OPEN_METEO_BASE}/forecast",
                params={
                    "latitude": lat,
                    "longitude": lon,
                    "current": "temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_direction_10m,surface_pressure,uv_index",
                    "daily": "sunrise,sunset",
                    "timezone": "Asia/Dhaka",
                    "forecast_days": 1,
                },
            )
            if response.status_code == 200:
                return response.json()
    except Exception as e:
        print(f"Open-Meteo API error: {e}")
    return None


async def fetch_hourly_forecast(lat: float, lon: float, hours: int = 24) -> Optional[Dict[str, Any]]:
    """Fetch hourly forecast from Open-Meteo API."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                f"{OPEN_METEO_BASE}/forecast",
                params={
                    "latitude": lat,
                    "longitude": lon,
                    "hourly": "temperature_2m,relative_humidity_2m,precipitation_probability,precipitation,weather_code,wind_speed_10m,wind_direction_10m",
                    "timezone": "Asia/Dhaka",
                    "forecast_hours": hours,
                },
            )
            if response.status_code == 200:
                return response.json()
    except Exception as e:
        print(f"Open-Meteo hourly API error: {e}")
    return None


async def fetch_weekly_forecast(lat: float, lon: float) -> Optional[Dict[str, Any]]:
    """Fetch 7-day forecast from Open-Meteo API."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                f"{OPEN_METEO_BASE}/forecast",
                params={
                    "latitude": lat,
                    "longitude": lon,
                    "daily": "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,sunrise,sunset,uv_index_max",
                    "timezone": "Asia/Dhaka",
                    "forecast_days": 7,
                },
            )
            if response.status_code == 200:
                return response.json()
    except Exception as e:
        print(f"Open-Meteo weekly API error: {e}")
    return None


async def search_locations(query: str) -> List[Dict[str, Any]]:
    """Search locations using Open-Meteo Geocoding API."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                "https://geocoding-api.open-meteo.com/v1/search",
                params={
                    "name": query,
                    "count": 10,
                    "language": "bn",
                    "format": "json",
                },
            )
            if response.status_code == 200:
                data = response.json()
                return data.get("results", [])
    except Exception as e:
        print(f"Geocoding API error: {e}")
    return []


def generate_weather_alerts(current: Dict, hourly: Optional[Dict] = None) -> List[Dict[str, Any]]:
    """Generate weather alerts based on current conditions."""
    alerts = []
    temp = current.get("temperature_2m", 0)
    humidity = current.get("relative_humidity_2m", 0)
    wind_speed = current.get("wind_speed_10m", 0)
    precipitation = current.get("precipitation", 0)
    weather_code = current.get("weather_code", 0)

    # Heat wave alert
    if temp > 38:
        alerts.append({
            "title": "Heat Wave Alert",
            "title_bn": "তাপ প্রবাহ সতর্কতা",
            "description": f"Temperature is {temp}°C. Stay hydrated and avoid outdoor activities.",
            "description_bn": f"তাপমাত্রা {temp}°C। পানি পান করুন এবং বাইরের কার্যকলাপ এড়িয়ে চলুন।",
            "severity": "high",
            "icon": "🌡️",
        })

    # Heavy rain alert
    if precipitation > 10 or weather_code in [65, 82, 95, 96, 99]:
        alerts.append({
            "title": "Heavy Rain Warning",
            "title_bn": "ভারী বৃষ্টি সতর্কতা",
            "description": f"Heavy rainfall expected. Precipitation: {precipitation}mm.",
            "description_bn": f"ভারী বৃষ্টি প্রত্যাশিত। বৃষ্টিপাত: {precipination}মিমি।",
            "severity": "high",
            "icon": "🌧️",
        })

    # Strong wind alert
    if wind_speed > 40:
        alerts.append({
            "title": "Strong Wind Alert",
            "title_bn": "প্রবল বাতাস সতর্কতা",
            "description": f"Wind speed: {wind_speed} km/h. Secure loose objects.",
            "description_bn": f"বাতাসের গতি: {wind_speed} কিমি/ঘণ্টা। ঢিলে বস্তু নিশ্চিত করুন।",
            "severity": "medium",
            "icon": "💨",
        })

    # High humidity alert
    if humidity > 90:
        alerts.append({
            "title": "High Humidity Alert",
            "title_bn": "উচ্চ আর্দ্রতা সতর্কতা",
            "description": f"Humidity: {humidity}%. Monitor for fungal diseases.",
            "description_bn": f"আর্দ্রতা: {humidity}%। ছত্রাক রোগের জন্য পর্যবেক্ষণ করুন।",
            "severity": "medium",
            "icon": "💧",
        })

    # Thunderstorm alert
    if weather_code in [95, 96, 99]:
        alerts.append({
            "title": "Thunderstorm Warning",
            "title_bn": "বজ্রঝড় সতর্কতা",
            "description": "Thunderstorm in progress. Seek shelter immediately.",
            "description_bn": "বজ্রঝড় চলছে। অবিলম্বে আশ্রয় নিন।",
            "severity": "high",
            "icon": "⛈️",
        })

    # Cold wave alert
    if temp < 8:
        alerts.append({
            "title": "Cold Wave Alert",
            "title_bn": "শীত সতর্কতা",
            "description": f"Temperature is {temp}°C. Protect crops from cold.",
            "description_bn": f"তাপমাত্রা {temp}°C। ফসলকে শীত থেকে রক্ষা করুন।",
            "severity": "medium",
            "icon": "🥶",
        })

    return alerts


def generate_farming_recommendations(current: Dict, hourly: Optional[Dict] = None) -> List[Dict[str, str]]:
    """Generate AI-powered farming recommendations based on weather."""
    recommendations = []
    temp = current.get("temperature_2m", 0)
    humidity = current.get("relative_humidity_2m", 0)
    wind_speed = current.get("wind_speed_10m", 0)
    precipitation = current.get("precipitation", 0)
    weather_code = current.get("weather_code", 0)

    # Rain-based recommendations
    if precipitation > 5 or weather_code in [61, 63, 65, 80, 81, 82]:
        recommendations.append({
            "title": "Delay Irrigation",
            "title_bn": "সেচ বিলম্বিত করুন",
            "message": "Rain expected. Delay irrigation for next 24 hours to save water.",
            "message_bn": "বৃষ্টি প্রত্যাশিত। পানি বাঁচাতে পরবর্তী ২৪ ঘণ্টায় সেচ বিলম্বিত করুন।",
            "icon": "💧",
            "priority": "high",
        })
        recommendations.append({
            "title": "Check Drainage",
            "title_bn": "জল নিষ্কাশন পরীক্ষা",
            "message": "Ensure field drainage is clear to prevent waterlogging.",
            "message_bn": "জলাবদ্ধতা রোধে মাঠের জল নিষ্কাশন পরিষ্কার আছে তা নিশ্চিত করুন।",
            "icon": "🌊",
            "priority": "high",
        })

    # Temperature-based recommendations
    if temp > 35:
        recommendations.append({
            "title": "Increase Water Supply",
            "title_bn": "পানির সরবরাহ বাড়ান",
            "message": f"High temperature ({temp}°C). Increase irrigation frequency.",
            "message_bn": f"উচ্চ তাপমাত্রা ({temp}°C)। সেচের হার বাড়ান।",
            "icon": "🌡️",
            "priority": "high",
        })
        recommendations.append({
            "title": "Provide Shade",
            "title_bn": "ছায়া প্রদান করুন",
            "message": "Use shade nets for sensitive crops during peak heat.",
            "message_bn": "চরম তাপে সংবেদনশীল ফসলের জন্য ছায়া জাল ব্যবহার করুন।",
            "icon": "⛱️",
            "priority": "medium",
        })

    if temp < 10:
        recommendations.append({
            "title": "Protect from Cold",
            "title_bn": "শীত থেকে রক্ষা করুন",
            "message": "Low temperature. Cover sensitive crops with mulch or plastic.",
            "message_bn": "কম তাপমাত্রা। মালচ বা প্লাস্টিক দিয়ে সংবেদনশীল ফসল ঢাকুন।",
            "icon": "🧊",
            "priority": "high",
        })

    # Wind-based recommendations
    if wind_speed > 30:
        recommendations.append({
            "title": "Protect from Wind",
            "title_bn": "বাতাস থেকে রক্ষা করুন",
            "message": "Strong winds expected. Support tall crops and secure structures.",
            "message_bn": "প্রবল বাতাস প্রত্যাশিত। লম্বা ফসলকে সমর্থন দিন।",
            "icon": "💨",
            "priority": "high",
        })

    # Humidity-based recommendations
    if humidity > 85:
        recommendations.append({
            "title": "Monitor Fungal Disease",
            "title_bn": "ছত্রাক রোগ পর্যবেক্ষণ",
            "message": "High humidity increases fungal disease risk. Apply preventive fungicide.",
            "message_bn": "উচ্চ আর্দ্রতা ছত্রাক রোগের ঝুঁকি বাড়ায়। প্রতিরোধী ছত্রাকনাশক প্রয়োগ করুন।",
            "icon": "🍄",
            "priority": "medium",
        })

    if humidity < 30:
        recommendations.append({
            "title": "Increase Moisture",
            "title_bn": "আর্দ্রতা বাড়ান",
            "message": "Low humidity. Consider misting or increasing irrigation.",
            "message_bn": "কম আর্দ্রতা। মিস্টিং বা সেচ বাড়ানোর কথা বিবেচনা করুন।",
            "icon": "💦",
            "priority": "medium",
        })

    # Clear weather recommendations
    if weather_code in [0, 1] and temp > 20 and temp < 35:
        recommendations.append({
            "title": "Good Conditions for Field Work",
            "title_bn": "ক্ষেতের কাজের জন্য ভালো অবস্থা",
            "message": "Good weather for harvesting, spraying, or field maintenance.",
            "message_bn": "ফসল তোলা, স্প্রে বা মাঠের রক্ষণাবেক্ষণের জন্য ভালো আবহাওয়া।",
            "icon": "🌾",
            "priority": "low",
        })

    return recommendations


def generate_ai_insights(current: Dict, hourly: Optional[Dict] = None, daily: Optional[Dict] = None) -> Dict[str, Any]:
    """Generate AI-powered weather insights for farmers."""
    temp = current.get("temperature_2m", 0)
    humidity = current.get("relative_humidity_2m", 0)
    wind_speed = current.get("wind_speed_10m", 0)
    precipitation = current.get("precipitation", 0)
    weather_code = current.get("weather_code", 0)
    weather_info = get_weather_info(weather_code)

    # Today's summary
    today_summary = f"Today: {weather_info['condition_bn']}, {temp}°C, {humidity}% humidity."
    if precipitation > 0:
        today_summary += f" Rainfall: {precipitation}mm."

    # Tomorrow summary
    tomorrow_summary = "Tomorrow's forecast will be available soon."
    if daily and len(daily.get("time", [])) > 1:
        tmrw_code = daily.get("weather_code", [0])[1] if len(daily.get("weather_code", [])) > 1 else 0
        tmrw_max = daily.get("temperature_2m_max", [0])[1] if len(daily.get("temperature_2m_max", [])) > 1 else 0
        tmrw_min = daily.get("temperature_2m_min", [0])[1] if len(daily.get("temperature_2m_min", [])) > 1 else 0
        tmrw_info = get_weather_info(tmrw_code)
        tomorrow_summary = f"Tomorrow: {tmrw_info['condition_bn']}, {tmrw_min}°C - {tmrw_max}°C."

    # 7-day summary
    weekly_summary = "Weekly outlook: "
    if daily:
        codes = daily.get("weather_code", [])
        max_temps = daily.get("temperature_2m_max", [])
        if codes:
            rain_days = sum(1 for c in codes if c >= 51)
            weekly_summary += f"{rain_days} rainy days expected this week."

    # Farmer action suggestions
    actions = []
    if precipitation > 5 or weather_code in [61, 63, 65, 80, 81, 82, 95]:
        actions.append({"action": "Delay irrigation", "action_bn": "সেচ বিলম্বিত করুন", "reason": "Rain expected"})
    if temp > 35:
        actions.append({"action": "Increase watering", "action_bn": "পানি বাড়ান", "reason": "High temperature"})
    if humidity > 85:
        actions.append({"action": "Spray fungicide", "action_bn": "ছত্রাকনাশক স্প্রে করুন", "reason": "High humidity"})
    if wind_speed > 30:
        actions.append({"action": "Support crops", "action_bn": "ফসলের সমর্থন দিন", "reason": "Strong winds"})
    if weather_code in [0, 1] and 20 <= temp <= 35:
        actions.append({"action": "Good for harvest", "action_bn": "ফসল তোলার জন্য ভালো", "reason": "Clear weather"})

    return {
        "today_summary": today_summary,
        "today_summary_bn": today_summary,
        "tomorrow_summary": tomorrow_summary,
        "tomorrow_summary_bn": tomorrow_summary,
        "weekly_summary": weekly_summary,
        "weekly_summary_bn": weekly_summary,
        "actions": actions,
    }
