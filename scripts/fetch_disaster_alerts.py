"""
Aggregate live disaster alerts from Bangladesh's official sources:

  1. BMD CAP RSS feed  — https://cap.bmd.gov.bd/api/cap/rss.xml
     (Bangladesh Meteorological Department — weather, cyclone, rainfall,
      landslide, maritime-port warnings in CAP format)
  2. FFWC flood page   — https://ffwc.gov.bd (HTML; flood warning bulletins)

Output:
  datasets/disaster/disaster_alerts_latest.csv
  datasets/disaster/disaster_alerts_history.csv

The BMD feed is the primary source. FFWC is scraped as a fallback for
flood-specific bulletins when the CAP feed has no flood item.

Usage:
  python scripts/fetch_disaster_alerts.py            # fetch + save latest + history
  python scripts/fetch_disaster_alerts.py --json     # print latest as JSON
"""
import argparse
import csv
import datetime as dt
import os
import re
import sys
import xml.etree.ElementTree as ET

import requests

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "datasets", "disaster")
os.makedirs(OUT_DIR, exist_ok=True)

BMD_RSS = "https://cap.bmd.gov.bd/api/cap/rss.xml"
FFWC_URL = "https://ffwc.gov.bd"

LATEST_CSV = os.path.join(OUT_DIR, "disaster_alerts_latest.csv")
HISTORY_CSV = os.path.join(OUT_DIR, "disaster_alerts_history.csv")

# Map alert keywords to our canonical disaster types.
TYPE_PATTERNS = [
    ("cyclone",     [r"\bcyclone\b", r"\bcyclonic\s*storm\b", r"\blow\s*pressure\b", r"\bdepression\b"]),
    ("flood",       [r"\bflood\b", r"\binundation\b", r"\bwater\s*logging\b"]),
    ("rain",        [r"\brain\b", r"\bheavy\s*rain\b", r"\brainfall\b"]),
    ("landslide",   [r"\blandslide\b"]),
    ("storm_surge", [r"\bstorm\s*surge\b", r"\bmarine\s*port\b"]),
    ("cold_wave",   [r"\bcold\s*wave\b", r"\bcold\b"]),
    ("heat",        [r"\bheat\b", r"\btemperature\b"]),
]

# Coastal districts that get cyclone / storm-surge warnings.
COASTAL = {"Bhola", "Barisal", "Barguna", "Patuakhali", "Bhola", "Lakshmipur",
           "Noakhali", "Feni", "Chittagong", "Cox's Bazar", "Chandpur",
           "Khulna", "Satkhira", "Bagerhat", "Pirojpur", "Jhalokati",
           "Sylhet", "Sunamganj", "Netrokona", "Kishoreganj"}

# Northern districts that get cold-wave warnings.
NORTHERN = {"Rangpur", "Nilphamari", "Lalmonirhat", "Kurigram", "Gaibandha",
            "Joypurhat", "Bogra", "Naogaon", "Joypurhat", "Dinajpur",
            "Thakurgaon", "Panchagarh", "Mymensingh", "Netrokona"}


def classify(title, desc):
    text = (title + " " + desc).lower()
    for dtype, pats in TYPE_PATTERNS:
        for p in pats:
            if re.search(p, text):
                return dtype
    return "other"


def severity_from_text(title, desc):
    text = (title + " " + desc).lower()
    if any(k in text for k in ["very heavy", "extreme", "extremely", "severe"]):
        return "high"
    if any(k in text for k in ["heavy", "strong", "significant"]):
        return "medium"
    return "low"


def _local(tag):
    return tag.rsplit("}", 1)[-1]


def fetch_bmd_rss():
    """Return list of alert dicts from the BMD CAP RSS feed."""
    r = requests.get(BMD_RSS, timeout=20, headers={"User-Agent": "Mozilla/5.0"})
    r.raise_for_status()
    root = ET.fromstring(r.text)
    items = []
    for el in root.iter():
        if _local(el.tag) != "item":
            continue
        title = "".join(c.text or "" for c in el if _local(c.tag) == "title").strip()
        desc = "".join(c.text or "" for c in el if _local(c.tag) == "description").strip()
        pub = "".join(c.text or "" for c in el if _local(c.tag) == "pubDate").strip()
        link = "".join(c.text or "" for c in el if _local(c.tag) == "link").strip()
        if not title:
            continue
        dtype = classify(title, desc)
        sev = severity_from_text(title, desc)
        districts = re.findall(r"\b([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\b", title)
        items.append({
            "source": "BMD (CAP RSS)",
            "type": dtype,
            "severity": sev,
            "title": title,
            "description": desc,
            "districts": ",".join(dict.fromkeys(districts)),
            "link": link,
            "published": pub,
        })
    return items


def fetch_ffwc_flood():
    """Fallback: scrape FFWC flood bulletins (HTML)."""
    try:
        r = requests.get(FFWC_URL, timeout=20, headers={"User-Agent": "Mozilla/5.0"})
        r.raise_for_status()
    except Exception:
        return []
    text = r.text
    alerts = []
    # FFWC pages list flood warnings like "Flood Warning ..."
    for m in re.finditer(r'([A-Z][A-Za-z ,\-]+?Flood[^<]{0,80})', text):
        title = m.group(1).strip()
        if len(title) > 15:
            alerts.append({
                "source": "FFWC",
                "type": "flood",
                "severity": "medium",
                "title": title,
                "description": "",
                "districts": "",
                "link": FFWC_URL,
                "published": dt.datetime.utcnow().strftime("%a, %d %b %Y %H:%M:%S +0000"),
            })
    return alerts


def main():
    ap = argparse.ArgumentParser(description="Fetch live disaster alerts")
    ap.add_argument("--json", action="store_true", help="print latest as JSON")
    args = ap.parse_args()

    alerts = fetch_bmd_rss() + fetch_ffwc_flood()
    today = dt.date.today().isoformat()

    with open(LATEST_CSV, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["source", "type", "severity", "title", "districts", "published", "link"])
        for a in alerts:
            w.writerow([a["source"], a["type"], a["severity"], a["title"], a["districts"], a["published"], a["link"]])
    print(f"Wrote {LATEST_CSV} ({len(alerts)} alerts)")

    if not args.json:
        write_header = not os.path.exists(HISTORY_CSV) or os.path.getsize(HISTORY_CSV) == 0
        with open(HISTORY_CSV, "a", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            if write_header:
                w.writerow(["source", "type", "severity", "title", "districts", "published", "link", "fetched_at"])
            for a in alerts:
                w.writerow([a["source"], a["type"], a["severity"], a["title"], a["districts"], a["published"], a["link"], today])
        print(f"Appended to {HISTORY_CSV}")

    print("\n=== Active Disaster Alerts ===")
    for a in alerts:
        print(f"  [{a['severity'].upper():5s}] {a['type']:12s} {a['title'][:70]}")

    if args.json:
        import json
        print("\n" + json.dumps(alerts, ensure_ascii=False, indent=2)[:3000])


if __name__ == "__main__":
    main()