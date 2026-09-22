"""Food cost calculation for Bangladesh travel."""

import json
from pathlib import Path
from typing import Dict, Optional

DATA_DIR = Path(__file__).parent.parent / "data" / "food"
_SEASONAL_DATA: Optional[Dict] = None
_MEAL_COSTS: Optional[Dict] = None


def _load_meal_costs() -> Dict:
    global _MEAL_COSTS
    if _MEAL_COSTS is None:
        path = DATA_DIR / "meal_costs.json"
        _MEAL_COSTS = json.loads(path.read_text())
    return _MEAL_COSTS


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


def calculate_food_cost(
    days: int,
    people: int = 1,
    tier: str = "mid",
    month: int = 1,
) -> float:
    """
    Calculate food cost for a trip.

    Args:
        days: Number of days
        people: Number of people
        tier: Food tier - "budget", "mid", "luxury"
        month: Month (1-12) for seasonal pricing

    Returns:
        Total cost in BDT
    """
    tier = tier.lower().strip()

    costs = _load_meal_costs()
    tier_costs = costs.get(tier, costs.get("mid", {}))
    daily_per_person = tier_costs.get("daily_total", 1300)

    seasonal_multiplier = _get_seasonal_multiplier(month)
    cost = daily_per_person * days * people * seasonal_multiplier
    return round(cost, 2)


def calculate_food_cost_detailed(
    days: int,
    people: int = 1,
    tier: str = "mid",
    month: int = 1,
) -> Dict[str, float]:
    """
    Calculate detailed food cost breakdown.

    Returns:
        Dictionary with breakfast, lunch, dinner, snacks, and total
    """
    tier = tier.lower().strip()

    costs = _load_meal_costs()
    tier_costs = costs.get(tier, costs.get("mid", {}))

    seasonal_multiplier = _get_seasonal_multiplier(month)

    breakdown = {}
    for meal, cost in tier_costs.items():
        if meal != "daily_total":
            breakdown[meal] = round(cost * days * people * seasonal_multiplier, 2)

    breakdown["total"] = round(sum(breakdown.values()), 2)
    return breakdown


def get_available_tiers() -> list[str]:
    """Get available food tiers."""
    return ["budget", "mid", "luxury"]


def get_daily_cost(tier: str) -> float:
    """Get daily food cost per person for a tier."""
    tier = tier.lower().strip()
    costs = _load_meal_costs()
    tier_costs = costs.get(tier, costs.get("mid", {}))
    return tier_costs.get("daily_total", 1300)