import os
from contextlib import asynccontextmanager
from typing import Annotated

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field


SERVICE_TOKEN = os.getenv("SERVICE_TOKEN", "")


@asynccontextmanager
async def lifespan(_: FastAPI):
    # Load a small ONNX model here once a verified model artifact is available.
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


def require_service_token(authorization: Annotated[str | None, Header()] = None) -> None:
    if not SERVICE_TOKEN:
        raise HTTPException(status_code=503, detail="Service token is not configured")
    if authorization != f"Bearer {SERVICE_TOKEN}":
        raise HTTPException(status_code=401, detail="Invalid service token")


@app.get("/health")
async def health() -> dict[str, str]:
    """Cheap endpoint for Render health checks and an uptime monitor."""
    return {"status": "ok", "service": "smart-farming-ai"}


@app.post("/v1/disease/analyze", response_model=DiseaseResponse)
async def analyze_disease(
    request: DiseaseRequest,
    authorization: Annotated[str | None, Header()] = None,
) -> DiseaseResponse:
    require_service_token(authorization)
    # Do not return fabricated predictions. This becomes active only after a
    # model is trained, evaluated, exported to ONNX, and loaded at startup.
    return DiseaseResponse(
        job_id=request.job_id,
        status="model_unavailable",
        message="A verified disease model has not been deployed yet.",
    )
