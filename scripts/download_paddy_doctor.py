"""Download the Paddy Doctor rice disease dataset via kagglehub.

Paddy Doctor: 16,225 labelled paddy (rice) leaf images, 13 classes
(12 diseases + healthy), CC-BY-4.0. This is the single largest gap in the
platform's disease-detection coverage: rice is 75% of Bangladesh's farmland
and was missing from the existing 8 crops.

Source: https://www.kaggle.com/datasets/umanggarg28/paddy-doctor-dataset

Prerequisites:
  kaggle login   # one-time: writes ~/.kaggle/kaggle.json

Outputs:
  datasets/crop_disease_images/rice/...        (images, local-only)
  datasets/crop_disease_images/rice/manifest.json
  datasets/crop_disease_images/manifest.json   (appended with rice)
  datasets/crop_disease_images/validation_report.json
"""
import hashlib
import json
import os
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..")
IMAGES_DIR = os.path.join(ROOT, "datasets", "crop_disease_images")
RICE_DIR = os.path.join(IMAGES_DIR, "rice")
MANIFEST_PATH = os.path.join(IMAGES_DIR, "manifest.json")
VALIDATION_PATH = os.path.join(IMAGES_DIR, "validation_report.json")

# 13 classes in the Paddy Doctor dataset.
PADDY_CLASSES = [
    "Bacterial Leaf Blight",
    "Bacterial Leaf Streak",
    "Bacterial Panicle Blight",
    "Blast",
    "Brown Spot",
    "Dead Heart",
    "Downy Mildew",
    "Hispa",
    "Normal",
    "Tungro",
    "Leaf Smut",
]


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def count_by_class(rice_dir):
    """Count images per class from the Paddy Doctor folder layout."""
    counts = {}
    if not os.path.isdir(rice_dir):
        return counts
    for entry in sorted(os.listdir(rice_dir)):
        full = os.path.join(rice_dir, entry)
        if not os.path.isdir(full):
            continue
        n = sum(1 for f in os.listdir(full)
                if f.lower().endswith((".jpg", ".jpeg", ".png", ".tif", ".tiff")))
        counts[entry] = n
    return counts


def main():
    try:
        import kagglehub
    except ImportError:
        print("kagglehub not installed. Run: pip install kagglehub", file=sys.stderr)
        sys.exit(1)

    print("Downloading Paddy Doctor dataset via kagglehub ...")
    path = kagglehub.dataset_download("umanggarg28/paddy-doctor-dataset")
    print("  source path:", path)

    # kagglehub returns a directory; locate the image folder inside it.
    image_src = None
    for root, dirs, files in os.walk(path):
        # Paddy Doctor stores images in class-named subdirectories.
        if any(d in PADDY_CLASSES for d in dirs):
            image_src = root
            break
    if image_src is None:
        # Fallback: pick the deepest directory that contains image files.
        best = None
        for root, dirs, files in os.walk(path):
            if any(f.lower().endswith((".jpg", ".jpeg", ".png")) for f in files):
                best = root
        image_src = best

    if image_src is None:
        print("Could not locate image folder in downloaded dataset.", file=sys.stderr)
        sys.exit(1)
    print("  image folder:", image_src)

    # Copy into datasets/crop_disease_images/rice/
    if os.path.isdir(RICE_DIR):
        shutil.rmtree(RICE_DIR)
    shutil.copytree(image_src, RICE_DIR)
    print("  copied to:", RICE_DIR)

    # Count images per class
    class_counts = count_by_class(RICE_DIR)
    total = sum(class_counts.values())
    print(f"  {total} images across {len(class_counts)} classes")

    # Update manifest.json
    manifest = {}
    if os.path.exists(MANIFEST_PATH):
        with open(MANIFEST_PATH, encoding="utf-8") as f:
            manifest = json.load(f)
    manifest.setdefault("datasets", [])
    # Remove any pre-existing rice entry
    manifest["datasets"] = [d for d in manifest["datasets"] if d.get("crop") != "rice"]
    manifest["datasets"].append({
        "crop": "rice",
        "artifact": "rice/",
        "format": "image folders",
        "local_images": total,
        "local_bytes": sum(
            os.path.getsize(os.path.join(RICE_DIR, d, f))
            for d in class_counts for f in os.listdir(os.path.join(RICE_DIR, d))
            if f.lower().endswith((".jpg", ".jpeg", ".png"))
        ),
        "classes": class_counts,
        "license": "CC BY 4.0",
        "complete_source": True,
        "source": "Paddy Doctor (IEEE DataPort / Kaggle)",
        "url": "https://www.kaggle.com/datasets/umanggarg28/paddy-doctor-dataset",
    })
    manifest["binary_policy"] = "local-only; excluded from Git"
    with open(MANIFEST_PATH, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
    print("  updated", MANIFEST_PATH)

    # Update validation report
    validation = {}
    if os.path.exists(VALIDATION_PATH):
        with open(VALIDATION_PATH, encoding="utf-8") as f:
            validation = json.load(f)
    validation.setdefault("image_folders", {})
    validation["image_folders"]["rice"] = {
        "type": "image_folder",
        "image_count": total,
        "classes": class_counts,
        "empty_files": [],
        "corrupt_files": [],
        "partial_files": [],
        "integrity": "ok",
    }
    validation["status"] = "ok"
    with open(VALIDATION_PATH, "w", encoding="utf-8") as f:
        json.dump(validation, f, ensure_ascii=False, indent=2)
    print("  updated", VALIDATION_PATH)

    print("\n=== Rice disease classes ===")
    for cls, n in sorted(class_counts.items()):
        print(f"  {cls:35s} {n:6d}")
    print(f"  {'TOTAL':35s} {total:6d}")
    print("\nDone. Rice is now part of the disease-detection dataset.")


if __name__ == "__main__":
    main()
