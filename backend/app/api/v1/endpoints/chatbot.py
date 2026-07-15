from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.farmer import Farmer
from app.models.all_models import ChatHistory
import uuid
import httpx
from app.core.config import settings


router = APIRouter()


class ChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = None
    language: str = "bn"


class ChatResponse(BaseModel):
    response: str
    response_bn: str
    session_id: str
    intent: Optional[str]
    confidence: float
    suggestions: List[str]
    suggestions_bn: List[str]


AGRICULTURAL_KNOWLEDGE = {
    "ধান": {
        "bn": "ধান বাংলাদেশের প্রধান খাদ্যশস্য। রবি ও খরিফ মৌসুমে চাষ করা হয়। সারা দেশে প্রায় ৮০% জমিতে ধান চাষ হয়।",
        "en": "Rice is the main food crop of Bangladesh. It is grown in Rabi and Kharif seasons. Rice cultivation covers about 80% of farmland nationwide.",
        "tips": ["পর্যায়ক্রমে ফসল চাষ করুন", "সুষম সার প্রয়োগ করুন", "পানি ব্যবস্থাপনা ভালো করুন"],
    },
    "গম": {
        "bn": "গম রবি মৌসুমের গুরুত্বপূর্ণ ফসল। নভেম্বর-ডিসেম্বরে বীজ বুনা হয়।",
        "en": "Wheat is an important Rabi season crop. Seeds are sown in November-December.",
        "tips": ["সময়মতো বীজ বুনুন", "রোগ প্রতিরোধী জাত ব্যবহার করুন"],
    },
    "পাট": {
        "bn": "পাট বাংলাদেশের ঐতিহ্যবাহী অর্থকরী ফসল। খরিফ মৌসুমে চাষ করা হয়।",
        "en": "Jute is a traditional cash crop of Bangladesh. It is grown in the Kharif season.",
        "tips": ["জলাবদ্ধ এলাকায় ভালো ফলন হয়", "দীর্ঘ দিনের আলো প্রয়োজন"],
    },
    "আলু": {
        "bn": "আলু রবি মৌসুমের গুরুত্বপূর্ণ শাকসবজি। অক্টোবর-নভেম্বরে বীজ বুনা হয়।",
        "en": "Potato is an important Rabi season vegetable. Seeds are sown in October-November.",
        "tips": ["শীতল আবহাওয়ায় ভালো ফলন হয়", "লেট ব্লাইট রোগ থেকে সাবধান"],
    },
    "রোগ": {
        "bn": "ফসলের রোগ প্রতিরোধে নিয়মিত পর্যবেক্ষণ, সুষম সার প্রয়োগ এবং প্রতিরোধী জাত ব্যবহার করুন।",
        "en": "To prevent crop diseases, regularly monitor fields, apply balanced fertilizer, and use resistant varieties.",
        "tips": ["নিয়মিত মাঠ পরিদর্শন করুন", "প্রতিরোধী জাত ব্যবহার করুন", "ছত্রাকনাশক প্রয়োগ করুন"],
    },
    "সেচ": {
        "bn": "সঠিক সেচ ব্যবস্থাপনা ফসলের উৎপাদনশীলতা বাড়ায়। ড্রিপ সেচ সবচেয়ে কার্যকর।",
        "en": "Proper irrigation management increases crop productivity. Drip irrigation is most effective.",
        "tips": ["ড্রিপ সেচ ব্যবহার করুন", "সকালে বা সন্ধ্যায় সেচ দিন", "মাটির আর্দ্রতা পরীক্ষা করুন"],
    },
    "বাজার": {
        "bn": "ফসলের সেরা দাম পেতে সরাসরি বাজারে বিক্রি করুন অথবা সমবায় সমিতির সাথে যোগাযোগ করুন।",
        "en": "To get the best price for crops, sell directly in the market or contact cooperative societies.",
        "tips": ["বাজার মূল্য জানুন", "সমবায় সমিতির সাথে যোগাযোগ করুন", "সঠিক সময়ে বিক্রি করুন"],
    },
    "সার": {
        "bn": "মাটি পরীক্ষার ভিত্তিতে সার প্রয়োগ করুন। অতিরিক্ত সার মাটি ও পরিবেশের ক্ষতি করে।",
        "en": "Apply fertilizer based on soil testing. Excess fertilizer harms soil and environment.",
        "tips": ["মাটি পরীক্ষা করুন", "সুষম সার ব্যবহার করুন", "জৈব সার ব্যবহার করুন"],
    },
    "কীটপতঙ্গ": {
        "bn": "কীটপতঙ্গ নিয়ন্ত্রণে IPM (কীটপতঙ্গ একীকৃত ব্যবস্থাপনা) পদ্ধতি অনুসরণ করুন।",
        "en": "For pest control, follow IPM (Integrated Pest Management) methods.",
        "tips": ["নিয়মিত পর্যবেক্ষণ করুন", "প্রাকৃতিক শিকারী ব্যবহার করুন", "প্রয়োজনে কীটনাশক ব্যবহার করুন"],
    },
}


def match_intent(message: str) -> tuple:
    message_lower = message.lower()
    for keyword, knowledge in AGRICULTURAL_KNOWLEDGE.items():
        if keyword in message_lower:
            return keyword, knowledge
    return "general", {
        "bn": "আমি কৃষি সম্পর্কে আপনাকে সাহায্য করতে পারি। ধান, গম, পাট, আলু, রোগ, সেচ, বাজার, সার বা কীটপতঙ্গ সম্পর্কে জিজ্ঞাসা করুন।",
        "en": "I can help you with agriculture. Ask about rice, wheat, jute, potato, diseases, irrigation, market, fertilizer, or pests.",
        "tips": ["ধান সম্পর্কে জানুন", "রোগ প্রতিরোধ শিখুন", "বাজার মূল্য জানুন"],
    }


@router.post("/chat", response_model=ChatResponse)
async def chat_with_bot(
    request: ChatRequest,
    db: AsyncSession = Depends(get_db),
    current_user: Farmer = Depends(get_current_user),
):
    session_id = request.session_id or str(uuid.uuid4())

    user_message = ChatHistory(
        id=uuid.uuid4(),
        farmer_id=current_user.id,
        session_id=uuid.UUID(session_id),
        role="user",
        content=request.message,
        language=request.language,
        created_at=datetime.utcnow(),
    )
    db.add(user_message)

    intent, knowledge = match_intent(request.message)

    response_text = knowledge["en"] if request.language == "en" else knowledge["bn"]
    suggestions = knowledge.get("tips", [])
    suggestions_bn = knowledge.get("tips", [])

    assistant_message = ChatHistory(
        id=uuid.uuid4(),
        farmer_id=current_user.id,
        session_id=uuid.UUID(session_id),
        role="assistant",
        content=response_text,
        content_bn=knowledge["bn"],
        language=request.language,
        intent=intent,
        confidence=0.85,
        model_used="rule_based",
        created_at=datetime.utcnow(),
    )
    db.add(assistant_message)
    await db.commit()

    return ChatResponse(
        response=response_text,
        response_bn=knowledge["bn"],
        session_id=session_id,
        intent=intent,
        confidence=0.85,
        suggestions=suggestions,
        suggestions_bn=suggestions_bn,
    )


@router.get("/history/{session_id}")
async def get_chat_history(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Farmer = Depends(get_current_user),
):
    result = await db.execute(
        select(ChatHistory)
        .where(
            ChatHistory.farmer_id == current_user.id,
            ChatHistory.session_id == session_id,
        )
        .order_by(ChatHistory.created_at)
    )
    messages = result.scalars().all()

    return {"messages": [
        {
            "role": m.role,
            "content": m.content_bn if m.language == "bn" else m.content,
            "intent": m.intent,
            "timestamp": str(m.created_at),
        }
        for m in messages
    ]}


@router.get("/sessions")
async def get_chat_sessions(
    db: AsyncSession = Depends(get_db),
    current_user: Farmer = Depends(get_current_user),
):
    from sqlalchemy import distinct
    result = await db.execute(
        select(distinct(ChatHistory.session_id))
        .where(ChatHistory.farmer_id == current_user.id)
        .order_by(ChatHistory.created_at.desc())
        .limit(20)
    )
    sessions = [str(row[0]) for row in result.all()]
    return {"sessions": sessions}
