/**
 * Shared sensor types with no runtime imports.
 *
 * Kept separate from `sensors.ts` so that pure modules (`sensors.rules.ts`)
 * and node:test unit tests can import the contracts without loading
 * Cloudflare bindings or the auth module.
 */
export type ThresholdRow = {
  moisture_min_percent: number;
  moisture_max_percent: number;
  soil_temp_min_c: number;
  soil_temp_max_c: number;
  battery_min_percent: number;
};

export type Advisory = {
  code: string;
  severity: 'info' | 'warning' | 'critical';
  message_en: string;
  message_bn: string;
};

export type DeviceContext = { ownerId: string; deviceId: string | null; via: 'user' | 'device' };

/**
 * Default advisory limits, used until a device saves its own.
 *
 * The moisture band reflects the 25-80% range that is workable for the major
 * BARC cereal and tuber crops; outside it the soil is either drought-stressed
 * or waterlogged. The soil-temperature band is the germination window.
 */
export const DEFAULT_THRESHOLDS: ThresholdRow = {
  moisture_min_percent: 25,
  moisture_max_percent: 80,
  soil_temp_min_c: 12,
  soil_temp_max_c: 38,
  battery_min_percent: 20,
};

