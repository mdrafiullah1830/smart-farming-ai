"""Soil survey import: `frontend/soil_data.json` to Cloudflare D1 `soil_features`.

Why a script instead of a migration
    `soil_data.json` is regenerated from the BARC/LRTI Excel workbooks by
    `frontend/scripts/parse_soil_data.py`; embedding ~11.7k feature rows in a
    numbered SQL migration would mean re-cutting the migration on every
    re-parse. This script is idempotent: it deletes its own previous rows
    (tagged `source = 'BARC-LRTI'`) before inserting, and records a content
    hash in `dataset_imports`, so re-running it is safe and auditable.

    District names are normalised to the canonical spellings used by the
    `districts` table (migration 0002) so `/api/v1/soil/features/:district/...`
    and the nearest-location route join cleanly. Any district that still does
    not match is reported as a warning rather than dropped.

Usage
    python3 scripts/import_soil_to_d1.py --dry-run
    python3 scripts/import_soil_to_d1.py --emit-sql > /tmp/soil_import.sql
    npx wrangler d1 execute smart-farming-db --remote --file=/tmp/soil_import.sql

The script never talks to D1 directly: it emits SQL, and wrangler applies it.
That keeps credentials out of the Python process and makes the operation
reviewable before it touches production.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
SOIL_JSON = REPO_ROOT / "frontend" / "soil_data.json"
DISTRICTS_MIGRATION = REPO_ROOT / "apps" / "worker-api" / "migrations" / "0002_seed_districts.sql"

SOURCE = "BARC-LRTI"

# soil_data.json keys that use an older/variant spelling of the district name
# found in the `districts` table. Keys are the UPPER_CASE names as they appear
# in the parsed JSON; values are the canonical names from migration 0002.
DISTRICT_ALIASES = {
    "JHALAKATI": "Jhalokati",
    "KHAGRACHHARI": "Khagrachari",
    "MOULVI BAZAR": "Moulvibazar",
    "NATOR": "Natore",
    "NAWABGANJ": "Chapainawabganj",
    "SARIATPUR": "Shariatpur",
}


def sql_str(value: object) -> str:
    """Quote a value for SQLite. None/empty becomes NULL."""
    if value is None:
        return "NULL"
    text = str(value).strip()
    if text == "":
        return "NULL"
    return "'" + text.replace("'", "''") + "'"


def sql_num(value: object) -> str:
    """Return a numeric literal or NULL. Non-numeric input is a data error."""
    if value is None or str(value).strip() == "":
        return "NULL"
    number = float(value)
    if number != number or number in (float("inf"), float("-inf")):
        raise ValueError(f"non-finite number: {value!r}")
    return repr(int(number)) if number.is_integer() else repr(number)


def title_case(name: str) -> str:
    """BAGERHAT -> Bagerhat, COX'S BAZAR -> Cox's Bazar."""
    return " ".join(word.capitalize() for word in name.split())


def canonical_district(name: str) -> str:
    upper = " ".join(name.split()).upper()
    return DISTRICT_ALIASES.get(upper, title_case(upper))


def canonical_district_names() -> set[str]:
    """District names as seeded by migration 0002 (the `districts` table)."""
    if not DISTRICTS_MIGRATION.exists():
        return set()
    sql = DISTRICTS_MIGRATION.read_text(encoding="utf-8")
    names = set()
    for match in re.finditer(r"^\('?\d+'?,'((?:[^']|'')*)','[^']*','[^']*',", sql, re.MULTILINE):
        names.add(match.group(1).replace("''", "'"))
    return names


def content_hash(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()[:16]


def build_statements(payload: dict) -> tuple[list[str], dict[str, int]]:
    """Turn soil_data.json into DELETE + INSERT statements for soil_features."""
    statements = ["DELETE FROM soil_features WHERE source = " + sql_str(SOURCE) + ";"]
    counts = {"districts": 0, "upazilas": 0, "rows": 0}

    districts = payload.get("districts") or {}
    known = canonical_district_names()

    for raw_district, info in districts.items():
        district = canonical_district(raw_district)
        if known and district not in known:
            print(
                f"warning: district {raw_district!r} -> {district!r} not in the districts table",
                file=sys.stderr,
            )
        counts["districts"] += 1
        for raw_upazila, upazila_info in (info.get("upazilas") or {}).items():
            upazila = title_case(str(raw_upazila))
            counts["upazilas"] += 1
            for feature, values in (upazila_info.get("features") or {}).items():
                if not isinstance(values, list):
                    values = [values]
                for entry in values:
                    if isinstance(entry, dict):
                        value = entry.get("value")
                        area = entry.get("area_ha")
                    else:
                        value, area = entry, None
                    if value is None or str(value).strip() == "":
                        continue
                    statements.append(
                        "INSERT INTO soil_features "
                        "(district_name, upazila_name, feature_name, feature_value, area_ha, source) VALUES ("
                        f"{sql_str(district)}, {sql_str(upazila)}, {sql_str(feature)}, "
                        f"{sql_str(value)}, {sql_num(area)}, {sql_str(SOURCE)});"
                    )
                    counts["rows"] += 1
    return statements, counts


def main() -> int:
    parser = argparse.ArgumentParser(description="Emit D1 SQL for the BARC soil survey.")
    parser.add_argument("--emit-sql", action="store_true", help="print SQL to stdout")
    parser.add_argument("--dry-run", action="store_true", help="report only, print nothing")
    args = parser.parse_args()

    if not args.emit_sql and not args.dry_run:
        parser.error("choose --emit-sql or --dry-run")

    if not SOIL_JSON.exists():
        print(f"missing {SOIL_JSON.relative_to(REPO_ROOT)}", file=sys.stderr)
        return 1

    try:
        payload = json.loads(SOIL_JSON.read_text(encoding="utf-8"))
        statements, counts = build_statements(payload)
    except (OSError, ValueError, KeyError, TypeError) as exc:
        print(f"{type(exc).__name__}: {exc}", file=sys.stderr)
        return 1

    digest = content_hash(SOIL_JSON)
    statements.append(
        "INSERT OR REPLACE INTO dataset_imports (dataset, source_file, content_hash, row_count, imported_at) VALUES ("
        f"{sql_str('soil_features')}, {sql_str('frontend/soil_data.json')}, "
        f"{sql_str(digest)}, {counts['rows']}, CURRENT_TIMESTAMP);"
    )

    relative = SOIL_JSON.relative_to(REPO_ROOT)
    print(
        f"{'soil_features':24s} {counts['rows']:6d} rows  "
        f"({counts['districts']} districts, {counts['upazilas']} upazilas)  sha256:{digest}",
        file=sys.stderr,
    )

    if args.emit_sql:
        print("\n".join(statements))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
