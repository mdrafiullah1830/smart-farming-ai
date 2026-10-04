# API Documentation

## Smart Farming AI Platform - API Reference

### Base URL
```
http://localhost:8000/api/v1
```
Worker (Cloudflare) equivalent: `https://<worker>/api/v1/...`

### Authentication

All endpoints (except register/login) require JWT Bearer token:
```
Authorization: Bearer <access_token>
```

### Observability (Worker)

- Request ID: every response includes `X-Request-Id` (client-supplied or server UUID).
- Structured logs: JSON lines with `ts`, `level`, `msg`, `requestId`, `method`, `path`, `status`, `durationMs`.
- Rate limit: 60 req/min/IP when KV is configured; `X-RateLimit-*` + `Retry-After` on 429.

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

## Worker API — Flood & Climate Resilience

Risk is computed per request from the stored exposure plus the live Open-Meteo
forecast, and is never persisted. A stored risk number outlives the forecast it
came from. Every assessment returns a level, the reasons behind it, and a
decision window, because a bare score is not actionable.

### GET /api/v1/flood/zones
Public. Known flood basins, deepest first. `?district_id=` filters.

```json
{
  "success": true,
  "zones": [
    {
      "id": "fz-sun-takabil",
      "district_id": "45",
      "name_en": "Takabil haor",
      "name_bn": "তাকাবিল হাওর",
      "flood_depth_m": 2.8,
      "flood_duration_days": 25,
      "flood_seasons": "boro,aman",
      "district_name_bn": "সুনামগঞ্জ"
    }
  ]
}
```

### GET /api/v1/flood/districts/{districtId}
Public. District headline risk, derived from its worst zone in the current
season. An unknown id answers **400** naming `/api/v1/locations/zillas`.

### GET /api/v1/flood/assessment
**Requires auth.** The signed-in farmer's exposures, worst first.

```json
{
  "success": true,
  "season": "aman",
  "highestLevel": "severe",
  "totalAtRiskTaka": 180000,
  "forecastAvailable": true,
  "exposures": [
    {
      "exposureId": "e1",
      "level": "severe",
      "score": 0.8,
      "reasons_bn": ["এই এলাকায় পানির গভীরতা সাধারণত 2.8 মিটার বেশি"],
      "reasons_en": ["Typical flood depth here is 2.8 m"],
      "actionDays": 2,
      "actionWindowBn": "২ দিনের মধ্যে ফসল তোলার সিদ্ধান্ত নিন",
      "actionWindowEn": "Decide on harvest within 2 days",
      "atRiskTaka": 180000
    }
  ]
}
```

`forecastAvailable: false` means the upstream forecast failed. The static half
of the assessment still stands; the UI says so rather than showing a clean bill
of health.

`atRiskTaka` is a fraction of the standing crop's value, not the whole year's:
full at `severe`, half at `high`, a fifth at `moderate`, zero at `low`. Whole
taka only — D1 has no decimal type.

### POST /api/v1/flood/exposures
**Requires auth.** `zone_id` is resolved before insert, so an unknown one is a
**400** naming `/api/v1/flood/zones` rather than a foreign-key 500.

```json
{
  "zone_id": "fz-sun-takabil",
  "crop_name_en": "Boro rice",
  "crop_name_bn": "বোরো ধান",
  "area_acres": 3.5,
  "seasons": "boro,aman",
  "crop_value_taka": 180000,
  "drainage_class": 1
}
```

### DELETE /api/v1/flood/exposures/{id}
**Requires auth.** Scoped to the caller, so a stranger's id answers **404**.

### POST /api/v1/flood/actions
**Requires auth.** Records what the farmer actually did. Append-only; the risk
level is snapshotted onto the row so hit-rate analysis stays honest.
`action` ∈ `none`, `early`, `relocated`, `drained`, `lost`.

### GET /api/v1/flood/actions
**Requires auth.** History plus the loss ledger
(`{ claimCount, totalClaimedTaka }`) for an insurance claim.

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
