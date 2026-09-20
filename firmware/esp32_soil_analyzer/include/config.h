/*
 * Compile-time configuration for the Smart Soil Analyzer.
 *
 * Credentials live in `secrets.h`, which is git-ignored. See `secrets.example.h`.
 */
#pragma once

// --- Firmware identity -------------------------------------------------------
// Reported to the backend so a fleet can be audited for stale firmware.
#define FIRMWARE_VERSION "1.0.0"

// --- GPIO --------------------------------------------------------------------
// Numbers match the wiring table in ../README.md and the ProbeAdapter cut-out.
#define PIN_RS485_RX 16              // ESP32 RX2  <- MAX485 RO
#define PIN_RS485_TX 17              // ESP32 TX2  -> MAX485 DI
#define PIN_RS485_DE 4               // DE + RE tied together
#define PIN_PROBE_POWER 25           // MOSFET gate for the switched 5 V rail
#define PIN_BATTERY_ADC 34           // ADC1 channel; -1 when not wired

// --- Probe -------------------------------------------------------------------
#define PROBE_BAUD 9600
#define PROBE_SLAVE_ID 0x01

// Holding registers (see ../README.md for the full map).
#define REG_MOISTURE 0x0000
#define REG_BAUD 0x0200

// The 7-in-1 probe needs ~1 s after power-up before it answers reliably.
#define PROBE_SETTLE_MS 1000

// --- Calibration -------------------------------------------------------------
// Bump CALIBRATION_VERSION whenever the raw endpoints below change, so readings
// recorded under a different curve remain interpretable.
#define CALIBRATION_VERSION "raw-2026-09"

// Raw probe output in air and in saturated soil.
#define MOISTURE_RAW_AIR 2900
#define MOISTURE_RAW_WATER 1050

// --- Power -------------------------------------------------------------------
#define BATTERY_DIVIDER_RATIO 2.0f   // 100k/100k divider
#define BATTERY_EMPTY_V 3.30f
#define BATTERY_FULL_V 4.20f

// --- Sampling cadence --------------------------------------------------------
// 30 minutes balances battery life against how quickly drying soil is noticed.
#define SLEEP_INTERVAL_SECONDS 1800

// --- Networking --------------------------------------------------------------
#define WIFI_CONNECT_TIMEOUT_MS 15000
#define HTTP_TIMEOUT_MS 10000

// --- TLS Certificate ---------------------------------------------------------
// GTS Root R1 certificate from Google Trust Services (pki.goog).
// Validates *.workers.dev domains used by Cloudflare Workers.
// This eliminates the need for client.setInsecure() which disables cert validation.
// Source: https://pki.goog/roots.pem
extern const char CA_CERT_PEM[];
extern const size_t CA_CERT_PEM_LEN;

// --- Offline buffer ----------------------------------------------------------
#define PENDING_CAPACITY 24          // 12 hours of readings at 30-minute cadence
