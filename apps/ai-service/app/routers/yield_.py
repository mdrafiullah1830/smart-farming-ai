"""POST /v1/yield/predict — per-acre and total yield estimation.

Model
    Gradient Boosting regressor trained by `ai_models/yield_prediction/train.py`.
    Feature order from `yield_model_info.json`:
        crop_encoded, temperature, humidity, rainfall, ph, nitrogen,
        area_acres, irrigation_used, season_encoded

    `crop` and `season` are ordinal-encoded using the `crop_classes` and
    `season_classes` lists in the metadata. An unknown value is rejected with a
    422 rather than mapped to a default, because silently predicting rice for an
    unrecognised crop would be worse than returning nothing.
"""

from __future__ import annotations

import logging
from typing import Annotated

import numpy as np
from fastapi import APIRouter, Header

from app.models import OnnxModel, models_root
from app.schemas import YieldPredictRequest, YieldPredictResponse

logger = logging.getLogger(__name__)

router = APIRouter()

MODEL: OnnxModel | None = None


def load() -> None:
    global MODEL
    MODEL = OnnxModel.load(
        models_root() / "yield_prediction.onnx",
        models_root() / "yield_prediction_model_info.json",
    )


@router.post("/v1/yield/predict", response_model=YieldPredictResponse)
async def predict_yield(
    request: YieldPredictRequest,
    authorization: Annotated[str | None, Header()] = None,
) -> YieldPredictResponse:
    from app.main import require_service_token

    require_service_token(authorization)

    if MODEL is None:
        return YieldPredictResponse(
            status="model_unavailable",
            message=(
                "The yield prediction model has not been deployed. "
                "Run scripts/export_models_to_onnx.py and set MODELS_DIR."
            ),
        )

    crop_classes: list[str] = MODEL.metadata.get("crop_classes") or []
    season_classes: list[str] = MODEL.metadata.get("season_classes") or []

    crop = request.crop.strip().lower()
    season = request.season.strip().lower()

    if crop_classes and crop not in crop_classes:
        return YieldPredictResponse(
            status="error",
            message=f"Unsupported crop '{request.crop}'. Known crops: {', '.join(crop_classes)}",
        )
    if season_classes and season not in season_classes:
        return YieldPredictResponse(
            status="error",
            message=f"Unsupported season '{request.season}'. Known seasons: {', '.join(season_classes)}",
        )

    crop_encoded = float(crop_classes.index(crop)) if crop_classes else 0.0
    season_encoded = float(season_classes.index(season)) if season_classes else 0.0

    features = np.array(
        [
            [
                crop_encoded,
                request.temperature,
                request.humidity,
                request.rainfall,
                request.ph,
                request.nitrogen,
                request.area_acres,
                1.0 if request.irrigation_used else 0.0,
                season_encoded,
            ]
        ],
        dtype=np.float32,
    )

    try:
        outputs = MODEL.session.run(None, {MODEL.input_name: features})
    except Exception as exc:  # noqa: BLE001
        logger.exception("yield inference failed")
        return YieldPredictResponse(status="error", message=f"Inference failed: {exc}")

    per_acre = float(np.asarray(outputs[0]).reshape(-1)[0])
    # A negative prediction is physically meaningless; clamp and say so in the
    # message rather than passing a nonsense number to the UI.
    clamped = max(per_acre, 0.0)
    note = "" if np.isclose(per_acre, clamped) else " (negative prediction clamped to 0)"

    return YieldPredictResponse(
        status="success",
        message=f"Yield prediction completed{note}",
        model=MODEL.metadata.get("model_name", "unknown"),
        yield_per_acre=round(clamped, 3),
        total_yield=round(clamped * request.area_acres, 3),
    )
