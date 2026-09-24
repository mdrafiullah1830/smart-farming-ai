"""POST /v1/travel — Bangladesh Travel Assistant endpoints."""

import logging
from typing import Annotated

from fastapi import APIRouter, Header, HTTPException, Query
from pydantic import BaseModel, Field

from app.travel.calculator import (
    TripParams,
    estimate_trip_cost,
    get_accom_tiers,
    get_available_modes,
    get_food_tiers,
    validate_params,
)
from app.travel.rag import TravelEmbedder, TravelRetriever

logger = logging.getLogger(__name__)

router = APIRouter()

# Global instances (initialized on first use)
_embedder: TravelEmbedder | None = None
_retriever: TravelRetriever | None = None


def get_embedder() -> TravelEmbedder:
    global _embedder
    if _embedder is None:
        _embedder = TravelEmbedder()
    return _embedder


def get_retriever() -> TravelRetriever:
    global _retriever
    if _retriever is None:
        _retriever = TravelRetriever(get_embedder())
    return _retriever


def load() -> None:
    """Initialize the travel embedder at startup (does not load torch)."""
    try:
        get_embedder()
        logger.info("Travel router loaded")
    except Exception as exc:
        logger.warning("Travel router degraded at startup: %s", exc)


class TravelAskRequest(BaseModel):
    question: str = Field(
        ..., min_length=1, max_length=1000, description="Travel question in Bangla or English"
    )
    language: str = Field(
        default="en",
        pattern="^(bn|en)$",
        description="Response language: bn (Bangla) or en (English)",
    )


class TravelAskResponse(BaseModel):
    answer: str
    answer_en: str | None = None
    answer_bn: str | None = None
    sources: list[dict]
    confidence: float


class TravelCostRequest(BaseModel):
    origin: str = Field(..., min_length=1, max_length=50)
    destination: str = Field(..., min_length=1, max_length=50)
    days: int = Field(..., ge=1, le=30)
    people: int = Field(default=1, ge=1, le=20)
    hotel_tier: str = Field(default="mid", pattern="^(budget|mid|luxury)$")
    transport_mode: str = Field(
        default="bus_ac",
        pattern="^(bus_ac|bus_non_ac|train_shovan|train_ac_chair|train_ac_berth|flight)$",
    )
    food_tier: str = Field(default="mid", pattern="^(budget|mid|luxury)$")
    month: int = Field(default=1, ge=1, le=12)
    accommodation_type: str = Field(default="hotel", pattern="^(hotel|homestay)$")
    rooms: int = Field(default=1, ge=1, le=10)
    return_transport: bool = Field(default=True)


class TravelCostResponse(BaseModel):
    transport: float
    accommodation: float
    food: float
    food_breakdown: dict
    misc_buffer: float
    total: float
    currency: str = "BDT"
    details: dict


class DistrictInfo(BaseModel):
    name: str
    highlights: list[str]
    estimated_daily_cost_budget: int
    estimated_daily_cost_mid: int
    estimated_daily_cost_luxury: int


class HistoricalSiteInfo(BaseModel):
    name: str
    district: str
    category: str
    description: str
    visiting_hours: str | None = None
    entry_fee_bdt: str | None = None


class HealthResponse(BaseModel):
    status: str
    rag_index: str
    embedding_model: str
    data_files: int


@router.post("/v1/travel/ask", response_model=TravelAskResponse)
async def travel_ask(
    request: TravelAskRequest,
    authorization: Annotated[str | None, Header()] = None,
) -> TravelAskResponse:
    """
    Ask a question about Bangladesh travel/history using RAG.
    """
    from app.main import require_service_token

    require_service_token(authorization)

    retriever = get_retriever()

    if not retriever.embedder.is_ready():
        raise HTTPException(
            status_code=503,
            detail=(
                "Travel RAG is unavailable on this deployment "
                "(embedding model or index not installed). "
                "Install requirements-rag.txt and rebuild the index to enable it."
            ),
        )

    results = retriever.retrieve(request.question, top_k=5)
    sources = retriever.get_sources(results)

    if not results:
        return TravelAskResponse(
            answer="I don't have enough information to answer that question. Please try asking about specific districts, historical sites, or travel planning in Bangladesh.",
            answer_en="I don't have enough information to answer that question.",
            answer_bn="আপনার প্রশ্নের উত্তর দেওয়ার জন্য পর্যাপ্ত তথ্য আমার पास নেই। বাংলাদেশের নির্দিষ্ট জেলা, ঐতিহাসিক স্থান বা ভ্রমণ পরিকল্পনা সম্পর্কে জিজ্ঞেস করুন।",
            sources=[],
            confidence=0.0,
        )

    context = "\n\n".join([r["text"] for r in results[:3]])
    confidence = sum(r["score"] for r in results[:3]) / min(3, len(results))

    if request.language == "bn":
        answer = f"আপনার প্রশ্নের উত্তর: {context[:500]}..."
        answer_en = context[:500] + "..."
        answer_bn = answer
    else:
        answer = context[:500] + "..."
        answer_en = answer
        answer_bn = f"আপনার প্রশ্নের উত্তর: {context[:500]}..."

    return TravelAskResponse(
        answer=answer,
        answer_en=answer_en,
        answer_bn=answer_bn,
        sources=sources,
        confidence=round(confidence, 2),
    )


@router.post("/v1/travel/cost", response_model=TravelCostResponse)
async def travel_cost(
    request: TravelCostRequest,
    authorization: Annotated[str | None, Header()] = None,
) -> TravelCostResponse:
    """
    Calculate estimated trip cost for Bangladesh travel.
    """
    from app.main import require_service_token

    require_service_token(authorization)

    params = TripParams(
        origin=request.origin,
        destination=request.destination,
        days=request.days,
        people=request.people,
        hotel_tier=request.hotel_tier,
        transport_mode=request.transport_mode,
        food_tier=request.food_tier,
        month=request.month,
        accommodation_type=request.accommodation_type,
        rooms=request.rooms,
        return_transport=request.return_transport,
    )

    errors = validate_params(params)
    if errors:
        raise HTTPException(status_code=400, detail={"errors": errors})

    breakdown = estimate_trip_cost(params)
    return TravelCostResponse(**breakdown.to_dict())


@router.get("/v1/travel/districts", response_model=list[DistrictInfo])
async def travel_districts(
    authorization: Annotated[str | None, Header()] = None,
) -> list[DistrictInfo]:
    """
    List available districts with highlights.
    """
    from app.main import require_service_token

    require_service_token(authorization)

    return [
        DistrictInfo(
            name="Dhaka",
            highlights=[
                "Lalbagh Fort",
                "Ahsan Manzil",
                "National Museum",
                "Star Mosque",
                "Ramna Park",
            ],
            estimated_daily_cost_budget=2500,
            estimated_daily_cost_mid=7000,
            estimated_daily_cost_luxury=20000,
        ),
        DistrictInfo(
            name="Sylhet",
            highlights=[
                "Shah Jalal Dargah",
                "Ratargul Swamp Forest",
                "Jaflong",
                "Srimangal Tea Gardens",
                "Lawachara National Park",
            ],
            estimated_daily_cost_budget=2000,
            estimated_daily_cost_mid=5000,
            estimated_daily_cost_luxury=15000,
        ),
        DistrictInfo(
            name="Cox's Bazar",
            highlights=[
                "World's Longest Beach",
                "Himchari Waterfall",
                "Inani Beach",
                "St. Martin's Island",
                "Dulhazra Safari Park",
            ],
            estimated_daily_cost_budget=3000,
            estimated_daily_cost_mid=8000,
            estimated_daily_cost_luxury=25000,
        ),
        DistrictInfo(
            name="Chittagong",
            highlights=[
                "Patenga Beach",
                "Foy's Lake",
                "Ethnological Museum",
                "Bayazid Bostami Shrine",
                "Karnaphuli River",
            ],
            estimated_daily_cost_budget=2500,
            estimated_daily_cost_mid=6000,
            estimated_daily_cost_luxury=18000,
        ),
        DistrictInfo(
            name="Rajshahi",
            highlights=[
                "Puthia Temple Complex",
                "Bagha Mosque",
                "Varendra Museum",
                "Mahasthangarh",
                "Mango Orchards",
            ],
            estimated_daily_cost_budget=1500,
            estimated_daily_cost_mid=4000,
            estimated_daily_cost_luxury=12000,
        ),
        DistrictInfo(
            name="Khulna",
            highlights=[
                "Sundarbans Mangrove Forest",
                "Sixty Dome Mosque",
                "Khan Jahan Ali Tomb",
                "Karamjal Wildlife Center",
            ],
            estimated_daily_cost_budget=2000,
            estimated_daily_cost_mid=5500,
            estimated_daily_cost_luxury=20000,
        ),
        DistrictInfo(
            name="Barisal",
            highlights=[
                "Kuakata Beach",
                "Durga Sagar",
                "Guthia Mosque",
                "Floating Guava Market",
                "River Cruises",
            ],
            estimated_daily_cost_budget=1500,
            estimated_daily_cost_mid=4500,
            estimated_daily_cost_luxury=15000,
        ),
        DistrictInfo(
            name="Rangpur",
            highlights=[
                "Tajhat Palace",
                "Kellaband Mosque",
                "Ramsagar National Park",
                "Vinno Jogot",
                "Carmichael College",
            ],
            estimated_daily_cost_budget=1200,
            estimated_daily_cost_mid=3500,
            estimated_daily_cost_luxury=10000,
        ),
        DistrictInfo(
            name="Mymensingh",
            highlights=[
                "Shashi Lodge",
                "Bangladesh Agricultural University",
                "Mymensingh Museum",
                "Brahmaputra River",
                "Muktagacha Palace",
            ],
            estimated_daily_cost_budget=1200,
            estimated_daily_cost_mid=3500,
            estimated_daily_cost_luxury=10000,
        ),
    ]


@router.get("/v1/travel/sites", response_model=list[HistoricalSiteInfo])
async def travel_sites(
    district: Annotated[str | None, Query(description="Filter by district")] = None,
    authorization: Annotated[str | None, Header()] = None,
) -> list[HistoricalSiteInfo]:
    """
    List historical sites, optionally filtered by district.
    """
    from app.main import require_service_token

    require_service_token(authorization)

    sites_data = [
        HistoricalSiteInfo(
            name="Lalbagh Fort",
            district="Dhaka",
            category="Mughal Fort",
            description="17th century incomplete Mughal fort with museum, mosque, and Pari Bibi's tomb",
            visiting_hours="Sat-Wed 9AM-5PM, Fri 2:30PM-5PM",
            entry_fee_bdt="Local ৳20, SAARC ৳100, Foreign ৳200",
        ),
        HistoricalSiteInfo(
            name="Ahsan Manzil (Pink Palace)",
            district="Dhaka",
            category="Nawab Palace",
            description="Official residence of Nawabs of Dhaka, now a museum with 23 galleries",
            visiting_hours="Sat-Wed 10:30AM-5:30PM, Fri 3PM-7:30PM",
            entry_fee_bdt="Local ৳20, SAARC ৳100, Foreign ৳200",
        ),
        HistoricalSiteInfo(
            name="Somapura Mahavihara",
            district="Rajshahi (Naogaon)",
            category="Buddhist Monastery",
            description="UNESCO World Heritage Site, largest Buddhist monastery south of Himalayas (8th century)",
            visiting_hours="Sat-Wed 9AM-5PM, Fri 2:30PM-5PM",
            entry_fee_bdt="Local ৳20, SAARC ৳100, Foreign ৳200",
        ),
        HistoricalSiteInfo(
            name="Sixty Dome Mosque (Shait Gumbad Masjid)",
            district="Khulna (Bagerhat)",
            category="Sultanate Mosque",
            description="UNESCO World Heritage Site, largest Sultanate-era mosque in Bangladesh (1459)",
            visiting_hours="Sat-Wed 9AM-5PM, Fri 2:30PM-5PM",
            entry_fee_bdt="Local ৳20, SAARC ৳100, Foreign ৳200",
        ),
        HistoricalSiteInfo(
            name="Mahasthangarh",
            district="Rajshahi (Bogura)",
            category="Ancient City",
            description="Earliest urban site in Bangladesh (3rd century BCE), capital of Pundravardhana",
            visiting_hours="Sat-Wed 9AM-5PM, Fri 2:30PM-5PM",
            entry_fee_bdt="Local ৳20, SAARC ৳100, Foreign ৳200",
        ),
        HistoricalSiteInfo(
            name="Kantaji Temple",
            district="Rangpur (Dinajpur)",
            category="Hindu Temple",
            description="18th century terracotta temple masterpiece, UNESCO tentative list",
            visiting_hours="Daily 8AM-6PM",
            entry_fee_bdt="Free",
        ),
        HistoricalSiteInfo(
            name="Star Mosque (Tara Masjid)",
            district="Dhaka",
            category="Mosque",
            description="19th century mosque decorated with mosaic star patterns",
            visiting_hours="Daily (outside prayer times)",
            entry_fee_bdt="Free",
        ),
        HistoricalSiteInfo(
            name="Shah Jalal Dargah",
            district="Sylhet",
            category="Sufi Shrine",
            description="Shrine of 14th century Sufi saint Hazrat Shah Jalal, major pilgrimage site",
            visiting_hours="Daily 24 hours",
            entry_fee_bdt="Free",
        ),
        HistoricalSiteInfo(
            name="Guthia Mosque",
            district="Barisal",
            category="Mosque",
            description="Bangladesh's largest mosque complex (Baitul Aman Jame Masjid, built 2003)",
            visiting_hours="Daily (outside prayer times)",
            entry_fee_bdt="Free",
        ),
        HistoricalSiteInfo(
            name="Puthia Temple Complex",
            district="Rajshahi",
            category="Hindu Temple Complex",
            description="Largest cluster of historic Hindu temples in Bangladesh (16th-19th century)",
            visiting_hours="Daily 8AM-6PM",
            entry_fee_bdt="Free",
        ),
    ]

    if district:
        district_lower = district.lower()
        sites_data = [s for s in sites_data if district_lower in s.district.lower()]

    return sites_data


@router.get("/v1/travel/health", response_model=HealthResponse)
async def travel_health(
    authorization: Annotated[str | None, Header()] = None,
) -> HealthResponse:
    """
    Health check for travel service including RAG index status.
    """
    from app.main import require_service_token

    require_service_token(authorization)

    embedder = get_embedder()
    index_ready = embedder.is_ready()

    data_dir = embedder.index_dir.parent
    data_files = 0
    if data_dir.exists():
        for cat_dir in data_dir.iterdir():
            if cat_dir.is_dir():
                data_files += len(list(cat_dir.glob("*.md"))) + len(list(cat_dir.glob("*.json")))

    from app.travel.rag import embedding_available

    return HealthResponse(
        status="ok" if index_ready else "degraded",
        rag_index="ready"
        if index_ready
        else ("index_only" if embedder.load_index() else "not_built"),
        embedding_model=(
            "sentence-transformers/all-MiniLM-L6-v2" if embedding_available() else "unavailable"
        ),
        data_files=data_files,
    )


@router.get("/v1/travel/transport-modes")
async def travel_transport_modes(
    authorization: Annotated[str | None, Header()] = None,
) -> dict:
    """Get available transport modes."""
    from app.main import require_service_token

    require_service_token(authorization)
    return {"modes": get_available_modes()}


@router.get("/v1/travel/tiers")
async def travel_tiers(
    authorization: Annotated[str | None, Header()] = None,
) -> dict:
    """Get available accommodation and food tiers."""
    from app.main import require_service_token

    require_service_token(authorization)
    return {
        "accommodation_tiers": get_accom_tiers(),
        "food_tiers": get_food_tiers(),
    }
