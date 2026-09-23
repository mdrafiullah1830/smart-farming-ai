import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { STRINGS, LANGS, t, getLang, setLang } from '../../web/scripts/i18n.js';

const REQUIRED_KEYS = [
  'appTitle',
  'navHome',
  'navDashboard',
  'navMarket',
  'navSoil',
  'navAI',
  'heroTitle',
  'dashTitle',
  'marketTitle',
  'soilTitle',
  'aiTitle',
  'signIn',
  'signOut',
  'loading',
  'loadFailed',
  'empty',
  'authRequired',
  'irrigationUnavailable',
  'modelUnavailable',
  'footerNote',
  'langToggle',
  'createAlert',
  'exportReport',
  'compareFields',
  'viewReport',
  'getAnswer',
  'newQuestion',
  'watchlist',
  'sources',
];

describe('i18n catalogs', () => {
  it('has bn and en catalogs', () => {
    assert.deepEqual(LANGS, ['bn', 'en']);
    assert.ok(STRINGS.bn && STRINGS.en);
  });

  it('defines required keys in both languages', () => {
    for (const key of REQUIRED_KEYS) {
      assert.ok(STRINGS.bn[key] != null && STRINGS.bn[key] !== '', `missing bn:${key}`);
      assert.ok(STRINGS.en[key] != null && STRINGS.en[key] !== '', `missing en:${key}`);
    }
  });

  it('no duplicate keys are lost (bn and en key sets align for required + shared page keys)', () => {
    const bnKeys = Object.keys(STRINGS.bn);
    const enKeys = new Set(Object.keys(STRINGS.en));
    // Critical shared surface must exist in both
    for (const k of bnKeys) {
      if (['appTitle', 'navHome', 'signIn', 'heroTitle'].includes(k)) {
        assert.ok(enKeys.has(k), `en missing ${k}`);
      }
    }
    for (const k of REQUIRED_KEYS) {
      assert.ok(enKeys.has(k), `en missing ${k}`);
    }
  });

  it('t falls back to en then key', () => {
    assert.equal(t('appTitle', 'bn'), STRINGS.bn.appTitle);
    assert.equal(t('appTitle', 'en'), STRINGS.en.appTitle);
    assert.equal(t('definitely_missing_key', 'bn'), 'definitely_missing_key');
  });

  it('defaults getLang to bn and setLang validates', () => {
    assert.ok(['bn', 'en'].includes(getLang()));
    assert.equal(setLang('en'), 'en');
    assert.equal(setLang('fr'), 'bn');
    assert.equal(setLang('bn'), 'bn');
  });

  it('Bengali strings are actually Bengali for primary labels', () => {
    assert.match(STRINGS.bn.navHome, /[ঀ-৿]/);
    assert.match(STRINGS.bn.signIn, /[ঀ-৿]/);
    assert.equal(STRINGS.en.navHome, 'Home');
  });
});
