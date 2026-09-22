"""Accommodation cost calculation for Bangladesh travel."""

import json
from pathlib import Path
from typing import Dict, Optional

DATA_DIR = Path(__file__).parent.parent / "data" / "accommodation"
_SEASONAL_DATA: Optional[Dict] = None

_HOTEL_TIERS: Optional[Dict] = None
_HOMESTAY_RATES: Optional[Dict] = None


def _load_hotel_tiers() -> Dict:
    global _HOTEL_TIERS
    if _HOTEL_TIERS is None:
        path = DATA_DIR / "hotel_tiers.json"
        _HOTEL_TIERS = json.loads(path.read_text())
    return _HOTEL_TIERS


def _load_homestay_rates() -> Dict:
    global _HOMESTAY_RATES
    if _HOMESTAY_RATES is None:
        path = DATA_DIR / "homestay_rates.json"
        _HOMESTAY_RATES = json.loads(path.read_text())
    return _HOMESTAY_RATES


def _load_seasonal_multipliers() -> Dict:
    global _SEASONAL_DATA
    if _SEASONAL_DATA is None:
        path = Path(__file__).parent.parent / "data" / "seasonal_multipliers.json"
        _SEASONAL_DATA = json.loads(path.read_text())
    return _SEASONAL_DATA


def _get_seasonal_multiplier(month: int) -> float:
    """Get seasonal multiplier for a given month (1-12)."""
    data = _load_seasonal_multipliers()
    monthly = data.get("monthly_multipliers", {})
    return monthly.get(str(month), 1.0)


def calculate_hotel_cost(
    district: str,
    nights: int,
    tier: str = "mid",
    rooms: int = 1,
    month: int = 1,
) -> float:
    """
    Calculate hotel accommodation cost.

    Args:
        district: District name (lowercase)
        nights: Number of nights
        tier: Hotel tier - "budget", "mid", "luxury"
        rooms: Number of rooms
        month: Month (1-12) for seasonal pricing

    Returns:
        Total cost in BDT
    """
    district = district.lower().strip()
    tier = tier.lower().strip()

    tiers = _load_hotel_tiers()
    tier_rates = tiers.get(tier, tiers.get("mid", {}))
    base_rate = tier_rates.get(district, tier_rates.get("default", 2500))

    seasonal_multiplier = _get_seasonal_multiplier(month)
    cost = base_rate * nights * rooms * seasonal_multiplier
    return round(cost, 2)


def calculate_homestay_cost(
    district: str,
    nights: int,
    tier: str = "mid",
    rooms: int = 1,
    month: int = 1,
) -> float:
    """
    Calculate homestay accommodation cost.

    Args:
        district: District name (lowercase)
        nights: Number of nights
        tier: Homestay tier - "budget", "mid", "luxury"
        rooms: Number of rooms
        month: Month (1-12) for seasonal pricing

    Returns:
        Total cost in BDT
    """
    district = district.lower().strip()
    tier = tier.lower().strip()

    rates = _load_homestay_rates()
    tier_rates = rates.get(tier, rates.get("mid", {}))
    base_rate = tier_rates.get(district, tier_rates.get("default", 2000))

    seasonal_multiplier = _get_seasonal_multiplier(month)
    cost = base_rate * nights * rooms * seasonal_multiplier
    return round(cost, 2)


def get_available_tiers() -> list[str]:
    """Get available accommodation tiers."""
    return ["budget", "mid", "luxury"]


def get_base_rate(district: str, tier: str, accommodation_type: str = "hotel") -> float:
    """Get base rate per night for a district and tier."""
    district = district.lower().strip()
    tier = tier.lower().strip()

    if accommodation_type == "hotel":
        tiers = _load_hotel_tiers()
    else:
        tiers = _load_homestay_rates()

    tier_rates = tiers.get(tier, tiers.get("mid", {}))
    return tier_rates.get(district, tier_rates.get("default", 2500))