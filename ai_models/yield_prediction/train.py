"""
Yield Prediction Model Training Pipeline
Smart Farming AI Platform Bangladesh
"""
import json
import os
import pickle
from datetime import datetime

import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.ensemble import GradientBoostingRegressor, RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder, StandardScaler


class YieldPredictionModel:
    def __init__(self):
        self.model = None
        self.scaler = StandardScaler()
        self.label_encoders = {}
        self.feature_names = [
            'crop_encoded', 'temperature', 'humidity', 'rainfall', 'ph',
            'nitrogen', 'area_acres', 'irrigation_used', 'season_encoded'
        ]
        self.model_info = {}

    def generate_training_data(self, n_samples: int = 5000, use_real_data: bool = True) -> pd.DataFrame:
        np.random.seed(42)

        crops = {
            'rice': {'base_yield': 2.5, 'temp_opt': (22, 32), 'rain_opt': (150, 250)},
            'wheat': {'base_yield': 1.8, 'temp_opt': (12, 22), 'rain_opt': (40, 80)},
            'jute': {'base_yield': 8.0, 'temp_opt': (25, 35), 'rain_opt': (180, 250)},
            'potato': {'base_yield': 12.0, 'temp_opt': (15, 22), 'rain_opt': (60, 90)},
            'onion': {'base_yield': 8.0, 'temp_opt': (18, 25), 'rain_opt': (40, 70)},
            'tomato': {'base_yield': 10.0, 'temp_opt': (22, 28), 'rain_opt': (50, 75)},
            'chili': {'base_yield': 3.0, 'temp_opt': (22, 28), 'rain_opt': (50, 75)},
        }

        # Load real soil data from database if available
        real_soil = []
        if use_real_data:
            try:
                import sqlite3
                db_path = os.path.join(os.path.dirname(__file__), '..', '..', 'database', 'smart_farming.db')
                if os.path.exists(db_path):
                    db = sqlite3.connect(db_path)
                    rows = db.execute("SELECT record_json FROM soil_report_data WHERE category = 'soil information' LIMIT 500").fetchall()
                    for row in rows:
                        try:
                            data = json.loads(row[0])
                            vals = [v for v in data.values() if isinstance(v, (int, float)) or (isinstance(v, str) and v.replace('.', '').replace('-', '').isdigit())]
                            real_soil.append([float(v) for v in vals[:4]] if vals else [])
                        except:
                            pass
                    db.close()
                    print(f"Loaded {len(real_soil)} real soil records from database")
            except Exception as e:
                print(f"Could not load real data: {e}")

        seasons = ['kharif', 'rabi', 'summer']
        data = []

        for _ in range(n_samples):
            crop_name = np.random.choice(list(crops.keys()))
            crop = crops[crop_name]

            temp = np.random.uniform(10, 40)
            humidity = np.random.uniform(30, 95)
            rainfall = np.random.uniform(20, 300)
            ph = np.random.uniform(4.5, 8.5)
            nitrogen = np.random.uniform(10, 80)
            area = np.random.uniform(0.5, 20)
            irrigation = np.random.choice([0, 1], p=[0.4, 0.6])
            season = np.random.choice(seasons)

            # Use real soil data if available
            if real_soil and np.random.random() < 0.3:
                sv = np.random.choice(len(real_soil))
                vals = real_soil[sv]
                if len(vals) >= 2:
                    ph = np.clip(vals[0], 4.0, 9.0)
                    nitrogen = np.clip(vals[1], 5, 100)

            base = crop['base_yield']
            factor = 1.0

            temp_min, temp_max = crop['temp_opt']
            if temp_min <= temp <= temp_max:
                factor *= 1.15
            elif temp < temp_min - 5 or temp > temp_max + 5:
                factor *= 0.6

            rain_min, rain_max = crop['rain_opt']
            if rain_min <= rainfall <= rain_max:
                factor *= 1.1
            elif rainfall < rain_min * 0.5 or rainfall > rain_max * 1.5:
                factor *= 0.7

            if 6.0 <= ph <= 7.5:
                factor *= 1.1
            elif ph < 5.0 or ph > 8.5:
                factor *= 0.65

            if nitrogen > 40:
                factor *= 1.1
            elif nitrogen < 15:
                factor *= 0.8

            if irrigation:
                factor *= 1.2

            yield_per_acre = base * factor * np.random.uniform(0.8, 1.2)
            yield_per_acre = max(0.5, min(yield_per_acre, base * 2))

            data.append({
                'crop': crop_name,
                'temperature': temp,
                'humidity': humidity,
                'rainfall': rainfall,
                'ph': ph,
                'nitrogen': nitrogen,
                'area_acres': area,
                'irrigation_used': irrigation,
                'season': season,
                'yield_per_acre': round(yield_per_acre, 4),
            })

        return pd.DataFrame(data)

    def train(self, df: pd.DataFrame = None):
        if df is None:
            df = self.generate_training_data()

        self.label_encoders['crop'] = LabelEncoder()
        self.label_encoders['season'] = LabelEncoder()

        df['crop_encoded'] = self.label_encoders['crop'].fit_transform(df['crop'])
        df['season_encoded'] = self.label_encoders['season'].fit_transform(df['season'])

        X = df[self.feature_names].values
        y = df['yield_per_acre'].values

        X_scaled = self.scaler.fit_transform(X)

        X_train, X_test, y_train, y_test = train_test_split(
            X_scaled, y, test_size=0.2, random_state=42
        )

        models = {
            'random_forest': RandomForestRegressor(n_estimators=200, max_depth=15, random_state=42),
            'xgboost': xgb.XGBRegressor(n_estimators=200, max_depth=8, learning_rate=0.1, random_state=42),
            'gradient_boosting': GradientBoostingRegressor(n_estimators=150, max_depth=8, random_state=42),
        }

        best_model = None
        best_score = -1
        best_name = ""

        for name, model in models.items():
            model.fit(X_train, y_train)
            y_pred = model.predict(X_test)
            r2 = r2_score(y_test, y_pred)
            rmse = np.sqrt(mean_squared_error(y_test, y_pred))
            mae = mean_absolute_error(y_test, y_pred)

            print(f"{name}: R2={r2:.4f}, RMSE={rmse:.4f}, MAE={mae:.4f}")

            if r2 > best_score:
                best_score = r2
                best_model = model
                best_name = name

        self.model = best_model
        self.model_info = {
            'model_name': best_name,
            'r2_score': best_score,
            'feature_names': self.feature_names,
            'crop_classes': list(self.label_encoders['crop'].classes_),
            'season_classes': list(self.label_encoders['season'].classes_),
            'trained_at': datetime.now().isoformat(),
            'n_samples': len(df),
        }

        print(f"\nBest Model: {best_name} with R2={best_score:.4f}")
        return self.model_info

    def predict(self, features: dict) -> dict:
        if self.model is None:
            raise ValueError("Model not trained yet")

        crop_encoded = self.label_encoders['crop'].transform([features['crop']])[0]
        season_encoded = self.label_encoders['season'].transform([features['season']])[0]

        X = np.array([[
            crop_encoded, features['temperature'], features['humidity'],
            features['rainfall'], features['ph'], features['nitrogen'],
            features['area_acres'], features['irrigation_used'], season_encoded,
        ]])
        X_scaled = self.scaler.transform(X)
        yield_per_acre = float(self.model.predict(X_scaled)[0])

        total_yield = yield_per_acre * features['area_acres']

        return {
            'yield_per_acre': round(yield_per_acre, 4),
            'total_yield': round(total_yield, 4),
        }

    def save(self, path: str):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        model_data = {
            'model': self.model,
            'scaler': self.scaler,
            'label_encoders': self.label_encoders,
            'model_info': self.model_info,
        }
        with open(path, 'wb') as f:
            pickle.dump(model_data, f)
        print(f"Model saved to {path}")

    @classmethod
    def load(cls, path: str):
        with open(path, 'rb') as f:
            model_data = pickle.load(f)
        instance = cls()
        instance.model = model_data['model']
        instance.scaler = model_data['scaler']
        instance.label_encoders = model_data['label_encoders']
        instance.model_info = model_data['model_info']
        return instance


if __name__ == "__main__":
    model = YieldPredictionModel()
    info = model.train()
    model.save("trained_models/yield_prediction.pkl")

    with open("trained_models/yield_model_info.json", "w") as f:
        json.dump(info, f, indent=2)

    test_features = {
        'crop': 'rice', 'temperature': 28, 'humidity': 70,
        'rainfall': 150, 'ph': 6.5, 'nitrogen': 50,
        'area_acres': 5, 'irrigation_used': 1, 'season': 'kharif',
    }
    prediction = model.predict(test_features)
    print(f"\nTest Prediction: {prediction}")
