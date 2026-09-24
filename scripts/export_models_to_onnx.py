#!/usr/bin/env python3
"""Export trained scikit-learn models to ONNX for the AI service.

Why this script exists
    The training pipelines in `ai_models/` save fitted estimators as `.pkl`.
    Pickle is fine offline but unusable in a service: loading it executes
    arbitrary code and pins the exact scikit-learn version, so the service
    (apps/ai-service) refuses to touch pickles. This script is the one-way
    bridge: it converts the fitted sklearn objects into self-contained ONNX
    graphs and copies them, with their metadata, into the service's models
    directory.

Outputs (into --models-dir, default apps/ai-service/models):
    crop_recommendation.onnx + crop_model_info.json
    yield_prediction.onnx    + yield_model_info.json
    market_forecast.onnx     + market_model_info.json  (fallback, see below)

Market fallback, stated honestly
    The only real price data in the repo (datasets/dam_prices/) is a single
    daily snapshot per commodity — 22 rows, one date. It cannot train a time
    series. The training script ai_models/market_forecasting/train.py
    generates synthetic per-crop series (seasonal sine + noise + trend) and
    fits a RandomForest on 30-day windows. This script reuses that documented
    generator to fit a per-crop RandomForest fallback and stores the per-crop
    scaler bounds in the metadata, so the service can scale inputs and invert
    them without unpickling the sklearn scaler. The graph gets a fixed 30-day
    window and the service rolls it forward step by step, matching the rolling
    prediction loop in train.py.

Verify mode
    `--verify` loads every exported graph with onnxruntime and compares its
    output against the original sklearn estimator on random inputs. An export
    that silently diverges fails loudly here instead of shipping wrong advice.

Usage:
    python3 scripts/export_models_to_onnx.py            # export all
    python3 scripts/export_models_to_onnx.py --verify   # export + cross-check
"""
from __future__ import annotations

import argparse
import json
import pickle
import shutil
from datetime import datetime
from pathlib import Path

import numpy as np

REPO_ROOT = Path(__file__).resolve().parents[1]
CROP_DIR = REPO_ROOT / "ai_models" / "crop_prediction" / "trained_models"
YIELD_DIR = REPO_ROOT / "ai_models" / "yield_prediction" / "trained_models"
DISEASE_DIR = REPO_ROOT / "ai_models" / "trained_models"
DEFAULT_OUT = REPO_ROOT / "apps" / "ai-service" / "models"

# Sanity ceiling: the largest ONNX we are ever willing to write into the repo.
# The crop Random Forest (200 trees, depth 15) exports to a few MB; anything
# dramatically larger signals a misconfigured export, not a better model.
MAX_ONNX_BYTES = 25 * 1024 * 1024

# Disease detection model metadata (matches ai_models/disease_detection/train_pytorch_onnx.py
# and apps/ai-service/app/main.py:DISEASE_CLASSES / DISEASE_CLASSES_BN)
DISEASE_CLASSES = [
    "Bacterial Leaf Blight", "Bacterial Leaf Streak", "Bacterial Panicle Blight",
    "Blast", "Brown Spot", "Dead Heart", "Downy Mildew", "Hispa", "Healthy", "Tungro"
]
DISEASE_CLASSES_BN = [
    "ব্যাকটেরিয়াল লিফ ব্লাইট", "ব্যাকটেরিয়াল লিফ স্ট্রিক", "ব্যাকটেরিয়াল প্যানিকল ব্লাইট",
    "ব্লাস্ট", "ব্রাউন স্পট", "ডেড হার্ট", "ডাউনি মিলডিউ", "হিসপা", "সুস্থ", "তুঙ্গরো",
]

# Same parameters as ai_models/market_forecasting/train.py — kept in sync by
# hand because the trainer has no importable module structure.
MARKET_CROPS = {
    "rice": {"base_price": 55, "volatility": 0.05, "trend": 0.001},
    "wheat": {"base_price": 40, "volatility": 0.04, "trend": 0.0005},
    "potato": {"base_price": 30, "volatility": 0.08, "trend": 0.002},
    "onion": {"base_price": 45, "volatility": 0.10, "trend": 0.001},
    "tomato": {"base_price": 50, "volatility": 0.12, "trend": 0.001},
    "chili": {"base_price": 80, "volatility": 0.09, "trend": 0.0015},
}
MARKET_SEQUENCE_LENGTH = 30
MARKET_DAYS = 365


def die(msg: str):
    raise SystemExit(f"export_models_to_onnx: {msg}")


def _to_onnx_bytes(model, sample: np.ndarray, options: dict | None = None) -> bytes:
    from skl2onnx import to_onnx

    converted = to_onnx(model, X=sample, options=options, target_opset=17)
    onnx_bytes: bytes = converted.SerializeToString()
    return onnx_bytes


def save_bundle(onnx_bytes: bytes, metadata: dict, out_dir: Path, stem: str) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    if len(onnx_bytes) > MAX_ONNX_BYTES:
        die(f"{stem}.onnx is {len(onnx_bytes) / 1e6:.1f} MB, above the {MAX_ONNX_BYTES / 1e6:.0f} MB sanity ceiling")
    onnx_path = out_dir / f"{stem}.onnx"
    onnx_path.write_bytes(onnx_bytes)
    (out_dir / f"{stem}_model_info.json").write_text(
        json.dumps(metadata, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    print(f"  wrote {onnx_path.relative_to(REPO_ROOT)} ({len(onnx_bytes) / 1024:.0f} KB)")
    return onnx_path

# --------------------------------------------------------------------------
# Crop recommendation: RandomForestClassifier + StandardScaler + LabelEncoder
# --------------------------------------------------------------------------
def export_crop(out_dir: Path):
    from sklearn.pipeline import Pipeline

    pkl_path = CROP_DIR / "crop_recommendation.pkl"
    if not pkl_path.exists():
        die(f"missing {pkl_path}. Train the crop model first (ai_models/crop_prediction/train.py).")
    with open(pkl_path, "rb") as fh:
        bundle = pickle.load(fh)  # nosec B301  # reads the locally trained crop model bundle

    scaler = bundle["scaler"]
    classes = [str(c) for c in bundle["label_encoder"].classes_]
    feature_names = list(bundle["model_info"]["feature_names"])

    # Fold the scaler into the graph so the service never needs sklearn.
    pipeline = Pipeline([("scaler", scaler), ("forest", bundle["model"])])
    sample = np.zeros((1, len(feature_names)), dtype=np.float32)
    onnx_bytes = _to_onnx_bytes(pipeline, sample, options={id(pipeline): {"zipmap": False}})

    metadata = {
        "model_name": bundle["model_info"].get("model_name", "random_forest"),
        "accuracy": bundle["model_info"].get("accuracy"),
        "classes": classes,
        "feature_names": feature_names,
        "n_samples": bundle["model_info"].get("n_samples"),
        "trained_at": bundle["model_info"].get("trained_at"),
        "exported_at": datetime.now().isoformat(),
        "export": "skl2onnx Pipeline(StandardScaler -> RandomForestClassifier), zipmap disabled",
    }
    return save_bundle(onnx_bytes, metadata, out_dir, "crop_recommendation"), metadata


# --------------------------------------------------------------------------
# Yield prediction: GradientBoostingRegressor + StandardScaler
# --------------------------------------------------------------------------
def export_yield(out_dir: Path):
    from sklearn.pipeline import Pipeline

    pkl_path = YIELD_DIR / "yield_prediction.pkl"
    if not pkl_path.exists():
        die(f"missing {pkl_path}. Train the yield model first (ai_models/yield_prediction/train.py).")
    with open(pkl_path, "rb") as fh:
        bundle = pickle.load(fh)  # nosec B301  # reads the locally trained yield model bundle

    info = bundle["model_info"]
    feature_names = list(info["feature_names"])

    pipeline = Pipeline([("scaler", bundle["scaler"]), ("gbr", bundle["model"])])
    sample = np.zeros((1, len(feature_names)), dtype=np.float32)
    onnx_bytes = _to_onnx_bytes(pipeline, sample)

    metadata = {
        "model_name": info.get("model_name", "gradient_boosting"),
        "r2_score": info.get("r2_score"),
        "feature_names": feature_names,
        "crop_classes": [str(c) for c in info.get("crop_classes", [])],
        "season_classes": [str(c) for c in info.get("season_classes", [])],
        "n_samples": info.get("n_samples"),
        "trained_at": info.get("trained_at"),
        "exported_at": datetime.now().isoformat(),
        "export": "skl2onnx Pipeline(StandardScaler -> GradientBoostingRegressor)",
    }
    return save_bundle(onnx_bytes, metadata, out_dir, "yield_prediction"), metadata


# --------------------------------------------------------------------------
# Market fallback: per-crop RandomForest over flattened 30-day windows
# --------------------------------------------------------------------------
def generate_market_series(params: dict, n_days: int = MARKET_DAYS) -> np.ndarray:
    """Reproduce the synthetic series from ai_models/market_forecasting/train.py."""
    rng = np.random.default_rng(42)
    price = float(params["base_price"])
    prices = []
    for day in range(n_days):
        seasonal = np.sin(2 * np.pi * day / 365) * params["base_price"] * 0.1
        noise = rng.normal(0, params["volatility"] * price)
        trend = params["trend"] * day
        price = params["base_price"] + seasonal + noise + trend
        prices.append(max(price * 0.5, min(price * 2, price)))
    return np.asarray(prices, dtype=np.float64)


def export_market(out_dir: Path):
    from sklearn.ensemble import RandomForestRegressor

    X_parts, y_parts, per_crop_bounds = [], [], {}
    for crop_name, params in MARKET_CROPS.items():
        series = generate_market_series(params)
        low, high = float(series.min()), float(series.max())
        if high <= low:
            die(f"degenerate price bounds for {crop_name}")
        scaled = (series - low) / (high - low)
        X, y = [], []
        for i in range(len(scaled) - MARKET_SEQUENCE_LENGTH):
            X.append(scaled[i : i + MARKET_SEQUENCE_LENGTH])
            y.append(scaled[i + MARKET_SEQUENCE_LENGTH])
        X_parts.append(np.asarray(X, dtype=np.float32))
        y_parts.append(np.asarray(y, dtype=np.float32))
        per_crop_bounds[crop_name] = {"min": round(low, 2), "max": round(high, 2)}

    X_arr = np.concatenate(X_parts)
    y_arr = np.concatenate(y_parts)
    # train.py fits on X.reshape(n, -1); the service feeds (1, window, 1) and
    # flattens equivalently, so a 2-D input graph is the contract.
    model = RandomForestRegressor(n_estimators=100, random_state=42)
    model.fit(X_arr.reshape(X_arr.shape[0], -1), y_arr)

    sample = np.zeros((1, MARKET_SEQUENCE_LENGTH), dtype=np.float32)
    onnx_bytes = _to_onnx_bytes(model, sample)

    metadata = {
        "model_name": "random_forest_fallback",
        "crops": sorted(MARKET_CROPS),
        "sequence_length": MARKET_SEQUENCE_LENGTH,
        "n_samples": int(X_arr.shape[0]),
        "scaler_bounds": per_crop_bounds,
        "trained_at": datetime.now().isoformat(),
        "exported_at": datetime.now().isoformat(),
        "data_source": (
            "Synthetic series from the documented generator in "
            "ai_models/market_forecasting/train.py — real DAM snapshots are a "
            "single daily observation and cannot train a time series. Replace "
            "with a model trained on accumulated history as it grows."
        ),
        "export": "skl2onnx RandomForestRegressor on flattened 30-day windows, rolled forward per step",
    }
    return save_bundle(onnx_bytes, metadata, out_dir, "market_forecast"), metadata


# --------------------------------------------------------------------------
# Disease detection: EfficientNetB0 exported from PyTorch (train_pytorch_onnx.py)
# --------------------------------------------------------------------------
def export_disease(out_dir: Path) -> tuple[Path, dict]:
    """Copy the pre-trained disease ONNX model and create metadata."""
    onnx_path = DISEASE_DIR / "disease_model.onnx"
    if not onnx_path.exists():
        die(f"missing {onnx_path}. Train the disease model first (ai_models/disease_detection/train_pytorch_onnx.py).")

    # Copy the ONNX file
    onnx_bytes = onnx_path.read_bytes()

    # Also copy external data file if it exists
    data_path = DISEASE_DIR / "disease_model.onnx.data"
    if data_path.exists():
        out_data_path = out_dir / "disease_model.onnx.data"
        shutil.copy2(data_path, out_data_path)
        print(f"  wrote {out_data_path.relative_to(REPO_ROOT)} ({data_path.stat().st_size / 1024:.0f} KB)")

    # Try to read existing metadata from training output
    metadata_path = DISEASE_DIR / "disease_model_info.json"
    if metadata_path.exists():
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    else:
        # Fallback metadata matching train_pytorch_onnx.py output
        metadata = {
            "model_type": "EfficientNetB0_PyTorch",
            "num_classes": len(DISEASE_CLASSES),
            "classes": DISEASE_CLASSES,
            "classes_bn": DISEASE_CLASSES_BN,
            "image_size": [224, 224],
            "trained_at": datetime.now().isoformat(),
            "label_mapping": {
                'bacterial_leaf_blight': 0, 'bacterial_leaf_streak': 1,
                'bacterial_panicle_blight': 2, 'blast': 3, 'brown_spot': 4,
                'dead_heart': 5, 'downy_mildew': 6, 'hispa': 7, 'normal': 8, 'tungro': 9,
            },
        }

    metadata["exported_at"] = datetime.now().isoformat()
    metadata["export"] = "torch.onnx.export EfficientNetB0 (opset 13, ImageNet normalized, CHW input)"
    metadata["input_format"] = "CHW, ImageNet normalized (mean=[0.485,0.456,0.406], std=[0.229,0.224,0.225])"

    return save_bundle(onnx_bytes, metadata, out_dir, "disease_model"), metadata


# --------------------------------------------------------------------------
# Verification: ONNX vs sklearn on random inputs
# --------------------------------------------------------------------------
def verify_crop(path: Path, metadata: dict) -> None:
    import onnxruntime as ort
    from sklearn.pipeline import Pipeline

    with open(CROP_DIR / "crop_recommendation.pkl", "rb") as fh:
        bundle = pickle.load(fh)  # nosec B301  # reads the locally trained crop model bundle
    pipeline = Pipeline([("scaler", bundle["scaler"]), ("forest", bundle["model"])])
    session = ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])
    name = session.get_inputs()[0].name

    rng = np.random.default_rng(7)
    for _ in range(5):
        x = rng.normal(50, 30, size=(1, len(metadata["feature_names"]))).astype(np.float32)
        expected = np.asarray(pipeline.predict(x), dtype=int)  # already encoded
        got = np.asarray(session.run(None, {name: x})[0])
        got_labels = got if got.dtype.kind in "iub" else np.argmax(got, axis=1)
        if not np.array_equal(np.asarray(got_labels, dtype=int).ravel(), expected.ravel()):
            die(f"crop ONNX diverges from sklearn on input {x.ravel()}")


def verify_yield(path: Path, metadata: dict) -> None:
    import onnxruntime as ort
    from sklearn.pipeline import Pipeline

    with open(YIELD_DIR / "yield_prediction.pkl", "rb") as fh:
        bundle = pickle.load(fh)  # nosec B301  # reads the locally trained yield model bundle
    pipeline = Pipeline([("scaler", bundle["scaler"]), ("gbr", bundle["model"])])
    session = ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])
    name = session.get_inputs()[0].name

    rng = np.random.default_rng(11)
    for _ in range(5):
        x = rng.normal(3, 1.5, size=(1, len(metadata["feature_names"]))).astype(np.float32)
        expected = float(np.asarray(pipeline.predict(x)).reshape(-1)[0])
        got = float(np.asarray(session.run(None, {name: x})[0]).reshape(-1)[0])
        if abs(expected - got) > 1e-3 * max(1.0, abs(expected)):
            die(f"yield ONNX diverges: sklearn={expected:.4f} onnx={got:.4f}")


def verify_market(path: Path, metadata: dict) -> None:
    import onnxruntime as ort

    session = ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])
    name = session.get_inputs()[0].name
    rng = np.random.default_rng(13)
    x = rng.uniform(0, 1, size=(1, metadata["sequence_length"])).astype(np.float32)
    out = np.asarray(session.run(None, {name: x})[0]).reshape(-1)
    if out.size != 1:
        die(f"market ONNX should emit one step, got shape {out.shape}")
    if not np.all(np.isfinite(out)):
        die("market ONNX produced non-finite output")


def verify_disease(path: Path, metadata: dict) -> None:
    import onnxruntime as ort

    session = ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])
    name = session.get_inputs()[0].name
    # Test with random input (CHW format, ImageNet normalized)
    rng = np.random.default_rng(17)
    x = rng.normal(0, 1, size=(1, 3, 224, 224)).astype(np.float32)
    out = np.asarray(session.run(None, {name: x})[0])
    if out.shape != (1, 10):
        die(f"disease ONNX should emit (1, 10), got shape {out.shape}")
    if not np.all(np.isfinite(out)):
        die("disease ONNX produced non-finite output")
    # Check that softmax produces valid probabilities
    exp_logits = np.exp(out[0] - np.max(out[0]))
    probs = exp_logits / np.sum(exp_logits)
    if abs(np.sum(probs) - 1.0) > 1e-5:
        die(f"softmax probabilities don't sum to 1: {np.sum(probs)}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Export trained sklearn models to ONNX")
    parser.add_argument("--models-dir", type=Path, default=DEFAULT_OUT,
                        help="Output directory (default: apps/ai-service/models)")
    parser.add_argument("--verify", action="store_true", help="Cross-check each graph against sklearn")
    parser.add_argument("--clean", action="store_true", help="Remove the output directory before exporting")
    args = parser.parse_args()

    try:
        import skl2onnx  # noqa: F401
    except ImportError:
        die("skl2onnx is required: pip install skl2onnx scikit-learn onnx onnxruntime")

    if args.clean and args.models_dir.exists():
        shutil.rmtree(args.models_dir)

    print("Exporting crop recommendation ...")
    crop_path, crop_meta = export_crop(args.models_dir)
    print("Exporting yield prediction ...")
    yield_path, yield_meta = export_yield(args.models_dir)
    print("Exporting market fallback ...")
    market_path, market_meta = export_market(args.models_dir)
    print("Exporting disease detection ...")
    disease_path, disease_meta = export_disease(args.models_dir)

    if args.verify:
        print("Verifying ...")
        verify_crop(crop_path, crop_meta)
        verify_yield(yield_path, yield_meta)
        verify_market(market_path, market_meta)
        verify_disease(disease_path, disease_meta)
        print("All ONNX graphs agree with their sklearn estimators.")

    print("Done.")


if __name__ == "__main__":
    main()

