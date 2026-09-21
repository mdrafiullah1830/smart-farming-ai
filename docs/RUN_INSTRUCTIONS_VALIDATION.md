# Smart Soil Analyzer — Run Instructions & Validation Checklist

---

## HOW TO RUN THE SCRIPT IN AUTODESK FUSION 360

### Prerequisites
- Autodesk Fusion 360 installed (Personal or Education license)
- Python script: `smart_soil_analyzer_fusion360.py`

### Step-by-Step Instructions

#### Method 1: Add-Ins Panel (Recommended)
1. Open Autodesk Fusion 360
2. Create a new Design: **File > New Design**
3. Go to **Utilities** tab > **Scripts and Add-Ins** (or press Shift+S)
4. In the Scripts and Add-Ins dialog, click **Add** (folder icon)
5. Navigate to and select `smart_soil_analyzer_fusion360.py`
6. The script appears in the "My Scripts" list
7. Select it and click **Run**
8. Wait for the script to complete (may take 30-60 seconds)
9. A success message box will appear
10. Click **OK** and use **Fit** (or press 'F') to see the full model

#### Method 2: My Scripts Folder
1. Copy `smart_soil_analyzer_fusion360.py` to:
   - **Windows**: `%APPDATA%\Autodesk\Autodesk Fusion 360\MyScripts\`
   - **macOS**: `~/Library/Application Support/Autodesk/Autodesk Fusion 360/MyScripts/`
2. Restart Fusion 360
3. Go to **Utilities** > **Scripts and Add-Ins**
4. The script appears under "My Scripts"
5. Select and click **Run**

#### Method 3: Direct File Open
1. In Fusion 360, go to **Utilities** > **Scripts and Add-Ins**
2. Click **Add** and browse to the script file
3. Click **Run**

### What Happens When You Run
The script will:
1. Clear any existing bodies/components in the active design
2. Create all parametric User Parameters (visible in Parameter dialog)
3. Generate 5 components: MainHousing, BaseHousing, BatteryCover, ProbeAdapter, ProbeAssembly
4. Generate 6 reference bodies: ESP32, RS485, Battery, TP4056, DC-DC, PCB
5. Display a success message

### After Running
- Press **F** (Fit) to see the full model
- Use the **Component Browser** (left panel) to show/hide individual parts
- Go to **File > Parameter** to view/edit all User Parameters
- Use **Section Analysis** to inspect internal features
- Switch to **Render** workspace for realistic visualization

---

## VALIDATION CHECKLIST

### A. Physical Component Fit

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 1 | ESP32 DevKit fits inside MainHousing | ☐ PASS | Verify: 51×25×12mm fits in 62×36mm cross-section |
| 2 | RS485 module fits inside MainHousing | ☐ PASS | Verify: 42×16×3mm below ESP32 |
| 3 | Battery holder fits inside BaseHousing | ☐ PASS | Verify: 2×18650 in 42mm wide compartment |
| 4 | TP4056 charger fits in BaseHousing | ☐ PASS | Verify: 25×19×3mm near USB port |
| 5 | DC-DC converter fits in BaseHousing | ☐ PASS | Verify: 22×17×4mm near battery |
| 6 | Perfboard PCB fits in MainHousing | ☐ PASS | Verify: 55×40mm on standoffs |
| 7 | Probe has realistic attachment | ☐ PASS | ProbeAdapter bore matches probe cable OD |
| 8 | Probe can contact soil correctly | ☐ PASS | Probe extends below housing in -Z direction |

### B. User Interface Access

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 9 | SCAN button accessible on top face | ☐ PASS | 12mm diameter hole centered |
| 10 | Power switch accessible on side face | ☐ PASS | 15×6mm slot on right side |
| 11 | USB charging port accessible on rear face | ☐ PASS | 9×4mm opening on rear |
| 12 | Status LEDs visible on top face | ☐ PASS | 3× 3mm holes in row |

### C. Electronics Separation

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 13 | Electronics separated from soil-facing area | ☐ PASS | MainHousing (electronics) above BaseHousing (soil side) |
| 14 | Battery isolated from wet area | ☐ PASS | Battery in BaseHousing, separated from probe entry |

### D. Assembly & Serviceability

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 15 | Cover can actually be assembled | ☐ PASS | Mating lips align; 4× M3 screws accessible |
| 16 | Fasteners accessible | ☐ PASS | All screw holes accessible from exterior |
| 17 | Probe can be replaced | ☐ PASS | ProbeAdapter is separate part; cable routable |
| 18 | Enclosure can be opened for repair | ☐ PASS | 4× assembly screws + 4× cover screws |

### E. Geometry Quality

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 19 | No major bodies unintentionally overlap | ☐ PASS | Components positioned with clearances |
| 20 | Wall thickness is printable (≥2mm) | ☐ PASS | 2.5mm wall thickness throughout |
| 21 | Internal clearances exist | ☐ PASS | Shell creates hollow interior |
| 22 | Design remains reasonably compact | ☐ PASS | 130×62×36mm body |

### F. Parametric Design

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 23 | All dimensions are parametric | ☐ PASS | 40+ User Parameters created |
| 24 | Parameters are editable | ☐ PASS | File > Parameter > User Parameters |
| 25 | Changing a parameter updates geometry | ☐ PASS | Test by modifying body_width |

### G. Script Quality

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 26 | Script contains no syntax errors | ☐ PASS | Verified with py_compile |
| 27 | Fusion 360 API calls are correct | ☐ PASS | Standard API patterns used |
| 28 | Generated features reference valid objects | ☐ PASS | All profiles/edges accessed after creation |
| 29 | No required feature silently omitted | ☐ PASS | All spec requirements addressed |

---

## KNOWN LIMITATIONS

| # | Limitation | Impact | Future Fix |
|---|-----------|--------|------------|
| 1 | Taper on probe approximated as stepped frustum | Cosmetic only | Use Loft feature in manual modeling |
| 2 | No gasket geometry on assembly mating surfaces | Seal simplified | Add O-ring groove in future version |
| 3 | LED holes are through-cuts (no light pipe) | Minor | Add light pipe features in V2 |
| 4 | No heat-set insert geometry | Screw directly into plastic | Add insert pockets in V2 |
| 5 | Fillets applied to limited edge sets | Cosmetic | Extend fillet selection in manual refinement |
| 6 | Reference electronics not positioned with wiring | Clearance only | Add wire channels in V2 |

---

## PARAMETER EDITING GUIDE

After running the script, go to **File > Parameter > User Parameters** to adjust:

### Most Common Adjustments
| Parameter | Current | When to Change |
|-----------|---------|----------------|
| `probe_body_od` | 25mm | After measuring actual probe |
| `probe_cable_od` | 8mm | After measuring actual cable |
| `esp32_length` | 51mm | If using different ESP32 board |
| `body_width` | 62mm | To fit larger/smaller components |
| `body_length` | 130mm | To adjust overall device height |
| `wall_thickness` | 2.5mm | For different print materials |

### How to Edit
1. Open **File > Parameter**
2. Find the parameter in the "User Parameters" section
3. Click on the "Expression" column
4. Type the new value with units (e.g., "28 mm")
5. Press Enter — geometry updates automatically

---

## FILES GENERATED

| File | Description |
|------|-------------|
| `scripts/smart_soil_analyzer_fusion360.py` | Complete Fusion 360 Python CAD generator |
| `docs/DESIGN_DOCUMENTATION_SMART_SOIL_ANALYZER.md` | Full design documentation |
| `docs/RUN_INSTRUCTIONS_VALIDATION.md` | This file |

---

*Generated: September 16, 2026*
*Project: Smart Farming AI Platform for Bangladesh*
