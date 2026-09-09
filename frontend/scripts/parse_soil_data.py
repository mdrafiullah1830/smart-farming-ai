#!/usr/bin/env python3
"""
Parse all soil report Excel files and generate a single JSON file
organized by District → Upazila with all soil features.
"""
import json
import os

import openpyxl

BASE = "/Users/mdrafiullah/smart_farming_ai/soil report"
OUTPUT = "/Users/mdrafiullah/smart_farming_ai/frontend/soil_data.json"

# District coordinates (lat, lng) for geolocation matching
DISTRICT_COORDS = {
    "BAGERHAT": [22.657, 89.793], "BANDARBAN": [22.195, 92.218], "BARGUNA": [22.16, 90.12],
    "BARISAL": [22.701, 90.354], "BHOLA": [22.686, 90.644], "BOGRA": [24.85, 89.35],
    "BRAHMANBARIA": [23.961, 91.112], "CHANDPUR": [23.216, 90.657], "CHITTAGONG": [22.357, 91.783],
    "CHUADANGA": [23.64, 88.861], "COMILLA": [23.461, 91.181], "COX'S BAZAR": [21.427, 92.007],
    "DHAKA": [23.81, 90.412], "DINAJPUR": [25.633, 88.633], "FARIDPUR": [23.542, 89.83],
    "FENI": [23.015, 91.398], "GAIBANDHA": [25.329, 89.543], "GAZIPUR": [24.0, 90.42],
    "GOPALGANJ": [23.0, 89.83], "HABIGANJ": [24.381, 91.418], "JAMALPUR": [24.925, 89.95],
    "JESSORE": [23.17, 89.21], "JHALAKATI": [22.641, 90.19], "JHENAIDAH": [23.544, 89.153],
    "JOYPURHAT": [25.101, 89.027], "KHAGRACHHARI": [23.106, 91.979], "KHULNA": [22.846, 89.54],
    "KISHOREGANJ": [24.433, 90.783], "KURIGRAM": [25.806, 89.636], "KUSHTIA": [23.906, 89.131],
    "LAKSHMIPUR": [22.943, 90.828], "LALMONIRHAT": [25.917, 89.467], "MADARIPUR": [23.167, 90.167],
    "MAGURA": [23.419, 89.419], "MANIKGANJ": [23.867, 90.0], "MEHERPUR": [23.768, 88.632],
    "MOULVI BAZAR": [24.484, 91.771], "MUNSHIGANJ": [23.55, 90.5], "MYMENSINGH": [24.75, 90.4],
    "NAOGAON": [24.805, 88.931], "NARAIL": [23.173, 89.513], "NARAYANGANJ": [23.633, 90.5],
    "NARSINGDI": [23.933, 90.717], "NATOR": [24.416, 88.996], "NAWABGANJ": [24.596, 88.276],
    "NETRAKONA": [24.882, 90.727], "NILPHAMARI": [25.933, 88.853], "NOAKHALI": [22.869, 91.099],
    "PABNA": [24.006, 89.244], "PANCHAGARH": [26.341, 88.554], "PATUAKHALI": [22.355, 90.329],
    "PIROJPUR": [22.578, 89.996], "RAJBARI": [23.75, 89.6], "RAJSHAHI": [24.374, 88.601],
    "RANGAMATI": [22.637, 92.198], "RANGPUR": [25.75, 89.25], "SARIATPUR": [23.2, 90.45],
    "SATKHIRA": [21.739, 89.071], "SHERPUR": [25.02, 90.019], "SIRAJGANJ": [24.458, 89.709],
    "SUNAMGANJ": [25.066, 91.395], "SYLHET": [24.895, 91.868], "TANGAIL": [24.25, 89.917],
    "THAKURGAON": [26.031, 88.47]
}

# Upazila coordinates (lat, lng) for finer geolocation matching
UPAZILA_COORDS = {
    # BAGERHAT
    "MOLLAHAT": [22.45, 89.65], "FAKIRHAT": [22.75, 89.55], "BAGERHAT": [22.657, 89.793],
    "RAMPAL": [22.55, 89.65], "SARANKHOLA": [22.35, 89.75], "MORRELGANJ": [22.45, 89.85],
    "SHYAMNAGAR": [22.35, 89.15], "MONGLA": [22.55, 89.6],
    # DHAKA
    "ADABOR": [23.77, 90.38], "BADD": [23.78, 90.42], "BANANI": [23.79, 90.40],
    "CANTONMENT": [23.80, 90.40], "DHANMONDI": [23.75, 90.38], "GULSHAN": [23.79, 90.41],
    "KERANIGANJ": [23.68, 90.40], "SAVAR": [23.85, 90.27], "UTTARA": [23.87, 90.40],
    # CHITTAGONG
    "HATHAZARI": [22.45, 91.80], "BOALKHALI": [22.35, 91.85], "ANWARA": [22.25, 91.75],
    "SITAKUNDA": [22.45, 91.65], "MIRSHARAI": [22.55, 91.55], "PATTIA": [22.35, 91.85],
    # SYLHET
    "COMPANIGANJ": [25.10, 91.75], "FENCHUGANJ": [24.85, 91.85], "GOLAPGANJ": [24.85, 91.95],
    "JAKIGANJ": [24.95, 92.10], "KANAIGHAT": [24.95, 92.05], "ZAKIGANJ": [24.85, 92.10],
    "GOPALGANJ_J": [24.85, 91.95],
    # RAJSHAHI
    "BOALIA": [24.37, 88.60], "GODAGARI": [24.45, 88.35], "PUTHIA": [24.40, 88.55],
    "TANORE": [24.50, 88.40], "CHARGHAT": [24.30, 88.75],
    # KHULNA
    "KHALISHPUR": [22.85, 89.55], "DIGHALIA": [22.90, 89.50], "DUMURIA": [22.80, 89.45],
    "BATIAGHATA": [22.75, 89.50], "TEROKHADA": [22.70, 89.45],
    # Default fallback - use district center
}

# Soil feature display names
FEATURE_NAMES = {
    "topsoil_texture": "Topsoil Texture",
    "soil_depth": "Effective Soil Depth",
    "soil_mosture": "Available Soil Moisture",
    "soil_premeability": "Soil Permeability",
    "drainage": "Drainage",
    "soil_consistency": "Soil Consistency",
    "soil_reaction": "Soil Reaction (pH)",
    "soil_salinity": "Soil Salinity Status",
    "natural_nutrient": "Natural Nutrient Status",
    "erosion_status": "Erosion Status",
    "firm:hard_ploughpan": "Very Firm/Hard Ploughpan",
    "relief": "Relief",
    "slope": "Slope",
    "flooding_depth": "Flooding Depth",
    "hazard_frequency": "Hazard Frequency",
    "acid_sulphate_phase": "Acid Sulphate Phase",
    "aklaine_phase": "Alkaline Phase",
    "calcic_phase": "Calcic Phase",
    "disastrous_flood_hazard": "Disastrous Flood Hazard",
    "disastrous_river_erosion_hazard": "Disastrous River Erosion Hazard",
    "disastrous_strom_surge_hazard": "Disastrous Storm Surge Hazard"
}


def parse_disupz_file(filepath):
    """Parse a SoilInfo_DisUpz.xlsx file into dict keyed by district->upazila."""
    wb = openpyxl.load_workbook(filepath, read_only=True, data_only=True)
    ws = wb.active
    rows = list(ws.iter_rows(values_only=True))
    wb.close()

    result = {}
    current_district = None
    current_upazila = None

    for row in rows:
        # Skip empty/header rows
        if not row or not any(row):
            continue

        # Detect district name (col A, all caps, not a header)
        col_a = str(row[0]).strip() if row[0] else ""
        if col_a and col_a.isupper() and len(col_a) > 3 and col_a not in [
            "DISTRICT NAME", "UPAZILA NAME", "TOTAL AREA (EXCLUDING MISCELLANEOUS LAND)",
            "SOURCE: LAND RESOURCES APPRAISAL OF BANGLADESH FOR AGRICULTURAL DEVELOPMENT, 1988 (BGD/81/035)"
        ]:
            # Verify it's a known district
            if col_a in DISTRICT_COORDS or col_a.replace("'", "'") in DISTRICT_COORDS:
                current_district = col_a
                if current_district not in result:
                    result[current_district] = {}

        # Detect upazila name (col C, when col A is empty)
        col_c = str(row[2]).strip() if row[2] else ""
        if not col_a and col_c and col_c.isupper() and len(col_c) > 3 and col_c not in [
            "UPAZILA NAME", "Upazila Total"
        ]:
            current_upazila = col_c
            if current_district and current_upazila not in result.get(current_district, {}):
                if current_district not in result:
                    result[current_district] = {}
                result[current_district][current_upazila] = {}

        # Detect data rows (col D has feature name, col E has value, col F has area)
        col_d = str(row[3]).strip() if row[3] else ""
        col_e = str(row[4]).strip() if row[4] else ""
        col_f = row[5] if row[5] else 0

        if col_d and col_e and col_d != "Upazila Total" and current_district and current_upazila:
            # This is a data row
            if current_upazila not in result[current_district]:
                result[current_district][current_upazila] = {}

            feature_name = col_d
            value = col_e
            area = col_f

            if feature_name not in result[current_district][current_upazila]:
                result[current_district][current_upazila][feature_name] = []

            try:
                area_val = float(area) if area else 0
            except:
                area_val = 0

            result[current_district][current_upazila][feature_name].append({
                "value": value,
                "area_ha": area_val
            })

    return result


def parse_combined_file(filepath):
    """Parse the soil depth combined file (has all features in one file)."""
    wb = openpyxl.load_workbook(filepath, read_only=True, data_only=True)
    ws = wb.active
    rows = list(ws.iter_rows(values_only=True))
    wb.close()

    result = {}
    current_district = None
    current_upazila = None

    for row in rows:
        if not row or not any(row):
            continue

        col_a = str(row[0]).strip() if row[0] else ""
        if col_a and col_a.isupper() and len(col_a) > 3 and col_a not in [
            "DISTRICT NAME", "UPAZILA NAME", "TOTAL AREA (EXCLUDING MISCELLANEOUS LAND)",
            "SOURCE: LAND RESOURCES APPRAISAL OF BANGLADESH FOR AGRICULTURAL DEVELOPMENT, 1988 (BGD/81/035)"
        ]:
            if col_a in DISTRICT_COORDS or col_a.replace("'", "'") in DISTRICT_COORDS:
                current_district = col_a
                if current_district not in result:
                    result[current_district] = {}

        col_c = str(row[2]).strip() if row[2] else ""
        if not col_a and col_c and col_c.isupper() and len(col_c) > 3 and col_c not in [
            "UPAZILA NAME", "Upazila Total"
        ]:
            current_upazila = col_c
            if current_district:
                if current_district not in result:
                    result[current_district] = {}
                if current_upazila not in result[current_district]:
                    result[current_district][current_upazila] = {}

        col_d = str(row[3]).strip() if row[3] else ""
        col_e = str(row[4]).strip() if row[4] else ""
        col_f = row[5] if row[5] else 0

        if col_d and col_e and col_d != "Upazila Total" and current_district and current_upazila:
            if current_upazila not in result.get(current_district, {}):
                continue

            feature_name = col_d
            value = col_e
            area = col_f

            if feature_name not in result[current_district][current_upazila]:
                result[current_district][current_upazila][feature_name] = []

            try:
                area_val = float(area) if area else 0
            except:
                area_val = 0

            result[current_district][current_upazila][feature_name].append({
                "value": value,
                "area_ha": area_val
            })

    return result


def parse_aez_file(filepath):
    """Parse AEZ Excel file."""
    wb = openpyxl.load_workbook(filepath, read_only=True, data_only=True)
    ws = wb.active
    rows = list(ws.iter_rows(values_only=True))
    wb.close()

    result = {}
    current_district = None
    current_upazila = None

    for row in rows:
        if not row or not any(row):
            continue

        col_a = str(row[0]).strip() if row[0] else ""
        if col_a and col_a.isupper() and len(col_a) > 3:
            if col_a in DISTRICT_COORDS:
                current_district = col_a
                if current_district not in result:
                    result[current_district] = {}

        col_c = str(row[2]).strip() if row[2] else ""
        if not col_a and col_c and col_c.isupper() and len(col_c) > 3 and col_c not in ["Upazila Total"]:
            current_upazila = col_c
            if current_district:
                if current_district not in result:
                    result[current_district] = {}
                if current_upazila not in result[current_district]:
                    result[current_district][current_upazila] = {}

        col_d = str(row[3]).strip() if row[3] else ""
        col_e = str(row[4]).strip() if row[4] else ""
        col_f = row[5] if row[5] else 0

        if col_d and col_e and col_d != "Upazila Total" and current_district and current_upazila:
            if current_upazila not in result.get(current_district, {}):
                continue

            if "AEZ" not in result[current_district][current_upazila]:
                result[current_district][current_upazila]["AEZ"] = []

            try:
                area_val = float(col_f) if col_f else 0
            except:
                area_val = 0

            result[current_district][current_upazila]["AEZ"].append({
                "value": col_e,
                "area_ha": area_val
            })

    return result


def parse_gst_file(filepath):
    """Parse GST Excel file."""
    wb = openpyxl.load_workbook(filepath, read_only=True, data_only=True)
    ws = wb.active
    rows = list(ws.iter_rows(values_only=True))
    wb.close()

    result = {}
    current_district = None
    current_upazila = None

    for row in rows:
        if not row or not any(row):
            continue

        col_a = str(row[0]).strip() if row[0] else ""
        if col_a and col_a.isupper() and len(col_a) > 3:
            if col_a in DISTRICT_COORDS:
                current_district = col_a
                if current_district not in result:
                    result[current_district] = {}

        col_c = str(row[2]).strip() if row[2] else ""
        if not col_a and col_c and col_c.isupper() and len(col_c) > 3 and col_c not in ["Upazila Total"]:
            current_upazila = col_c
            if current_district:
                if current_district not in result:
                    result[current_district] = {}
                if current_upazila not in result[current_district]:
                    result[current_district][current_upazila] = {}

        col_d = str(row[3]).strip() if row[3] else ""
        col_e = str(row[4]).strip() if row[4] else ""
        col_f = row[5] if row[5] else 0

        if col_d and col_e and col_d != "Upazila Total" and current_district and current_upazila:
            if current_upazila not in result.get(current_district, {}):
                continue

            if "General Soil Type" not in result[current_district][current_upazila]:
                result[current_district][current_upazila]["General Soil Type"] = []

            try:
                area_val = float(col_f) if col_f else 0
            except:
                area_val = 0

            result[current_district][current_upazila]["General Soil Type"].append({
                "value": col_e,
                "area_ha": area_val
            })

    return result


def parse_lt_file(filepath):
    """Parse Land Type Excel file."""
    wb = openpyxl.load_workbook(filepath, read_only=True, data_only=True)
    ws = wb.active
    rows = list(ws.iter_rows(values_only=True))
    wb.close()

    result = {}
    current_district = None
    current_upazila = None

    for row in rows:
        if not row or not any(row):
            continue

        col_a = str(row[0]).strip() if row[0] else ""
        if col_a and col_a.isupper() and len(col_a) > 3:
            if col_a in DISTRICT_COORDS:
                current_district = col_a
                if current_district not in result:
                    result[current_district] = {}

        col_c = str(row[2]).strip() if row[2] else ""
        if not col_a and col_c and col_c.isupper() and len(col_c) > 3 and col_c not in ["Upazila Total"]:
            current_upazila = col_c
            if current_district:
                if current_district not in result:
                    result[current_district] = {}
                if current_upazila not in result[current_district]:
                    result[current_district][current_upazila] = {}

        col_d = str(row[3]).strip() if row[3] else ""
        col_e = str(row[4]).strip() if row[4] else ""
        col_f = row[5] if row[5] else 0

        if col_d and col_e and col_d != "Upazila Total" and current_district and current_upazila:
            if current_upazila not in result.get(current_district, {}):
                continue

            if "Land Type" not in result[current_district][current_upazila]:
                result[current_district][current_upazila]["Land Type"] = []

            try:
                area_val = float(col_f) if col_f else 0
            except:
                area_val = 0

            result[current_district][current_upazila]["Land Type"].append({
                "value": col_e,
                "area_ha": area_val
            })

    return result


def parse_climate_file(filepath, feature_name):
    """Parse climate Excel file."""
    wb = openpyxl.load_workbook(filepath, read_only=True, data_only=True)
    ws = wb.active
    rows = list(ws.iter_rows(values_only=True))
    wb.close()

    result = {}
    current_district = None
    current_upazila = None

    for row in rows:
        if not row or not any(row):
            continue

        col_a = str(row[0]).strip() if row[0] else ""
        if col_a and col_a.isupper() and len(col_a) > 3:
            if col_a in DISTRICT_COORDS:
                current_district = col_a
                if current_district not in result:
                    result[current_district] = {}

        col_c = str(row[2]).strip() if row[2] else ""
        if not col_a and col_c and col_c.isupper() and len(col_c) > 3 and col_c not in ["Upazila Total"]:
            current_upazila = col_c
            if current_district:
                if current_district not in result:
                    result[current_district] = {}
                if current_upazila not in result[current_district]:
                    result[current_district][current_upazila] = {}

        col_d = str(row[3]).strip() if row[3] else ""
        col_e = str(row[4]).strip() if row[4] else ""
        col_f = row[5] if row[5] else 0

        if col_d and col_e and col_d != "Upazila Total" and current_district and current_upazila:
            if current_upazila not in result.get(current_district, {}):
                continue

            if feature_name not in result[current_district][current_upazila]:
                result[current_district][current_upazila][feature_name] = []

            try:
                area_val = float(col_f) if col_f else 0
            except:
                area_val = 0

            result[current_district][current_upazila][feature_name].append({
                "value": col_e,
                "area_ha": area_val
            })

    return result


def find_nearest_location(lat, lng):
    """Find nearest district and upazila from coordinates."""
    import math

    def haversine(lat1, lon1, lat2, lon2):
        R = 6371
        dlat = math.radians(lat2 - lat1)
        dlon = math.radians(lon2 - lon1)
        a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon/2)**2
        return R * 2 * math.asin(math.sqrt(a))

    # Find nearest district
    min_dist = float('inf')
    nearest_district = "DHAKA"
    for d, coords in DISTRICT_COORDS.items():
        dist = haversine(lat, lng, coords[0], coords[1])
        if dist < min_dist:
            min_dist = dist
            nearest_district = d

    return nearest_district


def main():
    print("Parsing soil data files...")
    soil_data = {}

    # 1. Parse individual soil features (DisUpz files)
    soil_base = os.path.join(BASE, "soil information")
    for feature_dir in os.listdir(soil_base):
        feature_path = os.path.join(soil_base, feature_dir)
        if not os.path.isdir(feature_path):
            continue

        disupz_file = os.path.join(feature_path, "SoilInfo_DisUpz.xlsx")
        if os.path.exists(disupz_file):
            print(f"  Parsing: {feature_dir}")
            feature_key = feature_dir.replace(" ", "_").replace(":", "").replace(";", "")

            # Use combined parser for soil depth (has all features)
            if feature_dir == "soil depth":
                data = parse_combined_file(disupz_file)
            else:
                data = parse_disupz_file(disupz_file)

            # Merge into soil_data
            for district, upazilas in data.items():
                if district not in soil_data:
                    soil_data[district] = {}
                for upazila, features in upazilas.items():
                    if upazila not in soil_data[district]:
                        soil_data[district][upazila] = {}
                    for feat_name, values in features.items():
                        soil_data[district][upazila][feat_name] = values

    # 2. Parse AEZ files
    print("  Parsing: AEZ Information")
    aez_base = os.path.join(BASE, "AEZ Information")
    aez_upz = os.path.join(aez_base, "Extent_Land_by_AEZ_under_Upazila_and_District.xlsx")
    if os.path.exists(aez_upz):
        aez_data = parse_aez_file(aez_upz)
        for district, upazilas in aez_data.items():
            if district not in soil_data:
                soil_data[district] = {}
            for upazila, features in upazilas.items():
                if upazila not in soil_data[district]:
                    soil_data[district][upazila] = {}
                soil_data[district][upazila].update(features)

    # 3. Parse GST files
    print("  Parsing: GST Information")
    gst_base = os.path.join(BASE, "GST Information")
    gst_upz = os.path.join(gst_base, "Extent_Land_by_GST_under_Upazila_and_District.xlsx")
    if os.path.exists(gst_upz):
        gst_data = parse_gst_file(gst_upz)
        for district, upazilas in gst_data.items():
            if district not in soil_data:
                soil_data[district] = {}
            for upazila, features in upazilas.items():
                if upazila not in soil_data[district]:
                    soil_data[district][upazila] = {}
                soil_data[district][upazila].update(features)

    # 4. Parse Land Type files
    print("  Parsing: LT Information")
    lt_base = os.path.join(BASE, "LT Information")
    lt_upz = os.path.join(lt_base, "Extent_LT_by_Upazila_and_District.xlsx")
    if os.path.exists(lt_upz):
        lt_data = parse_lt_file(lt_upz)
        for district, upazilas in lt_data.items():
            if district not in soil_data:
                soil_data[district] = {}
            for upazila, features in upazilas.items():
                if upazila not in soil_data[district]:
                    soil_data[district][upazila] = {}
                soil_data[district][upazila].update(features)

    # 5. Parse Climate files
    print("  Parsing: Climate Information")
    climate_base = os.path.join(BASE, "climate information")
    climate_files = {
        "Extreme temperature": "Extreme Temperature",
        "kharif reference lpg": "Kharif Reference LGP",
        "pre-kharif tran..": "Pre-Kharif Transition",
        "thermal info": "Thermal Zone"
    }
    for folder, feat_name in climate_files.items():
        folder_path = os.path.join(climate_base, folder)
        if os.path.isdir(folder_path):
            for f in os.listdir(folder_path):
                if "District_and_Upazila" in f and f.endswith(".xlsx"):
                    filepath = os.path.join(folder_path, f)
                    cdata = parse_climate_file(filepath, feat_name)
                    for district, upazilas in cdata.items():
                        if district not in soil_data:
                            soil_data[district] = {}
                        for upazila, features in upazilas.items():
                            if upazila not in soil_data[district]:
                                soil_data[district][upazila] = {}
                            soil_data[district][upazila].update(features)

    # Add coordinates to each district/upazila
    for district in soil_data:
        soil_data[district]["_coords"] = DISTRICT_COORDS.get(district, [23.81, 90.41])
        for upazila in soil_data[district]:
            if upazila.startswith("_"):
                continue
            # Try to find upazila coords, fallback to district center
            upazila_key = upazila.upper()
            if upazila_key in UPAZILA_COORDS:
                soil_data[district][upazila]["_coords"] = UPAZILA_COORDS[upazila_key]
            else:
                soil_data[district][upazila]["_coords"] = DISTRICT_COORDS.get(district, [23.81, 90.41])

    # Add metadata
    output = {
        "metadata": {
            "source": "Bangladesh Agricultural Research Council (BARC)",
            "total_districts": len([d for d in soil_data if not d.startswith("_")]),
            "total_upazilas": sum(len([u for u in soil_data[d] if not u.startswith("_")]) for d in soil_data if not d.startswith("_")),
            "feature_categories": list(set(
                feat for d in soil_data if not d.startswith("_")
                for u in soil_data[d] if not u.startswith("_")
                for feat in soil_data[d][u] if not feat.startswith("_")
            ))
        },
        "districts": {}
    }

    for district in soil_data:
        if district.startswith("_"):
            continue
        output["districts"][district] = {
            "coords": soil_data[district].get("_coords", [23.81, 90.41]),
            "upazilas": {}
        }
        for upazila in soil_data[district]:
            if upazila.startswith("_"):
                continue
            output["districts"][district]["upazilas"][upazila] = {
                "coords": soil_data[district][upazila].get("_coords", DISTRICT_COORDS.get(district, [23.81, 90.41])),
                "features": {}
            }
            for feat_name, values in soil_data[district][upazila].items():
                if feat_name.startswith("_"):
                    continue
                output["districts"][district]["upazilas"][upazila]["features"][feat_name] = values

    # Write output
    with open(OUTPUT, 'w', encoding='utf-8') as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"\nDone! Output: {OUTPUT}")
    print(f"Districts: {output['metadata']['total_districts']}")
    print(f"Upazilas: {output['metadata']['total_upazilas']}")
    print(f"Feature categories: {len(output['metadata']['feature_categories'])}")
    print(f"Features: {output['metadata']['feature_categories']}")


if __name__ == "__main__":
    main()
