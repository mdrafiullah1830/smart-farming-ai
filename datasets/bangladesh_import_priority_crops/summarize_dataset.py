#!/usr/bin/env python3
"""Build an auditable crop-level summary from the processed FAOSTAT extracts."""

import csv
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PROCESSED = ROOT / "processed"


def load(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


def aggregate(rows: list[dict[str, str]], element: str) -> dict[str, dict[int, float]]:
    values: dict[str, dict[int, float]] = defaultdict(lambda: defaultdict(float))
    for row in rows:
        if row["element"] == element:
            values[row["crop_key"]][int(row["year"])] += float(row["value"])
    return values


def main() -> None:
    production_rows = load(PROCESSED / "bangladesh_selected_crops_production_2022_latest.csv")
    import_rows = load(PROCESSED / "bangladesh_selected_crops_imports_2022_latest.csv")
    production = aggregate(production_rows, "Production")
    imports = aggregate(import_rows, "Import quantity")
    import_values = aggregate(import_rows, "Import value")

    records = []
    for crop in sorted(set(production) | set(imports)):
        years = sorted(set(production[crop]) | set(imports[crop]))
        first, latest = min(years), max(years)
        start_prod = production[crop].get(first, 0)
        latest_prod = production[crop].get(latest, 0)
        prod_change = ((latest_prod / start_prod) - 1) * 100 if start_prod else None
        latest_import = imports[crop].get(latest, 0)
        ratio = latest_import / latest_prod if latest_prod else None
        if latest_import >= 50_000 and prod_change is not None and prod_change >= 5:
            assessment = "meets_both"
        elif latest_import >= 50_000:
            assessment = "import_dependent_but_production_trend_mixed"
        else:
            assessment = "production_growth_but_direct_seed_import_is_low"
        records.append({
            "crop_key": crop,
            "first_year": first,
            "latest_year": latest,
            "production_first_t": round(start_prod, 2),
            "production_latest_t": round(latest_prod, 2),
            "production_change_pct": round(prod_change, 2) if prod_change is not None else "",
            "imports_latest_t": round(latest_import, 2),
            "imports_latest_1000_usd": round(import_values[crop].get(latest, 0), 2),
            "latest_import_to_production_ratio": round(ratio, 3) if ratio is not None else "",
            "assessment": assessment,
        })

    output = PROCESSED / "crop_priority_summary_2022_2024.csv"
    with output.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=records[0].keys())
        writer.writeheader()
        writer.writerows(records)


if __name__ == "__main__":
    main()
