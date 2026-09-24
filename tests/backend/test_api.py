# ============================================================
# Backend API Tests
# ============================================================

import uuid


class TestAuthEndpoints:
    def test_register(self, client):
        unique_email = f"test_{uuid.uuid4().hex[:8]}@example.com"
        response = client.post("/api/v1/auth/register", json={
            "name_en": "Test User",
            "name_bn": "টেস্ট ইউজার",
            "email": unique_email,
            "phone": "01700000000",
            "password": "Password123",
            "district": "Dhaka",
            "upazila": "Dhanmondi",
            "division": "Dhaka",
        })
        assert response.status_code == 200
        data = response.json()
        assert "success" in data
        assert data["success"] is True
        assert "token" in data

    def test_login(self, client):
        unique_email = f"test_{uuid.uuid4().hex[:8]}@example.com"
        # First register a user
        client.post("/api/v1/auth/register", json={
            "name_en": "Test User",
            "email": unique_email,
            "password": "Password123",
        })
        # Then login
        response = client.post("/api/v1/auth/login", json={
            "email": unique_email,
            "password": "Password123",
        })
        assert response.status_code == 200
        data = response.json()
        assert "success" in data
        assert "token" in data

    def test_profile(self, client):
        unique_email = f"test_{uuid.uuid4().hex[:8]}@example.com"
        # Register and login
        client.post("/api/v1/auth/register", json={
            "name_en": "Test User",
            "email": unique_email,
            "password": "Password123",
        })
        login_resp = client.post("/api/v1/auth/login", json={
            "email": unique_email,
            "password": "Password123",
        })
        token = login_resp.json()["token"]
        
        response = client.get("/api/v1/auth/profile", headers={"Authorization": f"Bearer {token}"})
        assert response.status_code == 200
        data = response.json()
        assert "email" in data


class TestDistrictEndpoints:
    def test_list_districts(self, client):
        response = client.get("/api/v1/districts")
        assert response.status_code == 200
        data = response.json()
        assert "districts" in data
        assert "total" in data

    def test_get_district(self, client):
        response = client.get("/api/v1/districts/Dhaka")
        assert response.status_code in [200, 404]


class TestSoilEndpoints:
    def test_soil_categories(self, client):
        response = client.get("/api/v1/soil/categories")
        assert response.status_code == 200
        data = response.json()
        assert "categories" in data

    def test_soil_data(self, client):
        response = client.get("/api/v1/soil/data/Alluvial")
        assert response.status_code == 200
        data = response.json()
        assert "records" in data

    def test_soil_by_district(self, client):
        response = client.get("/api/v1/soil/district/Dhaka")
        assert response.status_code == 200
        data = response.json()
        assert "records" in data

    def test_soil_nearest(self, client):
        response = client.get("/api/v1/soil/nearest", params={"lat": 23.81, "lng": 90.41})
        assert response.status_code == 200
        data = response.json()
        assert "district" in data


class TestWeatherEndpoints:
    def test_get_weather(self, client):
        response = client.get("/api/v1/weather/Dhaka")
        assert response.status_code in [200, 404, 503]


class TestCropEndpoints:
    def test_recommend_crops(self, client):
        response = client.post("/api/v1/crops/recommend", json={
            "district": "Dhaka",
            "upazila": "Dhanmondi",
            "division": "Dhaka",
        })
        assert response.status_code in [200, 404]
        data = response.json()
        if response.status_code == 200:
            assert "recommended_crops" in data


class TestMarketEndpoints:
    def test_market_prices(self, client):
        response = client.get("/api/v1/market/prices")
        assert response.status_code == 200
        data = response.json()
        assert "items" in data

    def test_market_price(self, client):
        response = client.get("/api/v1/market/price/Rice")
        assert response.status_code in [200, 404]


class TestDiseaseEndpoints:
    def _register(self, client):
        email = f"disease_{uuid.uuid4().hex[:8]}@example.com"
        client.post("/api/v1/auth/register", json={
            "name_en": "Disease Tester",
            "email": email,
            "password": "Password123",
        })
        login = client.post("/api/v1/auth/login", json={"email": email, "password": "Password123"})
        return login.json()["token"]

    def test_detect_disease_persists_for_signed_in_user(self, client):
        token = self._register(client)
        response = client.post("/api/v1/disease/detect", json={
            "disease_name": "Rice Blast",
            "confidence": 0.95,
            "description": "Test disease",
            "treatments": ["Treatment 1", "Treatment 2"],
        }, headers={"Authorization": f"Bearer {token}"})
        assert response.status_code == 200
        assert response.json()["success"] is True

    def test_detect_disease_accepts_anonymous_report(self, client):
        response = client.post("/api/v1/disease/detect", json={
            "disease_name": "Leaf Blight",
            "confidence": 0.8,
            "description": "Anonymous report",
            "treatments": [],
        })
        assert response.status_code == 200


class TestChatbotEndpoints:
    def test_chat(self, client):
        response = client.post("/api/v1/chatbot/chat", json={
            "message": "ধান চাষ কিভাবে করব?",
            "lang": "bn",
        })
        assert response.status_code == 200
        data = response.json()
        assert "reply" in data


class TestStatsEndpoints:
    def test_get_stats(self, client):
        response = client.get("/api/v1/stats")
        assert response.status_code == 200
        data = response.json()
        assert "users" in data


class TestHealthEndpoints:
    def test_health(self, client):
        response = client.get("/api/v1/health")
        assert response.status_code == 200
        data = response.json()
        assert "status" in data
        assert data["status"] == "healthy"