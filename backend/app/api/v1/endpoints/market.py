from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, date, timedelta
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.farmer import Farmer
from app.models.all_models import MarketPrice, Crop, Prediction
from app.models.district import District
import uuid
import numpy as np


router = APIRouter()


class PriceTrend(BaseModel):
    crop_name: str
    crop_name_bn: str
    current_price: float
    avg_price_7d: float
    avg_price_30d: float
    min_price_30d: float
    max_price_30d: float
    price_change_pct: float
    trend: str
    demand_level: str


class PricePrediction(BaseModel):
    crop_name: str
    crop_name_bn: str
    current_price: float
    predicted_price_7d: float
    predicted_price_30d: float
    confidence: float
    trend: str
    recommendation: str
    recommendation_bn: str


class MarketAnalysisResponse(BaseModel):
    district: str
    district_bn: str
    trends: List[PriceTrend]
    predictions: List[PricePrediction]
    top_demanded: List[dict]
    market_insights: List[str]
    market_insights_bn: List[str]


def calculate_price_trend(prices: List[float]) -> str:
    if len(prices) < 2:
        return "stable"
    recent = np.mean(prices[:3]) if len(prices) >= 3 else prices[0]
    older = np.mean(prices[-3:]) if len(prices) >= 3 else prices[-1]
    change = ((recent - older) / older) * 100
    if change > 5:
        return "up"
    elif change < -5:
        return "down"
    return "stable"


def predict_price(prices: List[float]) -> float:
    if len(prices) < 2:
        return prices[0] if prices else 0
    weights = np.linspace(0.5, 1.5, len(prices))
    weighted_avg = np.average(prices, weights=weights)
    trend = (prices[0] - prices[-1]) / len(prices)
    return round(weighted_avg + trend * 3, 2)


@router.get("/prices/{crop_id}")
async def get_crop_prices(
    crop_id: str,
    district_id: Optional[str] = None,
    days: int = Query(30, ge=1, le=365),
    db: AsyncSession = Depends(get_db),
    current_user: Farmer = Depends(get_current_user),
):
    start_date = date.today() - timedelta(days=days)
    query = select(MarketPrice).where(
        MarketPrice.crop_id == crop_id,
        MarketPrice.price_date >= start_date,
    )
    if district_id:
        query = query.where(MarketPrice.district_id == district_id)
    query = query.order_by(MarketPrice.price_date.desc())

    result = await db.execute(query)
    prices = result.scalars().all()

    price_data = [
        {"date": str(p.price_date), "price": float(p.price_per_kg), "market": p.market_name}
        for p in prices
    ]

    if not price_data:
        return {"crop_id": crop_id, "prices": [], "message": "No price data available"}

    price_values = [p["price"] for p in price_data]
    return {
        "crop_id": crop_id,
        "prices": price_data,
        "summary": {
            "current": price_values[0] if price_values else 0,
            "average": round(np.mean(price_values), 2),
            "min": round(min(price_values), 2),
            "max": round(max(price_values), 2),
            "trend": calculate_price_trend(price_values),
        },
    }


@router.get("/analysis/{district_id}", response_model=MarketAnalysisResponse)
async def get_market_analysis(
    district_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Farmer = Depends(get_current_user),
):
    result = await db.execute(select(District).where(District.id == district_id))
    district = result.scalar_one_or_none()
    if not district:
        raise HTTPException(status_code=404, detail="District not found")

    crops_result = await db.execute(select(Crop).where(Crop.is_active == True))
    crops = {str(c.id): c for c in crops_result.scalars().all()}

    trends = []
    predictions_list = []
    top_demanded = []

    for crop_id, crop in list(crops.items())[:10]:
        prices_result = await db.execute(
            select(MarketPrice)
            .where(MarketPrice.crop_id == crop_id, MarketPrice.district_id == district_id)
            .order_by(MarketPrice.price_date.desc())
            .limit(30)
        )
        prices = prices_result.scalars().all()

        if prices:
            price_values = [float(p.price_per_kg) for p in prices]
            current = price_values[0]
            avg_7d = round(np.mean(price_values[:7]), 2) if len(price_values) >= 7 else round(np.mean(price_values), 2)
            avg_30d = round(np.mean(price_values), 2)
            change_pct = round(((price_values[0] - price_values[-1]) / price_values[-1]) * 100, 2) if len(price_values) > 1 else 0

            trends.append(PriceTrend(
                crop_name=crop.name,
                crop_name_bn=crop.name_bn,
                current_price=current,
                avg_price_7d=avg_7d,
                avg_price_30d=avg_30d,
                min_price_30d=min(price_values),
                max_price_30d=max(price_values),
                price_change_pct=change_pct,
                trend=calculate_price_trend(price_values),
                demand_level="medium",
            ))

            predicted = predict_price(price_values)
            predictions_list.append(PricePrediction(
                crop_name=crop.name,
                crop_name_bn=crop.name_bn,
                current_price=current,
                predicted_price_7d=round(predicted * 1.02, 2),
                predicted_price_30d=round(predicted * 1.05, 2),
                confidence=0.72,
                trend=calculate_price_trend(price_values),
                recommendation="Buy now" if calculate_price_trend(price_values) == "down" else "Wait for better price",
                recommendation_bn="এখনই কিনুন" if calculate_price_trend(price_values) == "down" else "ভালো মূল্যের জন্য অপেক্ষা করুন",
            ))

            top_demanded.append({
                "crop": crop.name_bn,
                "price": current,
                "trend": calculate_price_trend(price_values),
            })

    market_insights = [
        "Rice prices are stable across most districts",
        "Vegetable prices tend to increase during monsoon",
        "Jute prices showing upward trend due to export demand",
    ]
    market_insights_bn = [
        "বেশিরভাগ জেলায় ধানের দাম স্থিতিশীল",
        "বর্ষাকালে সবজির দাম বাড়তে পারে",
        "রপ্তানি চাহিদার কারণে পাটের দাম বাড়ছে",
    ]

    return MarketAnalysisResponse(
        district=district.name,
        district_bn=district.name_bn,
        trends=trends,
        predictions=predictions_list,
        top_demanded=sorted(top_demanded, key=lambda x: x["price"], reverse=True)[:5],
        market_insights=market_insights,
        market_insights_bn=market_insights_bn,
    )


@router.get("/profit-calculator")
async def calculate_profit(
    crop_id: str,
    area_acres: float,
    expected_yield_per_acre: float,
    price_per_kg: float,
    cost_per_acre: float = 15000,
    current_user: Farmer = Depends(get_current_user),
):
    total_yield_kg = expected_yield_per_acre * area_acres * 1000
    revenue = total_yield_kg * price_per_kg
    total_cost = cost_per_acre * area_acres
    profit = revenue - total_cost
    roi = (profit / total_cost) * 100 if total_cost > 0 else 0

    return {
        "area_acres": area_acres,
        "expected_yield_kg": round(total_yield_kg, 2),
        "revenue_bdt": round(revenue, 2),
        "total_cost_bdt": round(total_cost, 2),
        "profit_bdt": round(profit, 2),
        "roi_pct": round(roi, 2),
        "breakeven_yield_kg": round(total_cost / price_per_kg, 2) if price_per_kg > 0 else 0,
    }
