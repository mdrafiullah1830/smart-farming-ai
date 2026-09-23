import base64
import logging
import os
import re
import time
from contextlib import asynccontextmanager
from typing import Annotated, Optional
from urllib.parse import urlparse

import numpy as np
from fastapi import FastAPI, Header, HTTPException, Request, Response
from pydantic import BaseModel, Field
from prometheus_client import Counter, Histogram, generate_latest, CONTENT_TYPE_LATEST

from app.routers import advisory, crop, market, travel, yield_

# Read token at request time so tests and runtime env changes are honored.
SERVICE_TOKEN_ENV = "SERVICE_TOKEN"
MODEL_PATH = os.getenv("MODEL_PATH", "/app/models/disease_model.onnx")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Prometheus metrics
REQUEST_COUNT = Counter(
    'http_requests_total',
    'Total HTTP requests',
    ['method', 'endpoint', 'status']
)
REQUEST_LATENCY = Histogram(
    'http_request_duration_seconds',
    'HTTP request latency in seconds',
    ['method', 'endpoint']
)
MODEL_INFERENCE_COUNT = Counter(
    'model_inference_total',
    'Total model inferences',
    ['model', 'status']
)
MODEL_INFERENCE_LATENCY = Histogram(
    'model_inference_duration_seconds',
    'Model inference latency in seconds',
    ['model']
)

# Global model session
model_session: Optional["ort.InferenceSession"] = None
model_loaded = False

try:
    import onnxruntime as ort
    ORT_AVAILABLE = True
except ImportError:
    ORT_AVAILABLE = False
    logger.warning("onnxruntime not available - disease detection will be unavailable")


def load_model() -> bool:
    """Load ONNX model at startup."""
    global model_session, model_loaded

    if not ORT_AVAILABLE:
        logger.error("onnxruntime not installed")
        return False

    if not os.path.exists(MODEL_PATH):
        logger.warning(f"Model file not found at {MODEL_PATH}")
        return False

    try:
        model_session = ort.InferenceSession(MODEL_PATH, providers=['CPUExecutionProvider'])
        model_loaded = True
        logger.info(f"Model loaded successfully from {MODEL_PATH}")
        return True
    except Exception as e:
        logger.error(f"Failed to load model: {e}")
        return False


def preprocess_image(image_bytes: bytes) -> np.ndarray:
    """Preprocess image for model input."""
    import io

    from PIL import Image

    img = Image.open(io.BytesIO(image_bytes)).convert('RGB')
    img = img.resize((224, 224))
    img_array = np.array(img, dtype=np.float32) / 255.0
    # Normalize with ImageNet stats
    mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
    std = np.array([0.229, 0.224, 0.225], dtype=np.float32)
    img_array = (img_array - mean) / std
    # HWC to CHW
    img_array = np.transpose(img_array, (2, 0, 1))
    # Add batch dimension
    img_array = np.expand_dims(img_array, axis=0)
    return img_array


DISEASE_CLASSES = [
    "Bacterial Leaf Blight", "Bacterial Leaf Streak", "Bacterial Panicle Blight",
    "Blast", "Brown Spot", "Dead Heart", "Downy Mildew", "Hispa", "Healthy", "Tungro"
]

DISEASE_CLASSES_BN = [
    "ব্যাকটেরিয়াল লিফ ব্লাইট", "ব্যাকটেরিয়াল লিফ স্ট্রিক", "ব্যাকটেরিয়াল প্যানিকল ব্লাইট",
    "ব্লাস্ট", "ব্রাউন স্পট", "ডেড হার্ট", "ডাউনি মিলডিউ", "হিসপা", "সুস্থ", "তুঙ্গরো",
]


BLOCKED_HOSTS = {"169.254.169.254", "metadata.google.internal", "localhost", "127.0.0.1", "0.0.0.0"}
BLOCKED_SCHEMES = {"file", "ftp", "gopher", "dict"}


def _is_safe_url(url: str) -> bool:
    """Reject private / internal URLs to prevent SSRF."""
    try:
        parsed = urlparse(url)
    except Exception:
        return False
    if parsed.scheme not in ("https", "http"):
        return False
    if parsed.scheme in BLOCKED_SCHEMES:
        return False
    hostname = parsed.hostname or ""
    if hostname in BLOCKED_HOSTS:
        return False
    if hostname.startswith("10.") or hostname.startswith("172.") or hostname.startswith("192.168."):
        return False
    if hostname == "169.254.":
        return False
    if re.match(r"^(0|\.)+$", hostname):
        return False
    return True



@asynccontextmanager
async def lifespan(_: FastAPI):
    # Load every model at startup so /health can report readiness honestly and
    # the first user request does not pay the load cost.
    load_model()
    crop.load()
    yield_.load()
    market.load()
    travel.load()
    yield


app = FastAPI(
    title="Smart Farming AI Inference",
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)


@app.middleware("http")
async def metrics_middleware(request: Request, call_next):
    """Collect Prometheus metrics for each request."""
    start_time = time.time()
    response = await call_next(request)
    duration = time.time() - start_time

    REQUEST_COUNT.labels(
        method=request.method,
        endpoint=request.url.path,
        status=response.status_code
    ).inc()
    REQUEST_LATENCY.labels(
        method=request.method,
        endpoint=request.url.path
    ).observe(duration)

    return response


@app.middleware("http")
async def model_version_header(request: Request, call_next):
    """Add model version header to ML endpoints."""
    response = await call_next(request)
    
    # Add model version headers for ML endpoints
    path = request.url.path
    if path.startswith("/v1/crop/"):
        if crop.MODEL:
            response.headers["X-Model-Version"] = crop.MODEL.model_version
    elif path.startswith("/v1/yield/"):
        if yield_.MODEL:
            response.headers["X-Model-Version"] = yield_.MODEL.model_version
    elif path.startswith("/v1/market/"):
        if market.MODEL:
            response.headers["X-Model-Version"] = market.MODEL.model_version
    elif path.startswith("/v1/disease/"):
        if model_loaded:
            response.headers["X-Model-Version"] = "1.0.0"  # Disease model version from metadata
    elif path.startswith("/v1/travel/"):
        response.headers["X-Model-Version"] = "1.0.0"  # Travel service version
    
    return response


@app.get("/metrics")
async def metrics():
    """Prometheus metrics endpoint."""
    return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)


# Prediction domains. Each router degrades to a `model_unavailable` status when
# its artifact is missing, so mounting them unconditionally is always safe.
app.include_router(crop.router)
app.include_router(yield_.router)
app.include_router(market.router)
app.include_router(advisory.router)
app.include_router(travel.router)


class DiseaseRequest(BaseModel):
    job_id: str = Field(min_length=1, max_length=100)
    image_url: str | None = Field(default=None, pattern=r"^https://")
    image_base64: str | None = None


class DiseaseResponse(BaseModel):
    job_id: str
    status: str
    message: str
    predictions: list | None = None


def require_service_token(authorization: Annotated[str | None, Header()] = None) -> None:
    service_token = os.getenv(SERVICE_TOKEN_ENV, "")
    if not service_token:
        raise HTTPException(status_code=503, detail="Service token is not configured")
    if authorization != f"Bearer {service_token}":
        raise HTTPException(status_code=401, detail="Invalid service token")


@app.get("/health")
async def health() -> dict[str, object]:
    """Cheap endpoint for Render health checks and an uptime monitor.

    Reports each prediction domain honestly: `ok` when its artifact is loaded,
    `unavailable` otherwise, so an operator can see exactly what this deployment
    can serve without probing every endpoint.
    """
    from app.travel.rag import TravelEmbedder
    embedder = TravelEmbedder()
    travel_ready = embedder.is_ready()
    
    return {
        "status": "ok",
        "service": "smart-farming-ai",
        "models": {
            "disease": "ok" if model_loaded else "unavailable",
            "crop": "ok" if crop.MODEL is not None else "unavailable",
            "yield": "ok" if yield_.MODEL is not None else "unavailable",
            "market": "ok" if market.MODEL is not None else "unavailable",
            # Advisory is rule-based; it never has an artifact to load.
            "advisory": "ok",
            "travel": "ok" if travel_ready else "unavailable",
        },
    }


@app.post("/v1/disease/analyze", response_model=DiseaseResponse)
async def analyze_disease(
    request: DiseaseRequest,
    authorization: Annotated[str | None, Header()] = None,
) -> DiseaseResponse:
    require_service_token(authorization)

    if not model_loaded:
        MODEL_INFERENCE_COUNT.labels(model='disease', status='unavailable').inc()
        return DiseaseResponse(
            job_id=request.job_id,
            status="model_unavailable",
            message="A verified disease model has not been deployed yet. Set MODEL_PATH to a valid ONNX model.",
        )

    try:
        if request.image_base64:
            image_bytes = base64.b64decode(request.image_base64.split(',', 1)[-1], validate=True)
        elif request.image_url:
            if not _is_safe_url(request.image_url):
                raise ValueError("image_url must be a public HTTPS URL (internal/private URLs are blocked)")
            import httpx
            async with httpx.AsyncClient(timeout=30.0, follow_redirects=False) as client:
                response = await client.get(request.image_url)
                response.raise_for_status()
                image_bytes = response.content
        else:
            raise ValueError("image_url or image_base64 is required")
        if len(image_bytes) > 5 * 1024 * 1024:
            raise ValueError("image exceeds 5 MB")

        # Preprocess
        input_tensor = preprocess_image(image_bytes)

        # Inference with metrics
        inference_start = time.time()
        input_name = model_session.get_inputs()[0].name
        outputs = model_session.run(None, {input_name: input_tensor})
        inference_duration = time.time() - inference_start
        MODEL_INFERENCE_LATENCY.labels(model='disease').observe(inference_duration)
        logits = outputs[0][0]

        # Softmax
        exp_logits = np.exp(logits - np.max(logits))
        probs = exp_logits / np.sum(exp_logits)

        # Top 5 predictions
        top_indices = np.argsort(probs)[::-1][:5]
        predictions = []
        for idx in top_indices:
            predictions.append({
                "disease_en": DISEASE_CLASSES[idx],
                "disease_bn": DISEASE_CLASSES_BN[idx],
                "confidence": float(probs[idx]),
                "severity": "high" if probs[idx] > 0.7 else "medium" if probs[idx] > 0.4 else "low"
            })

        MODEL_INFERENCE_COUNT.labels(model='disease', status='success').inc()
        return DiseaseResponse(
            job_id=request.job_id,
            status="success",
            message="Disease analysis completed",
            predictions=predictions
        )
    except Exception as e:
        logger.error(f"Disease analysis failed: {e}")
        MODEL_INFERENCE_COUNT.labels(model='disease', status='error').inc()
        return DiseaseResponse(
            job_id=request.job_id,
            status="error",
            message=f"Analysis failed: {str(e)}",
        )
