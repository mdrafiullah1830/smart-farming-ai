"""
AI Model Inference Pipeline
Smart Farming AI Platform Bangladesh
"""
import os
import sys
from typing import Any

import numpy as np

_ai_models_dir = os.path.dirname(os.path.abspath(__file__))
if _ai_models_dir not in sys.path:
    sys.path.insert(0, _ai_models_dir)


class AIInferencePipeline:
    def __init__(self):
        self.crop_model = None
        self.yield_model = None
        self.market_model = None
        self.disease_model = None
        self.chatbot = None
        self._loaded_models = set()

    def load_crop_model(self, path: str = "trained_models/crop_recommendation.pkl"):
        if os.path.exists(path) and "crop" not in self._loaded_models:
            from ai_models.crop_prediction.train import CropRecommendationModel
            self.crop_model = CropRecommendationModel.load(path)
            self._loaded_models.add("crop")
            print("Crop model loaded")

    def load_yield_model(self, path: str = "trained_models/yield_prediction.pkl"):
        if os.path.exists(path) and "yield" not in self._loaded_models:
            from ai_models.yield_prediction.train import YieldPredictionModel
            self.yield_model = YieldPredictionModel.load(path)
            self._loaded_models.add("yield")
            print("Yield model loaded")

    def load_market_model(self, path: str = "trained_models/market_forecasting.pkl"):
        if os.path.exists(path) and "market" not in self._loaded_models:
            from ai_models.market_forecasting.train import MarketForecastingModel
            self.market_model = MarketForecastingModel.load(path)
            self._loaded_models.add("market")
            print("Market model loaded")

    def load_disease_model(self, path: str = "trained_models/disease_detection.h5"):
        if os.path.exists(path) and "disease" not in self._loaded_models:
            from ai_models.disease_detection.train import DiseaseDetectionModel
            self.disease_model = DiseaseDetectionModel.load(path)
            self._loaded_models.add("disease")
            print("Disease model loaded")

    def load_chatbot(self, path: str = "trained_models/chatbot.pkl"):
        if os.path.exists(path) and "chatbot" not in self._loaded_models:
            from ai_models.chatbot.train_enhanced import AgriculturalChatbot
            self.chatbot = AgriculturalChatbot.load(path)
            self._loaded_models.add("chatbot")
            print("Chatbot loaded")

    def load_all_models(self, base_path: str = "trained_models"):
        self.load_crop_model(os.path.join(base_path, "crop_recommendation.pkl"))
        self.load_yield_model(os.path.join(base_path, "yield_prediction.pkl"))
        self.load_market_model(os.path.join(base_path, "market_forecasting.pkl"))
        self.load_disease_model(os.path.join(base_path, "disease_detection.h5"))
        self.load_chatbot(os.path.join(base_path, "chatbot.pkl"))

    def predict_crop(self, features: dict[str, float]) -> dict[str, Any]:
        if self.crop_model is None:
            return {"error": "Crop model not loaded"}
        result: dict[str, Any] = self.crop_model.predict(features)
        return result

    def predict_yield(self, features: dict[str, Any]) -> dict[str, Any]:
        if self.yield_model is None:
            return {"error": "Yield model not loaded"}
        result: dict[str, Any] = self.yield_model.predict(features)
        return result

    def predict_market(self, crop_name: str, historical_prices: list, days: int = 7) -> dict[str, Any]:
        if self.market_model is None:
            return {"error": "Market model not loaded"}
        result: dict[str, Any] = self.market_model.predict(crop_name, historical_prices, days)
        return result

    def detect_disease(self, image: np.ndarray) -> dict[str, Any]:
        if self.disease_model is None:
            return {"error": "Disease model not loaded"}
        result: dict[str, Any] = self.disease_model.predict(image)
        return result

    def chat(self, query: str, language: str = "bn") -> dict[str, Any]:
        if self.chatbot is None:
            return {"error": "Chatbot not loaded"}
        result: dict[str, Any] = self.chatbot.get_response(query, language)
        return result

    def get_seasonal_advice(self, month: int, district: str | None = None) -> dict[str, Any]:
        if self.chatbot is None:
            return {"error": "Chatbot not loaded"}
        result: dict[str, Any] = self.chatbot.get_seasonal_advice(month, district)
        return result

    def get_model_status(self) -> dict[str, bool]:
        return {
            "crop_model": self.crop_model is not None,
            "yield_model": self.yield_model is not None,
            "market_model": self.market_model is not None,
            "disease_model": self.disease_model is not None,
            "chatbot": self.chatbot is not None,
        }


pipeline = AIInferencePipeline()
