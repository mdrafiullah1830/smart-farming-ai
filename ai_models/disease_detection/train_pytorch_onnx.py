#!/usr/bin/env python3
"""
Train EfficientNetB0 on Paddy Doctor rice disease dataset using PyTorch and export to ONNX.
"""
import os
import json
import numpy as np
import pandas as pd
from pathlib import Path
from datetime import datetime
from collections import Counter

import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import Dataset, DataLoader
from torchvision import models, transforms
from torchvision.models import EfficientNet_B0_Weights
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report
from PIL import Image

# Try to import onnx for export
try:
    import onnx
    import onnxruntime as ort
    ONNX_AVAILABLE = True
except ImportError:
    ONNX_AVAILABLE = False
    print("ONNX not available - install with: pip install onnx onnxruntime")

# Configuration
DATA_DIR = Path("/Users/mdrafiullah/smart_farming_ai/datasets/crop_disease_images/rice")
TRAIN_CSV = DATA_DIR / "train.csv"
TRAIN_IMG_DIR = DATA_DIR / "train_images"
OUTPUT_DIR = Path("/Users/mdrafiullah/smart_farming_ai/ai_models/trained_models")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

IMAGE_SIZE = (224, 224)
BATCH_SIZE = 32
EPOCHS = 20
LEARNING_RATE = 1e-4
VALIDATION_SPLIT = 0.15
TEST_SPLIT = 0.15
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "mps" if torch.backends.mps.is_available() else "cpu")

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

print(f"Using device: {DEVICE}")


class RiceDiseaseDataset(Dataset):
    def __init__(self, df, transform=None):
        self.df = df.reset_index(drop=True)
        self.transform = transform
    
    def __len__(self):
        return len(self.df)
    
    def __getitem__(self, idx):
        row = self.df.iloc[idx]
        img_path = row['image_path']
        label = row['class_idx']
        
        image = Image.open(img_path).convert('RGB')
        if self.transform:
            image = self.transform(image)
        
        return image, label


def load_dataset():
    """Load and prepare the rice disease dataset."""
    print("Loading dataset...")
    df = pd.read_csv(TRAIN_CSV)
    print(f"Total samples: {len(df)}")
    print(f"Label distribution:\n{df['label'].value_counts()}")
    
    # Map labels to our standard classes
    df['class_idx'] = df['label'].map(LABEL_MAPPING)
    df['image_path'] = df.apply(lambda row: str(TRAIN_IMG_DIR / row['label'] / row['image_id']), axis=1)
    
    # Verify images exist
    df['exists'] = df['image_path'].apply(os.path.exists)
    missing = df[~df['exists']]
    if len(missing) > 0:
        print(f"WARNING: {len(missing)} images not found")
    df = df[df['exists']].copy()
    print(f"Valid samples after verification: {len(df)}")
    
    return df


def get_transforms():
    """Get train and validation transforms."""
    # ImageNet normalization
    mean = [0.485, 0.456, 0.406]
    std = [0.229, 0.224, 0.225]
    
    train_transform = transforms.Compose([
        transforms.Resize(IMAGE_SIZE),
        transforms.RandomHorizontalFlip(),
        transforms.RandomRotation(15),
        transforms.ColorJitter(brightness=0.2, contrast=0.2, saturation=0.2),
        transforms.ToTensor(),
        transforms.Normalize(mean, std),
    ])
    
    val_transform = transforms.Compose([
        transforms.Resize(IMAGE_SIZE),
        transforms.ToTensor(),
        transforms.Normalize(mean, std),
    ])
    
    return train_transform, val_transform


def build_model(num_classes=10):
    """Build EfficientNetB0 model with custom head."""
    weights = EfficientNet_B0_Weights.IMAGENET1K_V1
    model = models.efficientnet_b0(weights=weights)
    
    # Freeze early layers
    for param in model.features[:-4].parameters():
        param.requires_grad = False
    
    # Replace classifier
    in_features = model.classifier[1].in_features
    model.classifier = nn.Sequential(
        nn.Dropout(0.4),
        nn.Linear(in_features, 512),
        nn.ReLU(),
        nn.Dropout(0.3),
        nn.Linear(512, 256),
        nn.ReLU(),
        nn.Dropout(0.2),
        nn.Linear(256, num_classes),
    )
    
    return model.to(DEVICE)


def train_one_epoch(model, loader, criterion, optimizer, epoch):
    model.train()
    running_loss = 0.0
    correct = 0
    total = 0
    
    for batch_idx, (images, labels) in enumerate(loader):
        images, labels = images.to(DEVICE), labels.to(DEVICE)
        
        optimizer.zero_grad()
        outputs = model(images)
        loss = criterion(outputs, labels)
        loss.backward()
        optimizer.step()
        
        running_loss += loss.item()
        _, predicted = outputs.max(1)
        total += labels.size(0)
        correct += predicted.eq(labels).sum().item()
        
        if batch_idx % 50 == 0:
            print(f"  Epoch {epoch} [{batch_idx}/{len(loader)}] Loss: {loss.item():.4f} Acc: {100.*correct/total:.2f}%")
    
    epoch_loss = running_loss / len(loader)
    epoch_acc = 100. * correct / total
    return epoch_loss, epoch_acc


def validate(model, loader, criterion):
    model.eval()
    running_loss = 0.0
    correct = 0
    total = 0
    all_preds = []
    all_labels = []
    
    with torch.no_grad():
        for images, labels in loader:
            images, labels = images.to(DEVICE), labels.to(DEVICE)
            outputs = model(images)
            loss = criterion(outputs, labels)
            
            running_loss += loss.item()
            _, predicted = outputs.max(1)
            total += labels.size(0)
            correct += predicted.eq(labels).sum().item()
            
            all_preds.extend(predicted.cpu().numpy())
            all_labels.extend(labels.cpu().numpy())
    
    epoch_loss = running_loss / len(loader)
    epoch_acc = 100. * correct / total
    return epoch_loss, epoch_acc, all_preds, all_labels


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
    train_transform, val_transform = get_transforms()
    train_dataset = RiceDiseaseDataset(train_df, train_transform)
    val_dataset = RiceDiseaseDataset(val_df, val_transform)
    test_dataset = RiceDiseaseDataset(test_df, val_transform)
    
    train_loader = DataLoader(train_dataset, batch_size=BATCH_SIZE, shuffle=True, num_workers=4, pin_memory=True)
    val_loader = DataLoader(val_dataset, batch_size=BATCH_SIZE, shuffle=False, num_workers=4, pin_memory=True)
    test_loader = DataLoader(test_dataset, batch_size=BATCH_SIZE, shuffle=False, num_workers=4, pin_memory=True)
    
    # Build model
    model = build_model(len(CLASS_NAMES))
    print(model)
    
    criterion = nn.CrossEntropyLoss()
    optimizer = optim.AdamW(filter(lambda p: p.requires_grad, model.parameters()), lr=LEARNING_RATE, weight_decay=1e-4)
    scheduler = optim.lr_scheduler.ReduceLROnPlateau(optimizer, mode='max', factor=0.5, patience=4)
    
    # Training loop
    best_val_acc = 0.0
    history = {'train_loss': [], 'train_acc': [], 'val_loss': [], 'val_acc': []}
    
    print("\nStarting training...")
    for epoch in range(1, EPOCHS + 1):
        train_loss, train_acc = train_one_epoch(model, train_loader, criterion, optimizer, epoch)
        val_loss, val_acc, _, _ = validate(model, val_loader, criterion)
        scheduler.step(val_acc)
        
        history['train_loss'].append(train_loss)
        history['train_acc'].append(train_acc)
        history['val_loss'].append(val_loss)
        history['val_acc'].append(val_acc)
        
        print(f"Epoch {epoch}: Train Loss: {train_loss:.4f}, Train Acc: {train_acc:.2f}%, Val Loss: {val_loss:.4f}, Val Acc: {val_acc:.2f}%")
        
        if val_acc > best_val_acc:
            best_val_acc = val_acc
            torch.save(model.state_dict(), OUTPUT_DIR / 'best_model.pth')
            print(f"  -> Best model saved (val_acc: {val_acc:.2f}%)")
    
    # Load best model for testing
    model.load_state_dict(torch.load(OUTPUT_DIR / 'best_model.pth'))
    
    # Evaluate on test set
    print("\nEvaluating on test set...")
    test_loss, test_acc, test_preds, test_labels = validate(model, test_loader, criterion)
    print(f"Test Loss: {test_loss:.4f}, Test Acc: {test_acc:.2f}%")
    
    print("\nClassification Report:")
    print(classification_report(test_labels, test_preds, target_names=CLASS_NAMES))
    
    # Save model info
    model_info = {
        'model_type': 'EfficientNetB0_PyTorch',
        'num_classes': len(CLASS_NAMES),
        'classes': CLASS_NAMES,
        'classes_bn': CLASS_NAMES_BN,
        'image_size': IMAGE_SIZE,
        'trained_at': datetime.now().isoformat(),
        'train_samples': len(train_df),
        'val_samples': len(val_df),
        'test_samples': len(test_df),
        'test_accuracy': float(test_acc / 100),
        'test_loss': float(test_loss),
        'epochs_trained': epoch,
        'label_mapping': LABEL_MAPPING,
        'training_history': history,
    }
    
    # Save PyTorch model
    pth_path = OUTPUT_DIR / 'disease_model.pth'
    torch.save(model.state_dict(), pth_path)
    print(f"\nPyTorch model saved to {pth_path}")
    
    # Save model info
    info_path = OUTPUT_DIR / 'disease_model_info.json'
    with open(info_path, 'w') as f:
        json.dump(model_info, f, indent=2)
    print(f"Model info saved to {info_path}")
    
    # Export to ONNX
    if ONNX_AVAILABLE:
        print("\nExporting to ONNX...")
        model.eval()
        dummy_input = torch.randn(1, 3, *IMAGE_SIZE).to(DEVICE)
        onnx_path = OUTPUT_DIR / 'disease_model.onnx'
        
        torch.onnx.export(
            model,
            dummy_input,
            onnx_path,
            export_params=True,
            opset_version=13,
            do_constant_folding=True,
            input_names=['input'],
            output_names=['output'],
            dynamic_axes={'input': {0: 'batch_size'}, 'output': {0: 'batch_size'}},
        )
        print(f"ONNX model saved to {onnx_path}")
        
        # Verify ONNX model
        sess = ort.InferenceSession(str(onnx_path))
        input_name = sess.get_inputs()[0].name
        test_input = np.random.randn(1, 3, *IMAGE_SIZE).astype(np.float32)
        outputs = sess.run(None, {input_name: test_input})
        print(f"ONNX verification: output shape {outputs[0].shape}")
        
        # Test with actual image
        test_img = val_dataset[0][0].unsqueeze(0).numpy()
        outputs = sess.run(None, {input_name: test_img})
        pred_class = np.argmax(outputs[0])
        print(f"Sample prediction: {CLASS_NAMES[pred_class]} (confidence: {np.max(outputs[0]):.4f})")
    else:
        print("\nSkipping ONNX export (onnx not installed)")
    
    return model, model_info


if __name__ == "__main__":
    train_model()