"""Transport cost calculation for Bangladesh travel."""

import json
from pathlib import Path

DATA_DIR = Path(__file__).parent.parent / "data" / "transport"

# Message lives at module level so `raise` sites stay message-free (TRY003).
UNKNOWN_TRANSPORT_MODE_MSG = "Unknown transport mode: {mode}"

_BUS_FARES: dict | None = None
_TRAIN_FARES: dict | None = None
_FLIGHT_ROUTES: dict | None = None
_DISTANCES: dict[str, float] = {}


def _load_bus_fares() -> dict:
    global _BUS_FARES
    if _BUS_FARES is None:
        path = DATA_DIR / "bus_fares.json"
        _BUS_FARES = json.loads(path.read_text())
    return _BUS_FARES


def _load_train_fares() -> dict:
    global _TRAIN_FARES
    if _TRAIN_FARES is None:
        path = DATA_DIR / "train_fares.json"
        _TRAIN_FARES = json.loads(path.read_text())
    return _TRAIN_FARES


def _load_flight_routes() -> dict:
    global _FLIGHT_ROUTES
    if _FLIGHT_ROUTES is None:
        path = DATA_DIR / "flight_routes.json"
        _FLIGHT_ROUTES = json.loads(path.read_text())
    return _FLIGHT_ROUTES


def _load_distances() -> dict[str, float]:
    global _DISTANCES
    if not _DISTANCES:
        train_data = _load_train_fares()
        _DISTANCES = train_data.get("distances_km", {})
    return _DISTANCES


def _get_distance(origin: str, destination: str) -> float:
    """Get distance between two locations in km."""
    distances = _load_distances()
    key1 = f"{origin}_{destination}".lower()
    key2 = f"{destination}_{origin}".lower()
    return distances.get(key1) or distances.get(key2) or 100.0


def calculate_transport_cost(
    origin: str,
    destination: str,
    mode: str,
    passengers: int = 1,
) -> float:
    """
    Calculate transport cost between origin and destination.

    Args:
        origin: Origin district/city (lowercase)
        destination: Destination district/city (lowercase)
        mode: Transport mode - "bus_ac", "bus_non_ac", "train_shovan", "train_ac_chair", "train_ac_berth", "flight"
        passengers: Number of passengers

    Returns:
        Total cost in BDT
    """
    origin = origin.lower().strip()
    destination = destination.lower().strip()
    mode = mode.lower().strip()

    distance = _get_distance(origin, destination)

    if mode in ("bus_ac", "bus_non_ac"):
        fares = _load_bus_fares()
        fare_key = "bus_ac" if mode == "bus_ac" else "bus_non_ac"
        fare_info = fares.get(fare_key, {})
        base_fare_per_km = fare_info.get("base_fare_per_km", 2.0)
        class_multiplier = fare_info.get("class_multiplier", 1.0)
        cost: float = distance * base_fare_per_km * class_multiplier * passengers
        return round(cost, 2)

    if mode in ("train_shovan", "train_ac_chair", "train_ac_berth"):
        fares = _load_train_fares()
        fare_info = fares.get(mode, {})
        base_fare_per_km = fare_info.get("base_fare_per_km", 1.0)
        class_multiplier = fare_info.get("class_multiplier", 1.0)
        cost = distance * base_fare_per_km * class_multiplier * passengers
        return round(cost, 2)

    if mode == "flight":
        flight_data = _load_flight_routes()
        routes = flight_data.get("routes", {})
        key1 = f"{origin}_{destination}"
        key2 = f"{destination}_{origin}"
        route = routes.get(key1) or routes.get(key2)

        if route:
            base_fare = route.get("base_fare", 5000)
            airport_tax = flight_data.get("flight", {}).get("airport_tax", 500)
            cost = (base_fare + airport_tax) * passengers
            return round(cost, 2)
        flight_info = flight_data.get("flight", {})
        base_fare_per_km = flight_info.get("base_fare_per_km", 12.0)
        minimum_fare = flight_info.get("minimum_fare", 3500)
        airport_tax = flight_info.get("airport_tax", 500)
        cost = max(distance * base_fare_per_km, minimum_fare) + airport_tax
        return round(cost * passengers, 2)

    raise ValueError(UNKNOWN_TRANSPORT_MODE_MSG.format(mode=mode))


def get_available_modes() -> list[str]:
    """Get list of available transport modes."""
    return ["bus_ac", "bus_non_ac", "train_shovan", "train_ac_chair", "train_ac_berth", "flight"]


def get_distance(origin: str, destination: str) -> float:
    """Get distance between two locations."""
    return _get_distance(origin, destination)
