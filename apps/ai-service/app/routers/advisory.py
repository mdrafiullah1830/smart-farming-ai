"""POST /v1/advisory/sensor — irrigation and field advice from a live reading.

This endpoint is rule-based on purpose. An irrigation decision depends on soil
moisture, crop stage and expected rainfall, and the thresholds come from the
BARC recommendation guide rather than from a fitted model. Labelling it as a
model would overstate what the platform knows.

The rules mirror `apps/worker-api/src/sensors.rules.ts` so the dashboard and the
service agree about what counts as "too dry".
"""

from __future__ import annotations

import logging
from typing import Annotated

from fastapi import APIRouter, Header
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

router = APIRouter()


class SensorAdvisoryRequest(BaseModel):
    moisture_percent: float | None = Field(default=None, ge=0, le=100)
    soil_temperature_c: float | None = Field(default=None, ge=-30, le=80)
    air_temperature_c: float | None = Field(default=None, ge=-30, le=80)
    rainfall_next_24h_mm: float | None = Field(default=None, ge=0, le=1000)
    crop: str | None = Field(default=None, max_length=40)
    moisture_min_percent: float = Field(default=25, ge=0, le=100)
    moisture_max_percent: float = Field(default=80, ge=0, le=100)


class SensorAdvisoryResponse(BaseModel):
    status: str
    irrigation_action: str
    message_en: str
    message_bn: str
    reasons: list[str]


# BARC guide: 24h rainfall at or above this postpones irrigation.
RAINFALL_DELAY_THRESHOLD_MM = 15


def decide(request: SensorAdvisoryRequest) -> tuple[str, str, str, list[str]]:
    """Return (action, message_en, message_bn, reasons)."""
    reasons: list[str] = []
    moisture = request.moisture_percent
    rainfall = request.rainfall_next_24h_mm

    if moisture is None:
        return (
            "unknown",
            "No soil moisture reading is available, so no irrigation advice can be given. Check that the probe is connected.",
            "মাটির আর্দ্রতার কোনো রিডিং নেই, তাই সেচের পরামর্শ দেওয়া সম্ভব নয়। প্রোব সংযোগ পরীক্ষা করুন।",
            ["moisture reading missing"],
        )

    if rainfall is not None and rainfall >= RAINFALL_DELAY_THRESHOLD_MM:
        reasons.append(f"{rainfall:.0f} mm rain expected within 24 hours")
        return (
            "wait",
            f"About {rainfall:.0f} mm of rain is expected in the next 24 hours. Delay irrigation and re-check after the rain.",
            f"আগামী ২৪ ঘণ্টায় প্রায় {rainfall:.0f} মিমি বৃষ্টি হতে পারে। সেচ স্থগিত রাখুন এবং বৃষ্টির পরে আবার দেখুন।",
            reasons,
        )

    if moisture < request.moisture_min_percent:
        reasons.append(
            f"moisture {moisture:.1f}% is below the {request.moisture_min_percent:.0f}% threshold"
        )
        urgency = "critical" if moisture < request.moisture_min_percent / 2 else "warning"
        return (
            "irrigate_now",
            f"Soil moisture is {moisture:.1f}%, below the {request.moisture_min_percent:.0f}% threshold. Irrigate in the early morning to reduce evaporation loss.",
            f"মাটির আর্দ্রতা {moisture:.1f}%, যা নির্ধারিত {request.moisture_min_percent:.0f}% সীমার নিচে। বাষ্পীভবন কমাতে সকালে সেচ দিন।",
            reasons + [urgency],
        )

    if moisture > request.moisture_max_percent:
        reasons.append(
            f"moisture {moisture:.1f}% is above the {request.moisture_max_percent:.0f}% threshold"
        )
        return (
            "improve_drainage",
            f"Soil moisture is {moisture:.1f}%, higher than the {request.moisture_max_percent:.0f}% threshold. Open drainage channels and avoid further irrigation.",
            f"মাটির আর্দ্রতা {moisture:.1f}%, যা নির্ধারিত {request.moisture_max_percent:.0f}% সীমার উপরে। নিষ্কাশন নালা খুলুন এবং সেচ বন্ধ রাখুন।",
            reasons,
        )

    reasons.append(
        f"moisture {moisture:.1f}% is inside the {request.moisture_min_percent:.0f}-{request.moisture_max_percent:.0f}% band"
    )
    return (
        "no_action",
        f"Soil moisture is {moisture:.1f}%, within the target band. No irrigation is needed now; keep monitoring.",
        f"মাটির আর্দ্রতা {moisture:.1f}%, কাঙ্ক্ষিত সীমার মধ্যে। এখন সেচের প্রয়োজন নেই; নজর রাখুন।",
        reasons,
    )


@router.post("/v1/advisory/sensor", response_model=SensorAdvisoryResponse)
async def sensor_advisory(
    request: SensorAdvisoryRequest,
    authorization: Annotated[str | None, Header()] = None,
) -> SensorAdvisoryResponse:
    from app.main import require_service_token

    require_service_token(authorization)

    if request.moisture_min_percent >= request.moisture_max_percent:
        return SensorAdvisoryResponse(
            status="error",
            irrigation_action="unknown",
            message_en="moisture_min_percent must be below moisture_max_percent",
            message_bn="moisture_min_percent অবশ্যই moisture_max_percent এর নিচে হতে হবে",
            reasons=["invalid thresholds"],
        )

    action, message_en, message_bn, reasons = decide(request)
    return SensorAdvisoryResponse(
        status="success",
        irrigation_action=action,
        message_en=message_en,
        message_bn=message_bn,
        reasons=reasons,
    )
