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

### Market analysis

Aggregated, source-attributed price information built from published
government price feeds. Price information is public reference data; only
`POST /analysis/refresh` requires an account.

All analysis responses carry a `disclaimer` (English) and `disclaimerBn`
(Bangla) alongside `warnings: string[]`. The disclaimer is part of the
contract: these are aggregated figures, not a quote for any one market.

Warnings are counted and named, for example `sources_disagree:2`,
`unit_assumed:1` (a source published no unit, so ours was assumed),
`expired:1`, `national_fallback`, `migration_pending`.

#### GET /market/analysis

List aggregated prices.

**Query parameters:**

| Name | Type | Notes |
| --- | --- | --- |
| `q` | string | Match against the normalized commodity name or id |
| `category` | string | Exact category |
| `commodity` | string | Exact commodity id |
| `district_id` | string | Exact district id |
| `division` | string | Exact division |
| `freshness` | enum | `outdated`, `aged`, `recent`, `fresh`, `very_fresh`. Returns that level **or fresher** |
| `min_confidence` | number | 0–100 |
| `include_expired` | `true` | Serve rows past `expires_at` |
| `limit` | number | 1–200, default 50 |
| `offset` | number | default 0 |

Expired aggregates are hidden unless `include_expired=true`, so a caller
never sees a stale number presented as current.

**Response:**
```json
{
  "success": true,
  "prices": [
    {
      "id": "agg:cm-rice:::kg",
      "commodityId": "cm-rice",
      "normalizedName": "ভাতের চাল (মিনিকেট)",
      "category": "staple",
      "priceMin": 72,
      "priceMax": 75,
      "priceAvg": 73.5,
      "currency": "BDT",
      "unit": "kg",
      "sourceCount": 1,
      "sources": ["dam_gov"],
      "priceVariationPct": 4.1,
      "hasDisagreement": false,
      "overallConfidence": 61.5,
      "overallFreshness": "fresh",
      "aggregatedAt": "2026-10-07T06:00:00.000Z",
      "expiresAt": "2026-10-07T12:00:00.000Z"
    }
  ],
  "total": 1,
  "sources": [ { "id": "dam_gov", "trustTier": 1 } ],
  "warnings": ["unit_assumed:22"],
  "disclaimer": "Aggregated from published sources...",
  "disclaimerBn": "প্রকাশিত উৎস থেকে...",
  "lastUpdated": "2026-10-07T06:00:00.000Z"
}
```

`hasDisagreement` means contributing sources spread by more than 25%, in
which case every contributing record is also marked `disputed`.

#### GET /market/analysis/commodities

The commodity catalog: id, English and Bangla names, category, the unit the
catalog uses by default, the units the commodity accepts, and the aliases
sources publish.

**Query:** `category` (optional, exact).

#### GET /market/analysis/sources

Source health: what is collected from, when it last ran, and whether it
worked. `headers` and `userAgent` are never returned — they describe how we
authenticate to a publisher. Includes the last 50 fetch log entries.

#### GET /market/analysis/{district}

Prices for one district, which may be given as its id, its English name, or
its Bangla name.

District rows are returned when they exist. When they do not (the seeded
national feed carries no place at all) the response serves national figures
instead with `"scope": "national"` and a `national_fallback` warning, so a
local price is never implied where none was published.

**Response extras:** `district` (`id`, `nameEn`, `nameBn`, `division`),
`scope` (`district` | `national`), `districtPricesAvailable`.

**404** when the district is unknown.

#### POST /market/analysis/refresh

Requires `Authorization: Bearer <token>` (401 otherwise).

**Request:**
```json
{ "source_ids": ["dam_gov"], "force": false, "max_sources": 3 }
```

| Field | Rules |
| --- | --- |
| `source_ids` | Optional; restricts the run to these sources |
| `force` | Bypasses the freshness and rate gates — but **only** for sources named in `source_ids`. `force: true` without a list is rejected (400) |
| `max_sources` | 1–10, default 3. Bounds the run so a request cannot become an open-ended crawler |

**Response:**
```json
{
  "success": true,
  "startedAt": "2026-10-07T06:00:00.000Z",
  "durationMs": 840,
  "results": [
    { "sourceId": "dam_gov", "status": "success", "recordsExtracted": 22, "recordsValid": 22 }
  ],
  "aggregatesWritten": 22,
  "aggregatesRemoved": 0,
  "recordsPruned": 0
}
```

`status` is `success`, `failed`, or `skipped` (`already_fresh`,
`rate_limited`). A `failed` source does not fail the request.

`GET /market/analysis` will refresh by itself **only** when no unexpired
aggregate exists, at most once per 60-second lock window, and only for up to
two sources. Warm reads never make an outbound request.

**503** if migration `0011` has not been applied to the binding.

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

## Worker API — Voice-first assistant

Speech is handled by the browser; the server matches text. `capabilities` says
so explicitly rather than implying a server-side STT model.

### GET /api/v1/voice/capabilities
Public. What the server and browser each contribute.

```json
{
  "success": true,
  "capabilities": {
    "serverTranscription": false,
    "banglishNormalisation": true,
    "conversationContext": true,
    "languages": ["bn", "en"]
  },
  "browserResponsibility": ["SpeechRecognition", "speechSynthesis"]
}
```

### POST /api/v1/voice/ask
Public — the curated guidance needs no account, and the client holds the
conversation.

```json
{
  "transcript": "boro ta kete aishen, koto sar lagbe",
  "lang": "bn",
  "context": [{ "role": "user", "text": "সার কবে দিব" }]
}
```

```json
{
  "success": true,
  "transcript": "boro ta kete aishen, koto sar lagbe",
  "understood": "বোরো করে করবেন, কত সার লাগবে",
  "wasBanglish": true,
  "usedContext": false,
  "reply": "মাটি পরীক্ষা ও ফসলের বৃদ্ধির ধাপ অনুযায়ী সার দিন…",
  "source": "curated-voice-guidance"
}
```

`understood` is what the engine actually matched on. The UI shows it whenever
`wasBanglish` or `usedContext` is true, so a misrecognised word can be corrected
before the farmer acts on it.

`context` is capped at 4 turns of 400 characters each, and roles are coerced —
a caller cannot push an arbitrary payload into the matching rules. An empty
transcript is a **400**, and so is one over 1000 characters, which is a stuck
microphone rather than a question.

The guidance is the curated set `/api/v1/chat` already serves, plus a season
branch. Nothing here invents an answer.

---

## Worker API — Irrigation & water management

The pump switch in `/api/v1/devices/{id}/command` says on or off. It cannot say
whether the field needed water, how much, or what the last season cost. Those
two questions are what these routes answer.

Every irrigation figure is **advisory**: `mmPerDay` and `litresPerDay` come from
the seeded `water_requirements` table (a published crop-stage figure), not from
a measurement of the farmer's own field. The API labels them as such and the
dashboard repeats the disclaimer on the card.

### GET /api/v1/irrigation/advice

Auth required, because it embeds the farmer's own latest sensor reading.

| Query | Notes |
| --- | --- |
| `crop` | Crop name, e.g. `Rice`. Defaults to `Rice`. |
| `season` | `boro`, `aman`, `aus` or `other`. Defaults to `boro`. |
| `days_since_sowing` | Derives the growth stage. Absent or nonsensical falls back to `60` (panicle), the peak-demand stage. |
| `district_id` | A district override wins over the national default. |

```json
{
  "success": true,
  "crop": "Rice",
  "season": "boro",
  "stage": "panicle",
  "daysSinceSowing": 65,
  "areaAcres": 2,
  "moisturePercent": 40,
  "readingAt": "2026-10-04T09:12:00.000Z",
  "districtSpecific": false,
  "advice": {
    "status": "needs_water",
    "statusBn": "সেচ দরকার",
    "stage": "panicle",
    "guidance": true,
    "mmPerDay": 9,
    "litresPerDay": 73,
    "headlineBn": "এখন সেচ দরকার",
    "headlineEn": "Irrigation needed now",
    "detailBn": "মাটির আর্দ্রতা ৪০% — ৯ মিমি/দিন প্রয়োজন, প্রায় ৭৩ লিটার। সকালে সেচ দিলে বাষ্পীভবন কম হয়।",
    "detailEn": "Soil moisture is 40% — needs 9 mm/day, about 73 litres. Irrigation early in the morning loses less to evaporation."
  }
}
```

`status` is one of:

| Status | Meaning |
| --- | --- |
| `needs_water` | Moisture below 60%. Irrigate. |
| `watch` | 60–70%. Borderline; check again tomorrow. |
| `adequate` | At or above 70%. Do not irrigate. |
| `no_reading` | The requirement is known but no sensor has reported. **`mmPerDay` and `litresPerDay` are still returned** — the crop's demand is independent of the probe, so withholding it would waste the one useful number. The `no_reading` branch never fabricates a status. |
| `no_requirement` | The crop/season/stage is not in the seed table. Distinct from `no_reading`: an unknown crop is not a missing sensor. Figures are `null`. |

`litresPerDay` is a whole number, or `null` when the area is unknown. The advice
still stands without it — a farmer can act on "needs water" without litres.
1 mm over 1 acre is 4.047 L.

### GET /api/v1/irrigation/requirements

Public. The seeded crop-stage table, with the disclaimer.

| Query | Notes |
| --- | --- |
| `season` | Optional; `boro`, `aman`, `aus` or `other`. |

```json
{
  "success": true,
  "disclaimer": "Advisory crop-stage figures in mm/day, not measurements of any field.",
  "requirements": [
    { "crop_name_en": "Rice", "crop_name_bn": "ধান", "season": "boro", "stage": "panicle", "mm_per_day": 9, "district_id": null }
  ]
}
```

### GET /api/v1/irrigation/usage

Auth required. The history the pump switch cannot keep: `device_commands` holds
one row per device and overwrites it, so this ledger is the only record of how
much water a field got and what it cost.

| Query | Notes |
| --- | --- |
| `season` | Optional filter. |

```json
{
  "success": true,
  "usage": {
    "totalLitres": 5230,
    "totalCostTaka": 180,
    "runCount": 1,
    "unconfirmedCount": 1
  },
  "events": []
}
```

Only runs with a confirmed volume count toward `totalLitres` and `runCount`. An
`on` command whose run was never reported has a `null` volume and is surfaced
separately in `unconfirmedCount` — counting it as zero would make the total look
authoritative when it is not.

### POST /api/v1/irrigation/events

Auth required. Record a confirmed run.

```json
{
  "crop_name_en": "Rice",
  "season": "boro",
  "volume_litres": 5230,
  "duration_minutes": 45,
  "cost_taka": 180,
  "note": "morning run"
}
```

A negative `volume_litres` is a **400**. Omit `volume_litres` for an `on`
command whose volume is not yet known; it is stored as unconfirmed.

### GET /api/v1/irrigation/schedules

Auth required. Shared-pump rotations. `start_time` is local wall-clock `HH:MM`
and `interval_days` is 1–30.

### POST /api/v1/irrigation/schedules

```json
{
  "name": "মাঠ A",
  "crop_name_en": "Rice",
  "season": "boro",
  "start_time": "06:00",
  "interval_days": 3,
  "target_litres": 5230
}
```

An impossible time such as `99:99` is a **400**.

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
