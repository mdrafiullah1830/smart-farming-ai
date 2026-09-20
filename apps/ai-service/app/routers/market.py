"""POST /v1/market/forecast — short-horizon price forecasting.

Model
    The training script (`ai_models/market_forecasting/train.py`) builds an LSTM
    over 30-day price windows with a Random Forest fallback. Service-side this
    runs the exported ONNX graph when available.

    The scaler is part of the model: MinMax-scaled input and inverse-scaled
    output. The scaler bounds are shipped in the metadata file as
    `scaler_min` / `scaler_max`, so scaling is explicit instead of relying on a
    pickled sklearn object.
"""
from __future__ import annotations

import logging
from typing import Annotated

import numpy as np
from fastapi import APIRouter, Header

from app.models import OnnxModel, metadata_root, models_root
from app.schemas import MarketForecastRequest, MarketForecastResponse

logger = logging.getLogger(__name__)

router = APIRouter()

MODEL: OnnxModel | None = None


def load() -> None:
    global MODEL
    MODEL = OnnxModel.load(
        models_root() / "market_forecast.onnx",
        models_root() / "market_forecast_model_info.json",
    )


def classify_trend(history: list[float], forecast: list[float]) -> str:
    """Compare the forecast mean with the recent history mean.

    A 2% band avoids reporting noise as a trend.
    """
    recent = float(np.mean(history[-7:]))
    projected = float(np.mean(forecast))
    if recent <= 0:
        return "stable"
    change = (projected - recent) / recent
    if change > 0.02:
        return "up"
    if change < -0.02:
        return "down"
    return "stable"


@router.post("/v1/market/forecast", response_model=MarketForecastResponse)
async def forecast_price(
    request: MarketForecastRequest,
    authorization: Annotated[str | None, Header()] = None,
) -> MarketForecastResponse:
    from app.main import require_service_token

    require_service_token(authorization)

    if MODEL is None:
        return MarketForecastResponse(
            status="model_unavailable",
            message=(
                "The market forecasting model has not been deployed. "
                "Run scripts/export_models_to_onnx.py and set MODELS_DIR."
            ),
        )

    history = np.asarray(request.history, dtype=np.float32)
    if np.any(history <= 0):
        return MarketForecastResponse(status="error", message="All history values must be positive prices")

    scaler_bounds = MODEL.metadata.get("scaler_bounds", {})
    crop_key = request.crop.strip().lower()
    if crop_key in scaler_bounds:
        low = float(scaler_bounds[crop_key]["min"])
        high = float(scaler_bounds[crop_key]["max"])
    else:
        low = float(history.min())
        high = float(history.max())
    if high <= low:
        return MarketForecastResponse(status="error", message="Model scaler bounds are degenerate")

    window = int(MODEL.metadata.get("sequence_length", 30))
    sequence = history[-window:] if len(history) >= window else np.pad(history, (window - len(history),), mode="edge")
    scaled = (sequence - low) / (high - low)

    try:
        outputs = MODEL.session.run(None, {MODEL.input_name: scaled.reshape(1, window).astype(np.float32)})
    except Exception as exc:  # noqa: BLE001
        logger.error("market inference failed: %s", exc)
        return MarketForecastResponse(status="error", message=f"Inference failed: {exc}")

    raw = np.asarray(outputs[0]).reshape(-1)
    # The graph may return all requested steps at once, or a single next step
    # that must be fed back. Handle the single-step case by rolling forward.
    if raw.size == 1:
        rolling = list(scaled)
        steps: list[float] = []
        for _ in range(request.days):
            prediction = float(MODEL.session.run(None, {MODEL.input_name: np.asarray(rolling[-window:], dtype=np.float32).reshape(1, window)})[0].reshape(-1)[0])
            rolling.append(prediction)
            steps.append(prediction)
        scaled_forecast = np.asarray(steps)
    else:
        scaled_forecast = raw[: request.days]

    forecast = [round(float(value) * (high - low) + low, 2) for value in scaled_forecast]
    forecast = [max(value, 0.0) for value in forecast]

    return MarketForecastResponse(
        status="success",
        message="Market forecast completed",
        model=MODEL.metadata.get("model_name", "unknown"),
        forecast=forecast,
        trend=classify_trend(history.tolist(), forecast),
    )
