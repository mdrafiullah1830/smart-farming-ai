#!/usr/bin/env python3
"""Create Bangladesh crop import/production extracts from FAOSTAT bulk archives."""

from __future__ import annotations

import csv
import hashlib
import json
import zipfile
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent
RAW = ROOT / "raw"
OUT = ROOT / "processed"

CROPS = {
    "wheat": ("wheat",),
    "maize": ("maize (corn)",),
    "onion": (
        "onions and shallots; dry (excluding dehydrated)",
        "onions and shallots, dry (excluding dehydrated)",
    ),
    "garlic": ("green garlic",),
    "ginger": ("ginger; raw", "ginger, raw"),
    "lentil": ("lentils; dry", "lentils, dry"),
    "mustard_rapeseed": ("rape or colza seed", "mustard seed"),
    "soybean": ("soya beans",),
}


def match_crop(item: str) -> str | None:
    normalized = item.casefold()
    for crop, names in CROPS.items():
        if normalized in names:
            return crop
    return None


def archive_csv(zip_path: Path, prefix: str):
    archive = zipfile.ZipFile(zip_path)
    member = next(
        name for name in archive.namelist()
        if name.startswith(prefix) and "All_Data_(Normalized)" in name and name.endswith(".csv")
    )
    return archive, archive.open(member)


def extract(zip_name: str, prefix: str, output_name: str, allowed_elements: set[str]) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    archive, binary = archive_csv(RAW / zip_name, prefix)
    with archive, binary:
        text = (line.decode("utf-8-sig") for line in binary)
        for row in csv.DictReader(text):
            if row["Area"] != "Bangladesh" or int(row["Year"]) < 2022:
                continue
            crop = match_crop(row["Item"])
            if crop is None or row["Element"] not in allowed_elements:
                continue
            rows.append({
                "crop_key": crop,
                "area": row["Area"],
                "item": row["Item"],
                "element": row["Element"],
                "year": row["Year"],
                "unit": row["Unit"],
                "value": row["Value"],
                "flag": row["Flag"],
                "note": row["Note"],
            })
    rows.sort(key=lambda r: (r["crop_key"], r["item"], r["element"], int(r["year"])))
    OUT.mkdir(parents=True, exist_ok=True)
    with (OUT / output_name).open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=rows[0].keys())
        writer.writeheader()
        writer.writerows(rows)
    return rows


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> None:
    production = extract(
        "faostat_production_crops_livestock_normalized.zip",
        "Production_Crops_Livestock",
        "bangladesh_selected_crops_production_2022_latest.csv",
        {"Area harvested", "Yield", "Production"},
    )
    trade = extract(
        "faostat_trade_crops_livestock_normalized.zip",
        "Trade_CropsLivestock",
        "bangladesh_selected_crops_imports_2022_latest.csv",
        {"Import quantity", "Import value"},
    )

    summary: dict[str, dict[str, object]] = defaultdict(dict)
    for crop in CROPS:
        crop_prod = [r for r in production if r["crop_key"] == crop and r["element"] == "Production"]
        crop_imports = [r for r in trade if r["crop_key"] == crop and r["element"] == "Import quantity"]
        summary[crop] = {
            "production_years": sorted({int(r["year"]) for r in crop_prod}),
            "import_years": sorted({int(r["year"]) for r in crop_imports}),
            "production_rows": len(crop_prod),
            "import_rows": len(crop_imports),
        }

    manifest = {
        "generated_at_timezone": "Asia/Dhaka",
        "selection_period": "2022 to latest available FAOSTAT year",
        "selected_crops": list(CROPS),
        "source_archives": [
            {
                "file": "raw/faostat_production_crops_livestock_normalized.zip",
                "url": "https://bulks-faostat.fao.org/production/Production_Crops_Livestock_E_All_Data_(Normalized).zip",
                "sha256": sha256(RAW / "faostat_production_crops_livestock_normalized.zip"),
            },
            {
                "file": "raw/faostat_trade_crops_livestock_normalized.zip",
                "url": "https://bulks-faostat.fao.org/production/Trade_CropsLivestock_E_All_Data_(Normalized).zip",
                "sha256": sha256(RAW / "faostat_trade_crops_livestock_normalized.zip"),
            },
        ],
        "coverage": summary,
    }
    (ROOT / "dataset_manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
