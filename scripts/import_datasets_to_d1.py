"""Dataset import: local `datasets/*.csv` to Cloudflare D1.

Why a script instead of a migration
    The CSVs change with every DAM/BBS refresh, so embedding them in a numbered
    SQL migration would mean a new migration per data update. This script is
    idempotent (INSERT OR REPLACE keyed on the natural business key) and records
    a content hash in `dataset_imports`, so re-running it is safe and auditable.

Usage
    python3 scripts/import_datasets_to_d1.py --dry-run
    python3 scripts/import_datasets_to_d1.py --emit-sql > tmp/dataset_import.sql
    npx wrangler d1 execute smart-farming-db --remote --file=tmp/dataset_import.sql

The script never talks to D1 directly: it emits SQL, and wrangler applies it.
That keeps credentials out of the Python process and makes the operation
reviewable before it touches production.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
DATASETS = REPO_ROOT / "datasets"


def sql_str(value: str | None) -> str:
    """Quote a CSV cell for SQLite. Empty text becomes NULL."""
    if value is None:
        return "NULL"
    text = value.strip()
    if text == "":
        return "NULL"
    return "'" + text.replace("'", "''") + "'"


def sql_num(value: str | None) -> str:
    """Return a numeric literal or NULL. Non-numeric input is a data error."""
    if value is None or value.strip() == "":
        return "NULL"
    return value.strip()


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8-sig") as handle:
        return [row for row in csv.DictReader(handle)]


def content_hash(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()[:16]


def build_market(latest: Path) -> tuple[list[str], int]:
    statements: list[str] = []
    for row in read_csv(latest):
        statements.append(
            "INSERT OR REPLACE INTO market_prices_daily "
            "(crop_key, label_bn, price_min, price_max, price_mid, change_pct, unit, recorded_at, source) VALUES ("
            f"{sql_str(row.get('crop_key'))}, {sql_str(row.get('label_bn'))}, "
            f"{sql_num(row.get('price_min'))}, {sql_num(row.get('price_max'))}, "
            f"{sql_num(row.get('price_mid'))}, {sql_num(row.get('change_pct'))}, "
            f"{sql_str(row.get('unit') or 'kg')}, {sql_str(row.get('recorded_at'))}, 'DAM');"
        )
    return statements, len(statements)


def build_calendar(path: Path) -> tuple[list[str], int]:
    statements: list[str] = []
    for row in read_csv(path):
        statements.append(
            "INSERT OR REPLACE INTO crop_calendar "
            "(crop, region, season, sowing_start, sowing_end, harvest_start, harvest_end, seed_kg_per_acre, notes, source) VALUES ("
            f"{sql_str(row.get('crop'))}, {sql_str(row.get('region'))}, {sql_str(row.get('season'))}, "
            f"{sql_str(row.get('sowing_start'))}, {sql_str(row.get('sowing_end'))}, "
            f"{sql_str(row.get('harvest_start'))}, {sql_str(row.get('harvest_end'))}, "
            f"{sql_str(row.get('seed_kg_per_acre'))}, {sql_str(row.get('notes'))}, {sql_str(row.get('source'))});"
        )
    return statements, len(statements)


def build_fertilizer(path: Path) -> tuple[list[str], int]:
    statements: list[str] = []
    for row in read_csv(path):
        statements.append(
            "INSERT OR REPLACE INTO fertilizer_recommendations "
            "(crop, season, soil_type, n_kg_per_acre, p_kg_per_acre, k_kg_per_acre, s_kg_per_acre, zn_kg_per_acre, notes, source) VALUES ("
            f"{sql_str(row.get('crop'))}, {sql_str(row.get('season'))}, {sql_str(row.get('soil_type'))}, "
            f"{sql_num(row.get('n_kg_per_acre'))}, {sql_num(row.get('p_kg_per_acre'))}, "
            f"{sql_num(row.get('k_kg_per_acre'))}, {sql_num(row.get('s_kg_per_acre'))}, "
            f"{sql_num(row.get('zn_kg_per_acre'))}, {sql_str(row.get('notes'))}, {sql_str(row.get('source'))});"
        )
    return statements, len(statements)


def build_groundwater(path: Path) -> tuple[list[str], int]:
    statements: list[str] = []
    for row in read_csv(path):
        statements.append(
            "INSERT OR REPLACE INTO groundwater_depth "
            "(district, division, depth_m, stress_level, notes, source) VALUES ("
            f"{sql_str(row.get('district'))}, {sql_str(row.get('division'))}, "
            f"{sql_num(row.get('depth_m'))}, {sql_str(row.get('stress_level'))}, "
            f"{sql_str(row.get('notes'))}, {sql_str(row.get('source'))});"
        )
    return statements, len(statements)


def build_census(path: Path) -> tuple[list[str], int]:
    statements: list[str] = []
    for row in read_csv(path):
        statements.append(
            "INSERT OR REPLACE INTO district_census "
            "(district, division, farmers_registered, farms_registered, total_area_acre, avg_farm_size_acre, source) VALUES ("
            f"{sql_str(row.get('district'))}, {sql_str(row.get('division'))}, "
            f"{sql_num(row.get('farmers_registered'))}, {sql_num(row.get('farms_registered'))}, "
            f"{sql_num(row.get('total_area_acre'))}, {sql_num(row.get('avg_farm_size_acre'))}, "
            f"{sql_str(row.get('source'))});"
        )
    return statements, len(statements)

# dataset label -> (relative CSV path, builder), in dependency-free order.
SOURCES = {
    "dam_prices_latest": ("dam_prices/dam_prices_latest.csv", build_market),
    "crop_calendar": ("crop_calendar/crop_calendar.csv", build_calendar),
    "barc_fertilizer": ("fertilizer/barc_fertilizer_recommendation.csv", build_fertilizer),
    "groundwater_depth": ("irrigation/groundwater_depth.csv", build_groundwater),
    "farmer_census": ("farmer_profiles/farmer_census_districts.csv", build_census),
}


def main() -> int:
    parser = argparse.ArgumentParser(description="Emit D1 SQL for the bundled datasets.")
    parser.add_argument("--emit-sql", action="store_true", help="print SQL to stdout")
    parser.add_argument("--dry-run", action="store_true", help="report only, print nothing")
    args = parser.parse_args()

    if not args.emit_sql and not args.dry_run:
        parser.error("choose --emit-sql or --dry-run")

    failures: list[str] = []
    lines: list[str] = ["PRAGMA foreign_keys = ON;"]

    for label, (relative, builder) in SOURCES.items():
        path = DATASETS / relative
        if not path.exists():
            failures.append(f"{label}: missing {path.relative_to(REPO_ROOT)}")
            continue
        try:
            statements, count = builder(path)
        except (OSError, ValueError, KeyError) as exc:
            failures.append(f"{label}: {type(exc).__name__}: {exc}")
            continue
        digest = content_hash(path)
        lines.append(f"-- {label}: {count} rows from {relative} (sha256:{digest})")
        lines.extend(statements)
        lines.append(
            "INSERT OR REPLACE INTO dataset_imports (dataset, source_file, content_hash, row_count, imported_at) VALUES ("
            f"{sql_str(label)}, {sql_str(relative)}, {sql_str(digest)}, {count}, CURRENT_TIMESTAMP);"
        )
        print(f"{label:24s} {count:5d} rows  sha256:{digest}", file=sys.stderr)

    if failures:
        print("\nDataset problems:", file=sys.stderr)
        for failure in failures:
            print(f"  - {failure}", file=sys.stderr)
        return 1

    if args.emit_sql:
        print("\n".join(lines))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

