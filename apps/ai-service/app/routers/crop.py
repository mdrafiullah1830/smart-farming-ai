"""POST /v1/crop/recommend — crop recommendation from soil and climate inputs.

Model
    Random Forest classifier trained by `ai_models/crop_prediction/train.py`.
    Feature order is fixed by `crop_model_info.json`:
        temperature, humidity, rainfall, ph, nitrogen, phosphorus, potassium
    Class labels come from the same metadata file, so the ONNX output index maps
    back to a crop name without hardcoding it here.
"""
from __future__ import annotations

import logging
from typing import Annotated

import numpy as np
from fastapi import APIRouter, Header, HTTPException

from app.models import OnnxModel, metadata_root, models_root
from app.schemas import CropCandidate, CropRecommendRequest, CropRecommendResponse

logger = logging.getLogger(__name__)

router = APIRouter()

MODEL: OnnxModel | None = None


def load() -> None:
    """Load the ONNX artifact once, at application startup."""
    global MODEL
    MODEL = OnnxModel.load(
        models_root() / "crop_recommendation.onnx",
        models_root() / "crop_recommendation_model_info.json",
    )


FEATURE_ORDER = ["temperature", "humidity", "rainfall", "ph", "nitrogen", "phosphorus", "potassium"]


def _softmax(logits: np.ndarray) -> np.ndarray:
    shifted = logits - np.max(logits)
    exponentials = np.exp(shifted)
    return exponentials / np.sum(exponentials)


@router.post("/v1/crop/recommend", response_model=CropRecommendResponse)
async def recommend_crop(
    request: CropRecommendRequest,
    authorization: Annotated[str | None, Header()] = None,
) -> CropRecommendResponse:
    from app.main import require_service_token

    require_service_token(authorization)

    if MODEL is None:
        return CropRecommendResponse(
            status="model_unavailable",
            message=(
                "The crop recommendation model has not been deployed. "
                "Run scripts/export_models_to_onnx.py and set MODELS_DIR."
            ),
        )

    features = np.array(
        [[float(getattr(request, name)) for name in FEATURE_ORDER]],
        dtype=np.float32,
    )

    try:
        outputs = MODEL.session.run(None, {MODEL.input_name: features})
    except Exception as exc:  # noqa: BLE001 - report, never guess
        logger.error("crop inference failed: %s", exc)
        return CropRecommendResponse(status="error", message=f"Inference failed: {exc}")

    # skl2onnx RandomForestClassifier with zipmap disabled emits:
    #   outputs[0] = predicted class index (shape: [batch_size])
    #   outputs[1] = class probabilities (shape: [batch_size, n_classes])
    # Use the probability output for confidence scores.
    probabilities = np.asarray(outputs[1])[0]

    labels: list[str] = MODEL.metadata.get("classes") or [f"class_{i}" for i in range(len(probabilities))]
    order = np.argsort(probabilities)[::-1][: request.top_k]

    recommendations = [
        CropCandidate(crop=labels[int(i)], confidence=round(float(probabilities[int(i)]), 4))
        for i in order
    ]

    return CropRecommendResponse(
        status="success",
        message="Crop recommendation completed",
        model=MODEL.metadata.get("model_name", "unknown"),
        recommendations=recommendations,
    )
