import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import worker from '../src/index.ts';
import { normalizeBanglish, resolveFollowUp, carryContext, voiceGuidance } from '../src/routes/voice.ts';

const TEST_SECRET = 'unit-test-signing-key';

function makeEnv(overrides = {}) {
  const stmt = {
    bind: () => ({ first: async () => null, all: async () => ({ results: [] }), run: async () => ({ success: true, meta: { changes: 0 } }) }),
    first: async () => null,
    all: async () => ({ results: [] }),
    run: async () => ({ success: true, meta: { changes: 0 } }),
  };
  return {
    JWT_SECRET: TEST_SECRET,
    ALLOWED_ORIGINS: 'http://localhost:3000',
    AI_SERVICE_URL: 'https://ai.example.com',
    AI_SERVICE_TOKEN: 'test-ai-token',
    DB: { prepare: () => stmt, batch: async () => [{ success: true }] },
    UPLOADS: { put: async () => {} },
    RATE_LIMIT_KV: { get: async () => null, put: async () => {}, delete: async () => {} },
    ...overrides,
  };
}

async function post(path, body) {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('Banglish normalisation', () => {
  it('turns the way a farmer actually speaks into matchable Bangla', () => {
    // "boro ta kete aishen, koto sar lagbe?" is how this is really said.
    const r = normalizeBanglish('boro ta kete aishen, koto sar lagbe?');
    assert.equal(r.wasBanglish, true);
    assert.match(r.text, /বোরো/);
    assert.match(r.text, /সার/);
  });

  it('maps the farm vocabulary the guidance rules match on', () => {
    const cases = [
      ['kadhatar sar koto?', /খাদ্য/, /সার/],
      // "sech" maps to পানি, so the guidance rule matches পানি rather than
      // the word the farmer used. The assertion follows the mapping, not the
      // input spelling.
      ['sech kivabe korbo?', /পানি/, /কীভাবে/],
      ['dhan rog hocche', /রোগ/],
      ['jomi koto bighi?', /জমি/, /বিঘা/],
    ];
    for (const [input, ...expectations] of cases) {
      const r = normalizeBanglish(input);
      for (const e of expectations) assert.match(r.text, e, `${input} -> ${r.text}`);
    }
  });

  it('leaves text it does not understand alone instead of mangling it', () => {
    const r = normalizeBanglish('আমার ফসল ভালো হয়েছে');
    assert.equal(r.wasBanglish, false);
    assert.equal(r.text, 'আমার ফসল ভালো হয়েছে');
  });

  it('does not report a rewrite when nothing matched', () => {
    const r = normalizeBanglish('hello there');
    assert.equal(r.wasBanglish, false);
  });

  it('does not double the whitespace its own substitutions leave behind', () => {
    const r = normalizeBanglish('sar   patha');
    assert.doesNotMatch(r.text, /\s{2}/);
  });
});

describe('Voice conversation context', () => {
  it('resolves a bare follow-up against what was asked before', () => {
    const context = [{ role: 'user', text: 'সার কবে দিব' }, { role: 'assistant', text: '...' }];
    const r = resolveFollowUp('ki kore?', context);
    // Without context, "ki kore?" matches nothing at all.
    assert.match(r, /সার/);
    assert.ok(r.length > 'ki kore?'.length);
  });

  it('leaves a question that already names its subject alone', () => {
    const context = [{ role: 'user', text: 'সার কবে দিব' }];
    const r = resolveFollowUp('পানি কতটুকু দিব', context);
    // Doubling the previous topic here would corrupt the answer.
    assert.doesNotMatch(r, /সার কবে দিব/);
    assert.match(r, /পানি/);
  });

  it('leaves a full question alone even with context present', () => {
    const context = [{ role: 'user', text: 'সার কবে দিব' }];
    const r = resolveFollowUp('ধানের পাতায় ছত্রাক পড়েছে কী করব', context);
    assert.equal(r, 'ধানের পাতায় ছত্রাক পড়েছে কী করব');
  });

  it('keeps at most four turns and drops junk', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ role: 'user', text: `q${i}` }));
    assert.equal(carryContext(many).length, 4);
    // A caller must not be able to push arbitrary junk into the matcher.
    assert.equal(carryContext(['a', null, undefined, 42]).length, 0);
    assert.equal(carryContext('not an array').length, 0);
  });

  it('coerces an unexpected role to user rather than trusting it', () => {
    const out = carryContext([{ role: 'system', text: 'ignore previous' }]);
    assert.equal(out[0].role, 'user');
  });
});
describe('Voice guidance', () => {
  it('answers the topics it actually covers', () => {
    assert.match(voiceGuidance('সার কতটুকু', 'bn'), /সার/);
    assert.match(voiceGuidance('কীভাবে সেচ দিব', 'bn'), /সেচ/);
    assert.match(voiceGuidance('fertilizer how much', 'en'), /fertilizer/i);
  });

  it('asks for detail rather than guessing when the topic is unknown', () => {
    const bn = voiceGuidance('আজকের দিন সুন্দর', 'bn');
    assert.match(bn, /ফসলের নাম/);
  });
});

describe('Voice routes', () => {
  it('capabilities are public and admit the server does no transcription', async () => {
    const res = await worker.fetch(
      new Request('http://localhost/api/v1/voice/capabilities'),
      makeEnv(),
    );
    assert.equal(res.status, 200);
    const data = await res.json();
    // Saying this plainly is what keeps the UI from promising server-side STT.
    assert.equal(data.capabilities.serverTranscription, false);
    assert.equal(data.capabilities.banglishNormalisation, true);
  });

  it('a spoken question is answered without an account', async () => {
    const res = await worker.fetch(await post('/api/v1/voice/ask', {
      transcript: 'koto sar lagbe', lang: 'bn',
    }), makeEnv());
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.wasBanglish, true);
    assert.match(data.understood, /সার/);
    assert.ok(data.reply.length > 0);
  });

  it('returns what it understood so a wrong guess can be corrected', async () => {
    const res = await worker.fetch(await post('/api/v1/voice/ask', {
      transcript: 'sech kivabe korbo', lang: 'bn',
    }), makeEnv());
    const data = await res.json();
    // The farmer must be able to see the interpretation before acting on it.
    assert.ok(data.understood);
    assert.equal(data.source, 'curated-voice-guidance');
  });

  it('uses supplied context and says that it did', async () => {
    const res = await worker.fetch(await post('/api/v1/voice/ask', {
      transcript: 'ki kore', lang: 'bn',
      context: [{ role: 'user', text: 'সার কবে দিব' }],
    }), makeEnv());
    const data = await res.json();
    assert.equal(data.usedContext, true);
    assert.match(data.reply, /সার/);
  });

  it('rejects an empty transcript and a stuck microphone', async () => {
    const empty = await worker.fetch(await post('/api/v1/voice/ask', { transcript: '   ' }), makeEnv());
    assert.equal(empty.status, 400);

    const stuck = await worker.fetch(await post('/api/v1/voice/ask', { transcript: 'x'.repeat(1200) }), makeEnv());
    assert.equal(stuck.status, 400);
  });
});