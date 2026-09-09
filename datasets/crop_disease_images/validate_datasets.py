#!/usr/bin/env python3
"""Validate locally collected crop-disease archives, Parquet files and images."""

from __future__ import annotations

import hashlib
import json
import zipfile
from collections import Counter
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent
IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp"}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def validate_zip(path: Path) -> dict:
    with zipfile.ZipFile(path) as archive:
        bad_member = archive.testzip()
        images = [
            item for item in archive.infolist()
            if not item.is_dir() and Path(item.filename).suffix.casefold() in IMAGE_SUFFIXES
        ]
        classes = Counter(Path(item.filename).parent.name for item in images)
    return {
        "type": "zip",
        "bytes": path.stat().st_size,
        "sha256": sha256(path),
        "image_count": len(images),
        "classes": dict(sorted(classes.items())),
        "integrity": "ok" if bad_member is None else f"bad member: {bad_member}",
    }


def validate_parquet(path: Path) -> dict:
    with path.open("rb") as handle:
        header = handle.read(4)
        handle.seek(-4, 2)
        footer = handle.read(4)
    valid = header == b"PAR1" and footer == b"PAR1" and path.stat().st_size > 8
    return {
        "type": "parquet",
        "bytes": path.stat().st_size,
        "sha256": sha256(path),
        "integrity": "ok" if valid else "invalid Parquet magic bytes",
    }


def validate_image_folders(crop_dir: Path) -> dict:
    images = sorted(
        path for path in (crop_dir / "images").rglob("*")
        if path.is_file() and path.suffix.casefold() in IMAGE_SUFFIXES
    )
    empty = [str(path.relative_to(ROOT)) for path in images if path.stat().st_size == 0]
    corrupt = []
    for path in images:
        if path.stat().st_size == 0:
            continue
        try:
            with Image.open(path) as image:
                image.verify()
        except Exception as exc:  # validation must report decoder failures
            corrupt.append({"path": str(path.relative_to(ROOT)), "error": str(exc)})
    classes = Counter(path.parent.name for path in images if path.stat().st_size > 0)
    partials = [str(path.relative_to(ROOT)) for path in crop_dir.rglob("*.part")]
    return {
        "type": "image_folder",
        "bytes": sum(path.stat().st_size for path in images),
        "image_count": len(images),
        "classes": dict(sorted(classes.items())),
        "empty_files": empty,
        "corrupt_files": corrupt,
        "partial_files": partials,
        "integrity": "ok" if not empty and not corrupt and not partials else "failed",
    }


def main() -> None:
    report = {"root": str(ROOT), "files": {}, "image_folders": {}}
    for path in sorted(ROOT.rglob("*")):
        if not path.is_file():
            continue
        relative = str(path.relative_to(ROOT))
        if path.suffix.casefold() == ".zip":
            report["files"][relative] = validate_zip(path)
        elif path.suffix.casefold() == ".parquet":
            report["files"][relative] = validate_parquet(path)
    for crop_dir in sorted(path for path in ROOT.iterdir() if path.is_dir()):
        if (crop_dir / "images").is_dir():
            report["image_folders"][crop_dir.name] = validate_image_folders(crop_dir)
    report["status"] = "ok" if all(
        item["integrity"] == "ok"
        for group in (report["files"], report["image_folders"])
        for item in group.values()
    ) else "failed"
    output = ROOT / "validation_report.json"
    output.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
