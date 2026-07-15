#!/usr/bin/env python3
"""Smart Farming AI - FastAPI Backend with SQLite database."""
import os, json, sqlite3, hashlib, secrets
from datetime import datetime, timedelta
from typing import Optional
from fastapi import FastAPI, HTTPException, Depends, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'database', 'smart_farming.db')

app = FastAPI(title="Smart Farming AI", version="1.0.0", description="AI-powered agriculture platform for Bangladesh")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==================== DATABASE ====================
def get_db():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False, timeout=10)
    conn.row_factory = sqlite3.Row
    return conn

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
SECRET = "smart_farming_ai_fastapi_secret_2026"

def hash_password(pw: str) -> str:
    return hashlib.sha256((pw + SECRET).encode()).hexdigest()

def verify_password(pw: str, hashed: str) -> bool:
    return hash_password(pw) == hashed

def create_token(user_id: int, email: str) -> str:
    import jwt
    return jwt.encode({"id": user_id, "email": email, "exp": datetime.utcnow() + timedelta(days=7)}, SECRET, algorithm="HS256")

def get_current_user(token: str):
    import jwt
    try:
        data = jwt.decode(token, SECRET, algorithms=["HS256"])
        return data
    except:
        return None

# ==================== AUTH ENDPOINTS ====================
@app.post("/api/v1/auth/register")
def register(user: UserRegister):
    db = get_db()
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

@app.post("/api/v1/auth/login")
def login(user: UserLogin):
    db = get_db()
    row = db.execute("SELECT * FROM users WHERE email = ?", (user.email,)).fetchone()
    if not row:
        raise HTTPException(401, "User not found")
    if not verify_password(user.password, row["password_hash"]):
        raise HTTPException(401, "Invalid password")
    token = create_token(row["id"], row["email"])
    return {"success": True, "token": token, "user": {"id": row["id"], "name_en": row["name_en"], "email": row["email"]}}

@app.get("/api/v1/auth/profile")
def get_profile(authorization: str = Query(default="")):
    token = authorization.replace("Bearer ", "")
    user = get_current_user(token)
    if not user:
        raise HTTPException(401, "Unauthorized")
    db = get_db()
    row = db.execute("SELECT id, name_en, name_bn, email, phone, district, upazila, division FROM users WHERE id = ?", (user["id"],)).fetchone()
    return dict(row) if row else {}

# ==================== DISTRICTS ====================
@app.get("/api/v1/districts")
def list_districts():
    db = get_db()
    rows = db.execute("SELECT * FROM districts ORDER BY name_en").fetchall()
    return {"districts": [dict(r) for r in rows], "total": len(rows)}

@app.get("/api/v1/districts/{name}")
def get_district(name: str):
    db = get_db()
    row = db.execute("SELECT * FROM districts WHERE name_en = ? OR name_bn = ?", (name, name)).fetchone()
    if not row:
        raise HTTPException(404, "District not found")
    return dict(row)

# ==================== SOIL (FROM XLSX) ====================
@app.get("/api/v1/soil/categories")
def soil_categories():
    db = get_db()
    rows = db.execute("SELECT DISTINCT category, COUNT(*) as records FROM soil_report_data GROUP BY category").fetchall()
    return {"categories": [dict(r) for r in rows]}

@app.get("/api/v1/soil/data/{category}")
def soil_data(category: str, limit: int = 100):
    db = get_db()
    rows = db.execute("SELECT * FROM soil_report_data WHERE category = ? LIMIT ?", (category, limit)).fetchall()
    return {"category": "soil", "subcategory": category, "records": [dict(r) for r in rows], "total": len(rows)}

@app.get("/api/v1/soil/district/{district}")
def soil_by_district(district: str):
    db = get_db()
    rows = db.execute("SELECT * FROM soil_report_data WHERE record_json LIKE ? LIMIT 200", (f"%{district}%",)).fetchall()
    return {"district": district, "records": [dict(r) for r in rows], "total": len(rows)}

@app.get("/api/v1/soil/nearest")
def soil_nearest(lat: float, lng: float):
    db = get_db()
    # Find nearest district by coordinates
    districts = db.execute("SELECT * FROM districts").fetchall()
    best, best_dist = None, float('inf')
    for d in districts:
        dist = ((d["lat"] - lat) ** 2 + (d["lng"] - lng) ** 2) ** 0.5
        if dist < best_dist:
            best_dist = dist
            best = d
    if not best:
        raise HTTPException(404, "No district found")
    # Get soil data for that district
    soil_rows = db.execute("SELECT * FROM soil_report_data WHERE record_json LIKE ? LIMIT 200", (f"%{best['name_en']}%",)).fetchall()
    return {"district": best["name_en"], "district_bn": best["name_bn"], "distance_km": round(best_dist * 111, 1), "soil_data": [dict(r) for r in soil_rows]}

# ==================== WEATHER ====================
@app.get("/api/v1/weather/{district}")
def weather_by_district(district: str):
    # Return cached weather info for district
    db = get_db()
    row = db.execute("SELECT * FROM districts WHERE name_en = ?", (district,)).fetchone()
    if not row:
        raise HTTPException(404, "District not found")
    return {
        "district": district, "lat": row["lat"], "lng": row["lng"],
        "soil_type": row["soil_type"], "climate": row["climate"],
        "message": "Use /api/weather endpoint on Node.js server for real-time weather data"
    }

# ==================== CROP RECOMMENDATION ====================
@app.post("/api/v1/crops/recommend")
def recommend_crops(req: CropRecommendRequest):
    db = get_db()
    # Get district info
    dist = db.execute("SELECT * FROM districts WHERE name_en = ?", (req.district,)).fetchone()
    if not dist:
        raise HTTPException(404, "District not found")

    # Get soil data for district
    soil_data = db.execute("SELECT * FROM soil_report_data WHERE record_json LIKE ? LIMIT 50", (f"%{req.district}%",)).fetchall()

    # Basic crop recommendation based on district data
    crops = []
    if dist["major_crops"]:
        for crop in dist["major_crops"].split(","):
            crops.append({"name": crop.strip(), "confidence": 85, "reason": f"Major crop in {req.district} district"})

    # Add soil-based recommendations
    if dist["soil_type"] == "Alluvial":
        crops.append({"name": "ধান", "confidence": 90, "reason": "Alluvial soil is ideal for rice"})
        crops.append({"name": "গম", "confidence": 75, "reason": "Alluvial soil supports wheat"})
    elif dist["soil_type"] == "Coastal":
        crops.append({"name": "মরিচ", "confidence": 80, "reason": "Coastal soil suits chili"})
        crops.append({"name": "চা", "confidence": 70, "reason": "Coastal areas support tea"})

    return {"district": req.district, "upazila": req.upazila, "recommended_crops": crops, "soil_type": dist["soil_type"], "soil_records_found": len(soil_data)}

# ==================== MARKET ====================
@app.get("/api/v1/market/prices")
def market_prices():
    db = get_db()
    rows = db.execute("SELECT * FROM market_prices ORDER BY crop_name").fetchall()
    return {"items": [dict(r) for r in rows], "total": len(rows)}

@app.get("/api/v1/market/price/{crop}")
def market_price(crop: str):
    db = get_db()
    row = db.execute("SELECT * FROM market_prices WHERE crop_name = ? OR crop_name_bn = ?", (crop, crop)).fetchone()
    if not row:
        raise HTTPException(404, "Crop not found")
    return dict(row)

# ==================== DISEASE ====================
@app.post("/api/v1/disease/detect")
def detect_disease(report: DiseaseReport, authorization: str = Query(default="")):
    db = get_db()
    token = authorization.replace("Bearer ", "")
    user = get_current_user(token)
    user_id = user["id"] if user else None
    db.execute(
        "INSERT INTO disease_reports (user_id, disease_name, confidence, description, treatments) VALUES (?,?,?,?,?)",
        (user_id, report.disease_name, report.confidence, report.description, json.dumps(report.treatments))
    )
    db.commit()
    return {"success": True, "disease": report.disease_name, "confidence": report.confidence}

# ==================== CHATBOT ====================
@app.post("/api/v1/chatbot/chat")
def chat(msg: ChatMessage, authorization: str = Query(default="")):
    # Simple keyword-based chatbot
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

    # Save to database
    try:
        token = ""
        db = get_db()
        db.execute("INSERT INTO chat_history (user_id, message, reply, lang) VALUES (NULL,?,?,?)", (msg.message, reply, msg.lang))
        db.commit()
    except:
        pass

    return {"reply": reply, "lang": msg.lang}

# ==================== NOTIFICATIONS ====================
@app.get("/api/v1/notifications")
def get_notifications():
    db = get_db()
    rows = db.execute("SELECT * FROM notifications ORDER BY created_at DESC LIMIT 20").fetchall()
    return {"items": [dict(r) for r in rows]}

# ==================== DATABASE STATS ====================
@app.get("/api/v1/stats")
def get_stats():
    db = get_db()
    return {
        "users": db.execute("SELECT COUNT(*) as c FROM users").fetchone()["c"],
        "districts": db.execute("SELECT COUNT(*) as c FROM districts").fetchone()["c"],
        "soil_records": db.execute("SELECT COUNT(*) as c FROM soil_report_data").fetchone()["c"],
        "market_prices": db.execute("SELECT COUNT(*) as c FROM market_prices").fetchone()["c"],
        "crop_recommendations": db.execute("SELECT COUNT(*) as c FROM crop_recommendations").fetchone()["c"],
        "disease_reports": db.execute("SELECT COUNT(*) as c FROM disease_reports").fetchone()["c"],
        "chat_messages": db.execute("SELECT COUNT(*) as c FROM chat_history").fetchone()["c"],
    }

# ==================== HEALTH ====================
@app.get("/api/v1/health")
def health():
    db = get_db()
    db.execute("SELECT 1")
    return {"status": "healthy", "database": "connected", "timestamp": datetime.utcnow().isoformat()}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
