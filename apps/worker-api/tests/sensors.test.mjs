import assert from 'node:assert/strict';
import test, { describe, it } from 'node:test';
import { DEFAULT_THRESHOLDS, evaluateReading } from '../src/sensors.rules.ts';
import { validateReading } from '../src/sensors.ts';

describe('evaluateReading', () => {
  it('raises nothing when every value is inside its threshold', () => {
    const advisories = evaluateReading(
      { moisture_percent: 45, soil_temperature_c: 24, battery_percent: 80 },
      DEFAULT_THRESHOLDS,
    );
    assert.deepEqual(advisories, []);
  });

  it('raises a warning for moisture just below the minimum', () => {
    const [advisory] = evaluateReading({ moisture_percent: 20 }, DEFAULT_THRESHOLDS);
    assert.equal(advisory.code, 'moisture_low');
    assert.equal(advisory.severity, 'warning');
    assert.match(advisory.message_en, /20\.0%/);
  });

  it('escalates to critical below half the minimum', () => {
    const [advisory] = evaluateReading({ moisture_percent: 10 }, DEFAULT_THRESHOLDS);
    assert.equal(advisory.severity, 'critical');
  });

  it('raises moisture_high above the maximum', () => {
    const [advisory] = evaluateReading({ moisture_percent: 92 }, DEFAULT_THRESHOLDS);
    assert.equal(advisory.code, 'moisture_high');
  });

  it('treats the threshold boundaries as acceptable', () => {
    // min and max themselves are not violations; only strictly outside is.
    assert.deepEqual(evaluateReading({ moisture_percent: 25 }, DEFAULT_THRESHOLDS), []);
    assert.deepEqual(evaluateReading({ moisture_percent: 80 }, DEFAULT_THRESHOLDS), []);
  });

  it('raises soil temperature advisories on both sides', () => {
    assert.equal(evaluateReading({ soil_temperature_c: 5 }, DEFAULT_THRESHOLDS)[0].code, 'soil_temp_low');
    assert.equal(evaluateReading({ soil_temperature_c: 44 }, DEFAULT_THRESHOLDS)[0].code, 'soil_temp_high');
  });

  it('escalates a critically low battery', () => {
    const [advisory] = evaluateReading({ battery_percent: 5 }, DEFAULT_THRESHOLDS);
    assert.equal(advisory.code, 'battery_low');
    assert.equal(advisory.severity, 'critical');
  });

  it('stays silent when a sensor is absent', () => {
    // A device that has no temperature probe must not be reported as too cold.
    assert.deepEqual(evaluateReading({ moisture_percent: null, soil_temperature_c: undefined }, DEFAULT_THRESHOLDS), []);
    assert.deepEqual(evaluateReading({}, DEFAULT_THRESHOLDS), []);
  });

  it('ignores NaN and Infinity instead of alerting', () => {
    assert.deepEqual(evaluateReading({ moisture_percent: Number.NaN }, DEFAULT_THRESHOLDS), []);
    assert.deepEqual(evaluateReading({ moisture_percent: Number.POSITIVE_INFINITY }, DEFAULT_THRESHOLDS), []);
  });

  it('raises several advisories at once', () => {
    const advisories = evaluateReading(
      { moisture_percent: 8, soil_temperature_c: 50, battery_percent: 3 },
      DEFAULT_THRESHOLDS,
    );
    assert.deepEqual(advisories.map((a) => a.code).sort(), ['battery_low', 'moisture_low', 'soil_temp_high']);
  });

  it('always provides both Bangla and English text', () => {
    for (const advisory of evaluateReading({ moisture_percent: 1, battery_percent: 1 }, DEFAULT_THRESHOLDS)) {
      assert.ok(advisory.message_en.length > 0);
      assert.ok(advisory.message_bn.length > 0);
      assert.notEqual(advisory.message_en, advisory.message_bn);
    }
  });
});

describe('validateReading', () => {
  it('accepts a minimal reading and stamps the current time', () => {
    const result = validateReading({ moisture_raw: 512, moisture_percent: 34 });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.values.moisture_percent, 34);
    assert.ok(!Number.isNaN(Date.parse(String(result.values.recorded_at))));
  });

  it('keeps absent optional fields out of the output', () => {
    const result = validateReading({ moisture_raw: 512 });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal('soil_temperature_c' in result.values, false);
  });

  it('rejects out-of-range percentages', () => {
    const result = validateReading({ moisture_percent: 140 });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.match(result.message, /between 0 and 100/);
  });

  it('rejects non-numeric values instead of coercing them', () => {
    const result = validateReading({ moisture_percent: 'wet' });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.match(result.message, /finite number/);
  });

  it('rejects a bad timestamp', () => {
    const result = validateReading({ recorded_at: 'yesterday' });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.match(result.message, /ISO-8601/);
  });

  it('accepts a valid ISO timestamp', () => {
    const result = validateReading({ recorded_at: '2026-09-21T06:30:00Z' });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.values.recorded_at, '2026-09-21T06:30:00Z');
  });

  it('bounds latitude and longitude', () => {
    assert.equal(validateReading({ latitude: 91 }).ok, false);
    assert.equal(validateReading({ longitude: -181 }).ok, false);
    assert.equal(validateReading({ latitude: 23.81, longitude: 90.41 }).ok, true);
  });

  it('truncates overly long text fields', () => {
    const result = validateReading({ crop: 'x'.repeat(500) });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(String(result.values.crop).length, 120);
  });
});
