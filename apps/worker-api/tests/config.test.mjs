import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('migration creates the core tables and indexes', () => {
  const sql = readFileSync(new URL('../migrations/0001_initial.sql', import.meta.url), 'utf8');
  for (const table of ['users', 'districts', 'upazilas', 'farms', 'soil_features', 'crops', 'market_prices', 'notifications', 'uploaded_files', 'ai_jobs']) {
    assert.match(sql, new RegExp(`CREATE TABLE ${table} \\(`));
  }
  assert.match(sql, /CREATE INDEX idx_soil_location/);
  assert.match(sql, /CREATE INDEX idx_market_crop_date/);
});
