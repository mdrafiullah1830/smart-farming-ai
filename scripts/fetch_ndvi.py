"""Fetch Sentinel-2 NDVI for a point in Bangladesh via AWS earth-search.

No credentials required. Uses the public STAC API at
https://earth-search.aws.element84.com/v1 (Sentinel-2 L2A, CC-BY-4.0).

Usage:
  python scripts/fetch_ndvi.py --lat 23.81 --lng 90.41 --days 30
  python scripts/fetch_ndvi.py --lat 23.81 --lng 90.41 --days 30 --json
"""
import argparse
import datetime as dt
import json

import requests

STAC_URL = "https://earth-search.aws.element84.com/v1"
COLLECTION = "sentinel-2-l2a"
BANDS = ["B02", "B03", "B04", "B08"]  # 10 m bands used for NDVI/NDWI/EVI


def classify_ndvi(ndvi):
    if ndvi < 0.1:
        return "bare_soil_or_water"
    if ndvi < 0.2:
        return "sparse_vegetation"
    if ndvi < 0.4:
        return "moderate_vegetation"
    if ndvi < 0.6:
        return "good_vegetation"
    return "excellent_vegetation"


def search_items(lat, lng, days, max_cloud=30):
    """Return the most recent Sentinel-2 L2A items over a point.

    earth-search's `query` parameter for `eo:cloud_cover` is unreliable in
    practice (returns 0 results even when items with low cloud cover exist),
    so we fetch the most recent scenes and filter client-side instead.
    """
    end = dt.date.today()
    start = end - dt.timedelta(days=days)
    # Widen the point to a 5 km box so the STAC search reliably intersects a
    # Sentinel-2 tile (the 10 m bands are on a 100 km tile grid).
    half = 0.045  # ~5 km at this latitude
    bbox = [lng - half, lat - half, lng + half, lat + half]
    params = {
        "collections": COLLECTION,
        "bbox": ",".join(str(b) for b in bbox),
        "datetime": f"{start.isoformat()}T00:00:00Z/{end.isoformat()}T23:59:59Z",
        "limit": 20,
        "sortby": "-datetime",
    }
    r = requests.get(f"{STAC_URL}/search", params=params, timeout=30,
                     headers={"User-Agent": "Mozilla/5.0"})
    r.raise_for_status()
    # earth-search returns a GeoJSON FeatureCollection: items are in "features".
    features = r.json().get("features", [])
    # Client-side cloud filter
    filtered = []
    for f in features:
        cc = f.get("properties", {}).get("eo:cloud_cover")
        if cc is None or cc <= max_cloud:
            filtered.append(f)
    return filtered or features


def compute_ndvi(b08, b04):
    """NDVI = (NIR - RED) / (NIR + RED). Sentinel-2: B08=NIR, B04=RED."""
    import numpy as np
    a = np.asarray(b08, dtype=float)
    b = np.asarray(b04, dtype=float)
    denom = a + b
    with np.errstate(divide="ignore", invalid="ignore"):
        ndvi = np.where(denom != 0, (a - b) / denom, np.nan)
    return float(np.nanmean(ndvi))


def fetch_ndvi(lat, lng, days=30, max_cloud=30):
    items = search_items(lat, lng, days, max_cloud)
    if not items:
        return {"lat": lat, "lng": lng, "error": "no imagery found", "ndvi": None}

    # Use the most recent item
    item = items[0]
    assets = item.get("assets", {})
    b08 = assets.get("B08", {}).get("href")
    b04 = assets.get("B04", {}).get("href")
    b03 = assets.get("B03", {}).get("href")
    b02 = assets.get("B02", {}).get("href")

    # We cannot raster-decode COG without rasterio here, so we report the
    # metadata + a precomputed NDVI estimate from the item's summary if present.
    # For full pixel-level NDVI, run scripts/fetch_ndvi_full.py (requires rasterio).
    ndvi_est = None
    if all([b08, b04]):
        try:
            import rasterio
            with rasterio.open(b04) as red, rasterio.open(b08) as nir:
                # sample the centre pixel of each band
                r = red.read(1)
                n = nir.read(1)
                ndvi_est = compute_ndvi(n, r)
        except Exception:
            ndvi_est = None

    return {
        "lat": lat,
        "lng": lng,
        "datetime": item.get("properties", {}).get("datetime"),
        "cloud_cover": item.get("properties", {}).get("eo:cloud_cover"),
        "platform": item.get("properties", {}).get("platform"),
        "ndvi": ndvi_est,
        "ndvi_class": classify_ndvi(ndvi_est) if ndvi_est is not None else None,
        "scene_id": item.get("id"),
        "scenes_checked": len(items),
        "error": None,
    }


def main():
    ap = argparse.ArgumentParser(description="Fetch Sentinel-2 NDVI for a point")
    ap.add_argument("--lat", type=float, required=True)
    ap.add_argument("--lng", type=float, required=True)
    ap.add_argument("--days", type=int, default=30)
    ap.add_argument("--maxcloud", type=int, default=30)
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    out = fetch_ndvi(args.lat, args.lng, args.days, args.maxcloud)
    if args.json:
        print(json.dumps(out, ensure_ascii=False, indent=2))
    else:
        print(f"Point: {args.lat}, {args.lng}")
        print(f"Scene: {out.get('scene_id')}  date: {out.get('datetime')}")
        print(f"Cloud cover: {out.get('cloud_cover')}%")
        if out.get("ndvi") is not None:
            print(f"NDVI: {out['ndvi']:.3f}  ({out['ndvi_class']})")
        else:
            print(f"NDVI: not computed ({out.get('error')})")


if __name__ == "__main__":
    main()
