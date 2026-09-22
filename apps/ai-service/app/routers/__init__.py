"""AI service routers.

Each module owns one prediction domain and exposes:
    load()  — called once from the app lifespan (when the router serves a model)
    router  — an APIRouter mounted by app.main
"""
from . import advisory, crop, market, travel, yield_

__all__ = ["advisory", "crop", "market", "travel", "yield_"]
