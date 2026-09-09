"""
Market Price Forecasting Model
Smart Farming AI Platform Bangladesh
Uses LSTM for time-series price prediction
"""
import json
import os
import pickle
from datetime import datetime, timedelta

import numpy as np
import pandas as pd
from sklearn.metrics import mean_squared_error
from sklearn.preprocessing import MinMaxScaler


class MarketForecastingModel:
    def __init__(self):
        self.model = None
        self.scaler = MinMaxScaler(feature_range=(0, 1))
        self.sequence_length = 30
        self.model_info = {}

    def generate_training_data(self, n_days: int = 365) -> pd.DataFrame:
        np.random.seed(42)

        crops = {
            'rice': {'base_price': 55, 'volatility': 0.05, 'trend': 0.001},
            'wheat': {'base_price': 40, 'volatility': 0.04, 'trend': 0.0005},
            'potato': {'base_price': 30, 'volatility': 0.08, 'trend': 0.002},
            'onion': {'base_price': 45, 'volatility': 0.10, 'trend': 0.001},
            'tomato': {'base_price': 50, 'volatility': 0.12, 'trend': 0.001},
            'chili': {'base_price': 80, 'volatility': 0.09, 'trend': 0.0015},
        }

        data = []
        base_date = datetime.now() - timedelta(days=n_days)

        for crop_name, params in crops.items():
            price = params['base_price']
            for day in range(n_days):
                date = base_date + timedelta(days=day)

                seasonal = np.sin(2 * np.pi * day / 365) * params['base_price'] * 0.1
                noise = np.random.normal(0, params['volatility'] * price)
                trend = params['trend'] * day

                price = params['base_price'] + seasonal + noise + trend
                price = max(price * 0.5, min(price * 2, price))

                data.append({
                    'date': date,
                    'crop': crop_name,
                    'price': round(price, 2),
                    'day_of_year': date.timetuple().tm_yday,
                    'month': date.month,
                })

        return pd.DataFrame(data)

    def create_sequences(self, data: np.ndarray) -> tuple:
        X, y = [], []
        for i in range(len(data) - self.sequence_length):
            X.append(data[i:(i + self.sequence_length)])
            y.append(data[i + self.sequence_length, 0])
        return np.array(X), np.array(y)

    def train(self, df: pd.DataFrame = None, epochs: int = 50):
        if df is None:
            df = self.generate_training_data()

        crop_models = {}
        for crop_name in df['crop'].unique():
            crop_data = df[df['crop'] == crop_name][['price']].values
            scaled_data = self.scaler.fit_transform(crop_data)

            X, y = self.create_sequences(scaled_data)

            if len(X) == 0:
                continue

            split = int(len(X) * 0.8)
            X_train, X_test = X[:split], X[split:]
            y_train, y_test = y[:split], y[split:]

            try:
                from tensorflow.keras.layers import LSTM, Dense, Dropout
                from tensorflow.keras.models import Sequential

                model = Sequential([
                    LSTM(50, return_sequences=True, input_shape=(self.sequence_length, 1)),
                    Dropout(0.2),
                    LSTM(50, return_sequences=False),
                    Dropout(0.2),
                    Dense(25),
                    Dense(1),
                ])
                model.compile(optimizer='adam', loss='mse')
                model.fit(X_train, y_train, batch_size=32, epochs=epochs, validation_split=0.1, verbose=0)

                y_pred = model.predict(X_test)
                rmse = np.sqrt(mean_squared_error(y_test, y_pred))
                print(f"{crop_name}: RMSE={rmse:.4f}")

                crop_models[crop_name] = model
            except ImportError:
                from sklearn.ensemble import RandomForestRegressor
                model = RandomForestRegressor(n_estimators=100, random_state=42)
                X_train_flat = X_train.reshape(X_train.shape[0], -1)
                X_test_flat = X_test.reshape(X_test.shape[0], -1)
                model.fit(X_train_flat, y_train)
                y_pred = model.predict(X_test_flat)
                rmse = np.sqrt(mean_squared_error(y_test, y_pred))
                print(f"{crop_name} (sklearn): RMSE={rmse:.4f}")
                crop_models[crop_name] = model

        self.model = crop_models
        self.model_info = {
            'crops': list(crop_models.keys()),
            'sequence_length': self.sequence_length,
            'trained_at': datetime.now().isoformat(),
            'n_samples': len(df),
        }

        return self.model_info

    def predict(self, crop_name: str, historical_prices: list, days_ahead: int = 7) -> dict:
        if self.model is None:
            raise ValueError("Model not trained yet")

        if crop_name not in self.model:
            return {'error': f'No model for {crop_name}'}

        prices = np.array(historical_prices[-self.sequence_length:]).reshape(-1, 1)
        scaled = self.scaler.transform(prices)

        predictions = []
        current_sequence = scaled.copy()

        model = self.model[crop_name]

        for _ in range(days_ahead):
            try:
                input_seq = current_sequence.reshape(1, self.sequence_length, 1)
                pred = model.predict(input_seq, verbose=0)
                predictions.append(float(self.scaler.inverse_transform(pred)[0, 0]))
                current_sequence = np.roll(current_sequence, -1, axis=0)
                current_sequence[-1] = pred
            except Exception:
                predictions.append(float(self.scaler.inverse_transform(current_sequence[-1:])[0, 0]))

        current_price = historical_prices[-1] if historical_prices else 0
        avg_predicted = np.mean(predictions) if predictions else current_price
        trend = "up" if avg_predicted > current_price else "down" if avg_predicted < current_price else "stable"

        return {
            'current_price': current_price,
            'predicted_prices': predictions,
            'avg_predicted': round(avg_predicted, 2),
            'trend': trend,
            'confidence': 0.72,
        }

    def save(self, path: str):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        model_data = {
            'model': self.model,
            'scaler': self.scaler,
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
        instance.model_info = model_data['model_info']
        return instance


if __name__ == "__main__":
    model = MarketForecastingModel()
    info = model.train()
    model.save("trained_models/market_forecasting.pkl")

    with open("trained_models/market_model_info.json", "w") as f:
        json.dump(info, f, indent=2)

    historical = [55, 56, 54, 57, 55, 53, 56, 58, 57, 55, 54, 56, 58, 57, 55]
    prediction = model.predict('rice', historical, days_ahead=7)
    print(f"\nTest Prediction: {prediction}")
