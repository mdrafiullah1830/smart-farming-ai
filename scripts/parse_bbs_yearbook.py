"""
Parse BBS Yearbook of Agricultural Statistics (2022-2025) → structured CSVs.

Source: Bangladesh Bureau of Statistics, "Yearbook of Agricultural Statistics"
Table 2.1.1 "Area, Yield Rate and Production of Crops 2022-23 to 2024-25"

Units in the source:
  Area      : '000 acres  (multiply by 1000 for acres)
  Yield     : kg / acre
  Production: '000 metric tons (multiply by 1000 for metric tons)

Output:
  datasets/bbs_yearbook/processed/bbs_crop_production_YYYY.csv
  datasets/bbs_yearbook/processed/bbs_crop_yield_YYYY.csv
"""
import csv
import os
import re
import sys
import pdfplumber

DOCS_DIR = os.path.join(
    os.path.dirname(__file__), "..",
    "datasets", "bangladesh_import_priority_crops", "docs"
)
OUT_DIR = os.path.join(
    os.path.dirname(__file__), "..",
    "datasets", "bbs_yearbook", "processed"
)
os.makedirs(OUT_DIR, exist_ok=True)

YEARBOOKS = {
    2022: "bbs_agricultural_yearbook_2022.pdf",
    2023: "bbs_agricultural_yearbook_2023.pdf",
    2024: "bbs_agricultural_yearbook_2024.pdf",
    2025: "bbs_agricultural_yearbook_2025.pdf",
}

# Crop keys we care about for yield prediction / market intelligence.
# Each maps to one or more line labels that appear in Table 2.1.1.
CROP_PATTERNS = {
    "rice_total":        [r"^Total Rice\b", r"^Rice\b"],
    "rice_aman":         [r"^Total Aman\b"],
    "rice_boro":         [r"^Total Boro\b"],
    "rice_aus":          [r"^Total Aus\b"],
    "wheat":             [r"^Wheat\b"],
    "maize":             [r"^Maize\b"],
    "jute":              [r"^Jute\b"],
    "potato":            [r"^Total Potato\b"],
    "onion":             [r"^Onion\b"],
    "garlic":            [r"^Garlic\b"],
    "ginger":            [r"^Ginger\b"],
    "chili_total":       [r"^Total Chillies\b"],
    "chili_kharif":      [r"^Chillies, Kharif\b"],
    "chili_rabi":        [r"^Chillies, Rabi\b"],
    "tomato":            [r"^Tomato\b"],
    "mustard":           [r"^Rape & Mustard\b"],
    "lentil_masur":      [r"^Masur\b"],
    "sugarcane":         [r"^Sugar Cane\b"],
    "soybean":           [r"^Soya bean\b"],
    "groundnut":         [r"^Groundnut\b"],
    "coconut":           [r"^Coconut\b"],
    "cotton":            [r"^Cotton\b"],
    "tea":               [r"^Tea\b"],
}

# Table 2.1.1 spans pages 56-60 in the 2025 edition. We scan a generous
# window and rely on the header to anchor the columns.
TABLE_HEADER = "Area '000'"  # first marker of Table 2.1.1 rows


def extract_table_text(pdf_path):
    """Return the concatenated text of pages containing Table 2.1.1.

    Table 2.1.1 always lives in Chapter 2 (Crop Statistics), which is pages
    ~54-61 in every edition. We scan that window only — full-text extraction
    over 684 pages is the bottleneck.
    """
    pages = []
    with pdfplumber.open(pdf_path) as pdf:
        n = len(pdf.pages)
        start = max(0, 52)
        end = min(n, 64)
        for i in range(start, end):
            pg = pdf.pages[i]
            t = pg.extract_text() or ""
            if TABLE_HEADER in t and "Per acre" in t:
                pages.append((i + 1, t))
    return pages


def parse_row(line):
    """
    Parse one numeric row of Table 2.1.1.
    Format per year: Area  Yield  Production
    3 years → 9 numbers.
    """
    nums = re.findall(r"[\d]+(?:\.\d+)?", line)
    return nums


# Plausible yield range (kg/acre) per crop. Values outside this range are
# parsing artifacts from BBS's messy Table 2.1.1 (e.g. a "Total Rice" row
# picking up the wrong column) and are dropped rather than trusted.
PLAUSIBLE_YIELD = {
    "rice_total":      (1000, 2200),
    "rice_aman":       (900, 1600),
    "rice_boro":       (1500, 2000),
    "rice_aus":        (900, 1400),
    "wheat":           (1000, 1800),
    "maize":           (3000, 5000),
    "jute":            (1, 10),       # bales/acre, not kg
    "potato":          (8000, 11000),
    "onion":           (4000, 7000),
    "garlic":          (2500, 4000),
    "ginger":          (2800, 4000),
    "chili_total":     (2500, 4000),
    "chili_kharif":    (2500, 4000),
    "chili_rabi":      (2500, 4000),
    "tomato":          (5500, 8000),
    "mustard":         (400, 700),
    "lentil_masur":    (400, 700),
    "sugarcane":       (15000, 20000),
    "soybean":         (600, 900),
    "groundnut":       (700, 900),
    "coconut":         (5000, 7000),
    "cotton":          (1, 10),
    "tea":             (500, 800),
}


def plausible(key, value):
    lo, hi = PLAUSIBLE_YIELD.get(key, (0, 1e9))
    return lo <= value <= hi


def parse_yearbook(year, pdf_name):
    pdf_path = os.path.join(DOCS_DIR, pdf_name)
    if not os.path.exists(pdf_path):
        print(f"  MISSING: {pdf_path}")
        return {}, {}
    pages = extract_table_text(pdf_path)
    if not pages:
        print(f"  {year}: Table 2.1.1 not found")
        return {}, {}

    production = {}   # crop -> {year: metric_tons}
    yield_rate = {}   # crop -> {year: kg_per_acre}

    for pno, text in pages:
        lines = text.splitlines()
        for idx, line in enumerate(lines):
            label = line.strip()
            # Skip header / sub-header lines
            if not label or TABLE_HEADER in label or label.startswith("Crop"):
                continue
            # Must start with a crop name (letters) then numbers
            m = re.match(r"^([A-Za-z][A-Za-z &'\-\.]+?)\s+([\d\.])", label)
            if not m:
                continue
            crop_label = m.group(1).strip()
            nums = parse_row(line)
            if len(nums) < 9:
                continue
            try:
                vals = [float(n) for n in nums[:9]]
            except ValueError:
                continue
            # 9 numbers: [A1,Y1,P1, A2,Y2,P2, A3,Y3,P3]
            prod = [vals[2], vals[5], vals[8]]
            yld = [vals[1], vals[4], vals[7]]
            # The latest year in this edition is the edition year
            # (2025 edition covers 2022-23, 2023-24, 2024-25)
            years = [year - 3, year - 2, year - 1]
            for key, patterns in CROP_PATTERNS.items():
                for pat in patterns:
                    if re.match(pat, crop_label):
                        production.setdefault(key, {})
                        yield_rate.setdefault(key, {})
                        for y, p, yy in zip(years, prod, yld):
                            if not plausible(key, yy):
                                # Parsing artifact from BBS's messy table layout
                                continue
                            production[key][y] = p * 1000.0   # '000 MT -> MT
                            yield_rate[key][y] = yy
                        break
                else:
                    continue
                break
    return production, yield_rate


def main():
    all_prod, all_yield = {}, {}
    for year, pdf_name in YEARBOOKS.items():
        print(f"Parsing BBS {year} ({pdf_name}) ...", flush=True)
        prod, yld = parse_yearbook(year, pdf_name)
        print(f"  -> {len(prod)} crops, {len(yld)} yield rows", flush=True)
        for k, v in prod.items():
            all_prod.setdefault(k, {}).update(v)
        for k, v in yld.items():
            all_yield.setdefault(k, {}).update(v)

    # Write production CSV
    prod_path = os.path.join(OUT_DIR, "bbs_crop_production.csv")
    with open(prod_path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["crop", "year", "area_acres", "yield_kg_per_acre", "production_metric_tons"])
        for crop in sorted(all_prod):
            for year in sorted(all_prod[crop]):
                w.writerow([crop, year, "", "", round(all_prod[crop][year], 1)])
    print(f"\nWrote {prod_path} ({len(all_prod)} crops)")

    # Write yield CSV
    yld_path = os.path.join(OUT_DIR, "bbs_crop_yield.csv")
    with open(yld_path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["crop", "year", "yield_kg_per_acre", "source"])
        for crop in sorted(all_yield):
            for year in sorted(all_yield[crop]):
                w.writerow([crop, year, round(all_yield[crop][year], 2), "BBS Yearbook"])
    print(f"Wrote {yld_path} ({len(all_yield)} crops)")

    # Summary
    print("\n=== YIELD (kg/acre) by crop ===")
    for crop in sorted(all_yield):
        row = "  ".join(f"{y}:{all_yield[crop][y]:.0f}" for y in sorted(all_yield[crop]))
        print(f"  {crop:20s} {row}")


if __name__ == "__main__":
    main()