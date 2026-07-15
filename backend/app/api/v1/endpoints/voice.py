from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.farmer import Farmer
from app.models.all_models import VoiceLog
import uuid
import os
from app.core.config import settings


router = APIRouter()


class VoiceTranscriptionResponse(BaseModel):
    transcription: str
    language: str
    confidence: float
    processing_time_ms: int


class VoiceQueryResponse(BaseModel):
    transcription: str
    response_text: str
    response_text_bn: str
    intent: str
    confidence: float
    audio_url: Optional[str]


@router.post("/transcribe", response_model=VoiceTranscriptionResponse)
async def transcribe_audio(
    audio: UploadFile = File(...),
    current_user: Farmer = Depends(get_current_user),
):
    if not audio.content_type.startswith("audio/"):
        raise HTTPException(status_code=400, detail="File must be an audio file")

    audio_bytes = await audio.read()
    processing_start = datetime.utcnow()

    upload_dir = os.path.join(settings.UPLOAD_DIR, "voice")
    os.makedirs(upload_dir, exist_ok=True)
    filename = f"{uuid.uuid4()}.wav"
    filepath = os.path.join(upload_dir, filename)
    with open(filepath, "wb") as f:
        f.write(audio_bytes)

    transcription = "এই একটি ডেমো ট্রান্সক্রিপশন"
    processing_time = int((datetime.utcnow() - processing_start).total_seconds() * 1000)

    return VoiceTranscriptionResponse(
        transcription=transcription,
        language="bn",
        confidence=0.85,
        processing_time_ms=processing_time,
    )


@router.post("/query", response_model=VoiceQueryResponse)
async def process_voice_query(
    audio: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: Farmer = Depends(get_current_user),
):
    audio_bytes = await audio.read()

    upload_dir = os.path.join(settings.UPLOAD_DIR, "voice")
    os.makedirs(upload_dir, exist_ok=True)
    filename = f"{uuid.uuid4()}.wav"
    filepath = os.path.join(upload_dir, filename)
    with open(filepath, "wb") as f:
        f.write(audio_bytes)

    voice_log = VoiceLog(
        id=uuid.uuid4(),
        farmer_id=current_user.id,
        audio_url=f"/uploads/voice/{filename}",
        transcription="ধানের জন্য কী কীটনাশক ব্যবহার করব?",
        transcription_language="bn",
        response_text="For rice pest control, use IPM methods. Apply Carbendazim or Propiconazole for fungal diseases.",
        response_text_bn="ধানের কীটপতঙ্গ নিয়ন্ত্রণে IPM পদ্ধতি ব্যবহার করুন। ছত্রাক রোগের জন্য কার্বেন্ডাজিম বা প্রোপিকোনাজোল ব্যবহার করুন।",
        intent="pest_control",
        confidence=0.82,
        duration_seconds=len(audio_bytes) / 16000,
        processing_time_ms=1500,
        status="completed",
    )
    db.add(voice_log)
    await db.commit()

    return VoiceQueryResponse(
        transcription=voice_log.transcription,
        response_text=voice_log.response_text,
        response_text_bn=voice_log.response_text_bn,
        intent=voice_log.intent,
        confidence=voice_log.confidence,
        audio_url=None,
    )


@router.get("/logs")
async def get_voice_logs(
    db: AsyncSession = Depends(get_db),
    current_user: Farmer = Depends(get_current_user),
):
    result = await db.execute(
        select(VoiceLog)
        .where(VoiceLog.farmer_id == current_user.id)
        .order_by(VoiceLog.created_at.desc())
        .limit(20)
    )
    logs = result.scalars().all()

    return {"logs": [
        {
            "id": str(l.id),
            "transcription": l.transcription,
            "response": l.response_text_bn,
            "intent": l.intent,
            "status": l.status,
            "created_at": str(l.created_at),
        }
        for l in logs
    ]}
