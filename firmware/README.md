# Smart Soil Analyzer — ESP32 firmware

Firmware for the *Smart Soil Analyzer* device designed in
`scripts/smart_soil_analyzer_fusion360.py` (MainHousing + BaseHousing +
ProbeAdapter + 7-in-1 RS485 probe).

## What it does

1. Wakes from deep sleep on a timer.
2. Powers the RS485 transceiver and reads the 7-in-1 soil probe over Modbus RTU.
3. Writes the temperature-compensated reading to the probe's own registers.
4. `POST`s the reading to the Cloudflare Worker `/api/v1/sensors/readings`.
5. Returns to deep sleep. Wi-Fi is only powered during the upload window.

Readings are buffered in RTC memory so a failed upload is retried on the next
wake instead of being lost — rural connectivity is intermittent.

## Hardware

| Part | Purpose | CAD reference body |
|---|---|---|
| ESP32 DevKit v1 | MCU + Wi-Fi | `ESP32_DevKit` |
| MAX485 / TTL-RS485 module | Modbus RTU half-duplex | `RS485_Module` |
| 7-in-1 soil probe (RS485, Modbus) | moisture, temperature, EC, pH, N, P, K | `ProbeAssembly` |
| 18650 cell + holder | power | `BatteryHolder` |
| TP4056 | Li-ion charging | `TP4056_Charger` |
| DC-DC buck | 3.7 V → 5 V for the probe | `DCDC_Converter` |

The 7-in-1 probe requires **5 V** during measurement; the ESP32 runs from 3.3 V.
Power the probe rail from a GPIO-controlled MOSFET so it is only energised
during a reading, which is what makes multi-month battery life possible.

## Wiring (matches the ProbeAdapter cut-out)

| ESP32 | MAX485 / probe |
|---|---|
| GPIO 16 (RX2) | RO |
| GPIO 17 (TX2) | DI |
| GPIO 4 | DE + RE (tied together) |
| GPIO 25 | probe power MOSFET gate |
| GPIO 34 (ADC1) | battery divider (optional) |
| 3V3 / GND | module VCC / GND |
| 5V rail | probe VCC (switched) |

## Modbus register map (7-in-1 probe, address 0x01)

| Register | Quantity | Scale |
|---|---|---|
| `0x0000` | Moisture | 0.1 % |
| `0x0001` | Temperature | 0.1 °C (signed) |
| `0x0002` | EC | 1 µS/cm |
| `0x0003` | pH | 0.1 |
| `0x0004` | Nitrogen | 1 mg/kg |
| `0x0005` | Phosphorus | 1 mg/kg |
| `0x0006` | Potassium | 1 mg/kg |

`moisture_raw` is sent exactly as the probe reports it (before scaling), and
`calibration_version` records which calibration curve produced
`moisture_percent`. That way a future recalibration does not silently rewrite
the meaning of historical rows.

## Configuration

Create `include/secrets.h` from the example and flash:

```cpp
// include/secrets.h
#define WIFI_SSID       "your-ssid"
#define WIFI_PASSWORD   "your-password"
#define API_BASE        "https://smart-farming-api.2251081204.workers.dev"
#define DEVICE_ID       "ssa-01"
#define DEVICE_API_KEY  "sfa_ssa-01_..."   // from POST /api/v1/devices
```

`DEVICE_API_KEY` is shown **once** when the device is registered through the
dashboard. Treat it like a password; rotate it via
`POST /api/v1/devices/rotate-key` if it leaks.

## Build and flash

```bash
cd firmware/esp32_soil_analyzer
pio run                 # build
pio run --target upload # flash
pio device monitor      # 115200 baud serial log
```

## Sleeping and reporting cadence

`SLEEP_INTERVAL_SECONDS` defaults to 1800 (30 minutes). The probe needs ~1 s to
stabilise after power-up, so each wake costs roughly 3 s of radio time. At 30
minute intervals an 18650 cell lasts months, which matches the field deployment
assumption in the project report.
