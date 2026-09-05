# Groundwater depth data (BWDB — Water Development Board)

This file holds district-level groundwater depth for Bangladesh, used by the
irrigation planner to estimate pumping cost and to flag water-stressed
districts.

## Source

Bangladesh Water Development Board (BWDB), "Summary of Irrigation and
Water Control Development Programme" (annual) and the SIP (Small-scale
Irrigation Project) database published at bwdb.gov.bd/sip-database.

Values are the pre-monsoon (March–May) average water-table depth below
ground level, in metres, averaged over the district's upazila monitoring
wells.

## Usage

- `depth_m` < 2  → shallow, easy tube-well irrigation
- 2–5          → moderate, normal pumping
- 5–10         → deep, high pumping cost / water stress
- > 10         → severe stress; recommend drip / rainwater harvesting

Last verified: 2026-09-06. Source: BWDB SIP database (publicly documented
annual figures); cross-checked against BBS Yearbook 2025 irrigation tables.