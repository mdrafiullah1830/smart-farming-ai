#!/usr/bin/env python3
"""Smart Farming AI - FastAPI Backend with SQLite database."""
import json
import logging
import os
import re
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone

import bcrypt
import sentry_sdk
from fastapi import FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, field_validator

try:  # Optional: local runs read backend/.env; Render/K8s inject real env vars.
    from dotenv import load_dotenv

    load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), '.env'))
except ImportError:
    pass

# Sentry initialization
SENTRY_DSN = os.getenv("SENTRY_DSN")
if SENTRY_DSN:
    sentry_sdk.init(dsn=SENTRY_DSN, traces_sample_rate=0.1, environment=os.getenv("APP_ENV", "production"))

# Tests point this at a scratch copy so a run never mutates the repo database.
DB_PATH = os.getenv(
    "SMART_FARMING_DB",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'database', 'smart_farming.db'),
)

ALLOWED_ORIGINS = os.getenv("CORS_ORIGINS", os.getenv("ALLOWED_ORIGINS", "http://localhost:3000")).split(",")
APP_ENV = os.getenv("APP_ENV", "production").lower()

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(name)s: %(message)s')
logger = logging.getLogger(__name__)

app = FastAPI(title="Smart Farming AI", version="1.0.0", description="AI-powered agriculture platform for Bangladesh")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==================== DATABASE ====================
@contextmanager
def get_db():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False, timeout=10)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()

# ==================== MODELS ====================
class UserRegister(BaseModel):
    name_en: str
    name_bn: str = ""
    email: str
    phone: str = ""
    password: str
    district: str = ""
    upazila: str = ""
    division: str = ""

    @field_validator('password')
    @classmethod
    def validate_password(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError('Password must be at least 8 characters')
        if len(v) > 128:
            raise ValueError('Password must be at most 128 characters')
        if not re.search(r'[a-z]', v) or not re.search(r'[A-Z]', v) or not re.search(r'\d', v):
            raise ValueError('Password must contain uppercase, lowercase, and a digit')
        return v

    @field_validator('email')
    @classmethod
    def validate_email(cls, v: str) -> str:
        if not re.match(r'^[^\s@]+@[^\s@]+\.[^\s@]+$', v):
            raise ValueError('Invalid email format')
        return v.lower().strip()

class UserLogin(BaseModel):
    email: str
    password: str

class CropRecommendRequest(BaseModel):
    district: str
    upazila: str = ""
    union: str = ""
    division: str = ""

class DiseaseReport(BaseModel):
    disease_name: str
    confidence: float
    description: str
    treatments: list = []

class ChatMessage(BaseModel):
    message: str
    lang: str = "bn"

# ==================== AUTH HELPERS ====================
SECRET = os.getenv("SECRET_KEY", "")
if not SECRET:
    if APP_ENV == "production":
        raise RuntimeError("SECRET_KEY must be configured in production")
    SECRET = "local-development-only-change-me"
    logger.warning("Using hardcoded SECRET_KEY - set SECRET_KEY env var for production")

def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()

def verify_password(pw: str, hashed: str) -> bool:
    return bcrypt.checkpw(pw.encode(), hashed.encode())

def create_token(user_id: int, email: str) -> str:
    import jwt
    return jwt.encode({"id": user_id, "email": email, "exp": datetime.now(timezone.utc) + timedelta(days=7), "iat": datetime.now(timezone.utc)}, SECRET, algorithm="HS256")

def get_current_user(authorization: str = Header(default="")):
    import jwt
    token = authorization.replace("Bearer ", "") if authorization.startswith("Bearer ") else ""
    if not token:
        return None
    try:
        data = jwt.decode(token, SECRET, algorithms=["HS256"])
        return data
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None

# ==================== AUTH ENDPOINTS ====================
@app.post("/api/v1/auth/register", summary="Register a new user account", response_model=None)
def register(user: UserRegister):
    """Register a new user with email, password, and optional profile info.

    - **name_en**: Required. User's name in English.
    - **email**: Required. Valid email address.
    - **password**: Required. Min 8 chars, must include uppercase, lowercase, digit.
    - **phone**: Optional. Phone number.
    - **district/upazila/division**: Optional location info.
    """
    with get_db() as db:
        existing = db.execute("SELECT id FROM users WHERE email = ?", (user.email,)).fetchone()
        if existing:
            raise HTTPException(400, "Email already registered")
        hashed = hash_password(user.password)
        result = db.execute(
            "INSERT INTO users (name_en, name_bn, email, phone, password_hash, district, upazila, division) VALUES (?,?,?,?,?,?,?,?)",
            (user.name_en, user.name_bn or user.name_en, user.email, user.phone, hashed, user.district, user.upazila, user.division)
        )
        db.commit()
        token = create_token(result.lastrowid, user.email)
        return {"success": True, "token": token, "user": {"id": result.lastrowid, "name_en": user.name_en, "email": user.email}}

@app.post("/api/v1/auth/login", summary="Authenticate user and get access token")
def login(user: UserLogin):
    """Login with email and password.

    Returns JWT access token valid for 7 days.
    """
    with get_db() as db:
        row = db.execute("SELECT * FROM users WHERE email = ?", (user.email,)).fetchone()
        if not row or not verify_password(user.password, row["password_hash"]):
            logger.info(f"Failed login attempt for email: {user.email[:3]}***")
            raise HTTPException(401, "Invalid email or password")
        token = create_token(row["id"], row["email"])
        return {"success": True, "token": token, "user": {"id": row["id"], "name_en": row["name_en"], "email": row["email"]}}

@app.get("/api/v1/auth/profile", summary="Get current user profile")
def get_profile(authorization: str = Header(default="")):
    """Get authenticated user's profile. Requires Bearer token in Authorization header."""
    user = get_current_user(authorization)
    if not user:
        raise HTTPException(401, "Unauthorized")
    with get_db() as db:
        row = db.execute("SELECT id, name_en, name_bn, email, phone, district, upazila, division FROM users WHERE id = ?", (user["id"],)).fetchone()
        if not row:
            raise HTTPException(404, "User not found")
        return dict(row)

# ==================== DISTRICTS ====================
@app.get("/api/v1/districts", summary="List all Bangladesh districts")
def list_districts():
    """Get all 64 districts of Bangladesh with soil and climate data."""
    with get_db() as db:
        rows = db.execute("SELECT * FROM districts ORDER BY name_en").fetchall()
        return {"districts": [dict(r) for r in rows], "total": len(rows)}

@app.get("/api/v1/districts/{name}", summary="Get district details by name")
def get_district(name: str):
    """Get a single district by English or Bangla name."""
    with get_db() as db:
        row = db.execute("SELECT * FROM districts WHERE name_en = ? OR name_bn = ?", (name, name)).fetchone()
        if not row:
            raise HTTPException(404, "District not found")
        return dict(row)

# ==================== SOIL (FROM XLSX) ====================
@app.get("/api/v1/soil/categories", summary="List soil data categories")
def soil_categories():
    """Get available soil data categories from Bangladesh soil survey reports."""
    with get_db() as db:
        rows = db.execute("SELECT DISTINCT category, COUNT(*) as records FROM soil_report_data GROUP BY category").fetchall()
        return {"categories": [dict(r) for r in rows]}

@app.get("/api/v1/soil/data/{category}", summary="Get soil data by category")
def soil_data(category: str, limit: int = Query(default=100, le=500)):
    """Get soil analysis records for a specific category. Max 500 records."""
    with get_db() as db:
        rows = db.execute("SELECT * FROM soil_report_data WHERE category = ? LIMIT ?", (category, limit)).fetchall()
        return {"category": "soil", "subcategory": category, "records": [dict(r) for r in rows], "total": len(rows)}

@app.get("/api/v1/soil/district/{district}")
def soil_by_district(district: str):
    with get_db() as db:
        rows = db.execute("SELECT * FROM soil_report_data WHERE record_json LIKE ? LIMIT 200", (f"%{district}%",)).fetchall()
        return {"district": district, "records": [dict(r) for r in rows], "total": len(rows)}

@app.get("/api/v1/soil/nearest")
def soil_nearest(lat: float, lng: float):
    with get_db() as db:
        districts = db.execute("SELECT * FROM districts").fetchall()
        best, best_dist = None, float('inf')
        for d in districts:
            dist = ((d["lat"] - lat) ** 2 + (d["lng"] - lng) ** 2) ** 0.5
            if dist < best_dist:
                best_dist = dist
                best = d
        if not best:
            raise HTTPException(404, "No district found")
        soil_rows = db.execute("SELECT * FROM soil_report_data WHERE record_json LIKE ? LIMIT 200", (f"%{best['name_en']}%",)).fetchall()
        return {"district": best["name_en"], "district_bn": best["name_bn"], "distance_km": round(best_dist * 111, 1), "soil_data": [dict(r) for r in soil_rows]}

# ==================== WEATHER ====================
@app.get("/api/v1/weather/{district}")
def weather_by_district(district: str):
    with get_db() as db:
        row = db.execute("SELECT * FROM districts WHERE name_en = ? OR name_bn = ?", (district, district)).fetchone()
        if not row:
            raise HTTPException(404, "District not found")
        return {
            "district": row["name_en"], "district_bn": row["name_bn"],
            "lat": row["lat"], "lng": row["lng"],
            "soil_type": row["soil_type"], "climate": row["climate"],
            "message": "Use /api/weather endpoint on Node.js server for real-time weather data"
        }

# ==================== CROP RECOMMENDATION ====================
@app.post("/api/v1/crops/recommend", summary="Get crop recommendations for a location")
def recommend_crops(req: CropRecommendRequest):
    """Get recommended crops based on district soil type and major crops."""
    with get_db() as db:
        dist = db.execute("SELECT * FROM districts WHERE name_en = ? OR name_bn = ?", (req.district, req.district)).fetchone()
        if not dist:
            raise HTTPException(404, "District not found")

        district_name = dist["name_en"]
        crops = []
        if dist["major_crops"]:
            for crop in dist["major_crops"].split(","):
                crops.append({"name": crop.strip(), "confidence": 85, "reason": f"Major crop in {district_name} district"})

        if dist["soil_type"] == "Alluvial":
            crops.append({"name": "ধান", "confidence": 90, "reason": "Alluvial soil is ideal for rice"})
            crops.append({"name": "গম", "confidence": 75, "reason": "Alluvial soil supports wheat"})
        elif dist["soil_type"] == "Coastal":
            crops.append({"name": "মরিচ", "confidence": 80, "reason": "Coastal soil suits chili"})
            crops.append({"name": "চা", "confidence": 70, "reason": "Coastal areas support tea"})

        return {"district": district_name, "upazila": req.upazila, "recommended_crops": crops, "soil_type": dist["soil_type"]}

# ==================== MARKET ====================
@app.get("/api/v1/market/prices", summary="Get all current market prices")
def market_prices():
    """Get current market prices for all tracked crops in Bangladesh."""
    with get_db() as db:
        rows = db.execute("SELECT * FROM market_prices ORDER BY crop_name").fetchall()
        return {"items": [dict(r) for r in rows], "total": len(rows)}

@app.get("/api/v1/market/price/{crop}", summary="Get market price for a specific crop")
def market_price(crop: str):
    """Get current price for a specific crop by English or Bangla name."""
    with get_db() as db:
        row = db.execute("SELECT * FROM market_prices WHERE crop_name = ? OR crop_name_bn = ?", (crop, crop)).fetchone()
        if not row:
            raise HTTPException(404, "Crop not found")
        return dict(row)

# ==================== DISEASE ====================
@app.post("/api/v1/disease/detect", summary="Report a detected plant disease")
def detect_disease(report: DiseaseReport, authorization: str = Header(default="")):
    """Log a disease detection result. Optionally attach to authenticated user."""
    user = get_current_user(authorization)
    user_id = user["id"] if user else None
    with get_db() as db:
        try:
            db.execute(
                "INSERT INTO disease_reports (user_id, disease_name, confidence, description, treatments) VALUES (?,?,?,?,?)",
                (user_id, report.disease_name, report.confidence, report.description, json.dumps(report.treatments))
            )
            db.commit()
        except sqlite3.Error:
            # Never report success for a write that did not happen.
            logger.exception("Failed to persist disease report")
            raise HTTPException(500, "Failed to save disease report") from None
    return {"success": True, "disease": report.disease_name, "confidence": report.confidence}

# ==================== CHATBOT ====================
@app.post("/api/v1/chatbot/chat", summary="Chat with AI agriculture assistant")
def chat(msg: ChatMessage, authorization: str = Header(default="")):
    """Send a message to the agriculture chatbot. Supports Bangla and English."""
    responses = {
        "bn": {
            "ধান": "ধান বাংলাদেশের সবচেয়ে গুরুত্বপূর্ণ ফসল। BRRI Dhan 28 ও 50 জাত বেশি জনপ্রিয়।",
            "সেচ": "সেচ দেওয়ার সেরা সময় ভোর বা সন্ধ্যা।",
            "রোগ": "ফসলের রোগ সনাক্তকরণ ফিচারে ছবি আপলোড করে রোগ শনাক্ত করুন।",
            "বাজার": "বাজার বিশ্লেষণ ফিচারে সর্বশেষ ফসলের দাম দেখুন।",
            "সার": "সঠিক সার ব্যবহারে ফলন বাড়ে। মাটি পরীক্ষার রিপোর্ট অনুযায়ী সার ব্যবহার করুন।",
            "আবহাওয়া": "আবহাওয়া ফিচারে ৭ দিনের পূর্বাভাস দেখুন।",
            "default": "আমি আপনার কৃষি সহকারী। ধান, সবজি, ফল সম্পর্কে জানতে চাইলে বলুন।"
        },
        "en": {
            "rice": "Rice is the most important crop in Bangladesh. BRRI Dhan 28 and 50 are most popular.",
            "irrigation": "Best time for irrigation is dawn or dusk.",
            "disease": "Use the Disease Detection feature to upload a photo and identify diseases.",
            "market": "Check the Market Analysis feature for latest crop prices.",
            "fertilizer": "Proper fertilizer increases yield. Use based on soil test report.",
            "weather": "Check the Weather feature for 7-day forecast.",
            "default": "I am your agriculture assistant. Ask about rice, vegetables, or fruits."
        }
    }
    lang_data = responses.get(msg.lang, responses["bn"])
    reply = lang_data.get("default")
    text = msg.message.lower()
    for key, val in lang_data.items():
        if key != "default" and key in text:
            reply = val
            break

    try:
        with get_db() as db:
            db.execute("INSERT INTO chat_history (user_id, message, reply, lang) VALUES (NULL,?,?,?)", (msg.message, reply, msg.lang))
            db.commit()
    except sqlite3.Error:
        # Chat still works without the audit trail; log instead of hiding it.
        logger.exception("Failed to persist chat history")

    return {"reply": reply, "lang": msg.lang}

# ==================== NOTIFICATIONS ====================
@app.get("/api/v1/notifications")
def get_notifications():
    with get_db() as db:
        rows = db.execute("SELECT * FROM notifications ORDER BY created_at DESC LIMIT 20").fetchall()
        return {"items": [dict(r) for r in rows]}

# ==================== DATABASE STATS ====================
@app.get("/api/v1/stats")
def get_stats():
    with get_db() as db:
        stats = {
            "users": db.execute("SELECT COUNT(*) as c FROM users").fetchone()["c"],
            "districts": db.execute("SELECT COUNT(*) as c FROM districts").fetchone()["c"],
            "market_prices": db.execute("SELECT COUNT(*) as c FROM market_prices").fetchone()["c"],
            "disease_reports": db.execute("SELECT COUNT(*) as c FROM disease_reports").fetchone()["c"],
        }
        try:
            stats["soil_records"] = db.execute("SELECT COUNT(*) as c FROM soil_report_data").fetchone()["c"]
        except sqlite3.OperationalError:
            stats["soil_records"] = 0
        try:
            stats["crop_recommendations"] = db.execute("SELECT COUNT(*) as c FROM crop_recommendations").fetchone()["c"]
        except sqlite3.OperationalError:
            stats["crop_recommendations"] = 0
        try:
            stats["chat_messages"] = db.execute("SELECT COUNT(*) as c FROM chat_history").fetchone()["c"]
        except sqlite3.OperationalError:
            stats["chat_messages"] = 0
        return stats

# ==================== HEALTH ====================
@app.get("/api/v1/health", summary="Health check endpoint")
def health():
    """Verify API and database are healthy. Returns 503 if DB unreachable."""
    try:
        with get_db() as db:
            db.execute("SELECT 1")
        return {"status": "healthy", "database": "connected", "timestamp": datetime.now(timezone.utc).isoformat()}
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        raise HTTPException(503, "Service unavailable")

if __name__ == "__main__":
    import uvicorn
    # 0.0.0.0 is required: Render/K8s health checks reach the pod over the
    # container network. Binding to 127.0.0.1 would fail the health check.
    uvicorn.run(app, host="0.0.0.0", port=8000)  # nosec B104
