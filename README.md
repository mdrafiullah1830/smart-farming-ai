# 🌾 স্মার্ট ফার্মিং AI - Smart Farming AI Platform Bangladesh

AI-powered agriculture platform for Bangladeshi farmers with real-time market prices, AI search, disease detection, soil analysis, and crop recommendations. **100% free** — no paid APIs.

## Quick Start

```bash
# Start both servers
cd smart_farming_ai/frontend
node server.js &

cd ../backend
python -m uvicorn main:app --port 8000 &

# Open http://localhost:3000 in browser
```

## Features (18 Features)

### 🔍 AI Search (Perplexity-style)
- Real-time web search using DuckDuckGo, Wikipedia, Google News, YouTube
- **Banglish support** — type "dhaner rog" → searches "ধানের রোগ"
- Source icons and citations
- 100% free, no API keys needed

### 📊 Real-Time Market Prices
- **33+ crops** with live prices from DAM/BBS/FAO government sources
- District-wise prices for 20+ districts
- Price history charts (7/30/90 days)
- Profit calculator with cost analysis
- Market alerts and trends

### 🌱 Soil Analysis
- **86,590+ records** from 88+ xlsx files (BARC data)
- Location-based soil analysis (GPS auto-detect)
- **Crop recommendations** based on soil type
- pH analysis and fertilizer suggestions
- Drainage and nutrient status

### 🐛 Plant Disease Detection
- **AI-powered** using Hugging Face models (Google ViT, ResNet)
- **20+ plant diseases** recognized (tomato, potato, rice, corn, grape)
- Treatment suggestions in Bangla
- Multiple disease possibilities with confidence scores
- 100% free inference API

### 🌦️ Weather
- OpenWeatherMap API, GPS location
- 7-day forecast, hourly forecast
- Agricultural weather alerts

### 🤖 AI Chatbot
- Bangla/English keyword-based advice
- Rice, irrigation, disease, fertilizer guidance

### 🗺️ District Map
- Interactive Leaflet map with 63 districts
- Click anywhere for soil/weather/market data

### 🔐 Authentication
- Register/Login with JWT
- Profile management

## API Endpoints

### Node.js (port 3000)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/ai-search?q=query` | AI Search (DuckDuckGo + Wikipedia + News + YouTube) |
| GET | `/api/market/prices` | Real-time market prices (33 crops) |
| GET | `/api/market/history/:cropId` | Price history (7/30/90 days) |
| GET | `/api/market/districts` | District-wise prices |
| POST | `/api/disease/analyze` | AI disease detection (image upload) |
| GET | `/api/soil/crop-recommendation/:district/:upazila` | Crop recommendations |
| GET | `/api/soil/features/:district/:upazila` | Soil features |
| GET | `/api/soil/nearest?lat=&lng=` | Nearest soil data |
| GET | `/api/weather/:lat/:lng` | Weather forecast |
| POST | `/api/auth/register` | Register user |
| POST | `/api/auth/login` | Login |
| GET | `/api/db/stats` | Database statistics |

### FastAPI (port 8000)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/health` | Health check |
| GET | `/api/v1/districts` | 63 districts |
| GET | `/api/v1/soil/data/:category` | Soil records |
| POST | `/api/v1/crops/recommend` | Crop recommendation |
| POST | `/api/v1/chatbot/chat` | Bangla chatbot |

## Project Structure

```
smart_farming_ai/
├── frontend/
│   ├── server.js              # Node.js backend (2100+ lines)
│   ├── web/
│   │   ├── index.html          # Landing page
│   │   ├── dashboard.html      # Main dashboard (10 screens)
│   │   ├── soil.html           # Soil analysis with crop recommendations
│   │   ├── market.html         # Real-time market prices
│   │   ├── ai-search.html      # AI Search (Perplexity-style)
│   │   ├── bd_districts.js     # 63 districts data
│   │   └── bd_location_data.js # Location data
│   ├── soil_data.json          # 1.9MB soil dataset
│   ├── bangladesh_locations.csv # 128 locations
│   └── package.json
├── backend/
│   ├── main.py                 # FastAPI backend
│   └── .venv/                  # Python virtual env
├── ai_models/
│   ├── crop_prediction/        # Random Forest model
│   ├── yield_prediction/       # Gradient Boosting model
│   └── chatbot/                # Keyword-based chatbot
├── database/
│   └── smart_farming.db        # SQLite (86K+ records)
├── datasets/                   # Parsed JSON data
└── soil report/                # 88+ raw xlsx files
```

## Tech Stack

| Component | Technology |
|-----------|------------|
| Frontend | HTML5, CSS3, Vanilla JS, Material Icons, Chart.js, Leaflet |
| Backend | Node.js + Express, Python + FastAPI |
| Database | SQLite (86K+ records) |
| AI Models | scikit-learn, XGBoost, Hugging Face (disease detection) |
| Search | DuckDuckGo scraping, Wikipedia API, Google News RSS |
| Weather | OpenWeatherMap API |
| Auth | JWT, bcryptjs |
| Data | 88+ Excel files (BARC soil data) |

## Database Schema

| Table | Records | Description |
|-------|---------|-------------|
| users | 3+ | Registered users |
| districts | 63 | All Bangladesh districts |
| soil_report_data | 86,590 | Parsed from 88+ xlsx files |
| market_prices | 10 | Crop prices |
| notifications | 3 | Weather/market alerts |
| disease_reports | - | Disease detection results |
| chat_history | - | Chatbot logs |

## How to Use

1. Open `http://localhost:3000` in browser
2. **Dashboard** — Google-style search bar for AI Search
3. **AI Search** — Ask any agriculture question (supports Banglish!)
4. **Market Analysis** — Real-time prices for 33+ crops
5. **Soil Analysis** — Select location for crop recommendations
6. **Disease Detection** — Upload plant photo for AI analysis
7. Use language toggle (বাংলা/EN) in header

## Supported Crops (Market Prices)

| Category | Crops |
|----------|-------|
| Rice | বোরো চাল (সরু/মাঝারি/মোটা), আমন চাল, আটা |
| Vegetables | পেঁয়াজ, আলু, টমেটো, বেগুন |
| Spices | কাঁচা/শুকনো মরিচ, রসুন, আদা |
| Pulses | মুগ/মসুর ডাল, ছোলা |
| Oil | সয়াবিন/সরিষার তেল |
| Meat | মুরগী, গরু, খাসী, মাছ, ডিম |

## Disease Detection (Supported Plants)

| Plant | Diseases |
|-------|----------|
| Tomato | 10 diseases (Bacterial spot, Early/Late blight, etc.) |
| Potato | 3 diseases (Early/Late blight, Healthy) |
| Rice | 3 diseases (Blast, Brown spot, Leaf blast) |
| Corn | 2 diseases (Common rust, Gray leaf spot) |
| Grape | 2 diseases (Black rot, Esca) |

## License

Academic project - Smart Farming AI Platform Bangladesh
