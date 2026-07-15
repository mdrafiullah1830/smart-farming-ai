import pytest
from fastapi.testclient import TestClient
from httpx import AsyncClient
import asyncio


# ============================================================
# Backend API Tests
# ============================================================

class TestWeatherEndpoints:
    def test_get_weather(self, client):
        response = client.get("/api/v1/weather/district/test-id")
        assert response.status_code in [200, 503]

    def test_get_forecast(self, client):
        response = client.get("/api/v1/weather/district/test-id/forecast")
        assert response.status_code in [200, 503]


class TestSoilEndpoints:
    def test_analyze_soil(self, client):
        response = client.post("/api/v1/soil/analyze", json={
            "farm_id": "test-farm-id",
            "ph_level": 6.5,
            "nitrogen_mg_kg": 40,
            "phosphorus_mg_kg": 25,
            "potassium_mg_kg": 150,
            "moisture_pct": 30,
        })
        assert response.status_code == 200
        data = response.json()
        assert "health_score" in data
        assert "suitable_crops" in data


class TestCropEndpoints:
    def test_recommend_crops(self, client):
        response = client.post("/api/v1/crops/recommend", json={
            "temperature": 28,
            "humidity": 70,
            "rainfall": 150,
            "ph": 6.5,
            "nitrogen": 40,
            "phosphorus": 25,
            "potassium": 40,
            "season": "kharif",
        })
        assert response.status_code == 200
        data = response.json()
        assert "recommendations" in data

    def test_list_crops(self, client):
        response = client.get("/api/v1/crops/")
        assert response.status_code == 200


class TestYieldEndpoints:
    def test_predict_yield(self, client):
        response = client.post("/api/v1/yield/predict", json={
            "crop_id": "test-crop-id",
            "area_acres": 5,
            "temperature": 28,
            "humidity": 70,
            "rainfall": 150,
            "ph": 6.5,
            "nitrogen": 40,
            "irrigation_used": True,
            "season": "kharif",
            "year": 2025,
        })
        assert response.status_code == 200
        data = response.json()
        assert "expected_yield" in data


class TestChatbotEndpoints:
    def test_chat(self, client):
        response = client.post("/api/v1/chatbot/chat", json={
            "message": "ধান চাষ কিভাবে করব?",
            "language": "bn",
        })
        assert response.status_code == 200
        data = response.json()
        assert "response" in data


class TestMarketEndpoints:
    def test_profit_calculator(self, client):
        response = client.get(
            "/api/v1/market/profit-calculator",
            params={
                "crop_id": "test-crop",
                "area_acres": 5,
                "expected_yield_per_acre": 2.5,
                "price_per_kg": 55,
            },
        )
        assert response.status_code == 200


class TestNotificationEndpoints:
    def test_get_notifications(self, client):
        response = client.get("/api/v1/notifications/")
        assert response.status_code == 200

    def test_unread_count(self, client):
        response = client.get("/api/v1/notifications/unread-count")
        assert response.status_code == 200
        assert "unread_count" in response.json()


class TestFarmEndpoints:
    def test_create_farm(self, client):
        response = client.post("/api/v1/farms/", json={
            "name": "Test Farm",
            "latitude": 23.8103,
            "longitude": 90.4125,
            "area_acres": 5.0,
        })
        assert response.status_code == 201

    def test_list_farms(self, client):
        response = client.get("/api/v1/farms/")
        assert response.status_code == 200
