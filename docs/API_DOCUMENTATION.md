# API Documentation

## Smart Farming AI Platform - API Reference

### Base URL
```
http://localhost:8000/api/v1
```

### Authentication

All endpoints (except register/login) require JWT Bearer token:
```
Authorization: Bearer <access_token>
```

---

## Authentication

### POST /auth/register
Register a new farmer account.

**Request:**
```json
{
  "phone": "01712345678",
  "password": "securepass123",
  "full_name": "Rafiq Ahmed",
  "full_name_bn": "রফিক আহমেদ",
  "email": "rafiq@example.com",
  "language_preference": "bn"
}
```

**Response (201):**
```json
{
  "access_token": "eyJ...",
  "refresh_token": "eyJ...",
  "token_type": "bearer",
  "expires_in": 1800,
  "user": {
    "id": "uuid",
    "phone": "01712345678",
    "full_name": "Rafiq Ahmed",
    "full_name_bn": "রফিক আহমেদ",
    "role": "farmer"
  }
}
```

### POST /auth/login
Login with phone and password.

**Request:**
```json
{
  "phone": "01712345678",
  "password": "securepass123"
}
```

### POST /auth/refresh
Refresh access token.

**Request:**
```json
{
  "refresh_token": "eyJ..."
}
```

### GET /auth/profile
Get current user profile.

---

## Weather Intelligence

### GET /weather/district/{district_id}
Get current weather for a district.

**Response:**
```json
{
  "district": "Dhaka",
  "district_bn": "ঢাকা",
  "temperature_c": 32.5,
  "feels_like_c": 35.2,
  "humidity": 75.0,
  "rainfall_mm": 2.5,
  "condition": "Clouds",
  "condition_bn": "মেঘলা"
}
```

### GET /weather/district/{district_id}/forecast
Get 7-day weather forecast.

### GET /weather/district/{district_id}/risk
Get weather risk assessment.

---

## Soil Analysis

### POST /soil/analyze
Analyze soil health and get recommendations.

**Request:**
```json
{
  "farm_id": "uuid",
  "ph_level": 6.5,
  "nitrogen_mg_kg": 40,
  "phosphorus_mg_kg": 25,
  "potassium_mg_kg": 150,
  "moisture_pct": 30
}
```

**Response:**
```json
{
  "health_score": 72.5,
  "health_label": "Good",
  "health_label_bn": "ভালো",
  "suitable_crops": [...],
  "fertilizer_recommendations": [...],
  "risk_indicators": [...]
}
```

---

## Crop Recommendation

### POST /crops/recommend
Get AI-powered crop recommendations.

**Request:**
```json
{
  "temperature": 28,
  "humidity": 70,
  "rainfall": 150,
  "ph": 6.5,
  "nitrogen": 40,
  "phosphorus": 25,
  "potassium": 40,
  "season": "kharif"
}
```

**Response:**
```json
{
  "recommendations": [
    {
      "name": "rice",
      "name_bn": "ধান",
      "confidence": 0.92,
      "profit_score": 78
    }
  ]
}
```

### GET /crops/
List all crops with optional filters.

### GET /crops/{crop_id}
Get crop details.

### POST /crops/rotation-advice
Get crop rotation recommendations.

---

## Yield Prediction

### POST /yield/predict
Predict crop yield.

**Request:**
```json
{
  "crop_id": "uuid",
  "area_acres": 5,
  "temperature": 28,
  "humidity": 70,
  "rainfall": 150,
  "ph": 6.5,
  "nitrogen": 40,
  "irrigation_used": true,
  "season": "kharif",
  "year": 2025
}
```

**Response:**
```json
{
  "expected_yield": 12.5,
  "yield_per_acre": 2.5,
  "confidence": 0.85,
  "risk_level": "low",
  "revenue_estimate": 687500,
  "profit_estimate": 387500,
  "roi_estimate": 129.2
}
```

---

## Disease Detection

### POST /disease/detect
Detect plant disease from image.

**Request:** Multipart form with `image` file.

**Response:**
```json
{
  "disease_name": "Rice Blast",
  "disease_name_bn": "ধানের ব্লাস্ট রোগ",
  "confidence": 0.87,
  "severity": "high",
  "treatment": [...],
  "prevention": [...]
}
```

---

## Market Intelligence

### GET /market/prices/{crop_id}
Get historical crop prices.

### GET /market/analysis/{district_id}
Get comprehensive market analysis.

### GET /market/profit-calculator
Calculate farming profit.

---

## Chatbot

### POST /chatbot/chat
Chat with AI agricultural assistant.

**Request:**
```json
{
  "message": "ধান চাষ কিভাবে করব?",
  "session_id": "uuid",
  "language": "bn"
}
```

**Response:**
```json
{
  "response": "ধান বাংলাদেশের প্রধান খাদ্যশস্য...",
  "session_id": "uuid",
  "intent": "ধান",
  "confidence": 0.9,
  "suggestions": [...]
}
```

---

## Government Dashboard

### GET /government/dashboard
Get national agricultural overview.

### GET /government/districts
List all 64 districts.

### GET /government/analytics/yield
Get yield analytics.

### GET /government/analytics/market
Get market analytics.

### POST /government/advisories
Create government advisory.

---

## Error Responses

```json
{
  "detail": "Error message"
}
```

Status codes:
- 400: Bad Request
- 401: Unauthorized
- 403: Forbidden
- 404: Not Found
- 429: Rate Limited
- 500: Internal Server Error
