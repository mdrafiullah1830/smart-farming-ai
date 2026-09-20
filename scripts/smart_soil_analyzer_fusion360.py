# smart_soil_analyzer_fusion360.py
# ==============================================================================
# COMPLETE AUTODESK FUSION 360 PYTHON SCRIPT
# Smart Soil Analyzer for Smart Farming AI Platform — Bangladesh
# ==============================================================================
#
# PRODUCT ARCHITECTURE: 5 Major Parts (as named bodies in root component)
# -------------------------------------------------------------------
# 1. MainHousing    — Upper shell: control panel, button, LEDs, electronics mount
# 2. BaseHousing    — Lower shell: battery compartment, probe mount, charging port
# 3. BatteryCover   — Removable rear panel for battery access (4x M3 screws)
# 4. ProbeAdapter   — Cylindrical cable connector with strain relief
# 5. ProbeAssembly  — Simplified reference of commercial 7-in-1 RS485 soil probe
#
# REFERENCE BODIES (simplified electronics for clearance checking):
#    - ESP32_DevKit, RS485_Module, BatteryHolder, TP4056_Charger,
#      DCDC_Converter, Perfboard_PCB
#
# NOTE: This script creates ALL geometry as separate named BODIES within the
# root component. This is compatible with both "Design" and "Part Design"
# document modes in Fusion 360.
#
# ORIENTATION:
#    Z axis = vertical (up = +Z, probe points down = -Z)
#    XY plane = horizontal cross-section
#
# USAGE:
#    1. Open Autodesk Fusion 360
#    2. Create new Design (File > New Design)
#    3. Go to Utilities > Scripts and Add-Ins
#    4. Click "Add" and select this .py file
#    5. Click "Run"
#
# ==============================================================================

import adsk.core
import adsk.fusion
import adsk.cam
import math


# ==============================================================================
# MAIN ENTRY POINT
# ==============================================================================

def run(context):
    try:
        app = adsk.core.Application.get()
        ui = app.userInterface
        product = app.activeProduct

        design = adsk.fusion.Design.cast(product)
        if not design:
            ui.messageBox(
                "No active Fusion 360 Design found.\n"
                "Please create a new Design first:\n"
                "  File > New Design\nThen re-run this script."
            )
            return

        rootComp = design.rootComponent
        _clear_existing(rootComp)
        _create_user_parameters(design)
        p = _get_params(design)

        # Build all parts as named bodies in root component
        _build_main_housing(rootComp, p)
        _build_base_housing(rootComp, p)
        _build_battery_cover(rootComp, p)
        _build_probe_adapter(rootComp, p)
        _build_probe_reference(rootComp, p)
        _build_electronics_references(rootComp, p)

        app.activeView.fit()
        ui.messageBox(
            "Smart Soil Analyzer CAD generated successfully!\n\n"
            "Bodies created in Browser:\n"
            "  1. MainHousing  (upper shell)\n"
            "  2. BaseHousing  (lower shell)\n"
            "  3. BatteryCover (rear panel)\n"
            "  4. ProbeAdapter (cylindrical connector)\n"
            "  5. ProbeAssembly (simplified probe)\n\n"
            "Reference electronics:\n"
            "  ESP32, RS485, BatteryHolder, TP4056,\n"
            "  DCDC_Converter, Perfboard_PCB\n\n"
            "Edit User Parameters to adjust dimensions:\n"
            "  File > Parameter > User Parameters"
        )
    except Exception as e:
        try:
            ui = adsk.core.Application.get().userInterface
            ui.messageBox("Smart Soil Analyzer — Error:\n" + str(e))
        except:
            pass


# ==============================================================================
# CLEAR EXISTING GEOMETRY
# ==============================================================================

def _clear_existing(rootComp):
    """Remove all existing bodies, sketches, and construction geometry."""
    try:
        while rootComp.bodies.count > 0:
            rootComp.bodies.item(0).deleteMe()
    except:
        pass
    try:
        while rootComp.sketches.count > 0:
            rootComp.sketches.item(0).deleteMe()
    except:
        pass
    try:
        while rootComp.constructionPlanes.count > 0:
            rootComp.constructionPlanes.item(0).deleteMe()
    except:
        pass


# ==============================================================================
# USER PARAMETERS
# ==============================================================================

def _create_user_parameters(design):
    """Create all parametric user parameters."""
    params = design.userParameters

    def _add(name, expression, unit="mm"):
        try:
            ex = params.itemByName(name)
            if ex:
                ex.deleteMe()
        except:
            pass
        return params.add(name, adsk.core.ValueInput.createByString(expression), unit, "")

    # Body dimensions
    _add("body_length",       "130 mm")
    _add("body_width",        "62 mm")
    _add("body_depth",        "36 mm")
    _add("wall_thickness",    "2.5 mm")
    _add("corner_radius_xy",  "5 mm")

    # Housing split
    _add("height_upper",      "70 mm")
    _add("height_lower",      "60 mm")
    _add("mating_lip",        "3 mm")

    # Control panel
    _add("button_diameter",   "12 mm")
    _add("led_diameter",      "3 mm")
    _add("led_spacing",       "8 mm")
    _add("led_count",         "3")
    _add("led_offset_x",      "0 mm")
    _add("led_offset_y",      "-15 mm")
    _add("button_offset_y",   "12 mm")

    # Power switch
    _add("switch_width",      "15 mm")
    _add("switch_height",     "6 mm")
    _add("switch_z_offset",   "0 mm")

    # USB charging port
    _add("usb_width",         "9 mm")
    _add("usb_height",        "4 mm")

    # Probe adapter
    _add("probe_adapter_od",  "28 mm")
    _add("probe_adapter_id",  "22 mm")
    _add("probe_adapter_h",   "20 mm")
    _add("probe_cable_od",    "8 mm")
    _add("probe_body_od",     "25 mm")

    # Battery
    _add("battery_18650_length","65 mm")
    _add("battery_18650_dia",  "18.5 mm")
    _add("battery_slot_width", "42 mm")
    _add("battery_slot_depth", "70 mm")

    # Electronics reference dimensions
    _add("esp32_length",      "51 mm")
    _add("esp32_width",       "25 mm")
    _add("esp32_height",      "12 mm")
    _add("rs485_length",      "42 mm")
    _add("rs485_width",       "16 mm")
    _add("rs485_height",      "3 mm")
    _add("tp4056_length",     "25 mm")
    _add("tp4056_width",      "19 mm")
    _add("tp4056_height",     "3 mm")
    _add("dcdc_length",       "22 mm")
    _add("dcdc_width",        "17 mm")
    _add("dcdc_height",       "4 mm")
    _add("pcb_length",        "55 mm")
    _add("pcb_width",         "40 mm")
    _add("pcb_height",        "1.6 mm")
    _add("pcb_standoff_h",    "5 mm")

    # Fasteners
    _add("screw_diameter",    "3 mm")
    _add("boss_od",           "6 mm")
    _add("boss_h",            "8 mm")

    # Sealing
    _add("gasket_depth",      "1.5 mm")
    _add("gasket_width",      "1.5 mm")

    # Probe reference
    _add("probe_length",      "300 mm")
    _add("probe_tip_length",  "100 mm")


def _get_params(design):
    """Read all user parameters into a dict."""
    params = {}
    for i in range(design.userParameters.count):
        p = design.userParameters.item(i)
        params[p.name] = p.value
    return params


# ==============================================================================
# HELPER: ROUNDED RECTANGLE PROFILE
# ==============================================================================

def _draw_rounded_rect(sketch, cx, cy, width, height, rx, ry):
    """Draw a closed rounded-rectangle in the sketch plane."""
    lines = sketch.sketchCurves.sketchLines
    arcs = sketch.sketchCurves.sketchArcs

    hw = width / 2.0
    hh = height / 2.0
    rx = max(min(rx, hw - 0.1), 0.1)
    ry = max(min(ry, hh - 0.1), 0.1)
    sx = hw - rx
    sy = hh - ry

    t_r = adsk.core.Point3D.create(cx + sx,  cy + hh,  0)
    t_l = adsk.core.Point3D.create(cx - sx,  cy + hh,  0)
    l_t = adsk.core.Point3D.create(cx - hw,  cy + sy,  0)
    l_b = adsk.core.Point3D.create(cx - hw,  cy - sy,  0)
    b_l = adsk.core.Point3D.create(cx - sx,  cy - hh,  0)
    b_r = adsk.core.Point3D.create(cx + sx,  cy - hh,  0)
    r_b = adsk.core.Point3D.create(cx + hw,  cy - sy,  0)
    r_t = adsk.core.Point3D.create(cx + hw,  cy + sy,  0)

    entities = []
    entities.append(lines.addByTwoPoints(t_r, t_l))
    entities.append(lines.addByTwoPoints(l_t, l_b))
    entities.append(lines.addByTwoPoints(b_l, b_r))
    entities.append(lines.addByTwoPoints(r_b, r_t))

    c_tr = adsk.core.Point3D.create(cx + sx, cy + sy, 0)
    entities.append(arcs.addByCenterStartEnd(c_tr, r_t, t_r))
    c_tl = adsk.core.Point3D.create(cx - sx, cy + sy, 0)
    entities.append(arcs.addByCenterStartEnd(c_tl, t_l, l_t))
    c_bl = adsk.core.Point3D.create(cx - sx, cy - sy, 0)
    entities.append(arcs.addByCenterStartEnd(c_bl, l_b, b_l))
    c_br = adsk.core.Point3D.create(cx + sx, cy - sy, 0)
    entities.append(arcs.addByCenterStartEnd(c_br, b_r, r_b))

    return entities


# ==============================================================================
# HELPER: FIND FACE BY Z POSITION
# ==============================================================================

def _find_face_at_z(body, target_z, tol=0.5):
    """Find a BRepFace whose centroid Z is approximately target_z."""
    for i in range(body.faces.count):
        face = body.faces.item(i)
        try:
            c = face.centroid
            if abs(c.z - target_z) < tol:
                return face
        except:
            continue
    return None


# ==============================================================================
# HELPER: CREATE MOUNTING BOSS (in root component)
# ==============================================================================

def _create_mounting_boss(rootComp, cx, cy, cz, od, hole_d, height):
    """Create a cylindrical mounting boss with screw hole in root component."""
    features = rootComp.features
    sketches = rootComp.sketches

    # Offset plane at boss base
    plane_input = rootComp.constructionPlanes.createInput()
    plane_input.setByOffset(rootComp.xYPlane, adsk.core.ValueInput.createByReal(cz))
    boss_plane = rootComp.constructionPlanes.add(plane_input)

    # Boss outer cylinder
    sk = sketches.add(boss_plane)
    center = adsk.core.Point3D.create(cx, cy, 0)
    sk.sketchCurves.sketchCircles.addByCenterRadius(center, od / 2.0)

    if sk.profiles.count > 0:
        ext = features.extrudeFeatures.addSimple(
            sk.profiles.item(0),
            adsk.core.ValueInput.createByReal(height),
            adsk.fusion.FeatureOperations.NewBodyFeatureOperation
        )

        # Screw hole
        plane_input2 = rootComp.constructionPlanes.createInput()
        plane_input2.setByOffset(rootComp.xYPlane, adsk.core.ValueInput.createByReal(cz + height))
        hole_plane = rootComp.constructionPlanes.add(plane_input2)

        sk2 = sketches.add(hole_plane)
        sk2.sketchCurves.sketchCircles.addByCenterRadius(center, hole_d / 2.0)

        if sk2.profiles.count > 0:
            features.extrudeFeatures.addSimple(
                sk2.profiles.item(0),
                adsk.core.ValueInput.createByReal(-(height + 2)),
                adsk.fusion.FeatureOperations.CutFeatureOperation
            )
        try:
            hole_plane.deleteMe()
        except:
            pass

    try:
        boss_plane.deleteMe()
    except:
        pass


# ==============================================================================
# PART 1: MAIN HOUSING (Upper Shell)
# ==============================================================================

def _build_main_housing(rootComp, p):
    """Build MainHousing as a named body in root component."""
    features = rootComp.features
    sketches = rootComp.sketches

    w  = p["body_width"]
    d  = p["body_depth"]
    hu = p["height_upper"]
    wt = p["wall_thickness"]
    cr = p["corner_radius_xy"]
    lip = p["mating_lip"]

    # 1. Outer solid
    sk = sketches.add(rootComp.xYPlane)
    _draw_rounded_rect(sk, 0, 0, w, d, cr, cr)
    profile = sk.profiles.item(0)

    ext = features.extrudeFeatures.addSimple(
        profile,
        adsk.core.ValueInput.createByReal(hu),
        adsk.fusion.FeatureOperations.NewBodyFeatureOperation
    )
    body = ext.bodies.item(0)
    body.name = "MainHousing"

    # 2. Shell from bottom face (Z=0)
    bottom_face = _find_face_at_z(body, 0.0, tol=1.0)
    if bottom_face:
        shell_input = features.shellFeatures.createInput(
            [bottom_face],
            adsk.core.ValueInput.createByReal(wt)
        )
        features.shellFeatures.add(shell_input)

    # 3. Mating lip step
    sk_lip = sketches.add(rootComp.xYPlane)
    _draw_rounded_rect(sk_lip, 0, 0, w, d, cr, cr)
    _draw_rounded_rect(sk_lip, 0, 0, w - 2*wt, d - 2*wt,
                       max(cr - wt, 0.5), max(cr - wt, 0.5))
    if sk_lip.profiles.count >= 2:
        features.extrudeFeatures.addSimple(
            sk_lip.profiles.item(1),
            adsk.core.ValueInput.createByReal(-lip),
            adsk.fusion.FeatureOperations.CutFeatureOperation
        )

    # 4. SCAN button hole (top face)
    btn_d = p["button_diameter"]
    btn_y = p["button_offset_y"]
    sk_btn = sketches.add(rootComp.xYPlane)
    sk_btn.sketchCurves.sketchCircles.addByCenterRadius(
        adsk.core.Point3D.create(0, btn_y, 0), btn_d / 2.0
    )
    if sk_btn.profiles.count > 0:
        features.extrudeFeatures.addSimple(
            sk_btn.profiles.item(0),
            adsk.core.ValueInput.createByReal(hu + 5),
            adsk.fusion.FeatureOperations.CutFeatureOperation
        )

    # 5. LED holes (top face)
    led_d = p["led_diameter"]
    led_sp = p["led_spacing"]
    led_ox = p["led_offset_x"]
    led_oy = p["led_offset_y"]
    led_n = int(p["led_count"])

    sk_led = sketches.add(rootComp.xYPlane)
    for i in range(led_n):
        ox = led_ox + (i - (led_n - 1) / 2.0) * led_sp
        sk_led.sketchCurves.sketchCircles.addByCenterRadius(
            adsk.core.Point3D.create(ox, led_oy, 0), led_d / 2.0
        )
    for i in range(sk_led.profiles.count):
        features.extrudeFeatures.addSimple(
            sk_led.profiles.item(i),
            adsk.core.ValueInput.createByReal(hu + 5),
            adsk.fusion.FeatureOperations.CutFeatureOperation
        )

    # 6. Power switch opening (right side, X = +w/2)
    sw_w = p["switch_width"]
    sw_h = p["switch_height"]
    sw_z = p["switch_z_offset"]

    sk_sw = sketches.add(rootComp.yZPlane)
    sl = sk_sw.sketchCurves.sketchLines
    sl.addByTwoPoints(
        adsk.core.Point3D.create(sw_z - sw_h/2, -sw_w/2, 0),
        adsk.core.Point3D.create(sw_z + sw_h/2, -sw_w/2, 0)
    )
    sl.addByTwoPoints(
        adsk.core.Point3D.create(sw_z + sw_h/2, -sw_w/2, 0),
        adsk.core.Point3D.create(sw_z + sw_h/2,  sw_w/2, 0)
    )
    sl.addByTwoPoints(
        adsk.core.Point3D.create(sw_z + sw_h/2,  sw_w/2, 0),
        adsk.core.Point3D.create(sw_z - sw_h/2,  sw_w/2, 0)
    )
    sl.addByTwoPoints(
        adsk.core.Point3D.create(sw_z - sw_h/2,  sw_w/2, 0),
        adsk.core.Point3D.create(sw_z - sw_h/2, -sw_w/2, 0)
    )
    if sk_sw.profiles.count > 0:
        features.extrudeFeatures.addSimple(
            sk_sw.profiles.item(0),
            adsk.core.ValueInput.createByReal(w / 2 + 5),
            adsk.fusion.FeatureOperations.CutFeatureOperation
        )

    # 7. USB port opening (rear face, Y = -d/2)
    usb_w = p["usb_width"]
    usb_h = p["usb_height"]

    sk_usb = sketches.add(rootComp.xZPlane)
    ul = sk_usb.sketchCurves.sketchLines
    ul.addByTwoPoints(
        adsk.core.Point3D.create(-usb_w/2, 0, 0),
        adsk.core.Point3D.create( usb_w/2, 0, 0)
    )
    ul.addByTwoPoints(
        adsk.core.Point3D.create( usb_w/2, 0, 0),
        adsk.core.Point3D.create( usb_w/2, usb_h, 0)
    )
    ul.addByTwoPoints(
        adsk.core.Point3D.create( usb_w/2, usb_h, 0),
        adsk.core.Point3D.create(-usb_w/2, usb_h, 0)
    )
    ul.addByTwoPoints(
        adsk.core.Point3D.create(-usb_w/2, usb_h, 0),
        adsk.core.Point3D.create(-usb_w/2, 0, 0)
    )
    if sk_usb.profiles.count > 0:
        features.extrudeFeatures.addSimple(
            sk_usb.profiles.item(0),
            adsk.core.ValueInput.createByReal(-(d / 2 + 5)),
            adsk.fusion.FeatureOperations.CutFeatureOperation
        )

    # 8. Assembly screw posts
    boss_od = p["boss_od"]
    boss_h = p["boss_h"]
    screw_d = p["screw_diameter"]
    margin = wt + 4

    for (bx, by) in [
        ( w/2 - margin,  d/2 - margin),
        (-w/2 + margin,  d/2 - margin),
        ( w/2 - margin, -d/2 + margin),
        (-w/2 + margin, -d/2 + margin),
    ]:
        _create_mounting_boss(rootComp, bx, by, lip, boss_od, screw_d, boss_h)

    # 9. Fillet top edges
    try:
        fillet_feat = features.filletFeatures
        fillet_input = fillet_feat.createInput()
        top_edges = []
        for edge in body.edges:
            try:
                mid = edge.pointOnEdge
                if abs(mid.z - hu) < 1.0:
                    top_edges.append(edge)
            except:
                continue
        if top_edges:
            fillet_input.addConstantRadiusEdgeSet(
                top_edges[:8],
                adsk.core.ValueInput.createByReal(1.5)
            )
            fillet_feat.add(fillet_input)
    except:
        pass


# ==============================================================================
# PART 2: BASE HOUSING (Lower Shell)
# ==============================================================================

def _build_base_housing(rootComp, p):
    """Build BaseHousing as a named body in root component."""
    features = rootComp.features
    sketches = rootComp.sketches

    w  = p["body_width"]
    d  = p["body_depth"]
    hl = p["height_lower"]
    wt = p["wall_thickness"]
    cr = p["corner_radius_xy"]

    # 1. Outer solid (extrude downward)
    sk = sketches.add(rootComp.xYPlane)
    _draw_rounded_rect(sk, 0, 0, w, d, cr, cr)
    profile = sk.profiles.item(0)

    ext = features.extrudeFeatures.addSimple(
        profile,
        adsk.core.ValueInput.createByReal(-hl),
        adsk.fusion.FeatureOperations.NewBodyFeatureOperation
    )
    body = ext.bodies.item(0)
    body.name = "BaseHousing"

    # 2. Shell from top face (Z=0)
    top_face = _find_face_at_z(body, 0.0, tol=1.0)
    if top_face:
        shell_input = features.shellFeatures.createInput(
            [top_face],
            adsk.core.ValueInput.createByReal(wt)
        )
        features.shellFeatures.add(shell_input)

    # 3. Probe adapter hole (through bottom)
    pa_id = p["probe_adapter_id"]

    sk_probe = sketches.add(rootComp.xYPlane)
    sk_probe.sketchCurves.sketchCircles.addByCenterRadius(
        adsk.core.Point3D.create(0, 0, 0), pa_id / 2.0
    )
    if sk_probe.profiles.count > 0:
        features.extrudeFeatures.addSimple(
            sk_probe.profiles.item(0),
            adsk.core.ValueInput.createByReal(-(hl + 5)),
            adsk.fusion.FeatureOperations.CutFeatureOperation
        )

    # 4. Reinforcement ring around probe hole
    pa_od = p["probe_adapter_od"]
    sk_ring = sketches.add(rootComp.xYPlane)
    sk_ring.sketchCurves.sketchCircles.addByCenterRadius(
        adsk.core.Point3D.create(0, 0, 0), pa_od / 2.0
    )
    sk_ring.sketchCurves.sketchCircles.addByCenterRadius(
        adsk.core.Point3D.create(0, 0, 0), pa_id / 2.0
    )
    if sk_ring.profiles.count >= 2:
        features.extrudeFeatures.addSimple(
            sk_ring.profiles.item(1),
            adsk.core.ValueInput.createByReal(-4),
            adsk.fusion.FeatureOperations.NewBodyFeatureOperation
        )

    # 5. Battery compartment pocket
    bat_sw = p["battery_slot_width"]
    bat_sd = p["battery_slot_depth"]

    sk_bat = sketches.add(rootComp.xYPlane)
    bl = sk_bat.sketchCurves.sketchLines
    bl.addByTwoPoints(
        adsk.core.Point3D.create(-bat_sw/2, -bat_sd/2, 0),
        adsk.core.Point3D.create( bat_sw/2, -bat_sd/2, 0)
    )
    bl.addByTwoPoints(
        adsk.core.Point3D.create( bat_sw/2, -bat_sd/2, 0),
        adsk.core.Point3D.create( bat_sw/2,  bat_sd/2, 0)
    )
    bl.addByTwoPoints(
        adsk.core.Point3D.create( bat_sw/2,  bat_sd/2, 0),
        adsk.core.Point3D.create(-bat_sw/2,  bat_sd/2, 0)
    )
    bl.addByTwoPoints(
        adsk.core.Point3D.create(-bat_sw/2,  bat_sd/2, 0),
        adsk.core.Point3D.create(-bat_sw/2, -bat_sd/2, 0)
    )
    if sk_bat.profiles.count > 0:
        features.extrudeFeatures.addSimple(
            sk_bat.profiles.item(0),
            adsk.core.ValueInput.createByReal(-(hl - wt - 2)),
            adsk.fusion.FeatureOperations.CutFeatureOperation
        )

    # 6. Battery cover screw holes (4 corners, through bottom)
    sc_d = p["screw_diameter"]
    mc = 5

    sk_screws = sketches.add(rootComp.xYPlane)
    for (sx, sy) in [
        ( w/2 - mc,  d/2 - mc),
        (-w/2 + mc,  d/2 - mc),
        ( w/2 - mc, -d/2 + mc),
        (-w/2 + mc, -d/2 + mc),
    ]:
        sk_screws.sketchCurves.sketchCircles.addByCenterRadius(
            adsk.core.Point3D.create(sx, sy, 0), sc_d / 2.0
        )
    for i in range(sk_screws.profiles.count):
        features.extrudeFeatures.addSimple(
            sk_screws.profiles.item(i),
            adsk.core.ValueInput.createByReal(-(hl + 5)),
            adsk.fusion.FeatureOperations.CutFeatureOperation
        )

    # 7. Fillet bottom edges
    try:
        fillet_feat = features.filletFeatures
        fillet_input = fillet_feat.createInput()
        bottom_edges = []
        for edge in body.edges:
            try:
                mid = edge.pointOnEdge
                if abs(mid.z - (-hl)) < 1.0:
                    bottom_edges.append(edge)
            except:
                continue
        if bottom_edges:
            fillet_input.addConstantRadiusEdgeSet(
                bottom_edges[:8],
                adsk.core.ValueInput.createByReal(1.0)
            )
            fillet_feat.add(fillet_input)
    except:
        pass


# ==============================================================================
# PART 3: BATTERY COVER
# ==============================================================================

def _build_battery_cover(rootComp, p):
    """Build BatteryCover as a named body in root component."""
    features = rootComp.features
    sketches = rootComp.sketches

    w  = p["body_width"]
    d  = p["body_depth"]
    wt = p["wall_thickness"]
    cr = p["corner_radius_xy"]
    sc_d = p["screw_diameter"]
    gd = p["gasket_depth"]
    margin = 5
    cover_thick = 3.0

    # 1. Cover panel
    sk = sketches.add(rootComp.xYPlane)
    _draw_rounded_rect(sk, 0, 0, w, d, cr, cr)
    profile = sk.profiles.item(0)

    ext = features.extrudeFeatures.addSimple(
        profile,
        adsk.core.ValueInput.createByReal(cover_thick),
        adsk.fusion.FeatureOperations.NewBodyFeatureOperation
    )
    body = ext.bodies.item(0)
    body.name = "BatteryCover"

    # 2. Gasket channel
    sk_gasket = sketches.add(rootComp.xYPlane)
    _draw_rounded_rect(sk_gasket, 0, 0,
                       w - 2*wt - 2, d - 2*wt - 2,
                       max(cr - wt - 1, 0.5), max(cr - wt - 1, 0.5))
    if sk_gasket.profiles.count > 0:
        features.extrudeFeatures.addSimple(
            sk_gasket.profiles.item(0),
            adsk.core.ValueInput.createByReal(gd),
            adsk.fusion.FeatureOperations.CutFeatureOperation
        )

    # 3. Screw holes
    sk_screws = sketches.add(rootComp.xYPlane)
    for (sx, sy) in [
        ( w/2 - margin,  d/2 - margin),
        (-w/2 + margin,  d/2 - margin),
        ( w/2 - margin, -d/2 + margin),
        (-w/2 + margin, -d/2 + margin),
    ]:
        sk_screws.sketchCurves.sketchCircles.addByCenterRadius(
            adsk.core.Point3D.create(sx, sy, 0), sc_d / 2.0
        )
    for i in range(sk_screws.profiles.count):
        features.extrudeFeatures.addSimple(
            sk_screws.profiles.item(i),
            adsk.core.ValueInput.createByReal(cover_thick + 5),
            adsk.fusion.FeatureOperations.CutFeatureOperation
        )

    # 4. Finger grip slot
    sk_grip = sketches.add(rootComp.xYPlane)
    gl = sk_grip.sketchCurves.sketchLines
    ghf = 15
    gvf = 2.5
    gl.addByTwoPoints(
        adsk.core.Point3D.create(-ghf, -gvf, 0),
        adsk.core.Point3D.create( ghf, -gvf, 0)
    )
    gl.addByTwoPoints(
        adsk.core.Point3D.create( ghf, -gvf, 0),
        adsk.core.Point3D.create( ghf,  gvf, 0)
    )
    gl.addByTwoPoints(
        adsk.core.Point3D.create( ghf,  gvf, 0),
        adsk.core.Point3D.create(-ghf,  gvf, 0)
    )
    gl.addByTwoPoints(
        adsk.core.Point3D.create(-ghf,  gvf, 0),
        adsk.core.Point3D.create(-ghf, -gvf, 0)
    )
    if sk_grip.profiles.count > 0:
        features.extrudeFeatures.addSimple(
            sk_grip.profiles.item(0),
            adsk.core.ValueInput.createByReal(-1.0),
            adsk.fusion.FeatureOperations.CutFeatureOperation
        )

    # 5. Fillet edges
    try:
        fillet_feat = features.filletFeatures
        fillet_input = fillet_feat.createInput()
        edge_list = list(body.edges)
        if edge_list:
            fillet_input.addConstantRadiusEdgeSet(
                edge_list[:min(12, len(edge_list))],
                adsk.core.ValueInput.createByReal(0.8)
            )
            fillet_feat.add(fillet_input)
    except:
        pass


# ==============================================================================
# PART 4: PROBE ADAPTER
# ==============================================================================

def _build_probe_adapter(rootComp, p):
    """Build ProbeAdapter as a named body in root component."""
    features = rootComp.features
    sketches = rootComp.sketches

    pa_od = p["probe_adapter_od"]
    pa_id = p["probe_adapter_id"]
    pa_h  = p["probe_adapter_h"]
    cable_od = p["probe_cable_od"]
    gd = p["gasket_depth"]
    gw = p["gasket_width"]

    center = adsk.core.Point3D.create(0, 0, 0)

    # 1. Outer cylinder
    sk_outer = sketches.add(rootComp.xYPlane)
    sk_outer.sketchCurves.sketchCircles.addByCenterRadius(center, pa_od / 2.0)

    ext = features.extrudeFeatures.addSimple(
        sk_outer.profiles.item(0),
        adsk.core.ValueInput.createByReal(pa_h),
        adsk.fusion.FeatureOperations.NewBodyFeatureOperation
    )
    body = ext.bodies.item(0)
    body.name = "ProbeAdapter"

    # 2. Inner bore (cable passage)
    sk_inner = sketches.add(rootComp.xYPlane)
    sk_inner.sketchCurves.sketchCircles.addByCenterRadius(center, pa_id / 2.0)

    if sk_inner.profiles.count > 0:
        features.extrudeFeatures.addSimple(
            sk_inner.profiles.item(0),
            adsk.core.ValueInput.createByReal(pa_h + 5),
            adsk.fusion.FeatureOperations.CutFeatureOperation
        )

    # 3. Cable strain relief bore (upper half)
    sk_cable = sketches.add(rootComp.xYPlane)
    sk_cable.sketchCurves.sketchCircles.addByCenterRadius(center, cable_od / 2.0)

    if sk_cable.profiles.count > 0:
        features.extrudeFeatures.addSimple(
            sk_cable.profiles.item(0),
            adsk.core.ValueInput.createByReal(pa_h * 0.5),
            adsk.fusion.FeatureOperations.CutFeatureOperation
        )

    # 4. Gasket groove
    try:
        groove_z = pa_h * 0.6
        plane_input = rootComp.constructionPlanes.createInput()
        plane_input.setByOffset(
            rootComp.xYPlane,
            adsk.core.ValueInput.createByReal(groove_z)
        )
        groove_plane = rootComp.constructionPlanes.add(plane_input)

        sk_gr = sketches.add(groove_plane)
        sk_gr.sketchCurves.sketchCircles.addByCenterRadius(center, pa_od / 2.0 + 0.1)
        sk_gr.sketchCurves.sketchCircles.addByCenterRadius(center, pa_od / 2.0 - gw)

        if sk_gr.profiles.count >= 2:
            features.extrudeFeatures.addSimple(
                sk_gr.profiles.item(1),
                adsk.core.ValueInput.createByReal(gd),
                adsk.fusion.FeatureOperations.CutFeatureOperation
            )
        groove_plane.deleteMe()
    except:
        pass

    # 5. Fillet top and bottom edges
    try:
        fillet_feat = features.filletFeatures
        fillet_input = fillet_feat.createInput()
        edge_list = []
        for edge in body.edges:
            try:
                mid = edge.pointOnEdge
                if abs(mid.z) < 0.5 or abs(mid.z - pa_h) < 0.5:
                    edge_list.append(edge)
            except:
                continue
        if edge_list:
            fillet_input.addConstantRadiusEdgeSet(
                edge_list[:4],
                adsk.core.ValueInput.createByReal(0.5)
            )
            fillet_feat.add(fillet_input)
    except:
        pass


# ==============================================================================
# PART 5: PROBE ASSEMBLY (Simplified Reference)
# ==============================================================================

def _build_probe_reference(rootComp, p):
    """Build simplified probe reference as a named body in root component."""
    features = rootComp.features
    sketches = rootComp.sketches

    probe_od = p["probe_body_od"]
    probe_len = p["probe_length"]
    probe_tip = p["probe_tip_length"]
    cable_od = p["probe_cable_od"]
    cable_len = 150

    center = adsk.core.Point3D.create(0, 0, 0)

    # 1. Probe shaft
    sk_body = sketches.add(rootComp.xYPlane)
    sk_body.sketchCurves.sketchCircles.addByCenterRadius(center, probe_od / 2.0)

    ext = features.extrudeFeatures.addSimple(
        sk_body.profiles.item(0),
        adsk.core.ValueInput.createByReal(-probe_len),
        adsk.fusion.FeatureOperations.NewBodyFeatureOperation
    )
    body = ext.bodies.item(0)
    body.name = "ProbeAssembly"

    # 2. Sensing tip
    tip_d = probe_od - 4
    sk_tip = sketches.add(rootComp.xYPlane)
    sk_tip.sketchCurves.sketchCircles.addByCenterRadius(center, tip_d / 2.0)

    if sk_tip.profiles.count > 0:
        features.extrudeFeatures.addSimple(
            sk_tip.profiles.item(0),
            adsk.core.ValueInput.createByReal(-(probe_len + probe_tip)),
            adsk.fusion.FeatureOperations.NewBodyFeatureOperation
        )

    # 3. Cable
    sk_cable = sketches.add(rootComp.xYPlane)
    sk_cable.sketchCurves.sketchCircles.addByCenterRadius(center, cable_od / 2.0)

    if sk_cable.profiles.count > 0:
        features.extrudeFeatures.addSimple(
            sk_cable.profiles.item(0),
            adsk.core.ValueInput.createByReal(cable_len),
            adsk.fusion.FeatureOperations.NewBodyFeatureOperation
        )

    # 4. Tapered transition (approximate with annular ring)
    try:
        taper_h = probe_tip * 0.3
        taper_bot_z = -(probe_len + taper_h)

        plane_taper = rootComp.constructionPlanes.createInput()
        plane_taper.setByOffset(
            rootComp.xYPlane,
            adsk.core.ValueInput.createByReal(taper_bot_z)
        )
        tplane = rootComp.constructionPlanes.add(plane_taper)

        sk_taper = sketches.add(tplane)
        sk_taper.sketchCurves.sketchCircles.addByCenterRadius(center, probe_od / 2.0)
        sk_taper.sketchCurves.sketchCircles.addByCenterRadius(center, tip_d / 2.0)

        if sk_taper.profiles.count >= 2:
            features.extrudeFeatures.addSimple(
                sk_taper.profiles.item(1),
                adsk.core.ValueInput.createByReal(taper_h),
                adsk.fusion.FeatureOperations.NewBodyFeatureOperation
            )
        tplane.deleteMe()
    except:
        pass


# ==============================================================================
# PART 6: ELECTRONICS REFERENCES
# ==============================================================================

def _build_electronics_references(rootComp, p):
    """Create simplified reference bodies for internal electronics."""
    features = rootComp.features
    sketches = rootComp.sketches

    hu = p["height_upper"]
    hl = p["height_lower"]

    electronics = [
        ("ESP32_DevKit",   p["esp32_length"],  p["esp32_width"],  p["esp32_height"],
         (0, 5, hu/2 + 5)),
        ("RS485_Module",   p["rs485_length"],  p["rs485_width"],  p["rs485_height"],
         (0, -12, hu/2 + 5)),
        ("BatteryHolder",  p["battery_18650_length"], p["battery_18650_dia"]*2+4,
         p["battery_18650_dia"]+2, (0, 0, -(hl/2))),
        ("TP4056_Charger", p["tp4056_length"], p["tp4056_width"], p["tp4056_height"],
         (0, -p["body_depth"]/2 + 10, -(hl/2))),
        ("DCDC_Converter", p["dcdc_length"],   p["dcdc_width"],   p["dcdc_height"],
         (15, -10, -(hl/2))),
        ("Perfboard_PCB",  p["pcb_length"],    p["pcb_width"],    p["pcb_height"],
         (0, 0, hu/2 + p["pcb_standoff_h"])),
    ]

    for name, el, ew, eh, pos in electronics:
        _create_ref_box(rootComp, name, el, ew, eh, pos)


def _create_ref_box(comp, name, length, width, height, position):
    """Create a simple box body as a dimensional reference."""
    features = comp.features
    sketches = comp.sketches
    cx, cy, cz = position

    sk = sketches.add(comp.xYPlane)
    lines = sk.sketchCurves.sketchLines
    lines.addByTwoPoints(
        adsk.core.Point3D.create(cx - width/2, cy - length/2, 0),
        adsk.core.Point3D.create(cx + width/2, cy - length/2, 0)
    )
    lines.addByTwoPoints(
        adsk.core.Point3D.create(cx + width/2, cy - length/2, 0),
        adsk.core.Point3D.create(cx + width/2, cy + length/2, 0)
    )
    lines.addByTwoPoints(
        adsk.core.Point3D.create(cx + width/2, cy + length/2, 0),
        adsk.core.Point3D.create(cx - width/2, cy + length/2, 0)
    )
    lines.addByTwoPoints(
        adsk.core.Point3D.create(cx - width/2, cy + length/2, 0),
        adsk.core.Point3D.create(cx - width/2, cy - length/2, 0)
    )

    if sk.profiles.count > 0:
        ext = features.extrudeFeatures.addSimple(
            sk.profiles.item(0),
            adsk.core.ValueInput.createByReal(height),
            adsk.fusion.FeatureOperations.NewBodyFeatureOperation
        )
        body = ext.bodies.item(0)
        body.name = name


# ==============================================================================
# END OF SCRIPT
# ==============================================================================
