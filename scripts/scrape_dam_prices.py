"""
Scrape live daily market prices from the Department of Agricultural Marketing
(DAM), Bangladesh — market.dam.gov.bd.

The homepage serves a scrolling marquee of current wholesale prices written in
Bengali numerals (e.g. "৭২.০০ - ৭৫.০০"). We extract, convert to Arabic
numerals, and map to canonical crop keys used throughout the platform.

Output:
  datasets/dam_prices/dam_prices_latest.csv     (latest snapshot)
  datasets/dam_prices/dam_prices_history.csv    (appended daily snapshots)

Usage:
  python scripts/scrape_dam_prices.py            # append today's snapshot
  python scripts/scrape_dam_prices.py --latest   # print latest only
"""
import argparse
import csv
import datetime as dt
import os
import re

import requests

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "datasets", "dam_prices")
os.makedirs(OUT_DIR, exist_ok=True)

BN_DIGITS = str.maketrans("০১২৩৪৫৬৭৮৯", "0123456789")
LATEST_CSV = os.path.join(OUT_DIR, "dam_prices_latest.csv")
HISTORY_CSV = os.path.join(OUT_DIR, "dam_prices_history.csv")

# Canonical crop key -> list of marquee labels (Bengali) that map to it.
# DAM's marquee is a fixed list of ~25 commodities; we map the ones we care
# about and record the rest as-is.
CROP_MAP = {
    "rice_aman_fine":     [r"আমন চাল\s*-\s*সরু"],
    "rice_aman_medium":   [r"আমন চাল\s*-\s*মাঝারি"],
    "rice_aman_coarse":   [r"আমন চাল\s*-\s*মোটা"],
    "rice_boro_fine":     [r"বোরো চাল\s*-\s*সরু"],
    "rice_boro_medium":   [r"বোরো চাল\s*-\s*মাঝারি"],
    "rice_boro_coarse":   [r"বোরো চাল\s*-\s*মোটা"],
    "onion_local":        [r"পেঁয়াজ\s*-\s*দেশী"],
    "garlic_local":       [r"রসুন\s*-\s*দেশী"],
    "garlic_imported":    [r"রসুন\s*-\s*আমদানিকৃত"],
    "chili_green":        [r"কাঁচা মরিচ"],
    "ginger_local":       [r"আদা\s*-\s*দেশী"],
    "ginger_imported":    [r"আদা\s*-\s*আমদানিকৃত"],
    "mung":               [r"মুগ"],
    "soybean":            [r"সয়াবিন"],
    "sugar_local":        [r"চিনি\s*-\s*দেশী"],
    "salt_iodized":       [r"আয়োডিনযুক্ত লবণ"],
}


def fetch_marquee(lang="bn"):
    """Return the raw marquee HTML from market.dam.gov.bd."""
    url = "https://market.dam.gov.bd/"
    if lang == "en":
        url += "?L=E"
    r = requests.get(url, timeout=30, headers={"User-Agent": "Mozilla/5.0"})
    r.raise_for_status()
    m = re.search(r'<div[^>]*id="marqueecontent"[^>]*>(.*?)</div>', r.text, re.I | re.S)
    if not m:
        raise RuntimeError("marqueecontent div not found on DAM homepage")
    return m.group(1)


def parse_prices(marquee_html):
    """
    Parse "<label>: ৭২.০০ - ৭৫.০০ ▲০.০০%" blocks into
    {crop_key: (price_min, price_max, unit, change_pct)}.
    """
    # Each stockbox: <span ...><a href="#label">label</a>:&nbsp;MIN - MAX <span...>▲X%</span></span>
    # The arrow is an HTML entity (&#x25B2; = ▲, &#x25BC; = ▼) followed by digits.
    blocks = re.findall(
        r'<span class="stockbox"><a href="#([^"]+)"[^>]*>(.*?)</a>:&nbsp;([\d০-৯.]+)\s*-\s*([\d০-৯.]+).*?(?:&#x25B2;|&#x25BC;)?\s*([\d০-৯.]+)%</span>',
        marquee_html, re.S,
    )
    rows = []
    for href, label, lo, hi, chg in blocks:
        lo_f = float(lo.translate(BN_DIGITS))
        hi_f = float(hi.translate(BN_DIGITS))
        chg_f = float(chg.translate(BN_DIGITS))
        # Detect down arrow (▼ = &#x25BC;) to negate the change
        sample = marquee_html[marquee_html.find(label):marquee_html.find(label) + 400]
        if "&#x25BC;" in sample:
            chg_f = -chg_f
        rows.append((label.strip(), lo_f, hi_f, chg_f))
    return rows


def map_rows(rows):
    """Map parsed rows to canonical crop keys; keep raw for unmapped."""
    out = {}
    for label, lo, hi, chg in rows:
        key = None
        for ck, pats in CROP_MAP.items():
            for p in pats:
                if re.search(p, label):
                    key = ck
                    break
            if key:
                break
        out[key or label] = {
            "label_bn": label,
            "price_min": lo,
            "price_max": hi,
            "price_mid": round((lo + hi) / 2, 2),
            "change_pct": chg,
            "unit": "kg",
        }
    return out


def main():
    ap = argparse.ArgumentParser(description="Scrape DAM daily market prices")
    ap.add_argument("--lang", default="bn", choices=["bn", "en"])
    ap.add_argument("--latest", action="store_true", help="print latest only, no history")
    args = ap.parse_args()

    marquee = fetch_marquee(args.lang)
    rows = parse_prices(marquee)
    mapped = map_rows(rows)
    today = dt.date.today().isoformat()

    # Write latest snapshot
    with open(LATEST_CSV, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["crop_key", "label_bn", "price_min", "price_max", "price_mid", "change_pct", "unit", "recorded_at"])
        for k, v in sorted(mapped.items()):
            w.writerow([k, v["label_bn"], v["price_min"], v["price_max"], v["price_mid"], v["change_pct"], v["unit"], today])
    print(f"Wrote {LATEST_CSV} ({len(mapped)} commodities)")

    if not args.latest:
        # Append to history
        write_header = not os.path.exists(HISTORY_CSV) or os.path.getsize(HISTORY_CSV) == 0
        with open(HISTORY_CSV, "a", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            if write_header:
                w.writerow(["crop_key", "price_min", "price_max", "price_mid", "change_pct", "recorded_at"])
            for k, v in sorted(mapped.items()):
                w.writerow([k, v["price_min"], v["price_max"], v["price_mid"], v["change_pct"], today])
        print(f"Appended to {HISTORY_CSV}")

    # Print summary
    print("\n=== DAM Daily Prices (BDT/kg) ===")
    for k, v in sorted(mapped.items()):
        arrow = "▲" if v["change_pct"] >= 0 else "▼"
        print(f"  {k:22s} {v['price_min']:7.2f} - {v['price_max']:7.2f}  {arrow}{abs(v['change_pct']):.2f}%  ({v['label_bn']})")


if __name__ == "__main__":
    main()
