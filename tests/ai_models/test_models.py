import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'ai_models'))


class TestCropRecommendation:
    def setup_method(self):
        from crop_prediction.train import CropRecommendationModel
        self.model = CropRecommendationModel()
        self.model.train()

    def test_predict_rice(self):
        features = {
            'temperature': 28, 'humidity': 70, 'rainfall': 150,
            'ph': 6.5, 'nitrogen': 50, 'phosphorus': 30, 'potassium': 40,
        }
        predictions = self.model.predict(features)
        assert len(predictions) > 0
        assert predictions[0]['confidence'] > 0

    def test_predict_wheat(self):
        features = {
            'temperature': 18, 'humidity': 55, 'rainfall': 60,
            'ph': 6.8, 'nitrogen': 35, 'phosphorus': 20, 'potassium': 30,
        }
        predictions = self.model.predict(features)
        assert len(predictions) > 0

    def test_save_and_load(self, tmp_path):
        self.model.save(str(tmp_path / "test_model.pkl"))
        loaded = self.model.load(str(tmp_path / "test_model.pkl"))
        assert loaded.model is not None


class TestYieldPrediction:
    def setup_method(self):
        from yield_prediction.train import YieldPredictionModel
        self.model = YieldPredictionModel()
        self.model.train()

    def test_predict_rice_yield(self):
        features = {
            'crop': 'rice', 'temperature': 28, 'humidity': 70,
            'rainfall': 150, 'ph': 6.5, 'nitrogen': 50,
            'area_acres': 5, 'irrigation_used': 1, 'season': 'kharif',
        }
        result = self.model.predict(features)
        assert 'yield_per_acre' in result
        assert result['yield_per_acre'] > 0

    def test_save_and_load(self, tmp_path):
        self.model.save(str(tmp_path / "test_yield.pkl"))
        loaded = self.model.load(str(tmp_path / "test_yield.pkl"))
        assert loaded.model is not None


class TestMarketForecasting:
    def setup_method(self):
        from market_forecasting.train import MarketForecastingModel
        self.model = MarketForecastingModel()
        self.model.train()

    def test_predict_price(self):
        historical = [55, 56, 54, 57, 55, 53, 56, 58, 57, 55]
        result = self.model.predict('rice', historical, days_ahead=7)
        assert 'predicted_prices' in result
        assert len(result['predicted_prices']) == 7


class TestDiseaseDetection:
    def setup_method(self):
        from disease_detection.train import DiseaseDetectionModel
        self.model = DiseaseDetectionModel()
        self.model.train(epochs=5)

    def test_detect_disease(self):
        import numpy as np
        image = np.random.rand(224, 224, 3).astype(np.float32)
        result = self.model.detect_disease(image)
        assert 'disease_name' in result
        assert 'confidence' in result


class TestChatbot:
    def setup_method(self):
        from chatbot.train import AgriculturalChatbot
        self.chatbot = AgriculturalChatbot()

    def test_rice_query(self):
        response = self.chatbot.get_response('ধান চাষ কিভাবে করব?')
        assert 'ধান' in response['response_bn']

    def test_general_query(self):
        response = self.chatbot.get_response('general question')
        assert 'response' in response

    def test_seasonal_advice(self):
        advice = self.chatbot.get_seasonal_advice(5)
        assert 'season' in advice
        assert 'activities' in advice

    def test_save_and_load(self, tmp_path):
        self.chatbot.save(str(tmp_path / "test_chatbot.pkl"))
        loaded = AgriculturalChatbot.load(str(tmp_path / "test_chatbot.pkl"))
        assert len(loaded.knowledge_base) > 0
