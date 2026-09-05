# NDVI / satellite imagery for Bangladesh

This directory holds the satellite-vegetation-index pipeline that powers the
"Satellite Monitoring" feature of the platform.

## Data source

**AWS earth-search** (`https://earth-search.aws.element84.com/v1`) — a public
STAC API serving Sentinel-2 Level-2A (surface reflectance) imagery. No
credentials, no subscription, no rate-limit auth required. Data is CC-BY-4.0
(Copernicus).

## Indices computed

| Index | Bands | Formula | Use |
|---|---|---|---|
| NDVI | B08, B04 | (B08 - B04) / (B08 + B04) | Vegetation greenness |
| NDWI | B03, B08 | (B03 - B08) / (B03 + B08) | Surface water / soil moisture |
| EVI | B08, B04, B02 | 2.5*(B08-B04)/(B08+6*B04-7.5*B02+1) | Dense canopy (no saturation) |

## Classification

| NDVI range | Class |
|---|---|
| < 0.1 | Bare soil / water |
| 0.1 - 0.2 | Sparse vegetation |
| 0.2 - 0.4 | Moderate vegetation |
| 0.4 - 0.6 | Good vegetation |
| > 0.6 | Excellent / dense vegetation |

## Usage

```
python scripts/fetch_ndvi.py --lat 23.81 --lng 90.41 --days 30
```

Last verified: 2026-09-06. Source: AWS earth-search STAC API (Sentinel-2 L2A).