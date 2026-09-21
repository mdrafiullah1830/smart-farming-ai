/*
 * Smart Soil Analyzer — ESP32 firmware.
 *
 * Reads a 7-in-1 RS485 soil probe over Modbus RTU, posts the reading to the
 * Cloudflare Worker, then deep-sleeps. Any reading that fails to upload is kept
 * in RTC memory and retried on the next wake, because field connectivity is
 * intermittent and a lost reading cannot be recovered.
 *
 * Contract with the backend (apps/worker-api/src/sensors.ts):
 *   POST /api/v1/sensors/readings
 *   headers: X-Device-Key: <device key>, Content-Type: application/json
 *   body: { device_id, recorded_at, moisture_raw, moisture_percent,
 *           soil_temperature_c, battery_percent, calibration_version, crop }
 *   -> 201 { success, id, device_id, advisories: [...] }
 *
 * The device must be registered first (POST /api/v1/devices) so that the API key
 * resolves to an owner; an unregistered device key gets HTTP 403.
 */
#include <Arduino.h>
#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <ModbusMaster.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>

#include "config.h"
#include "secrets.h"

namespace {

// --- RS485 half-duplex direction control -------------------------------------
void rs485Transmit() { digitalWrite(PIN_RS485_DE, HIGH); }
void rs485Receive() { digitalWrite(PIN_RS485_DE, LOW); }

// --- Calibration -------------------------------------------------------------
// The probe reports a raw 0-100 scaled reading, which is not volumetric water
// content. These endpoints come from the field calibration in the project
// report; changing them REQUIRES bumping CALIBRATION_VERSION so historical rows
// stay interpretable.
float rawToMoisturePercent(uint16_t raw) {
  const float rawMin = static_cast<float>(MOISTURE_RAW_AIR);
  const float rawMax = static_cast<float>(MOISTURE_RAW_WATER);
  if (rawMax <= rawMin) return NAN;
  float percent = (static_cast<float>(raw) - rawMin) * 100.0f / (rawMax - rawMin);
  if (percent < 0.0f) percent = 0.0f;
  if (percent > 100.0f) percent = 100.0f;
  return percent;
}

// --- Probe -------------------------------------------------------------------
struct ProbeReading {
  bool ok = false;
  uint16_t moistureRaw = 0;
  float moisturePercent = NAN;
  float soilTempC = NAN;
};

ProbeReading readProbe(ModbusMaster &node) {
  ProbeReading reading;

  // The probe's data registers require the baud rate to be written first;
  // 0x0001 = 9600, and the write is ignored by probes already at that rate.
  node.writeSingleRegister(REG_BAUD, 1);
  delay(PROBE_SETTLE_MS);

  uint8_t result = node.readHoldingRegisters(REG_MOISTURE, 7);
  if (result != node.ku8MBSuccess) {
    Serial.printf("[probe] read failed, modbus code %u\n", result);
    return reading;
  }

  const uint16_t rawMoisture = node.getResponseBuffer(0);
  const int16_t rawTemp = static_cast<int16_t>(node.getResponseBuffer(1));

  reading.ok = true;
  reading.moistureRaw = rawMoisture;
  reading.moisturePercent = rawToMoisturePercent(rawMoisture);
  reading.soilTempC = rawTemp / 10.0f;
  return reading;
}

// --- Battery -----------------------------------------------------------------
// Optional divider on PIN_BATTERY_ADC. Returns NAN when the pin is not wired,
// which the backend stores as NULL rather than as 0%.
float readBatteryPercent() {
  if (PIN_BATTERY_ADC < 0) return NAN;
  const uint32_t millivolts = analogReadMilliVolts(PIN_BATTERY_ADC) * BATTERY_DIVIDER_RATIO;
  const float voltage = millivolts / 1000.0f;
  float percent = (voltage - BATTERY_EMPTY_V) * 100.0f / (BATTERY_FULL_V - BATTERY_EMPTY_V);
  if (percent < 0.0f) percent = 0.0f;
  if (percent > 100.0f) percent = 100.0f;
  return percent;
}

// --- Pending upload buffer ---------------------------------------------------
// RTC memory survives deep sleep but not a power cycle, which is the right
// trade-off: a flat battery legitimately loses unsent readings.
struct PendingReading {
  uint16_t moistureRaw;
  float moisturePercent;
  float soilTempC;
  float batteryPercent;
  uint64_t recordedAtEpoch;
};

RTC_DATA_ATTR PendingReading pending[PENDING_CAPACITY];
RTC_DATA_ATTR uint8_t pendingCount = 0;

void enqueuePending(const ProbeReading &reading, float batteryPercent) {
  if (pendingCount >= PENDING_CAPACITY) {
    // Drop the oldest so the newest reading is never the one discarded.
    for (uint8_t i = 1; i < PENDING_CAPACITY; ++i) pending[i - 1] = pending[i];
    pendingCount = PENDING_CAPACITY - 1;
    Serial.println("[queue] full, dropped oldest reading");
  }
  PendingReading &slot = pending[pendingCount++];
  slot.moistureRaw = reading.moistureRaw;
  slot.moisturePercent = reading.moisturePercent;
  slot.soilTempC = reading.soilTempC;
  slot.batteryPercent = batteryPercent;
  slot.recordedAtEpoch = static_cast<uint64_t>(time(nullptr));
}

void popPending() {
  for (uint8_t i = 1; i < pendingCount; ++i) pending[i - 1] = pending[i];
  if (pendingCount > 0) --pendingCount;
}

// --- Networking --------------------------------------------------------------
bool connectWifi() {
  if (WiFi.status() == WL_CONNECTED) return true;
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  const unsigned long deadline = millis() + WIFI_CONNECT_TIMEOUT_MS;
  while (WiFi.status() != WL_CONNECTED && millis() < deadline) {
    delay(200);
    Serial.print('.');
  }
  Serial.println();
  return WiFi.status() == WL_CONNECTED;
}

/** Format an epoch second as an ISO-8601 UTC string, as the backend expects. */
String iso8601(uint64_t epochSeconds) {
  time_t raw = static_cast<time_t>(epochSeconds);
  struct tm timeinfo;
  gmtime_r(&raw, &timeinfo);
  char buffer[25];
  strftime(buffer, sizeof(buffer), "%Y-%m-%dT%H:%M:%SZ", &timeinfo);
  return String(buffer);
}

/**
 * Upload one buffered reading.
 *
 * Returns true only on a 2xx response. A 4xx is treated as permanent (the key is
 * wrong or the device was revoked) and the reading is dropped after logging,
 * because retrying it forever would block the queue.
 */
bool uploadReading(const PendingReading &reading) {
  WiFiClientSecure client;
  
  // Use embedded CA certificate instead of setInsecure()
  // This validates the server certificate against Google Trust Services (GTS Root R1)
  // which issues certificates for *.workers.dev domains
  client.setCACert(CA_CERT_PEM);

  HTTPClient http;
  const String url = String(API_BASE) + API_PATH;
  if (!http.begin(client, url)) {
    Serial.println("[http] begin failed");
    return false;
  }

  http.setTimeout(HTTP_TIMEOUT_MS);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Key", DEVICE_API_KEY);

  JsonDocument doc;
  doc["device_id"] = DEVICE_ID;
  doc["firmware_version"] = FIRMWARE_VERSION;
  doc["recorded_at"] = iso8601(reading.recordedAtEpoch);
  doc["moisture_raw"] = reading.moistureRaw;
  doc["calibration_version"] = CALIBRATION_VERSION;
  if (!isnan(reading.moisturePercent)) doc["moisture_percent"] = reading.moisturePercent;
  if (!isnan(reading.soilTempC)) doc["soil_temperature_c"] = reading.soilTempC;
  if (!isnan(reading.batteryPercent)) doc["battery_percent"] = reading.batteryPercent;

  String payload;
  serializeJson(doc, payload);

  const int status = http.POST(payload);
  if (status <= 0) {
    Serial.printf("[http] transport error: %s\n", http.errorToString(status).c_str());
    http.end();
    return false;
  }

  Serial.printf("[http] %d %s\n", status, http.getString().c_str());
  http.end();

  if (status >= 200 && status < 300) return true;

  // 401/403 mean the credential itself is wrong; retrying cannot help.
  if (status == 401 || status == 403) {
    Serial.println("[http] credential rejected — dropping reading");
    return true;
  }
  return false;
}

/** Try to drain the buffer, oldest first. Stops at the first failure. */
void flushPending() {
  while (pendingCount > 0) {
    if (!uploadReading(pending[0])) {
      Serial.printf("[queue] %u reading(s) still pending\n", pendingCount);
      return;
    }
    popPending();
  }
  Serial.println("[queue] buffer empty");
}

void goToDeepSleep() {
  Serial.printf("[sleep] %u s\n", SLEEP_INTERVAL_SECONDS);
  WiFi.disconnect(true);
  WiFi.mode(WIFI_OFF);
  esp_sleep_enable_timer_wakeup(static_cast<uint64_t>(SLEEP_INTERVAL_SECONDS) * 1000000ULL);
  esp_deep_sleep_start();
}

}  // namespace

void setup() {
  Serial.begin(115200);
  delay(200);  // Let the USB-serial bridge attach, so early boot logs survive.

  const bool wokeFromTimer = esp_sleep_get_wakeup_cause() == ESP_SLEEP_WAKEUP_TIMER;
  Serial.printf("\n[ boot] %s fw=%s\n", DEVICE_ID, FIRMWARE_VERSION);
  Serial.printf("[ boot] %s, %u reading(s) buffered\n",
                wokeFromTimer ? "resumed from deep sleep" : "cold start", pendingCount);

  // 1. Power the probe rail and read it over Modbus.
  pinMode(PIN_PROBE_POWER, OUTPUT);
  digitalWrite(PIN_PROBE_POWER, HIGH);
  delay(PROBE_SETTLE_MS);

  pinMode(PIN_RS485_DE, OUTPUT);
  digitalWrite(PIN_RS485_DE, LOW);  // Listen by default.

  Serial2.begin(PROBE_BAUD, SERIAL_8N1, PIN_RS485_RX, PIN_RS485_TX);
  ModbusMaster node;
  node.begin(PROBE_SLAVE_ID, Serial2);
  node.preTransmission(rs485Transmit);
  node.postTransmission(rs485Receive);

  const ProbeReading reading = readProbe(node);

  // The probe rail is switched off again immediately: it is the dominant load.
  digitalWrite(PIN_PROBE_POWER, LOW);
  Serial2.end();

  if (!reading.ok) {
    // No sample this wake. Do not sleep longer than usual — a failed read often
    // means a loose connector the farmer should fix, not a drained battery.
    Serial.println("[probe] no reading; skipping upload this cycle");
    goToDeepSleep();
    return;
  }

  const float batteryPercent = readBatteryPercent();
  enqueuePending(reading, batteryPercent);
  Serial.printf("[probe] raw=%u moisture=%.1f%% soil=%.1fC battery=%s\n",
                reading.moistureRaw, reading.moisturePercent, reading.soilTempC,
                isnan(batteryPercent) ? "n/a" : String(batteryPercent, 0).c_str());

  // 2. Upload everything queued. Wall-clock time comes from the network.
  if (connectWifi()) {
    configTime(0, 0, "pool.ntp.org", "time.google.com");
    // The queue entry recorded time(nullptr) before NTP, so re-stamp the newest
    // reading once the clock is trustworthy.
    if (time(nullptr) > 1600000000) {
      pending[pendingCount - 1].recordedAtEpoch = static_cast<uint64_t>(time(nullptr));
    }
    flushPending();
  } else {
    Serial.println("[wifi] unavailable; reading stays buffered");
  }

  goToDeepSleep();
}

void loop() {
  // Unused: setup() always ends in deep sleep.
}

