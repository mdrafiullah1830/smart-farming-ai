"""Contract tests for the crop, yield and market ML routers.

The routers answer `model_unavailable` (HTTP 200) when their artifact is
missing, so the no-model path is testable without any ONNX file. The
artifact-loaded path is exercised by `test_ml_with_models.py`, which runs
against the real exported graphs in apps/ai-service/models.
"""
import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)
AUTH = {"Authorization": "Bearer test-token"}


# ---------------------------------------------------------------- tokens
@pytest.mark.parametrize(
    ("path", "payload"),
    [
        ("/v1/crop/recommend", {"temperature": 25, "humidity": 60, "rainfall": 200,
                                "ph": 6.5, "nitrogen": 50, "phosphorus": 30, "potassium": 40}),
        ("/v1/yield/predict", {"crop": "rice", "temperature": 25, "humidity": 60,
                               "rainfall": 200, "ph": 6.5, "nitrogen": 50, "area_acres": 2}),
        ("/v1/market/forecast", {"crop": "rice", "history": [55, 56, 54, 57, 55, 53, 56]}),
        ("/v1/advisory/sensor", {"moisture_percent": 18}),
    ],
)
def test_endpoints_require_service_token(path, payload):
    response = client.post(path, json=payload)
    assert response.status_code in (401, 503)


# ---------------------------------------------------------------- crop
def test_crop_model_unavailable_returns_200():
    response = client.post(
        "/v1/crop/recommend",
        json={"temperature": 25, "humidity": 60, "rainfall": 200, "ph": 6.5,
              "nitrogen": 50, "phosphorus": 30, "potassium": 40},
        headers=AUTH,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "model_unavailable"
    assert data["recommendations"] is None


def test_crop_rejects_out_of_range_soil_ph():
    response = client.post(
        "/v1/crop/recommend",
        json={"temperature": 25, "humidity": 60, "rainfall": 200, "ph": 14,
              "nitrogen": 50, "phosphorus": 30, "potassium": 40},
        headers=AUTH,
    )
    assert response.status_code == 422


# ---------------------------------------------------------------- yield
def test_yield_model_unavailable_returns_200():
    response = client.post(
        "/v1/yield/predict",
        json={"crop": "rice", "temperature": 25, "humidity": 60, "rainfall": 200,
              "ph": 6.5, "nitrogen": 50, "area_acres": 2},
        headers=AUTH,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "model_unavailable"


def test_yield_rejects_non_positive_area():
    response = client.post(
        "/v1/yield/predict",
        json={"crop": "rice", "temperature": 25, "humidity": 60, "rainfall": 200,
              "ph": 6.5, "nitrogen": 50, "area_acres": 0},
        headers=AUTH,
    )
    assert response.status_code == 422


# ---------------------------------------------------------------- market
def test_market_requires_at_least_seven_prices():
    response = client.post(
        "/v1/market/forecast",
        json={"crop": "rice", "history": [55, 56, 54]},
        headers=AUTH,
    )
    assert response.status_code == 422


def test_market_model_unavailable_returns_200():
    response = client.post(
        "/v1/market/forecast",
        json={"crop": "rice", "history": [55, 56, 54, 57, 55, 53, 56]},
        headers=AUTH,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "model_unavailable"
    assert data["forecast"] is None


# ---------------------------------------------------------------- advisory
def test_advisory_irrigate_when_dry():
    response = client.post(
        "/v1/advisory/sensor",
        json={"moisture_percent": 18, "crop": "rice"},
        headers=AUTH,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    assert data["irrigation_action"] == "irrigate_now"
    assert "warning" in data["reasons"] or "critical" in data["reasons"]
    # The platform is bilingual by contract — every advisory must carry both.
    assert data["message_en"] and data["message_bn"]


def test_advisory_wait_when_rain_expected():
    response = client.post(
        "/v1/advisory/sensor",
        json={"moisture_percent": 18, "rainfall_next_24h_mm": 30},
        headers=AUTH,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["irrigation_action"] == "wait"


def test_advisory_no_action_inside_band():
    response = client.post(
        "/v1/advisory/sensor",
        json={"moisture_percent": 50},
        headers=AUTH,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["irrigation_action"] == "no_action"


def test_advisory_drainage_when_saturated():
    response = client.post(
        "/v1/advisory/sensor",
        json={"moisture_percent": 95},
        headers=AUTH,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["irrigation_action"] == "improve_drainage"


def test_advisory_unknown_without_moisture():
    response = client.post(
        "/v1/advisory/sensor",
        json={"crop": "rice"},
        headers=AUTH,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["irrigation_action"] == "unknown"


def test_advisory_rejects_inverted_thresholds():
    response = client.post(
        "/v1/advisory/sensor",
        json={"moisture_percent": 50, "moisture_min_percent": 80, "moisture_max_percent": 30},
        headers=AUTH,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "error"
