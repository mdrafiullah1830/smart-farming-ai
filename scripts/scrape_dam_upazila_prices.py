"""
Scrape upazila (sub-district) level retail prices from DAM.

The DAM "Subdistrict Wise Retail Price" report at
market.dam.gov.bd/subdistrict_retail_price_report returns an HTML table
with per-upazila, per-commodity retail prices. This gives the platform
district-wise AND upazila-wise price granularity, which the current worker
schema (district_id only) does not yet support.

Output:
  datasets/dam_prices/dam_upazila_prices_latest.csv

Usage:
  python scripts/scrape_dam_upazila_prices.py
"""
import csv
import datetime as dt
import os
import re

import requests
from bs4 import BeautifulSoup

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "datasets", "dam_prices")
os.makedirs(OUT_DIR, exist_ok=True)
URL = "https://market.dam.gov.bd/subdistrict_retail_price_report"
OUT_CSV = os.path.join(OUT_DIR, "dam_upazila_prices_latest.csv")


def fetch_report():
    r = requests.get(URL, timeout=30, headers={"User-Agent": "Mozilla/5.0"})
    r.raise_for_status()
    return BeautifulSoup(r.text, "html.parser")


def parse_table(soup):
    """Return list of (upazila, district, commodity, price_min, price_max, unit)."""
    tables = soup.find_all("table")
    rows = []
    for tbl in tables:
        for tr in tbl.find_all("tr"):
            cells = [c.get_text(strip=True) for c in tr.find_all(["td", "th"])]
            if len(cells) < 4:
                continue
            rows.append(cells)
    return rows


def main():
    soup = fetch_report()
    rows = parse_table(soup)
    today = dt.date.today().isoformat()

    with open(OUT_CSV, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["upazila", "district", "commodity", "price_min", "price_max", "unit", "recorded_at"])
        written = 0
        for cells in rows:
            # Heuristic: first cell is upazila, later cells hold commodity + price
            upazila = cells[0]
            if not upazila or upazila.lower() in ("sl.", "no.", "#"):
                continue
            district = cells[1] if len(cells) > 1 else ""
            # Look for "X - Y" numeric price patterns in remaining cells
            prices = []
            commodity_parts = []
            for c in cells[2:]:
                m = re.match(r"^([\d]+(?:\.\d+)?)\s*-\s*([\d]+(?:\.\d+)?)$", c)
                if m:
                    prices.append((float(m.group(1)), float(m.group(2))))
                else:
                    commodity_parts.append(c)
            commodity = " ".join(commodity_parts).strip()
            if prices and commodity:
                lo, hi = prices[0]
                w.writerow([upazila, district, commodity, lo, hi, "kg", today])
                written += 1
    print(f"Wrote {OUT_CSV} ({written} rows)")


if __name__ == "__main__":
    main()