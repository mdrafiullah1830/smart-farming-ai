"""Trip cost aggregation for Bangladesh travel."""

from dataclasses import dataclass, field
from typing import Optional, List, Dict, Any

from .transport import calculate_transport_cost, get_available_modes
from .accommodation import calculate_hotel_cost, calculate_homestay_cost, get_available_tiers as get_accom_tiers
from .food import calculate_food_cost, calculate_food_cost_detailed, get_available_tiers as get_food_tiers


@dataclass
class TripParams:
    """Parameters for trip cost estimation."""
    origin: str
    destination: str
    days: int
    people: int = 1
    hotel_tier: str = "mid"
    transport_mode: str = "bus_ac"
    food_tier: str = "mid"
    month: int = 1
    accommodation_type: str = "hotel"
    rooms: int = 1
    return_transport: bool = True


@dataclass
class TripCostBreakdown:
    """Detailed trip cost breakdown."""
    transport: float
    accommodation: float
    food: float
    food_breakdown: Dict[str, float]
    misc_buffer: float
    total: float
    currency: str = "BDT"
    details: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "transport": self.transport,
            "accommodation": self.accommodation,
            "food": self.food,
            "food_breakdown": self.food_breakdown,
            "misc_buffer": self.misc_buffer,
            "total": self.total,
            "currency": self.currency,
            "details": self.details,
        }


def estimate_trip_cost(params: TripParams) -> TripCostBreakdown:
    """
    Estimate total trip cost with detailed breakdown.

    Args:
        params: TripParams with all trip details

    Returns:
        TripCostBreakdown with all costs
    """
    nights = max(params.days - 1, 1)

    # Transport cost
    transport_cost = calculate_transport_cost(
        origin=params.origin,
        destination=params.destination,
        mode=params.transport_mode,
        passengers=params.people,
    )

    if params.return_transport:
        transport_cost *= 2

    # Accommodation cost
    if params.accommodation_type == "hotel":
        accommodation_cost = calculate_hotel_cost(
            district=params.destination,
            nights=nights,
            tier=params.hotel_tier,
            rooms=params.rooms,
            month=params.month,
        )
    else:
        accommodation_cost = calculate_homestay_cost(
            district=params.destination,
            nights=nights,
            tier=params.hotel_tier,
            rooms=params.rooms,
            month=params.month,
        )

    # Food cost
    food_cost = calculate_food_cost(
        days=params.days,
        people=params.people,
        tier=params.food_tier,
        month=params.month,
    )
    food_breakdown = calculate_food_cost_detailed(
        days=params.days,
        people=params.people,
        tier=params.food_tier,
        month=params.month,
    )

    # Miscellaneous buffer (10%)
    subtotal = transport_cost + accommodation_cost + food_cost
    misc_buffer = round(subtotal * 0.10, 2)

    total = round(subtotal + misc_buffer, 2)

    return TripCostBreakdown(
        transport=round(transport_cost, 2),
        accommodation=round(accommodation_cost, 2),
        food=round(food_cost, 2),
        food_breakdown=food_breakdown,
        misc_buffer=misc_buffer,
        total=total,
        details={
            "origin": params.origin,
            "destination": params.destination,
            "days": params.days,
            "nights": nights,
            "people": params.people,
            "hotel_tier": params.hotel_tier,
            "transport_mode": params.transport_mode,
            "food_tier": params.food_tier,
            "month": params.month,
            "accommodation_type": params.accommodation_type,
            "rooms": params.rooms,
            "return_transport": params.return_transport,
        },
    )


def validate_params(params: TripParams) -> List[str]:
    """Validate trip parameters and return list of errors."""
    errors = []

    if params.days < 1:
        errors.append("days must be at least 1")
    if params.people < 1:
        errors.append("people must be at least 1")
    if params.month < 1 or params.month > 12:
        errors.append("month must be between 1 and 12")
    if params.rooms < 1:
        errors.append("rooms must be at least 1")

    valid_modes = get_available_modes()
    if params.transport_mode not in valid_modes:
        errors.append(f"transport_mode must be one of: {', '.join(valid_modes)}")

    valid_tiers = get_accom_tiers()
    if params.hotel_tier not in valid_tiers:
        errors.append(f"hotel_tier must be one of: {', '.join(valid_tiers)}")

    valid_food_tiers = get_food_tiers()
    if params.food_tier not in valid_food_tiers:
        errors.append(f"food_tier must be one of: {', '.join(valid_food_tiers)}")

    if params.accommodation_type not in ("hotel", "homestay"):
        errors.append("accommodation_type must be 'hotel' or 'homestay'")

    return errors