"""
Disease Detection Model Training Pipeline
Smart Farming AI Platform Bangladesh
Uses EfficientNet/CNN for plant disease classification
"""
import json
import os
import pickle
from datetime import datetime

import numpy as np


class DiseaseDetectionModel:
    def __init__(self):
        self.model = None
        self.class_names = [
            'Bacterial Leaf Blight', 'Bacterial Leaf Streak', 'Bacterial Panicle Blight',
            'Blast', 'Brown Spot', 'Dead Heart', 'Downy Mildew', 'Hispa', 'Healthy', 'Tungro'
        ]
        self.class_names_bn = [
            'ব্যাক্টেরিযাল লিফ ব্লাইট', 'ব্যাক্টেরিযাল লিফ স্ট্রিক', 'ব্যাক্টেরিযাল প্যানিকল ব্লাইট',
            'ব্লাস্ট', 'ব্রাউন স্পট', 'ডেড হার্ট', 'ডাউনি মিল্ডিউ', 'হিসপা', 'সুস্থ', 'তুঙ্গরো'
        ]
        self.image_size = (224, 224)
        self.model_info = {}

    def create_cnn_model(self, num_classes: int):
        try:
            import tensorflow as tf
            from tensorflow.keras.applications import EfficientNetB0
            from tensorflow.keras.layers import Dense, Dropout, GlobalAveragePooling2D
            from tensorflow.keras.models import Model

            base_model = EfficientNetB0(
                weights='imagenet',
                include_top=False,
                input_shape=(*self.image_size, 3),
            )

            for layer in base_model.layers[:-20]:
                layer.trainable = False

            x = base_model.output
            x = GlobalAveragePooling2D()(x)
            x = Dense(256, activation='relu')(x)
            x = Dropout(0.3)(x)
            x = Dense(128, activation='relu')(x)
            x = Dropout(0.2)(x)
            predictions = Dense(num_classes, activation='softmax')(x)

            model = Model(inputs=base_model.input, outputs=predictions)
            model.compile(
                optimizer='adam',
                loss='categorical_crossentropy',
                metrics=['accuracy'],
            )

            return model
        except ImportError:
            print("TensorFlow not available, using sklearn model")
            from sklearn.ensemble import RandomForestClassifier
            return RandomForestClassifier(n_estimators=100, random_state=42)

    def generate_synthetic_dataset(self, n_samples: int = 1000) -> tuple:
        """Generate synthetic dataset for development/testing only.
        
        WARNING: This produces random pixel patterns with trivial features.
        Models trained on this data have ZERO real-world accuracy.
        Use train_onnx.py with actual crop disease images for production models.
        """
        rng = np.random.RandomState(42)

        X = rng.rand(n_samples, *self.image_size, 3).astype(np.float32)
        y = rng.randint(0, len(self.class_names), n_samples)

        for i in range(n_samples):
            class_idx = y[i]
            if class_idx < len(self.class_names):
                if 'Blight' in self.class_names[class_idx] or 'Blast' in self.class_names[class_idx]:
                    X[i, 50:150, 50:150, 0] = rng.uniform(0.1, 0.3)
                elif 'Rust' in self.class_names[class_idx]:
                    X[i, 30:100, 30:100, :] = rng.uniform(0.6, 0.8, (70, 70, 3))
                elif 'Healthy' in self.class_names[class_idx]:
                    X[i, :, :, 1] = rng.uniform(0.4, 0.7, self.image_size)

        y_categorical = np.eye(len(self.class_names), dtype=np.float32)[y]

        return X, y_categorical, y

    def train(self, epochs: int = 20, batch_size: int = 32):
        X, y_cat, y_labels = self.generate_synthetic_dataset()

        split = int(len(X) * 0.8)
        X_train, X_test = X[:split], X[split:]
        y_train, y_test = y_cat[:split], y_cat[split:]

        try:
            import tensorflow as tf
            model = self.create_cnn_model(len(self.class_names))

            history = model.fit(
                X_train, y_train,
                batch_size=batch_size,
                epochs=epochs,
                validation_data=(X_test, y_test),
                verbose=1,
            )

            self.model = model

            y_pred = model.predict(X_test)
            y_pred_classes = np.argmax(y_pred, axis=1)
            y_true_classes = np.argmax(y_test, axis=1)
            accuracy = np.mean(y_pred_classes == y_true_classes)

            self.model_info = {
                'model_type': 'EfficientNetB0',
                'num_classes': len(self.class_names),
                'accuracy': float(accuracy),
                'classes': self.class_names,
                'classes_bn': self.class_names_bn,
                'image_size': self.image_size,
                'trained_at': datetime.now().isoformat(),
                'n_samples': len(X),
                'epochs': epochs,
            }

            print(f"Model trained with accuracy: {accuracy:.4f}")

        except ImportError:
            from sklearn.ensemble import RandomForestClassifier
            from sklearn.metrics import accuracy_score

            X_train_flat = X_train.reshape(X_train.shape[0], -1)
            X_test_flat = X_test.reshape(X_test.shape[0], -1)

            model = RandomForestClassifier(n_estimators=100, random_state=42, n_jobs=-1)
            model.fit(X_train_flat, np.argmax(y_train, axis=1))

            y_pred = model.predict(X_test_flat)
            accuracy = accuracy_score(np.argmax(y_test, axis=1), y_pred)

            self.model = model
            self.model_info = {
                'model_type': 'RandomForest',
                'num_classes': len(self.class_names),
                'accuracy': float(accuracy),
                'classes': self.class_names,
                'classes_bn': self.class_names_bn,
                'image_size': self.image_size,
                'trained_at': datetime.now().isoformat(),
                'n_samples': len(X),
            }

            print(f"Sklearn model trained with accuracy: {accuracy:.4f}")

        return self.model_info

    def predict(self, image: np.ndarray) -> dict:
        if self.model is None:
            raise ValueError("Model not trained yet")

        try:
            import tensorflow as tf
            if len(image.shape) == 3:
                image = np.expand_dims(image, axis=0)
            image = tf.image.resize(image, self.image_size)
            if image.dtype == tf.uint8 or image.numpy().max() > 1.0:
                image = image / 255.0

            predictions = self.model.predict(image, verbose=0)
            class_idx = np.argmax(predictions[0])
            confidence = float(predictions[0][class_idx])

        except ImportError:
            if len(image.shape) == 3:
                image_flat = image.reshape(1, -1)
            else:
                image_flat = image.reshape(image.shape[0], -1)
            predictions = self.model.predict_proba(image_flat)
            class_idx = np.argmax(predictions[0])
            confidence = float(predictions[0][class_idx])

        disease_name = self.class_names[class_idx]
        disease_name_bn = self.class_names_bn[class_idx]

        severity = "low"
        if confidence > 0.8 and class_idx != len(self.class_names) - 1:
            severity = "high"
        elif confidence > 0.6 and class_idx != len(self.class_names) - 1:
            severity = "medium"

        return {
            'disease_name': disease_name,
            'disease_name_bn': disease_name_bn,
            'confidence': round(confidence, 4),
            'severity': severity,
            'class_index': int(class_idx),
            'all_probabilities': {
                self.class_names[i]: round(float(predictions[0][i]), 4)
                for i in range(len(self.class_names))
            },
        }

    def save(self, path: str):
        os.makedirs(os.path.dirname(path) or '.', exist_ok=True)
        saved_path = path
        try:
            self.model.save(path)
        except Exception:
            pkl_path = path if path.endswith('.pkl') else path + '.pkl'
            model_data = {
                'model': self.model,
                'model_info': self.model_info,
            }
            with open(pkl_path, 'wb') as f:
                pickle.dump(model_data, f)
            saved_path = pkl_path

        info_path = path.replace('.h5', '_info.json').replace('.keras', '_info.json')
        if info_path == path:
            info_path = path + '_info.json'
        with open(info_path, 'w') as f:
            json.dump(self.model_info, f, indent=2)
        print(f"Model saved to {saved_path}")

    @classmethod
    def load(cls, path: str):
        instance = cls()
        try:
            import tensorflow as tf
            instance.model = tf.keras.models.load_model(path)
        except Exception:
            pkl_path = path + '.pkl' if not path.endswith('.pkl') else path
            with open(pkl_path, 'rb') as f:
                model_data = pickle.load(f)
            instance.model = model_data['model']
            instance.model_info = model_data.get('model_info', {})

        info_path = path.replace('.h5', '_info.json').replace('.keras', '_info.json')
        if info_path == path:
            info_path = path + '_info.json'
        if os.path.exists(info_path):
            with open(info_path) as f:
                instance.model_info = json.load(f)

        return instance


if __name__ == "__main__":
    model = DiseaseDetectionModel()
    info = model.train(epochs=10)
    model.save("trained_models/disease_detection.h5")
    print(f"\nModel Info: {json.dumps(info, indent=2)}")
