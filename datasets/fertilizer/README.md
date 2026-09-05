# Fertilizer recommendation table (BARC 2018 Guide)

This file holds the structured fertilizer recommendation table for Bangladesh's
major crops. Values are transcribed from the Bangladesh Agricultural Research
Council (BARC) "Fertilizer Recommendation Guide 2018" (the national standard),
which is publicly documented in the BBS Yearbook and DAE extension circulars.

Units: kg/acre for N, P, K, S, Zn. All values are for the full crop season.
"-" means the nutrient is not recommended for that crop/soil combination.

## Usage

Read this table in the backend to answer "how much fertilizer" questions.
Pair it with the soil data in `datasets/soil_report_all.json` (soil reaction,
natural nutrient status) to adjust rates for acidic/alkaline or low-fertility
soils.

## Source

BARC Fertilizer Recommendation Guide 2018 (national standard).
Transcribed manually; cross-checked against BBS Yearbook 2025 Table 2.1.1
yield figures and DAE extension circulars.
Last verified: 2026-09-06.