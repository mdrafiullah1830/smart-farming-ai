import assert from 'node:assert/strict';
import test, { describe, it } from 'node:test';
import { PBKDF2_ITERATIONS, hashPassword, verifyPassword } from '../src/auth.ts';

describe('password hashing', () => {
  it('stays within the Cloudflare Workers PBKDF2 iteration cap', () => {
    // Workers' WebCrypto rejects iteration counts above 100000, which makes
    // POST /api/v1/auth/register fail with a 500. Guard the constant.
    assert.ok(PBKDF2_ITERATIONS <= 100_000, `PBKDF2_ITERATIONS=${PBKDF2_ITERATIONS} exceeds the Workers cap`);
    assert.ok(PBKDF2_ITERATIONS >= 100_000, 'use the highest iteration count Workers allows');
  });

  it('round-trips a password', async () => {
    const stored = await hashPassword('SmokeTest!2026x');
    assert.match(stored, /^pbkdf2_sha256\$100000\$[^$]+\$[^$]+$/);
    assert.equal(await verifyPassword('SmokeTest!2026x', stored), true);
  });

  it('rejects the wrong password', async () => {
    const stored = await hashPassword('SmokeTest!2026x');
    assert.equal(await verifyPassword('SmokeTest!2026y', stored), false);
  });

  it('uses a fresh salt for every hash', async () => {
    const a = await hashPassword('SmokeTest!2026x');
    const b = await hashPassword('SmokeTest!2026x');
    assert.notEqual(a, b);
    assert.equal(await verifyPassword('SmokeTest!2026x', a), true);
    assert.equal(await verifyPassword('SmokeTest!2026x', b), true);
  });

  it('rejects malformed stored hashes instead of throwing', async () => {
    for (const stored of ['', 'not-a-hash', 'bcrypt$10$salt$hash', 'pbkdf2_sha256$$salt$hash', 'pbkdf2_sha256$abc$salt$hash']) {
      assert.equal(await verifyPassword('SmokeTest!2026x', stored), false, `should reject: ${stored}`);
    }
  });
});
