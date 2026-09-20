"""Shared model-serving helpers for the AI service routers.

Design notes
    The training scripts in `ai_models/` export scikit-learn estimators as
    `.pkl`. Pickle is convenient offline but unusable in a service: it executes
    arbitrary code on load and pins the exact scikit-learn version. So the same
    estimators are also exported to ONNX by `scripts/export_models_to_onnx.py`,
    and this module prefers the ONNX artifact when present.

    When neither artifact is available the routers answer `model_unavailable`
    with HTTP 200 and an explicit status field, matching the disease endpoint.
    That is deliberate: the platform must never fabricate a prediction just to
    return a 200.
"""
from __future__ import annotations

import json
import logging
import os
from pathlib import Path
from typing import Any

import numpy as np

logger = logging.getLogger(__name__)

try:  # pragma: no cover - exercised implicitly by every import
    import onnxruntime as ort

    ORT_AVAILABLE = True
except ImportError:  # pragma: no cover
    ORT_AVAILABLE = False
    logger.warning("onnxruntime not available - ML endpoints will report model_unavailable")


class OnnxModel:
    """Thin wrapper that pairs an ONNX graph with its feature/label metadata."""

    def __init__(self, session: "ort.InferenceSession", metadata: dict[str, Any]) -> None:
        self.session = session
        self.metadata = metadata
        self.input_name = session.get_inputs()[0].name

    @classmethod
    def load(cls, onnx_path: Path, metadata_path: Path) -> "OnnxModel | None":
        if not ORT_AVAILABLE or not onnx_path.exists():
            return None
        metadata: dict[str, Any] = {}
        if metadata_path.exists():
            metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        try:
            session = ort.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"])
        except Exception as exc:  # noqa: BLE001 - any load failure means "unavailable"
            logger.error("failed to load %s: %s", onnx_path, exc)
            return None
        logger.info("loaded %s", onnx_path.name)
        return cls(session, metadata)


def models_root() -> Path:
    """Directory holding exported ONNX artifacts."""
    return Path(os.getenv("MODELS_DIR", "/app/models"))


def metadata_root() -> Path:
    """Directory holding the model_info.json files produced during training."""
    return Path(os.getenv("METADATA_DIR", "/app/models"))
