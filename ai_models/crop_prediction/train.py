"""
Crop Recommendation Model Training Pipeline
Smart Farming AI Platform Bangladesh
"""
import json
import os
import pickle
from datetime import datetime

import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.ensemble import GradientBoostingClassifier, RandomForestClassifier
from sklearn.metrics import accuracy_score, classification_report
from sklearn.model_selection import cross_val_score, train_test_split
from sklearn.preprocessing import LabelEncoder, StandardScaler


class CropRecommendationModel:
    def __init__(self):
        self.model = None
        self.scaler = StandardScaler()
        self.label_encoder = LabelEncoder()
        self.feature_names = [
            'temperature', 'humidity', 'rainfall', 'ph',
            'nitrogen', 'phosphorus', 'potassium'
        ]
        self.model_info = {}

    def generate_training_data(self, n_samples: int = 5000, use_real_data: bool = True) -> pd.DataFrame:
        np.random.seed(42)

        crops = {
            'rice': {'temp': (20, 35), 'hum': (50, 90), 'rain': (100, 300), 'ph': (5.5, 7.0), 'n': (40, 80), 'p': (20, 50), 'k': (30, 60)},
            'wheat': {'temp': (10, 25), 'hum': (40, 70), 'rain': (30, 100), 'ph': (6.0, 7.5), 'n': (30, 60), 'p': (15, 40), 'k': (20, 50)},
            'jute': {'temp': (25, 35), 'hum': (60, 85), 'rain': (150, 250), 'ph': (6.0, 7.5), 'n': (50, 80), 'p': (25, 50), 'k': (30, 55)},
            'potato': {'temp': (15, 25), 'hum': (50, 80), 'rain': (50, 100), 'ph': (5.0, 6.5), 'n': (40, 70), 'p': (30, 60), 'k': (40, 70)},
            'onion': {'temp': (15, 25), 'hum': (50, 75), 'rain': (30, 80), 'ph': (6.0, 7.0), 'n': (30, 50), 'p': (20, 45), 'k': (25, 50)},
            'tomato': {'temp': (20, 30), 'hum': (50, 80), 'rain': (40, 80), 'ph': (6.0, 7.0), 'n': (35, 60), 'p': (25, 50), 'k': (30, 55)},
            'chili': {'temp': (20, 30), 'hum': (50, 75), 'rain': (40, 80), 'ph': (6.0, 7.0), 'n': (30, 55), 'p': (20, 45), 'k': (25, 50)},
            'mango': {'temp': (24, 30), 'hum': (50, 80), 'rain': (75, 200), 'ph': (5.5, 7.5), 'n': (40, 70), 'p': (20, 45), 'k': (30, 60)},
            'banana': {'temp': (25, 35), 'hum': (60, 85), 'rain': (100, 250), 'ph': (6.0, 7.5), 'n': (50, 80), 'p': (25, 50), 'k': (35, 65)},
            'sugarcane': {'temp': (20, 35), 'hum': (55, 80), 'rain': (100, 180), 'ph': (6.0, 7.5), 'n': (45, 75), 'p': (20, 45), 'k': (30, 55)},
            'mustard': {'temp': (10, 25), 'hum': (40, 70), 'rain': (30, 80), 'ph': (6.0, 7.5), 'n': (25, 50), 'p': (15, 40), 'k': (20, 45)},
            'lentil': {'temp': (15, 25), 'hum': (40, 65), 'rain': (30, 80), 'ph': (6.0, 7.5), 'n': (20, 45), 'p': (15, 35), 'k': (15, 40)},
        }

        # Load real soil data from database if available
        real_data = []
        if use_real_data:
            try:
                import sqlite3
                db_path = os.path.join(os.path.dirname(__file__), '..', '..', 'database', 'smart_farming.db')
                if os.path.exists(db_path):
                    db = sqlite3.connect(db_path)
                    # Get soil info records (contain pH, nitrogen, etc.)
                    rows = db.execute("SELECT record_json FROM soil_report_data WHERE category = 'soil information' LIMIT 1000").fetchall()
                    for row in rows:
                        try:
                            import json
                            data = json.loads(row[0])
                            values = list(data.values())
                            # Try to extract numeric soil properties
                            numeric_vals = []
                            for v in values:
                                if isinstance(v, (int, float)):
                                    numeric_vals.append(v)
                                elif isinstance(v, str):
                                    try:
                                        numeric_vals.append(float(v))
                                    except:
                                        pass
                            if len(numeric_vals) >= 3:
                                real_data.append(numeric_vals)
                        except:
                            pass
                    db.close()
                    print(f"Loaded {len(real_data)} real soil records from database")
            except Exception as e:
                print(f"Could not load real data: {e}, using synthetic data only")

        data = []
        samples_per_crop = n_samples // len(crops)

        for crop_name, ranges in crops.items():
            for _ in range(samples_per_crop):
                temp = np.random.uniform(*ranges['temp'])
                hum = np.random.uniform(*ranges['hum'])
                rain = np.random.uniform(*ranges['rain'])
                ph = np.random.uniform(*ranges['ph'])
                n = np.random.uniform(*ranges['n'])
                p = np.random.uniform(*ranges['p'])
                k = np.random.uniform(*ranges['k'])
                data.append([temp, hum, rain, ph, n, p, k, crop_name])

        # Augment with real soil data if available
        if real_data:
            for soil_vals in real_data[:min(len(real_data), n_samples // 3)]:
                crop_name = np.random.choice(list(crops.keys()))
                ranges = crops[crop_name]
                # Map real soil values to model features
                ph_real = np.clip(soil_vals[0] if len(soil_vals) > 0 else np.random.uniform(*ranges['ph']), 4.0, 9.0)
                n_real = np.clip(soil_vals[1] if len(soil_vals) > 1 else np.random.uniform(*ranges['n']), 5, 100)
                p_real = np.clip(soil_vals[2] if len(soil_vals) > 2 else np.random.uniform(*ranges['p']), 5, 80)
                k_real = np.clip(soil_vals[3] if len(soil_vals) > 3 else np.random.uniform(*ranges['k']), 5, 80)
                temp = np.random.uniform(*ranges['temp'])
                hum = np.random.uniform(*ranges['hum'])
                rain = np.random.uniform(*ranges['rain'])
                data.append([temp, hum, rain, ph_real, n_real, p_real, k_real, crop_name])

        df = pd.DataFrame(data, columns=self.feature_names + ['crop'])
        return df.sample(frac=1, random_state=42).reset_index(drop=True)

    def train(self, df: pd.DataFrame = None):
        if df is None:
            df = self.generate_training_data()

        X = df[self.feature_names].values
        y = df['crop'].values

        y_encoded = self.label_encoder.fit_transform(y)
        X_scaled = self.scaler.fit_transform(X)

        X_train, X_test, y_train, y_test = train_test_split(
            X_scaled, y_encoded, test_size=0.2, random_state=42, stratify=y_encoded
        )

        models = {
            'random_forest': RandomForestClassifier(n_estimators=200, max_depth=15, random_state=42),
            'xgboost': xgb.XGBClassifier(n_estimators=200, max_depth=8, learning_rate=0.1, random_state=42),
            'gradient_boosting': GradientBoostingClassifier(n_estimators=150, max_depth=8, random_state=42),
        }

        best_model = None
        best_score = 0
        best_name = ""

        for name, model in models.items():
            model.fit(X_train, y_train)
            y_pred = model.predict(X_test)
            accuracy = accuracy_score(y_test, y_pred)
            cv_scores = cross_val_score(model, X_scaled, y_encoded, cv=5, scoring='accuracy')

            print(f"{name}: Accuracy={accuracy:.4f}, CV Mean={cv_scores.mean():.4f}")

            if accuracy > best_score:
                best_score = accuracy
                best_model = model
                best_name = name

        self.model = best_model
        self.model_info = {
            'model_name': best_name,
            'accuracy': best_score,
            'n_classes': len(self.label_encoder.classes_),
            'classes': list(self.label_encoder.classes_),
            'feature_names': self.feature_names,
            'trained_at': datetime.now().isoformat(),
            'n_samples': len(df),
        }

        y_pred = best_model.predict(X_test)
        print(f"\nBest Model: {best_name}")
        print(f"Classification Report:\n{classification_report(y_test, y_pred, target_names=self.label_encoder.classes_)}")

        return self.model_info

    def predict(self, features: dict) -> list:
        if self.model is None:
            raise ValueError("Model not trained yet")

        X = np.array([[features.get(f, 0) for f in self.feature_names]])
        X_scaled = self.scaler.transform(X)
        probabilities = self.model.predict_proba(X_scaled)[0]

        top_indices = np.argsort(probabilities)[::-1][:5]
        predictions = []

        for idx in top_indices:
            crop_name = self.label_encoder.inverse_transform([idx])[0]
            confidence = float(probabilities[idx])
            predictions.append({
                'crop': crop_name,
                'confidence': round(confidence, 4),
            })

        return predictions

    def save(self, path: str):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        model_data = {
            'model': self.model,
            'scaler': self.scaler,
            'label_encoder': self.label_encoder,
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
        instance.label_encoder = model_data['label_encoder']
        instance.model_info = model_data['model_info']
        return instance


if __name__ == "__main__":
    model = CropRecommendationModel()
    info = model.train()
    model.save("trained_models/crop_recommendation.pkl")

    with open("trained_models/crop_model_info.json", "w") as f:
        json.dump(info, f, indent=2)

    test_features = {
        'temperature': 28, 'humidity': 70, 'rainfall': 150,
        'ph': 6.5, 'nitrogen': 50, 'phosphorus': 30, 'potassium': 40,
    }
    predictions = model.predict(test_features)
    print(f"\nTest Predictions: {predictions}")
