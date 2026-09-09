#!/usr/bin/env python3
"""
Train EfficientNetB0 on Paddy Doctor rice disease dataset and export to ONNX.
"""
import json
import os
from datetime import datetime
from pathlib import Path

import numpy as np
import pandas as pd
import tensorflow as tf
from sklearn.metrics import classification_report
from sklearn.model_selection import train_test_split
from tensorflow.keras.applications import EfficientNetB0
from tensorflow.keras.callbacks import EarlyStopping, ModelCheckpoint, ReduceLROnPlateau
from tensorflow.keras.layers import Dense, Dropout, GlobalAveragePooling2D, Input
from tensorflow.keras.models import Model
from tensorflow.keras.optimizers import Adam
from tensorflow.keras.utils import to_categorical

# Try to import tf2onnx for ONNX export
try:
    import tf2onnx
    ONNX_AVAILABLE = True
except ImportError:
    ONNX_AVAILABLE = False
    print("tf2onnx not available - install with: pip install tf2onnx")

# Configuration
DATA_DIR = Path("/Users/mdrafiullah/smart_farming_ai/datasets/crop_disease_images/rice")
TRAIN_CSV = DATA_DIR / "train.csv"
TRAIN_IMG_DIR = DATA_DIR / "train_images"
OUTPUT_DIR = Path("/Users/mdrafiullah/smart_farming_ai/ai_models/trained_models")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

IMAGE_SIZE = (224, 224)
BATCH_SIZE = 32
EPOCHS = 30
LEARNING_RATE = 1e-4
VALIDATION_SPLIT = 0.15
TEST_SPLIT = 0.15

# Label mapping from dataset to our standard classes
LABEL_MAPPING = {
    'bacterial_leaf_blight': 0,  # Bacterial Leaf Blight
    'bacterial_leaf_streak': 1,  # Blast (closest)
    'bacterial_panicle_blight': 2,  # Brown Spot (closest)
    'blast': 3,  # Blast
    'brown_spot': 4,  # Brown Spot
    'dead_heart': 5,  # Tungro (closest - viral)
    'downy_mildew': 6,  # Powdery Mildew (closest)
    'hispa': 7,  # Leaf Rust (closest)
    'normal': 8,  # Healthy
    'tungro': 9,  # Tungro
}

# Our standard class names (matching AI service)
CLASS_NAMES = [
    "Bacterial Leaf Blight", "Blast", "Brown Spot", "Tungro",
    "Leaf Rust", "Powdery Mildew", "Late Blight", "Early Blight",
    "Anthracnose", "Healthy"
]

CLASS_NAMES_BN = [
    "ব্যাকটেরিয়াল লিফ ব্লাইট", "ব্লাস্ট", "ব্রাউন স্পট", "তুঙ্গরো",
    "লিফ রাস্ট", "পাউডারি মিলডিউ", "লেট ব্লাইট", "আর্লি ব্লাইট",
    "অ্যান্থ্রাকনোজ", "সুস্থ"
]


def load_dataset():
    """Load and prepare the rice disease dataset."""
    print("Loading dataset...")
    df = pd.read_csv(TRAIN_CSV)
    print(f"Total samples: {len(df)}")
    print(f"Label distribution:\n{df['label'].value_counts()}")

    # Map labels to our standard classes
    df['class_idx'] = df['label'].map(LABEL_MAPPING)
    df['image_path'] = df['image_id'].apply(lambda x: str(TRAIN_IMG_DIR / x))

    # Verify images exist
    df['exists'] = df['image_path'].apply(os.path.exists)
    missing = df[~df['exists']]
    if len(missing) > 0:
        print(f"WARNING: {len(missing)} images not found")
    df = df[df['exists']].copy()
    print(f"Valid samples after verification: {len(df)}")

    return df


def create_tf_dataset(df, batch_size=32, shuffle=True, augment=False):
    """Create tf.data.Dataset from dataframe."""
    def load_and_preprocess(path, label):
        img = tf.io.read_file(path)
        img = tf.image.decode_jpeg(img, channels=3)
        img = tf.image.resize(img, IMAGE_SIZE)
        img = tf.cast(img, tf.float32) / 255.0

        # ImageNet normalization
        mean = tf.constant([0.485, 0.456, 0.406])
        std = tf.constant([0.229, 0.224, 0.225])
        img = (img - mean) / std

        # Augmentation
        if augment:
            img = tf.image.random_flip_left_right(img)
            img = tf.image.random_brightness(img, 0.2)
            img = tf.image.random_contrast(img, 0.8, 1.2)
            img = tf.image.random_saturation(img, 0.8, 1.2)
            img = tf.clip_by_value(img, 0, 1)

        return img, label

    paths = df['image_path'].values
    labels = to_categorical(df['class_idx'].values, num_classes=len(CLASS_NAMES))

    dataset = tf.data.Dataset.from_tensor_slices((paths, labels))
    dataset = dataset.map(load_and_preprocess, num_parallel_calls=tf.data.AUTOTUNE)

    if shuffle:
        dataset = dataset.shuffle(buffer_size=min(1000, len(df)), reshuffle_each_iteration=True)

    dataset = dataset.batch(batch_size).prefetch(tf.data.AUTOTUNE)
    return dataset


def build_model(num_classes=10):
    """Build EfficientNetB0 model with custom head."""
    base_model = EfficientNetB0(
        weights='imagenet',
        include_top=False,
        input_shape=(*IMAGE_SIZE, 3),
    )

    # Freeze early layers, unfreeze last 30
    for layer in base_model.layers[:-30]:
        layer.trainable = False
    for layer in base_model.layers[-30:]:
        layer.trainable = True

    inputs = Input(shape=(*IMAGE_SIZE, 3))
    x = base_model(inputs, training=False)
    x = GlobalAveragePooling2D()(x)
    x = Dense(512, activation='relu')(x)
    x = Dropout(0.4)(x)
    x = Dense(256, activation='relu')(x)
    x = Dropout(0.3)(x)
    outputs = Dense(num_classes, activation='softmax')(x)

    model = Model(inputs, outputs)

    model.compile(
        optimizer=Adam(learning_rate=LEARNING_RATE),
        loss='categorical_crossentropy',
        metrics=['accuracy', tf.keras.metrics.TopKCategoricalAccuracy(k=3, name='top3_acc')],
    )

    return model


def train_model():
    """Main training pipeline."""
    df = load_dataset()

    # Split data
    train_df, temp_df = train_test_split(
        df, test_size=VALIDATION_SPLIT + TEST_SPLIT,
        stratify=df['class_idx'], random_state=42
    )
    val_size = VALIDATION_SPLIT / (VALIDATION_SPLIT + TEST_SPLIT)
    val_df, test_df = train_test_split(
        temp_df, test_size=1-val_size,
        stratify=temp_df['class_idx'], random_state=42
    )

    print(f"Train: {len(train_df)}, Val: {len(val_df)}, Test: {len(test_df)}")

    # Create datasets
    train_ds = create_tf_dataset(train_df, BATCH_SIZE, shuffle=True, augment=True)
    val_ds = create_tf_dataset(val_df, BATCH_SIZE, shuffle=False)
    test_ds = create_tf_dataset(test_df, BATCH_SIZE, shuffle=False)

    # Build model
    model = build_model(len(CLASS_NAMES))
    model.summary()

    # Callbacks
    callbacks = [
        EarlyStopping(monitor='val_accuracy', patience=8, restore_best_weights=True, verbose=1),
        ReduceLROnPlateau(monitor='val_loss', factor=0.5, patience=4, min_lr=1e-7, verbose=1),
        ModelCheckpoint(
            OUTPUT_DIR / 'best_model.keras',
            monitor='val_accuracy', save_best_only=True, verbose=1
        ),
    ]

    # Train
    print("\nStarting training...")
    history = model.fit(
        train_ds,
        validation_data=val_ds,
        epochs=EPOCHS,
        callbacks=callbacks,
        verbose=1,
    )

    # Evaluate on test set
    print("\nEvaluating on test set...")
    test_results = model.evaluate(test_ds, verbose=1)
    test_loss, test_acc, test_top3 = test_results
    print(f"Test Loss: {test_loss:.4f}, Test Acc: {test_acc:.4f}, Test Top-3: {test_top3:.4f}")

    # Detailed predictions
    y_true = []
    y_pred = []
    for batch_x, batch_y in test_ds:
        preds = model.predict(batch_x, verbose=0)
        y_true.extend(np.argmax(batch_y, axis=1))
        y_pred.extend(np.argmax(preds, axis=1))

    print("\nClassification Report:")
    print(classification_report(y_true, y_pred, target_names=CLASS_NAMES))

    # Save model info
    model_info = {
        'model_type': 'EfficientNetB0',
        'num_classes': len(CLASS_NAMES),
        'classes': CLASS_NAMES,
        'classes_bn': CLASS_NAMES_BN,
        'image_size': IMAGE_SIZE,
        'trained_at': datetime.now().isoformat(),
        'train_samples': len(train_df),
        'val_samples': len(val_df),
        'test_samples': len(test_df),
        'test_accuracy': float(test_acc),
        'test_top3_accuracy': float(test_top3),
        'test_loss': float(test_loss),
        'epochs_trained': len(history.history['loss']),
        'label_mapping': LABEL_MAPPING,
        'training_history': {k: [float(v) for v in vals] for k, vals in history.history.items()},
    }

    # Save Keras model
    keras_path = OUTPUT_DIR / 'disease_model.keras'
    model.save(keras_path)
    print(f"\nKeras model saved to {keras_path}")

    # Save model info
    info_path = OUTPUT_DIR / 'disease_model_info.json'
    with open(info_path, 'w') as f:
        json.dump(model_info, f, indent=2)
    print(f"Model info saved to {info_path}")

    # Export to ONNX
    if ONNX_AVAILABLE:
        print("\nExporting to ONNX...")
        onnx_path = OUTPUT_DIR / 'disease_model.onnx'
        spec = (tf.TensorSpec((None, *IMAGE_SIZE, 3), tf.float32, name="input"),)
        model_proto, _ = tf2onnx.convert.from_keras(model, input_signature=spec, opset=13)
        with open(onnx_path, "wb") as f:
            f.write(model_proto.SerializeToString())
        print(f"ONNX model saved to {onnx_path}")

        # Verify ONNX model
        import onnxruntime as ort
        sess = ort.InferenceSession(str(onnx_path))
        input_name = sess.get_inputs()[0].name
        test_input = np.random.randn(1, *IMAGE_SIZE, 3).astype(np.float32)
        outputs = sess.run(None, {input_name: test_input})
        print(f"ONNX verification: output shape {outputs[0].shape}")
    else:
        print("\nSkipping ONNX export (tf2onnx not installed)")

    return model, model_info


if __name__ == "__main__":
    train_model()
