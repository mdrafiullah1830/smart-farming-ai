# 🌾 Smart Farming AI — Bangladesh

> **AI-powered agriculture platform built for Bangladeshi farmers — 100% free, no paid APIs.**

![Version](https://img.shields.io/badge/version-1.1-blue)
![License](https://img.shields.io/badge/license-Academic-green)
![Python](https://img.shields.io/badge/python-3.10+-yellow)
![Node.js](https://img.shields.io/badge/node.js-18+-green)

---

## 📌 Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Database Schema](#database-schema)
- [AI Models](#ai-models)
- [API Endpoints](#api-endpoints)
- [Installation & Setup](#installation--setup)
- [How Each Feature Works](#how-each-feature-works)
- [Data Sources](#data-sources)
- [Changelog](#changelog)
- [Known Issues](#known-issues)
- [License](#license)

---

## Overview

Smart Farming AI is a comprehensive AI-powered agriculture platform specifically designed for Bangladesh. It provides farmers, researchers, and government officials with real-time market prices, AI-based disease detection, soil analysis, crop recommendations, yield predictions, disaster alerts, satellite monitoring, and a Bangla chatbot — all completely free.

**Key Highlights:**
- 63 districts covered across 8 divisions
- 86,590+ soil records parsed from 88+ BARC Excel files
- 33+ crops with real-time market prices
- 20+ plant diseases detectable via AI
- Bangla/English bilingual interface
- Multi-source dynamic crop recommendation (Google, Perplexity, Wikipedia, BAMIS, newspapers)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        CLIENT (Browser)                            │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │
│  │Dashboard │ │  Market  │ │   Soil   │ │AI Search │ │  Disease │  │
│  │  (SPA)   │ │ Analysis │ │ Analysis │ │(Perplexi │ │ Detection│  │
│  │          │ │          │ │          │ │  -style) │ │          │  │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘  │
│       └─────────────┴────────────┴────────────┴────────────┘        │
└───────────────────────────────┬─────────────────────────────────────┘
                                │ HTTP/REST API
┌───────────────────────────────┴─────────────────────────────────────┐
│                     FRONTEND SERVER (Node.js :3000)                 │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌──────────────────┐  │
│  │   Weather  │ │   Crop     │ │  Disease   │ │    Chatbot       │  │
│  │  (OWM +    │ │ Recommend  │ │  (HF API + │ │  (Training Data  │  │
│  │ Open-Meteo)│ │ (5-source  │ │  KB Match) │ │   + Similarity)  │  │
│  │            │ │  scoring)  │ │            │ │                  │  │
│  └────────────┘ └────────────┘ └────────────┘ └──────────────────┘  │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌──────────────────┐  │
│  │   Market   │ │    Soil    │ │    Auth    │ │  Search Scraper  │  │
│  │  Prices    │ │   Data     │ │   (JWT)    │ │ (Google/DDG/Bing)│  │
│  │  (33+)     │ │ (86K+ DB)  │ │            │ │                  │  │
│  └────────────┘ └────────────┘ └────────────┘ └──────────────────┘  │
└───────────┬────────────────────────────────────┬────────────────────┘
            │ SQLite (86K+ records)              │
            │                                    │
┌───────────┴──────────────────┐  ┌──────────────┴────────────────────┐
│    BACKEND SERVER (FastAPI   │  │       EXTERNAL SERVICES          │
│           :8000)             │  │  ┌─────────────┐ ┌────────────┐  │
│  ┌──────────┐ ┌──────────┐   │  │  │ OpenWeather  │ │ Hugging    │  │
│  │ Crop     │ │ Yield    │   │  │  │    Map API   │ │  Face API  │  │
│  │ Recommend│ │ Predict  │   │  │  └─────────────┘ └────────────┘  │
│  │          │ │          │   │  │  ┌─────────────┐ ┌────────────┐  │
│  │ (Random  │ │ (Gradient│   │  │  │ Open-Meteo   │ │ Google     │  │
│  │  Forest, │ │  Boost,  │   │  │  │ (Free)       │ │ Search     │  │
│  │  XGBoost)│ │  XGBoost)│   │  │  └─────────────┘ └────────────┘  │
│  └──────────┘ └──────────┘   │  │  ┌─────────────┐ ┌────────────┐  │
│  ┌──────────┐ ┌──────────┐   │  │  │ Wikipedia    │ │ Perplexity │  │
│  │ Disease  │ │ Market   │   │  │  │ /Banglapedia │ │   AI       │  │
│  │Detection │ │Forecast  │   │  │  └─────────────┘ └────────────┘  │
│  │(Efficient│ │ (LSTM)   │   │  │  ┌─────────────┐ ┌────────────┐  │
│  │   Net)   │ │          │   │  │  │ BAMIS/BARC   │ │ BD News    │  │
│  └──────────┘ └──────────┘   │  │  │ Government   │ │ Papers     │  │
│  ┌──────────┐ ┌──────────┐   │  │  └─────────────┘ └────────────┘  │
│  │ Chatbot  │ │ Satellite│   │  └──────────────────────────────────┘
│  │(Bangla   │ │(NDVI)    │   │
│  │  BERT)   │ │          │   │
│  └──────────┘ └──────────┘   │
│  ┌──────────┐ ┌──────────┐   │
│  │  Voice   │ │ Disaster │   │
│  │ Assistant│ │ Alerts   │   │
│  └──────────┘ └──────────┘   │
│  ┌──────────┐ ┌──────────┐   │
│  │Government│ │Farmer    │   │
│  │Dashboard │ │  Mgmt    │   │
│  └──────────┘ └──────────┘   │
└───────────────────────────────┘
            │
┌───────────┴────────────────────────────────────────────────────────┐
│                         DATA LAYER                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │
│  │   PostgreSQL  │  │   MongoDB    │  │        Redis             │  │
│  │  (PostGIS)    │  │  (Logs/      │  │   (Caching/Sessions)     │  │
│  │  Primary DB   │  │   Analytics) │  │                          │  │
│  └──────────────┘  └──────────────┘  └──────────────────────────┘  │
│  ┌──────────────┐  ┌──────────────┐                                │
│  │   SQLite      │  │  88+ Excel   │                                │
│  │  (Dev/Lite)   │  │  Files (BARC)│                                │
│  │  86K+ records │  │  Soil Data   │                                │
│  └──────────────┘  └──────────────┘                                │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Features

### 1. 🔍 AI Search (Perplexity-Style)
- Real-time web search using **Google, DuckDuckGo, Bing** scraping
- **Perplexity AI** answer extraction
- **Wikipedia/Banglapedia** district data
- **Banglish support** — type "dhaner rog" → searches "ধানের রোগ"
- Source icons and citations from verified Bangladeshi newspapers
- 100% free, no API keys needed

### 2. 📊 Real-Time Market Prices
- **33+ crops** with live prices from DAM/BBS/FAO government sources
- District-wise prices for **20+ districts**
- Price history charts (7/30/90 days)
- **Profit calculator** with cost analysis
- Market alerts and trends
- Price forecasting (7-day and 30-day predictions)

### 3. 🌱 Soil Analysis
- **86,590+ records** from **88+ xlsx files** (BARC data)
- Location-based soil analysis (GPS auto-detect)
- **Crop recommendations** based on soil type
- pH analysis and fertilizer suggestions
- Drainage and nutrient status
- Nearest soil data lookup by coordinates

### 4. 🐛 Plant Disease Detection
- **AI-powered** using Hugging Face free inference API (Google ViT, ResNet, DeiT)
- **20+ plant diseases** recognized (tomato, potato, rice, corn, grape)
- Treatment suggestions in **Bangla**
- Multiple disease possibilities with confidence scores
- 100% free inference API — no paid model hosting
- Severity assessment (low/medium/high)

### 5. 🌦️ Weather Intelligence
- **Dual API**: OpenWeatherMap (primary) + Open-Meteo (free fallback)
- 7-day forecast with daily high/low
- Hourly forecast (next 8 hours)
- **Agricultural weather alerts**
- WMO weather code mapping (Bangla + English)
- Sunrise/sunset times, wind direction, humidity, pressure
- GPS-based location detection

### 6. 🤖 AI Chatbot (Bangla/English)
- **Keyword-based** agricultural advice with similarity matching
- Comprehensive knowledge base: ধান, গম, পাট, আলু, রোগ, সেচ, বাজার, সার, কীটপতঙ্গ
- **Seasonal farming calendar** (month-wise activities)
- Contextual suggestions based on conversation topic
- Greeting detection and fallback responses
- Bilingual (Bangla + English)

### 7. 🗺️ Interactive District Map
- **Leaflet map** with all 64 districts
- Click anywhere for soil/weather/market data
- District markers with crop information
- Division-wise filtering
- Upazila and union-level data

### 8. 🌾 Dynamic Crop Recommendation (5-Source Scoring)
- **Source 1**: Static BAMIS/BARC/BBS district crop database (64 districts)
- **Source 2**: Google + DuckDuckGo + Bing parallel web scraping
- **Source 3**: Perplexity AI answer extraction
- **Source 4**: Wikipedia/Banglapedia district analysis
- **Source 5**: Verified Bangladeshi newspaper articles (Prothom Alo, Daily Star, etc.)
- Weighted scoring system with confidence levels
- Detailed crop info: why cultivate, market demand, profit level, tips
- Reference source links for each recommendation

### 9. 🤖 Crop Recommendation (ML-Based)
- **Random Forest** classifier with 200 estimators
- **XGBoost** with 200 estimators
- **Gradient Boosting** with 150 estimators
- Features: temperature, humidity, rainfall, pH, nitrogen, phosphorus, potassium
- Auto-selects best model via cross-validation
- Supports 12 crops: rice, wheat, jute, potato, onion, tomato, chili, mango, banana, sugarcane, mustard, lentil

### 10. 📈 Yield Prediction
- **Random Forest Regressor** / **XGBoost** / **Gradient Boosting**
- Features: crop type, temperature, humidity, rainfall, pH, nitrogen, area, irrigation, season
- Revenue/cost/profit estimation with ROI calculation
- Risk assessment (low/medium/high)
- Real soil data integration from database

### 11. 📉 Market Price Forecasting
- **LSTM (Long Short-Term Memory)** neural network for time-series prediction
- Fallback to **Random Forest** if TensorFlow unavailable
- Per-crop trained models (rice, wheat, potato, onion, tomato, chili)
- 30-day sequence input for prediction
- Trend detection (up/down/stable)
- Confidence scoring

### 12. 🛰️ Satellite Monitoring (NDVI Analysis)
- **NDVI** (Normalized Difference Vegetation Index) analysis
- **NDWI** (Normalized Difference Water Index)
- **EVI** (Enhanced Vegetation Index)
- Soil moisture estimation
- Vegetation health classification (excellent/good/moderate/poor)
- Stress area detection
- Trend analysis (increasing/decreasing/stable)
- Bangla + English recommendations

### 13. 🎤 Voice Assistant
- Audio file upload and transcription
- Intent detection (pest control, irrigation, disease, etc.)
- Bangla voice query processing
- Response in both Bangla and English
- Voice query history logging

### 14. ⚠️ Disaster Intelligence
- **Cyclone risk** assessment for coastal districts
- **Flood risk** mapping
- **Cold wave** risk for northern districts
- Active disaster alerts with severity levels
- District-level risk scoring
- Recommendation engine for disaster preparedness

### 15. 🏛️ Government Dashboard
- District-wise overview (farmers, farms, area, health)
- Crop distribution analytics
- Yield trend analysis
- Market summary
- Government advisory creation and management
- Risk level assessment per district

### 16. 🔐 Authentication & User Management
- Register/Login with **JWT** tokens
- Profile management (name, email, phone, district, upazila)
- Password hashing (bcrypt in frontend, SHA-256 in backend)
- Token-based authorization

### 17. 🌐 Bilingual Interface (Bangla/English)
- Full UI language toggle (বাংলা/EN)
- All responses in both languages
- Banglish input support
- WMO weather codes in Bangla

### 18. 🔔 Notifications System
- Weather alerts
- Market price alerts
- Disease outbreak notifications
- Disaster warnings

---

## Tech Stack

### Frontend
| Component | Technology |
|-----------|------------|
| UI Framework | HTML5, CSS3, Vanilla JavaScript |
| UI Library | Material Icons, Chart.js |
| Maps | Leaflet.js |
| Scraping | Cheerio.js (server-side HTML parsing) |
| File Upload | Multer.js |
| Auth | JWT (jsonwebtoken), bcryptjs |
| Server | Node.js + Express 5 |

### Backend
| Component | Technology |
|-----------|------------|
| API Server | Python + FastAPI |
| ORM | SQLAlchemy (async) |
| Validation | Pydantic v2 |
| ML Models | scikit-learn, XGBoost, TensorFlow/Keras |
| Auth | JWT, bcrypt |
| Caching | Redis |
| i18n | Custom middleware |

### AI/ML Models
| Model | Algorithm | Purpose |
|-------|-----------|---------|
| Crop Recommendation | Random Forest, XGBoost, Gradient Boosting | Predict best crop for given conditions |
| Yield Prediction | Random Forest, XGBoost, Gradient Boosting | Predict crop yield per acre |
| Market Forecasting | LSTM / Random Forest | Time-series price prediction |
| Disease Detection | EfficientNetB0 / RandomForest | Plant disease classification from images |
| Chatbot | Knowledge Base + Similarity Matching | Bangla agricultural Q&A |

### Database
| Database | Purpose |
|----------|---------|
| PostgreSQL (PostGIS) | Primary database with geospatial support |
| MongoDB | Logs, analytics, unstructured data |
| Redis | Caching, session management |
| SQLite | Development/lite version (86K+ records) |

### External Services
| Service | Purpose |
|---------|---------|
| OpenWeatherMap | Real-time weather (primary) |
| Open-Meteo | Weather forecast (free fallback) |
| Hugging Face Inference | Free image classification (disease detection) |
| Google Search | Web scraping for AI search |
| DuckDuckGo | Web scraping (fallback) |
| Bing Search | Web scraping (fallback) |
| Perplexity AI | Answer extraction |
| Wikipedia/Banglapedia | District crop data |
| BAMIS/BARC | Government crop statistics |
| Bangladeshi Newspapers | Verified agricultural news |

---

## Project Structure

```
smart_farming_ai/
├── frontend/                        # Node.js Express server
│   ├── server.js                    # Main server (2500+ lines) — all API routes
│   ├── package.json                 # Dependencies
│   ├── web/                         # Static frontend files
│   │   ├── index.html               # Landing page
│   │   ├── dashboard.html           # Main dashboard (10 screens)
│   │   ├── soil.html                # Soil analysis + crop recommendations
│   │   ├── market.html              # Real-time market prices
│   │   ├── ai-search.html           # Perplexity-style AI search
│   │   ├── bd_districts.js          # 63 districts data with upazilas
│   │   └── bd_location_data.js      # Location data
│   ├── soil_data.json               # 1.9MB soil dataset
│   ├── bangladesh_locations.csv     # 128 locations
│   ├── scripts/
│   │   └── parse_soil_data.py       # Soil data parser
│   └── ios/                         # Flutter mobile app (in progress)
│
├── backend/                         # Python FastAPI server
│   ├── main.py                      # Simple FastAPI backend (SQLite)
│   ├── app/                         # Full-featured FastAPI backend
│   │   ├── main.py                  # App entry point
│   │   ├── core/
│   │   │   ├── config.py            # Settings (env-based)
│   │   │   ├── database.py          # PostgreSQL async connection
│   │   │   ├── security.py          # JWT auth, password hashing
│   │   │   ├── cache.py             # Redis caching
│   │   │   └── i18n.py              # Internationalization
│   │   ├── models/                  # SQLAlchemy models
│   │   │   ├── farmer.py            # Farmer model
│   │   │   ├── farm.py              # Farm model
│   │   │   ├── crop.py              # Crop model
│   │   │   ├── district.py          # District model
│   │   │   ├── soil_weather.py      # Soil/Weather models
│   │   │   ├── weather.py           # Weather model
│   │   │   └── all_models.py        # Satellite, Voice, Disaster, etc.
│   │   ├── schemas/
│   │   │   └── weather.py           # Pydantic schemas
│   │   ├── api/v1/
│   │   │   ├── router.py            # API router (14 modules)
│   │   │   └── endpoints/
│   │   │       ├── farmers.py       # Farmer CRUD
│   │   │       ├── farms.py         # Farm management
│   │   │       ├── weather.py       # Weather intelligence
│   │   │       ├── soil.py          # Soil analysis
│   │   │       ├── crops.py         # Crop recommendation
│   │   │       ├── yield_prediction.py # Yield prediction
│   │   │       ├── disease.py       # Disease detection
│   │   │       ├── market.py        # Market intelligence
│   │   │       ├── chatbot.py       # Bangla chatbot
│   │   │       ├── voice.py         # Voice assistant
│   │   │       ├── satellite.py     # Satellite NDVI monitoring
│   │   │       ├── disaster.py      # Disaster alerts
│   │   │       ├── notifications.py # Notifications
│   │   │       └── government.py    # Government dashboard
│   │   └── middleware/
│   │       ├── rate_limiter.py      # Rate limiting
│   │       ├── logging.py           # Request logging
│   │       └── i18n.py              # Language middleware
│   └── .venv/                       # Python virtual environment
│
├── ai_models/                       # AI/ML training pipelines
│   ├── inference.py                 # Unified inference pipeline
│   ├── crop_prediction/
│   │   └── train.py                 # Random Forest / XGBoost / GBM
│   ├── yield_prediction/
│   │   └── train.py                 # Yield regression models
│   ├── market_forecasting/
│   │   └── train.py                 # LSTM time-series model
│   ├── disease_detection/
│   │   └── train.py                 # EfficientNetB0 CNN model
│   ├── chatbot/
│   │   ├── train.py                 # Knowledge base chatbot
│   │   ├── train_enhanced.py        # Enhanced v2 with similarity
│   │   └── training_data.json       # Q&A dataset
│   ├── satellite/                   # Satellite analysis (planned)
│   └── voice_assistant/             # Voice processing (planned)
│
├── database/
│   └── smart_farming.db             # SQLite database (86K+ records)
│
├── datasets/                        # Parsed JSON data
│   ├── soil_report_all.json         # Full soil dataset
│   └── soil_report_summary.json     # Summary statistics
│
├── soil report/                     # 88+ raw BARC xlsx files
│   ├── soil information/
│   ├── soil fertility/
│   └── ... (multiple categories)
│
├── scripts/
│   ├── parse_xlsx.py                # Parse xlsx → JSON
│   └── setup_db.py                  # Database setup
│
├── tests/
│   ├── conftest.py                  # Test fixtures
│   ├── ai_models/test_models.py     # Model tests
│   └── backend/test_api.py          # API tests
│
├── docker/
│   └── nginx/nginx.conf             # Nginx config
│
├── docker-compose.yml               # Full Docker stack
├── .gitignore
└── README.md
```

---

## Database Schema

### SQLite (Development)

| Table | Records | Description |
|-------|---------|-------------|
| `users` | 3+ | Registered users with profile data |
| `districts` | 63 | All Bangladesh districts with coordinates, soil type, climate |
| `soil_report_data` | 86,590 | Parsed from 88+ xlsx files (BARC data) |
| `market_prices` | 10+ | Crop market prices |
| `crop_recommendations` | — | Crop recommendation history |
| `disease_reports` | — | Disease detection results |
| `chat_history` | — | Chatbot conversation logs |
| `notifications` | 3+ | Weather/market alerts |

### PostgreSQL (Production)

| Table | Description |
|-------|-------------|
| `farmers` | Farmer profiles with authentication |
| `farms` | Farm locations with area, crops |
| `crops` | Crop catalog with prices |
| `districts` | District data with PostGIS geometry |
| `soil_reports` | Soil analysis results |
| `market_prices` | Time-series market prices |
| `predictions` | ML model predictions |
| `disease_reports` | Disease detection logs |
| `yield_reports` | Yield tracking data |
| `satellite_data` | NDVI/NDWI/EVI readings |
| `voice_logs` | Voice assistant logs |
| `disaster_alerts` | Active disaster warnings |
| `government_advisories` | Official advisories |
| `notifications` | User notifications |

---

## AI Models

### 1. Crop Recommendation Model

| Property | Value |
|----------|-------|
| **Algorithms** | Random Forest (200 trees), XGBoost (200 trees), Gradient Boosting (150 trees) |
| **Features** | temperature, humidity, rainfall, pH, nitrogen, phosphorus, potassium |
| **Classes** | 12 crops: rice, wheat, jute, potato, onion, tomato, chili, mango, banana, sugarcane, mustard, lentil |
| **Training** | 5,000+ synthetic samples + real BARC soil data |
| **Validation** | 5-fold cross-validation, auto-selects best model |
| **Output** | Top-5 crop predictions with confidence scores |

### 2. Yield Prediction Model

| Property | Value |
|----------|-------|
| **Algorithms** | Random Forest Regressor, XGBoost Regressor, Gradient Boosting Regressor |
| **Features** | crop_encoded, temperature, humidity, rainfall, pH, nitrogen, area_acres, irrigation_used, season_encoded |
| **Training** | 5,000+ samples with realistic yield factors |
| **Metrics** | R² score, RMSE, MAE |
| **Output** | yield_per_acre, total_yield, revenue/cost/profit estimates |

### 3. Market Forecasting Model

| Property | Value |
|----------|-------|
| **Primary** | LSTM (50 units, 2 layers) with TensorFlow/Keras |
| **Fallback** | Random Forest Regressor (sklearn) |
| **Crops** | rice, wheat, potato, onion, tomato, chili |
| **Sequence Length** | 30 days input |
| **Training** | 365 days synthetic price data per crop |
| **Output** | 7-day price predictions, trend (up/down/stable) |

### 4. Disease Detection Model

| Property | Value |
|----------|-------|
| **Primary** | EfficientNetB0 (ImageNet pre-trained) with custom classification head |
| **Fallback** | Random Forest Classifier |
| **Classes** | 10 diseases: Bacterial Leaf Blight, Blast, Brown Spot, Tungro, Leaf Rust, Powdery Mildew, Late Blight, Early Blight, Anthracnose, Healthy |
| **Image Size** | 224x224x3 |
| **Frontend** | Hugging Face free inference (Google ViT, ResNet, DeiT) |
| **Output** | Disease name (EN/BN), confidence, severity, all probabilities |

### 5. Agricultural Chatbot

| Property | Value |
|----------|-------|
| **Version** | v2.0 (Enhanced) |
| **Approach** | Knowledge base + string similarity matching |
| **Topics** | ধান, গম, পাট, আলু, রোগ, সেচ, বাজার, সার, কীটপতঙ্গ, লাভ |
| **Languages** | Bangla, English |
| **Features** | Greeting detection, contextual suggestions, seasonal calendar |
| **Training Data** | JSON-based Q&A pairs with keywords |

---

## API Endpoints

### Node.js Server (Port 3000)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/weather?lat=&lng=&lang=` | Weather forecast (OWM + Open-Meteo) |
| `POST` | `/api/crop/recommend` | Static crop recommendation |
| `POST` | `/api/crop/recommend-dynamic` | Dynamic 5-source crop recommendation |
| `POST` | `/api/disease/analyze` | Disease detection (image upload) |
| `POST` | `/api/chat` | AI chatbot (Bangla/English) |
| `GET` | `/api/market/prices` | Real-time market prices (33+ crops) |
| `GET` | `/api/market/districts` | District-wise prices |
| `GET` | `/api/market/history/:cropId` | Price history (7/30/90 days) |
| `GET` | `/api/soil/crop-recommendation/:district/:upazila` | Crop recommendations |
| `GET` | `/api/soil/features/:district/:upazila` | Soil features |
| `GET` | `/api/soil/nearest?lat=&lng=` | Nearest soil data |
| `POST` | `/api/auth/register` | Register user |
| `POST` | `/api/auth/login` | Login |
| `GET` | `/api/db/stats` | Database statistics |
| `GET` | `/api/districts` | List all districts |

### FastAPI Server (Port 8000)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/health` | Health check |
| `GET` | `/api/v1/stats` | Database statistics |
| `GET` | `/api/v1/districts` | 63 districts |
| `GET` | `/api/v1/districts/{name}` | District details |
| `GET` | `/api/v1/soil/categories` | Soil data categories |
| `GET` | `/api/v1/soil/data/{category}` | Soil records by category |
| `GET` | `/api/v1/soil/district/{district}` | Soil data by district |
| `GET` | `/api/v1/soil/nearest?lat=&lng=` | Nearest soil data |
| `POST` | `/api/v1/crops/recommend` | Crop recommendation |
| `GET` | `/api/v1/market/prices` | Market prices |
| `GET` | `/api/v1/market/price/{crop}` | Single crop price |
| `POST` | `/api/v1/disease/detect` | Disease detection |
| `POST` | `/api/v1/chatbot/chat` | Chatbot |
| `GET` | `/api/v1/notifications` | Notifications |
| `POST` | `/api/v1/auth/register` | Register |
| `POST` | `/api/v1/auth/login` | Login |
| `GET` | `/api/v1/auth/profile` | User profile |

### FastAPI Advanced Endpoints (Production)

| Module | Endpoints |
|--------|-----------|
| **Farmers** | CRUD, profile management |
| **Farms** | Farm registration, location, crops |
| **Weather** | Intelligence, alerts, forecasts |
| **Soil** | Analysis, health scoring, recommendations |
| **Crops** | Recommendation engine |
| **Yield** | Prediction, history, analytics |
| **Disease** | Detection, reporting, treatment |
| **Market** | Prices, trends, predictions, profit calculator |
| **Chatbot** | Bangla AI conversation |
| **Voice** | Transcription, query processing, logs |
| **Satellite** | NDVI analysis, farm monitoring, district summary |
| **Disaster** | Alerts, risk assessment, district risk mapping |
| **Notifications** | Weather, market, disaster alerts |
| **Government** | Dashboard, analytics, advisories |

---

## Installation & Setup

### Prerequisites
- Node.js 18+
- Python 3.10+
- SQLite (for development) or PostgreSQL (for production)

### Quick Start

```bash
# 1. Clone the repository
git clone <repo-url>
cd smart_farming_ai

# 2. Start Frontend Server (Node.js)
cd frontend
npm install
node server.js
# Server runs at http://localhost:3000

# 3. Start Backend Server (FastAPI)
cd ../backend
pip install -r requirements.txt  # or use venv
python -m uvicorn main:app --port 8000
# API docs at http://localhost:8000/docs
```

### Docker Setup (Production)

```bash
# Start all services
docker-compose up -d

# Services:
# - PostgreSQL (PostGIS) on port 5432
# - MongoDB on port 27017
# - Redis on port 6379
# - FastAPI Backend on port 8000
# - Nginx on port 80/443
```

### Train AI Models

```bash
# Train crop recommendation model
cd ai_models/crop_prediction
python train.py

# Train yield prediction model
cd ../yield_prediction
python train.py

# Train market forecasting model
cd ../market_forecasting
python train.py

# Train disease detection model
cd ../disease_detection
python train.py

# Train chatbot
cd ../chatbot
python train.py
```

---

## How Each Feature Works

### AI Search Flow
```
User Query → Banglish Detection → Google/DDG/Bing Scraping
         → Perplexity Answer Extraction → Wikipedia Lookup
         → Results Aggregation → Source Citations → Display
```

### Crop Recommendation Flow (Dynamic)
```
District/Upazila → BAMIS/BARC Static DB Lookup
                → Google + DDG + Bing Parallel Scraping
                → Perplexity AI Answer Extraction
                → Wikipedia/Banglapedia Analysis
                → Bangladeshi Newspaper Scraping
                → Weighted Score Aggregation → Top 10 Crops
```

### Disease Detection Flow
```
Image Upload → Hugging Face API (ViT/ResNet/DeiT)
            → Generic Label Detection → Disease Mapping
            → Bangla Treatment Suggestions → Severity Assessment
```

### Market Price Flow
```
Crop Selection → Price Data (BBS/DAM/FAO)
              → 7/30/90 Day History → Chart.js Visualization
              → LSTM Prediction → Trend Analysis
```

---

## Data Sources

| Source | Type | Records |
|--------|------|---------|
| BARC (Bangladesh Agricultural Research Council) | Soil reports (xlsx) | 86,590+ records from 88+ files |
| BBS (Bangladesh Bureau of Statistics) | Crop statistics | National level |
| DAM (Department of Agricultural Marketing) | Market prices | 33+ crops |
| FAO GIEWS | International prices | Global reference |
| BAMIS (Bangladesh Agricultural Marketing Information System) | District-wise crops | 64 districts |
| BARI (Bangladesh Agricultural Research Institute) | Crop varieties | Research data |
| BRRI (Bangladesh Rice Research Institute) | Rice varieties | Research data |
| DAE (Department of Agricultural Extension) | Extension services | Government |
| OpenWeatherMap | Weather data | Real-time |
| Open-Meteo | Weather forecast | Free API |
| Hugging Face | Image classification | Free inference |
| Prothom Alo, Daily Star, etc. | Agricultural news | Verified sources |

---

## Changelog

### v1.1 (July 2026)

#### Critical Fixes
- **Fixed CSS z-index bug** — Hero section and content were hidden behind fixed background elements
- **Fixed `genome` → `lng` typo** — 20+ districts had incorrect coordinate keys
- **Fixed Cox's Bazar naming** — Inconsistent naming caused map marker failures

#### Improvements
- Added SPA fallback routes (`/market`, `/ai-search`)
- Fixed duplicate `require('os')` imports
- Fixed duplicate `dhaner` key in Banglish dictionary
- Improved accessibility (`user-scalable=yes`)
- Verified Google Fonts `display=swap`

---

## Known Issues

| Issue | Severity | Notes |
|-------|----------|-------|
| `backend/app/` (modular FastAPI) is not wired to the deployed Worker | High | Deprecated; see `backend/app/DEPRECATED.md` and `ARCHITECTURE.md` |
| `ai_models/trained_models/` is empty — `apps/ai-service` returns `model_unavailable` | High | Honest stub until a real ONNX model is provided (see `apps/ai-service/app/main.py`) |
| Python backend SHA-256 password hashing | Medium | Should use bcrypt |
| No rate limiting on scraping endpoints | Medium | Should add throttling (Redis-backed limiter exists in `backend/app/`, not yet in Worker) |
| CORS allows all origins on the legacy monolith | Medium | Worker already restricts origins via `ALLOWED_ORIGINS`; legacy `frontend/server.js` does not |
| Hardcoded API keys (OWM, JWT, Google) | Resolved | `frontend/server.js` now reads `OPENWEATHER_API_KEY`, `JWT_SECRET`, `GOOGLE_CLIENT_ID` from env only. `apps/worker-api` was always env-only. The Vercel OIDC token previously on disk has been rotated. |

---

## License

**Academic Project** — Smart Farming AI Platform Bangladesh

Built with ❤️ for Bangladeshi farmers.
