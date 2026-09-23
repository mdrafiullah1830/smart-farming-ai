"""Integration tests for travel API endpoints."""

import os
import pytest
from fastapi.testclient import TestClient

# Set the service token BEFORE importing app (matches conftest for the whole suite)
os.environ["SERVICE_TOKEN"] = "test-token"

from app.main import app

client = TestClient(app)

# Test token
TEST_TOKEN = "test-token"
HEADERS = {"Authorization": f"Bearer {TEST_TOKEN}", "Content-Type": "application/json"}


class TestTravelAskEndpoint:
    def test_ask_lalbagh_fort(self):
        response = client.post(
            "/v1/travel/ask",
            headers=HEADERS,
            json={"question": "What is Lalbagh Fort?", "language": "en"},
        )
        assert response.status_code == 200
        data = response.json()
        assert "answer" in data
        assert "answer_en" in data
        assert "answer_bn" in data
        assert "sources" in data
        assert "confidence" in data
        assert len(data["sources"]) > 0
        assert data["confidence"] >= 0

    def test_ask_bangla(self):
        response = client.post(
            "/v1/travel/ask",
            headers=HEADERS,
            json={"question": "লালবাগ কেল্লা কী?", "language": "bn"},
        )
        assert response.status_code == 200
        data = response.json()
        assert "answer_bn" in data
        assert data["answer_bn"] is not None

    def test_ask_no_results(self):
        response = client.post(
            "/v1/travel/ask",
            headers=HEADERS,
            json={"question": "xyzabc123 nonexistent place", "language": "en"},
        )
        assert response.status_code == 200
        data = response.json()
        # Should return a fallback response
        assert "answer" in data

    def test_ask_missing_auth(self):
        response = client.post(
            "/v1/travel/ask",
            json={"question": "test", "language": "en"},
        )
        assert response.status_code == 401

    def test_ask_invalid_auth(self):
        response = client.post(
            "/v1/travel/ask",
            headers={"Authorization": "Bearer invalid", "Content-Type": "application/json"},
            json={"question": "test", "language": "en"},
        )
        assert response.status_code == 401


class TestTravelCostEndpoint:
    def test_cost_basic(self):
        response = client.post(
            "/v1/travel/cost",
            headers=HEADERS,
            json={
                "origin": "dhaka",
                "destination": "sylhet",
                "days": 3,
                "people": 2,
                "hotel_tier": "mid",
                "transport_mode": "bus_ac",
                "food_tier": "mid",
                "month": 11,
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert "transport" in data
        assert "accommodation" in data
        assert "food" in data
        assert "food_breakdown" in data
        assert "misc_buffer" in data
        assert "total" in data
        assert data["currency"] == "BDT"
        assert data["total"] > 0

    def test_cost_with_flight(self):
        response = client.post(
            "/v1/travel/cost",
            headers=HEADERS,
            json={
                "origin": "dhaka",
                "destination": "coxs_bazar",
                "days": 4,
                "people": 2,
                "hotel_tier": "luxury",
                "transport_mode": "flight",
                "food_tier": "luxury",
                "month": 12,
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert data["transport"] > 0
        assert data["total"] > 0

    def test_cost_return_transport_false(self):
        response = client.post(
            "/v1/travel/cost",
            headers=HEADERS,
            json={
                "origin": "dhaka",
                "destination": "sylhet",
                "days": 3,
                "people": 2,
                "hotel_tier": "mid",
                "transport_mode": "bus_ac",
                "food_tier": "mid",
                "month": 11,
                "return_transport": False,
            },
        )
        assert response.status_code == 200
        data = response.json()

        # Compare with return_transport=True
        response2 = client.post(
            "/v1/travel/cost",
            headers=HEADERS,
            json={
                "origin": "dhaka",
                "destination": "sylhet",
                "days": 3,
                "people": 2,
                "hotel_tier": "mid",
                "transport_mode": "bus_ac",
                "food_tier": "mid",
                "month": 11,
                "return_transport": True,
            },
        )
        data2 = response2.json()
        assert data2["transport"] == data["transport"] * 2

    def test_cost_invalid_params(self):
        response = client.post(
            "/v1/travel/cost",
            headers=HEADERS,
            json={
                "origin": "dhaka",
                "destination": "sylhet",
                "days": 0,  # Invalid
                "people": 2,
                "hotel_tier": "mid",
                "transport_mode": "bus_ac",
                "food_tier": "mid",
                "month": 11,
            },
        )
        assert response.status_code == 422
        data = response.json()
        # FastAPI validation returns detail as list
        assert "detail" in data

    def test_cost_invalid_transport_mode(self):
        response = client.post(
            "/v1/travel/cost",
            headers=HEADERS,
            json={
                "origin": "dhaka",
                "destination": "sylhet",
                "days": 3,
                "people": 2,
                "hotel_tier": "mid",
                "transport_mode": "invalid",
                "food_tier": "mid",
                "month": 11,
            },
        )
        assert response.status_code == 422

    def test_cost_invalid_hotel_tier(self):
        response = client.post(
            "/v1/travel/cost",
            headers=HEADERS,
            json={
                "origin": "dhaka",
                "destination": "sylhet",
                "days": 3,
                "people": 2,
                "hotel_tier": "invalid",
                "transport_mode": "bus_ac",
                "food_tier": "mid",
                "month": 11,
            },
        )
        assert response.status_code == 422

    def test_cost_missing_auth(self):
        response = client.post(
            "/v1/travel/cost",
            json={
                "origin": "dhaka",
                "destination": "sylhet",
                "days": 3,
                "people": 2,
            },
        )
        assert response.status_code == 401


class TestTravelDistrictsEndpoint:
    def test_get_districts(self):
        response = client.get("/v1/travel/districts", headers=HEADERS)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) > 0
        for district in data:
            assert "name" in district
            assert "highlights" in district
            assert "estimated_daily_cost_budget" in district
            assert "estimated_daily_cost_mid" in district
            assert "estimated_daily_cost_luxury" in district

    def test_districts_includes_major_cities(self):
        response = client.get("/v1/travel/districts", headers=HEADERS)
        data = response.json()
        names = [d["name"] for d in data]
        assert "Dhaka" in names
        assert "Sylhet" in names
        assert "Cox's Bazar" in names
        assert "Chittagong" in names
        assert "Rajshahi" in names
        assert "Khulna" in names
        assert "Barisal" in names
        assert "Rangpur" in names
        assert "Mymensingh" in names


class TestTravelSitesEndpoint:
    def test_get_sites(self):
        response = client.get("/v1/travel/sites", headers=HEADERS)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) > 0
        for site in data:
            assert "name" in site
            assert "district" in site
            assert "category" in site
            assert "description" in site

    def test_get_sites_filter_by_district(self):
        response = client.get("/v1/travel/sites?district=dhaka", headers=HEADERS)
        assert response.status_code == 200
        data = response.json()
        for site in data:
            assert "dhaka" in site["district"].lower()

    def test_get_sites_filter_by_partial_district(self):
        response = client.get("/v1/travel/sites?district=raj", headers=HEADERS)
        assert response.status_code == 200
        data = response.json()
        for site in data:
            assert "raj" in site["district"].lower()


class TestTravelHealthEndpoint:
    def test_health(self):
        response = client.get("/v1/travel/health", headers=HEADERS)
        assert response.status_code == 200
        data = response.json()
        assert "status" in data
        assert "rag_index" in data
        assert "embedding_model" in data
        assert "data_files" in data
        assert data["embedding_model"] == "sentence-transformers/all-MiniLM-L6-v2"


class TestTravelTransportModesEndpoint:
    def test_get_transport_modes(self):
        response = client.get("/v1/travel/transport-modes", headers=HEADERS)
        assert response.status_code == 200
        data = response.json()
        assert "modes" in data
        modes = data["modes"]
        assert "bus_ac" in modes
        assert "bus_non_ac" in modes
        assert "train_shovan" in modes
        assert "train_ac_chair" in modes
        assert "train_ac_berth" in modes
        assert "flight" in modes


class TestTravelTiersEndpoint:
    def test_get_tiers(self):
        response = client.get("/v1/travel/tiers", headers=HEADERS)
        assert response.status_code == 200
        data = response.json()
        assert "accommodation_tiers" in data
        assert "food_tiers" in data
        assert data["accommodation_tiers"] == ["budget", "mid", "luxury"]
        assert data["food_tiers"] == ["budget", "mid", "luxury"]


class TestMainHealthEndpoint:
    def test_health_includes_travel(self):
        response = client.get("/health", headers=HEADERS)
        assert response.status_code == 200
        data = response.json()
        assert "models" in data
        assert "travel" in data["models"]
        # May be unavailable when the RAG index is not built; the key must exist.
        assert data["models"]["travel"] in ("ok", "unavailable")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])