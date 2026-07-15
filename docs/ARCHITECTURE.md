# Architecture Document - Smart Farming AI Platform Bangladesh

## System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    SMART FARMING AI PLATFORM                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │  FLUTTER APP  │    │  WEB DASHBOARD│    │   ADMIN      │      │
│  │  (Mobile)     │    │  (React)     │    │   PANEL      │      │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘      │
│         │                    │                    │               │
│         └────────────────────┼────────────────────┘               │
│                              │                                   │
│                    ┌─────────▼─────────┐                        │
│                    │   NGINX PROXY     │                        │
│                    │   (Load Balancer)  │                        │
│                    └─────────┬─────────┘                        │
│                              │                                   │
│                    ┌─────────▼─────────┐                        │
│                    │    FASTAPI        │                        │
│                    │    BACKEND        │                        │
│                    │    (Python 3.12)  │                        │
│                    └─────────┬─────────┘                        │
│                              │                                   │
│         ┌────────────────────┼────────────────────┐             │
│         │                    │                    │              │
│  ┌──────▼──────┐    ┌───────▼──────┐    ┌───────▼──────┐      │
│  │ PostgreSQL  │    │   MongoDB    │    │    Redis     │      │
│  │ + PostGIS   │    │  (Chat logs) │    │   (Cache)    │      │
│  └─────────────┘    └──────────────┘    └──────────────┘      │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    AI/ML SERVICES                        │   │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐       │   │
│  │  │Crop Predict │ │Yield Predict│ │Market Forec │       │   │
│  │  │(RF/XGBoost)│ │(RF/XGBoost)│ │(LSTM)       │       │   │
│  │  └─────────────┘ └─────────────┘ └─────────────┘       │   │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐       │   │
│  │  │Disease Det  │ │Chatbot      │ │Voice Asst   │       │   │
│  │  │(EfficientNet)│ │(BanglaBERT)│ │(Whisper)    │       │   │
│  │  └─────────────┘ └─────────────┘ └─────────────┘       │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                  EXTERNAL SERVICES                       │   │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐    │   │
│  │  │ OpenWeather  │ │ Google Maps  │ │ Sentinel     │    │   │
│  │  │ API          │ │ API          │ │ Satellite    │    │   │
│  │  └──────────────┘ └──────────────┘ └──────────────┘    │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## Database Schema

### Entity Relationship Diagram

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  districts   │────<│   farmers   │────<│    farms    │
│─────────────│     │─────────────│     │─────────────│
│ id (PK)     │     │ id (PK)     │     │ id (PK)     │
│ name        │     │ phone       │     │ farmer_id(FK)│
│ name_bn     │     │ password    │     │ district_id │
│ division    │     │ full_name   │     │ latitude    │
│ latitude    │     │ district_id │     │ longitude   │
│ longitude   │     │ role        │     │ area_acres  │
└─────────────┘     └─────────────┘     └──────┬──────┘
                                               │
        ┌──────────────────────────────────────┘
        │
┌───────▼──────┐     ┌──────────────┐     ┌──────────────┐
│ soil_reports │     │ crop_history │     │yield_reports │
│──────────────│     │──────────────│     │──────────────│
│ id (PK)      │     │ id (PK)      │     │ id (PK)      │
│ farm_id (FK) │     │ farm_id (FK) │     │ farm_id (FK) │
│ ph_level     │     │ crop_id (FK) │     │ crop_id (FK) │
│ nitrogen     │     │ season       │     │ season       │
│ health_score │     │ year         │     │ yield_per_acr│
└──────────────┘     └──────────────┘     └──────────────┘

┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│   crops     │     │market_prices │     │ predictions  │
│─────────────│     │──────────────│     │──────────────│
│ id (PK)     │     │ id (PK)      │     │ id (PK)      │
│ name        │     │ crop_id (FK) │     │ farmer_id    │
│ name_bn     │     │ price_per_kg │     │ prediction_  │
│ season      │     │ price_date   │     │   type       │
│ temp_range  │     │ trend        │     │ output_data  │
└─────────────┘     └──────────────┘     └──────────────┘

┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│notifications │     │chat_history  │     │  voice_logs  │
│──────────────│     │──────────────│     │──────────────│
│ id (PK)      │     │ id (PK)      │     │ id (PK)      │
│ farmer_id    │     │ farmer_id    │     │ farmer_id    │
│ title_bn     │     │ session_id   │     │ transcription│
│ severity     │     │ role         │     │ response     │
│ is_read      │     │ content      │     │ intent       │
└──────────────┘     └──────────────┘     └──────────────┘
```

## API Architecture

### Request Flow

```
Client Request → Nginx → FastAPI Router → Middleware
    → Authentication → Validation → Service Layer
    → Database/Cache → Response Serialization → Client
```

### Middleware Stack

1. **Rate Limiter** - 60 requests/minute per IP
2. **Logging** - Request/response logging with structlog
3. **CORS** - Cross-origin resource sharing
4. **JWT Auth** - Token validation and user extraction

## AI/ML Pipeline

### Model Training Pipeline

```
Data Collection → Preprocessing → Feature Engineering
    → Model Training → Evaluation → Serialization
    → Deployment → Inference API
```

### Models Used

| Model | Algorithm | Purpose | Accuracy |
|-------|-----------|---------|----------|
| Crop Recommendation | Random Forest + XGBoost | Best crop for conditions | 85-92% |
| Yield Prediction | Random Forest + XGBoost | Expected harvest | 80-88% |
| Market Forecasting | LSTM + Prophet | Price prediction | 70-78% |
| Disease Detection | EfficientNet + CNN | Plant disease ID | 85-95% |
| Chatbot | BanglaBERT | Agricultural Q&A | 80-85% |

## Deployment Architecture

### Docker Containers

```
┌────────────────────────────────────────────┐
│              docker-compose                │
├────────────────────────────────────────────┤
│  Container          │ Port  │ Purpose     │
├─────────────────────┼───────┼─────────────┤
│  smart_farming_     │ 8000  │ FastAPI     │
│  backend            │       │ Backend     │
├─────────────────────┼───────┼─────────────┤
│  smart_farming_     │ 5432  │ PostgreSQL  │
│  postgres           │       │ Database    │
├─────────────────────┼───────┼─────────────┤
│  smart_farming_     │ 27017 │ MongoDB     │
│  mongodb            │       │ NoSQL DB    │
├─────────────────────┼───────┼─────────────┤
│  smart_farming_     │ 6379  │ Redis       │
│  redis              │       │ Cache       │
├─────────────────────┼───────┼─────────────┤
│  smart_farming_     │ 80/443│ Nginx       │
│  nginx              │       │ Proxy       │
└────────────────────────────────────────────┘
```

## Security

- JWT authentication with refresh tokens
- Password hashing with bcrypt
- Rate limiting per IP
- CORS configuration
- Input validation with Pydantic
- SQL injection prevention (SQLAlchemy ORM)
- File upload size limits
- Environment variable configuration

## Scalability

### Horizontal Scaling
- Multiple FastAPI instances behind Nginx
- PostgreSQL read replicas
- Redis cluster for caching
- MongoDB sharding for chat logs

### Vertical Scaling
- Database connection pooling
- Async operations throughout
- Redis caching layer
- Background task processing

## Monitoring

- Structured logging with structlog
- Request/response timing
- Error tracking with Sentry
- Prometheus metrics endpoint
- Health check endpoint

## Data Flow

### Farmer Registration
```
Phone + Password → Validation → Hash Password
    → Store in PostgreSQL → Generate JWT → Return Token
```

### Crop Recommendation
```
Weather + Soil + Season → Feature Engineering
    → ML Model Prediction → Return Top 5 Crops
    → Store Prediction in Database
```

### Disease Detection
```
Image Upload → Validation → Feature Extraction
    → CNN Model Prediction → Disease Classification
    → Treatment Recommendation → Return Results
```

### Chatbot Query
```
User Message → Intent Detection → Knowledge Base Lookup
    → Response Generation → Context Memory Update
    → Return Response with Suggestions
```
