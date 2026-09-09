import os
import logging
from contextlib import asynccontextmanager
from typing import Annotated, Optional

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field
import numpy as np

SERVICE_TOKEN = os.getenv("SERVICE_TOKEN", "")
MODEL_PATH = os.getenv("MODEL_PATH", "/app/models/disease_model.onnx")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

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
    from PIL import Image
    import io
    
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



@asynccontextmanager
async def lifespan(_: FastAPI):
    # Load ONNX model at startup
    load_model()
    yield


app = FastAPI(
    title="Smart Farming AI Inference",
    version="0.1.0",
    docs_url=None,
    redoc_url=None,
    lifespan=lifespan,
)


class DiseaseRequest(BaseModel):
    job_id: str = Field(min_length=1, max_length=100)
    image_url: str = Field(pattern=r"^https://")


class DiseaseResponse(BaseModel):
    job_id: str
    status: str
    message: str
    predictions: Optional[list] = None


def require_service_token(authorization: Annotated[str | None, Header()] = None) -> None:
    if not SERVICE_TOKEN:
        raise HTTPException(status_code=503, detail="Service token is not configured")
    if authorization != f"Bearer {SERVICE_TOKEN}":
        raise HTTPException(status_code=401, detail="Invalid service token")


@app.get("/health")
async def health() -> dict[str, str]:
    """Cheap endpoint for Render health checks and an uptime monitor."""
    return {"status": "ok", "service": "smart-farming-ai", "model_loaded": str(model_loaded)}


@app.post("/v1/disease/analyze", response_model=DiseaseResponse)
async def analyze_disease(
    request: DiseaseRequest,
    authorization: Annotated[str | None, Header()] = None,
) -> DiseaseResponse:
    require_service_token(authorization)
    
    if not model_loaded:
        return DiseaseResponse(
            job_id=request.job_id,
            status="model_unavailable",
            message="A verified disease model has not been deployed yet. Set MODEL_PATH to a valid ONNX model.",
        )
    
    try:
        # Download image
        import httpx
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(request.image_url)
            response.raise_for_status()
            image_bytes = response.content
        
        # Preprocess
        input_tensor = preprocess_image(image_bytes)
        
        # Inference
        input_name = model_session.get_inputs()[0].name
        outputs = model_session.run(None, {input_name: input_tensor})
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
        
        return DiseaseResponse(
            job_id=request.job_id,
            status="success",
            message="Disease analysis completed",
            predictions=predictions
        )
    except Exception as e:
        logger.error(f"Disease analysis failed: {e}")
        return DiseaseResponse(
            job_id=request.job_id,
            status="error",
            message=f"Analysis failed: {str(e)}",
        )
