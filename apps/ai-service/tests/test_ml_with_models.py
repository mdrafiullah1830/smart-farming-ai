"""Tests that run the real exported ONNX graphs end to end.

These tests are skipped automatically when apps/ai-service/models does not
contain the exported artifacts (e.g. a fresh clone before running
scripts/export_models_to_onnx.py). They assert behavioural contracts, not
exact numbers: the sklearn cross-check that proves numerical fidelity lives
in scripts/export_models_to_onnx.py --verify.
"""
import os
from pathlib import Path

# Set environment variables before importing app so models_root() uses correct paths
MODELS_DIR = Path(__file__).resolve().parents[1] / "models"
os.environ["MODELS_DIR"] = str(MODELS_DIR)
os.environ["METADATA_DIR"] = str(MODELS_DIR)
os.environ["SERVICE_TOKEN"] = "test-token"

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)
AUTH = {"Authorization": "Bearer test-token"}
CROP_READY = (MODELS_DIR / "crop_recommendation.onnx").exists()
YIELD_READY = (MODELS_DIR / "yield_prediction.onnx").exists()
MARKET_READY = (MODELS_DIR / "market_forecast.onnx").exists()

crop_ready = pytest.mark.skipif(not CROP_READY, reason="crop ONNX not exported")
yield_ready = pytest.mark.skipif(not YIELD_READY, reason="yield ONNX not exported")
market_ready = pytest.mark.skipif(not MARKET_READY, reason="market ONNX not exported")


def _load_model(stem: str):
    from app.models import OnnxModel

    return OnnxModel.load(
        MODELS_DIR / f"{stem}.onnx",
        MODELS_DIR / f"{stem}_model_info.json",
    )


# ---------------------------------------------------------------- crop
@crop_ready
def test_crop_returns_recommendations():
    import app.routers.crop as crop_router

    assert crop_router.MODEL is None  # lifespan does not run under TestClient
    crop_router.load()
    assert crop_router.MODEL is not None

    response = client.post(
        "/v1/crop/recommend",
        json={"temperature": 28, "humidity": 75, "rainfall": 800, "ph": 6.2,
              "nitrogen": 80, "phosphorus": 45, "potassium": 50},
        headers=AUTH,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    assert data["model"] == "random_forest"
    recs = data["recommendations"]
    assert 1 <= len(recs) <= 5
    # Confidences must be probabilities: in [0, 1] and sorted descending.
    confidences = [r["confidence"] for r in recs]
    assert all(0.0 <= c <= 1.0 for c in confidences)
    assert confidences == sorted(confidences, reverse=True)
    # Every label must come from the trained class list, never a fabricated one.
    known = set(crop_router.MODEL.metadata["classes"])
    assert {r["crop"] for r in recs} <= known


# ---------------------------------------------------------------- yield
@yield_ready
def test_yield_returns_positive_per_acre():
    import app.routers.yield_ as yield_router

    yield_router.load()
    assert yield_router.MODEL is not None

    response = client.post(
        "/v1/yield/predict",
        json={"crop": "rice", "temperature": 28, "humidity": 75, "rainfall": 800,
              "ph": 6.2, "nitrogen": 80, "area_acres": 2, "irrigation_used": True,
              "season": "kharif"},
        headers=AUTH,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    assert data["yield_per_acre"] >= 0
    # Both values are rounded to 3dp independently; allow rounding slop.
    assert data["total_yield"] == pytest.approx(data["yield_per_acre"] * 2, abs=0.005)


@yield_ready
def test_yield_rejects_unknown_crop_before_inference():
    import app.routers.yield_ as yield_router

    yield_router.load()
    response = client.post(
        "/v1/yield/predict",
        json={"crop": "quinoa", "temperature": 28, "humidity": 75, "rainfall": 800,
              "ph": 6.2, "nitrogen": 80, "area_acres": 2},
        headers=AUTH,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "error"
    assert "Unsupported crop" in data["message"]


# ---------------------------------------------------------------- market
@market_ready
def test_market_forecast_shape_and_trend():
    import app.routers.market as market_router

    market_router.load()
    assert market_router.MODEL is not None

    history = [55.0, 56.0, 54.5, 57.0, 55.5, 53.0, 56.0, 57.5, 56.0, 54.0,
               55.0, 56.5, 58.0, 57.0, 55.0, 54.0, 56.0, 57.0, 55.5, 56.0,
               57.0, 56.0, 55.0, 54.5, 56.0, 57.5, 56.0, 55.0, 54.0, 56.5,
               58.0, 57.0, 55.0, 54.0]
    response = client.post(
        "/v1/market/forecast",
        json={"crop": "rice", "history": history, "days": 7},
        headers=AUTH,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    forecast = data["forecast"]
    assert len(forecast) == 7
    # Prices are physically non-negative; a negative forecast is a bug.
    assert all(p >= 0 for p in forecast)
    assert data["trend"] in ("up", "down", "stable")
