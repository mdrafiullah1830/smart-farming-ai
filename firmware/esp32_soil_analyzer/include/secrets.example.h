/*
 * Copy this file to `secrets.h` and fill in real values.
 *
 * `secrets.h` is git-ignored; never commit real credentials.
 */
#pragma once

#define WIFI_SSID "your-wifi-ssid"
#define WIFI_PASSWORD "your-wifi-password"

// Cloudflare Worker origin (no trailing slash).
#define API_BASE "https://smart-farming-api.2251081204.workers.dev"

// Ingestion endpoint created by the Worker router.
#define API_PATH "/api/v1/sensors/readings"

// Device identity. DEVICE_ID must be registered first through
// POST /api/v1/devices, which returns DEVICE_API_KEY exactly once.
#define DEVICE_ID "ssa-01"
#define DEVICE_API_KEY "sfa_ssa-01_replace-with-the-issued-key"
