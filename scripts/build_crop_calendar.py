"""
Build a structured crop calendar for Bangladesh.

Sources:
  1. BBS Yearbook of Agricultural Statistics 2025, Section 1.8
     "Crop Calendar of Bangladesh" — national sowing / harvest windows.
  2. DAE (Department of Agricultural Extension) regional guidance for
     the three main agro-ecological zones (AEZ): northern (Rangpur/
     Dinajpur), central (Dhaka/Mymensingh), coastal (Chittagong/
     Barishal/Cox's Bazar).

Output:
  datasets/crop_calendar/crop_calendar.csv
"""
import csv
import os

OUT = os.path.join(os.path.dirname(__file__), "..", "datasets", "crop_calendar")
os.makedirs(OUT, exist_ok=True)

# crop, season, sowing_start, sowing_end, harvest_start, harvest_end,
# seed_kg_per_acre, notes, source
ROWS = [
    # Rice — the dominant crop, three seasons
    ("rice_aus",     "aus",    "15-Mar", "15-Apr", "15-Jul", "15-Aug", "11-14",  "HYV transplant; broadcast needs 28-37 kg/acre",  "BBS 2025 §1.8"),
    ("rice_aman",    "aman",   "20-Jun", "15-Sep", "15-Dec", "15-Jan", "8-11",   "Transplanted monsoon crop",                       "BBS 2025 §1.8"),
    ("rice_boro",    "boro",   "15-Dec", "15-Feb", "15-Apr", "15-Jun", "8-11",   "Irrigated winter crop; main surplus season",       "BBS 2025 §1.8"),
    # Cereals
    ("wheat",        "rabi",   "15-Nov", "15-Dec", "15-Mar", "15-Apr", "28-47",  "Seed rate rises with irrigation frequency",        "BBS 2025 §1.8"),
    ("maize",        "rabi",   "15-Oct", "15-Dec", "15-Apr", "31-May", "7-9",    "Rabi maize",                                       "BBS 2025 §1.8"),
    ("barley",       "rabi",   "15-Oct", "15-Dec", "15-Feb", "15-Apr", "23-28",  "",                                                  "BBS 2025 §1.8"),
    # Pulses
    ("lentil",       "rabi",   "15-Nov", "15-Dec", "15-Mar", "15-Apr", "20-25",  "Legume; low N requirement",                        "DAE / BARC 2018"),
    ("mung",         "kharif", "15-Mar", "15-Apr", "15-Jul", "15-Aug", "20-25",  "",                                                  "DAE / BARC 2018"),
    ("masur",        "rabi",   "15-Nov", "15-Dec", "15-Mar", "15-Apr", "20-25",  "",                                                  "DAE / BARC 2018"),
    # Oilseeds
    ("mustard",      "rabi",   "15-Oct", "15-Nov", "15-Feb", "15-Mar", "5-7",    "Main rabi oilseed of Bangladesh",                  "DAE / BARC 2018"),
    ("soybean",      "kharif", "15-Apr", "15-May", "15-Aug", "15-Sep", "25-30",  "",                                                  "DAE / BARC 2018"),
    ("groundnut",    "kharif", "15-Apr", "15-May", "15-Aug", "15-Sep", "30-35",  "",                                                  "DAE / BARC 2018"),
    # Fibres
    ("jute",         "kharif", "15-Mar", "15-May", "15-Jul", "15-Sep", "4-5",    "White capsularis sown earlier; tossa later",       "BBS 2025 §1.8"),
    # Vegetables (representative major ones)
    ("potato",       "rabi",   "15-Sep", "15-Nov", "15-Jan", "31-Mar", "90-120", "Tuber; seed = 4-6 Ql/acre (40-60 kg)",            "BBS 2025 §1.8"),
    ("onion",        "rabi",   "15-Oct", "15-Nov", "15-Feb", "15-Apr", "10-12",  "Bulb crop",                                        "DAE / BARC 2018"),
    ("tomato",       "rabi",   "15-Oct", "15-Nov", "15-Feb", "15-Apr", "10-12",  "Winter tomato",                                    "DAE / BARC 2018"),
    ("chili",        "rabi",   "15-Oct", "15-Nov", "15-Feb", "15-Apr", "10-12",  "Winter chili",                                     "DAE / BARC 2018"),
    ("garlic",       "rabi",   "15-Oct", "15-Nov", "15-Feb", "15-Apr", "10-12",  "",                                                  "DAE / BARC 2018"),
    ("ginger",       "kharif", "15-Apr", "15-May", "15-Aug", "15-Nov", "30-35",  "Rhizome; planting material 30-35 kg/acre",         "DAE / BARC 2018"),
    # Sugar
    ("sugarcane",    "kharif", "15-Mar", "15-Jun", "15-Nov", "31-Jan", "80-100", "Planting material = setts, 80-100 kg/acre",       "DAE / BARC 2018"),
    # Adjust for AEZ (regional shift, in weeks)
    # Northern AEZ (Rangpur/Dinajpur): cooler, sow 1-2 weeks earlier for rabi
    # Coastal AEZ (Chittagong/Cox's Bazar): monsoon arrives earlier, aman sow 2 weeks earlier
]

# Regional adjustment table: crop -> {region: (sow_shift_weeks, harvest_shift_weeks)}
# Positive = later, negative = earlier.
REGION_SHIFTS = {
    "rice_aman":  {"northern": (-1, -1), "central": (0, 0), "coastal": (-2, -2)},
    "rice_boro":  {"northern": (+1, +1), "central": (0, 0), "coastal": (0, 0)},
    "rice_aus":   {"northern": (0, 0), "central": (0, 0), "coastal": (-1, -1)},
    "wheat":      {"northern": (-1, -1), "central": (0, 0), "coastal": (0, 0)},
    "potato":     {"northern": (-1, -1), "central": (0, 0), "coastal": (0, 0)},
    "mustard":    {"northern": (-1, -1), "central": (0, 0), "coastal": (0, 0)},
    "lentil":     {"northern": (-1, -1), "central": (0, 0), "coastal": (0, 0)},
}


def shift_month(month_day, weeks):
    """Shift a 'DD-MMM' date by `weeks` weeks (positive = later)."""
    import datetime
    months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
              "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    d, m = month_day.split("-")
    dt = datetime.date(2001, months.index(m) + 1, int(d))
    dt += datetime.timedelta(weeks=weeks)
    return f"{dt.day:02d}-{months[dt.month - 1]}"


def main():
    path = os.path.join(OUT, "crop_calendar.csv")
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["crop", "region", "season", "sowing_start", "sowing_end",
                    "harvest_start", "harvest_end", "seed_kg_per_acre", "notes", "source"])
        for crop, season, ss, se, hs, he, seed, notes, src in ROWS:
            shifts = REGION_SHIFTS.get(crop, {})
            for region in ("northern", "central", "coastal"):
                sw, hw = shifts.get(region, (0, 0))
                w.writerow([
                    crop, region, season,
                    shift_month(ss, sw), shift_month(se, sw),
                    shift_month(hs, hw), shift_month(he, hw),
                    seed, notes, src,
                ])
    print(f"Wrote {path}")
    import pandas as pd
    df = pd.read_csv(path)
    print(f"  {len(df)} rows, {df['crop'].nunique()} crops, "
          f"{df['region'].nunique()} regions")


if __name__ == "__main__":
    main()