/**
 * Pure advisory rule set for sensor readings.
 *
 * Split out of `sensors.ts` so it can be imported by tests (and by the AI
 * service parity check) without pulling in Cloudflare bindings.
 *
 * Every input is nullable because a field device may omit sensors. A missing
 * value must never produce an alert — silence is not a low reading.
 */
import type { Advisory, ThresholdRow } from './sensors.types.ts';
export { DEFAULT_THRESHOLDS } from './sensors.types.ts';

export function evaluateReading(
  reading: { moisture_percent?: number | null; soil_temperature_c?: number | null; battery_percent?: number | null },
  thresholds: ThresholdRow,
): Advisory[] {
  const out: Advisory[] = [];
  const moisture = reading.moisture_percent;
  const soilTemp = reading.soil_temperature_c;
  const battery = reading.battery_percent;

  if (typeof moisture === 'number' && Number.isFinite(moisture)) {
    if (moisture < thresholds.moisture_min_percent) {
      out.push({
        code: 'moisture_low',
        severity: moisture < thresholds.moisture_min_percent / 2 ? 'critical' : 'warning',
        message_en: `Soil moisture is ${moisture.toFixed(1)}% — below the ${thresholds.moisture_min_percent}% threshold. Irrigate early morning.`,
        message_bn: `মাটির আর্দ্রতা ${moisture.toFixed(1)}% — নির্ধারিত ${thresholds.moisture_min_percent}% সীমার নিচে। সকালে সেচ দিন।`,
      });
    } else if (moisture > thresholds.moisture_max_percent) {
      out.push({
        code: 'moisture_high',
        severity: 'warning',
        message_en: `Soil moisture is ${moisture.toFixed(1)}% — above the ${thresholds.moisture_max_percent}% threshold. Check field drainage.`,
        message_bn: `মাটির আর্দ্রতা ${moisture.toFixed(1)}% — নির্ধারিত ${thresholds.moisture_max_percent}% সীমার উপরে। জল নিষ্কাশন পরীক্ষা করুন।`,
      });
    }
  }

  if (typeof soilTemp === 'number' && Number.isFinite(soilTemp)) {
    if (soilTemp < thresholds.soil_temp_min_c) {
      out.push({
        code: 'soil_temp_low',
        severity: 'warning',
        message_en: `Soil temperature is ${soilTemp.toFixed(1)}°C — below the ${thresholds.soil_temp_min_c}°C threshold. Delay sowing and protect seedlings.`,
        message_bn: `মাটির তাপমাত্রা ${soilTemp.toFixed(1)}°C — নির্ধারিত ${thresholds.soil_temp_min_c}°C সীমার নিচে। বপন স্থগিত রাখুন ও চারাগাছ রক্ষা করুন।`,
      });
    } else if (soilTemp > thresholds.soil_temp_max_c) {
      out.push({
        code: 'soil_temp_high',
        severity: 'warning',
        message_en: `Soil temperature is ${soilTemp.toFixed(1)}°C — above the ${thresholds.soil_temp_max_c}°C threshold. Apply mulch and irrigate in the evening.`,
        message_bn: `মাটির তাপমাত্রা ${soilTemp.toFixed(1)}°C — নির্ধারিত ${thresholds.soil_temp_max_c}°C সীমার উপরে। মালচ দিন ও বিকেলে সেচ দিন।`,
      });
    }
  }

  if (typeof battery === 'number' && Number.isFinite(battery) && battery < thresholds.battery_min_percent) {
    out.push({
      code: 'battery_low',
      severity: battery < thresholds.battery_min_percent / 2 ? 'critical' : 'warning',
      message_en: `Device battery is ${battery.toFixed(0)}% — charge or replace the cell to keep reporting.`,
      message_bn: `ডিভাইসের ব্যাটারি ${battery.toFixed(0)}% — রিপোর্ট চালু রাখতে চার্জ দিন বা সেল বদলান।`,
    });
  }

  return out;
}
