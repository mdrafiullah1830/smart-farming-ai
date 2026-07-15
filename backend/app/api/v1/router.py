from fastapi import APIRouter
from app.api.v1.endpoints import (
    weather, soil, crops, yield_prediction,
    disease, market, chatbot, voice, farmers,
    farms, notifications, government, satellite, disaster
)

api_router = APIRouter()

api_router.include_router(farmers.router, prefix="/farmers", tags=["Farmers"])
api_router.include_router(farms.router, prefix="/farms", tags=["Farms"])
api_router.include_router(weather.router, prefix="/weather", tags=["Weather Intelligence"])
api_router.include_router(soil.router, prefix="/soil", tags=["Soil Analysis"])
api_router.include_router(crops.router, prefix="/crops", tags=["Crop Recommendation"])
api_router.include_router(yield_prediction.router, prefix="/yield", tags=["Yield Prediction"])
api_router.include_router(disease.router, prefix="/disease", tags=["Disease Detection"])
api_router.include_router(market.router, prefix="/market", tags=["Market Intelligence"])
api_router.include_router(chatbot.router, prefix="/chatbot", tags=["Bangla AI Chatbot"])
api_router.include_router(voice.router, prefix="/voice", tags=["Voice Assistant"])
api_router.include_router(notifications.router, prefix="/notifications", tags=["Notifications"])
api_router.include_router(government.router, prefix="/government", tags=["Government Dashboard"])
api_router.include_router(satellite.router, prefix="/satellite", tags=["Satellite Monitoring"])
api_router.include_router(disaster.router, prefix="/disaster", tags=["Disaster Intelligence"])
