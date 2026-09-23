// Validates that every data-i18n key used in web/index.html exists in both
// the `bn` and `en` translation objects of the landing page.
// Usage: node frontend/scripts/check-landing-i18n.mjs
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const file = resolve(here, '../web/index.html');
const html = readFileSync(file, 'utf8');

const match = html.match(/var T = \{([\s\S]*?)\n\};/);
if (!match) {
  console.error('FAIL: could not locate the `var T = {...}` translation block');
  process.exit(1);
}

const block = match[1];
const enSplit = block.split(/\n  en: /);
const bnSrc = enSplit[0].replace(/^\s*bn: \{/, '');
const enSrc = enSplit[1] || '';

function keys(src) {
  // Parse the object source by splitting on top-level commas while respecting
  // quoted strings. This correctly captures every key, even when several pairs
  // share one line, and never mistakes a word inside a string value for a key.
  const out = new Set();
  let buf = '';
  let quote = null;
  const flush = (part) => {
    const m = part.match(/^\s*\{?\s*([A-Za-z0-9_]+)\s*:/);
    if (m) out.add(m[1]);
  };
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quote) {
      if (ch === '\\') { buf += ch + (src[i + 1] || ''); i++; continue; }
      if (ch === quote) quote = null;
      buf += ch;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') { quote = ch; buf += ch; continue; }
    if (ch === ',') { flush(buf); buf = ''; continue; }
    buf += ch;
  }
  flush(buf);
  return out;
}

const bn = keys(bnSrc);
const en = keys(enSrc);
const used = [...new Set([...html.matchAll(/data-i18n="([A-Za-z0-9_]+)"/g)].map((m) => m[1]))];

const missingBn = used.filter((k) => !bn.has(k));
const missingEn = used.filter((k) => !en.has(k));
const onlyBn = [...bn].filter((k) => !en.has(k));
const onlyEn = [...en].filter((k) => !bn.has(k));

console.log(`translation keys -> bn:${bn.size} en:${en.size} | keys used in markup: ${used.length}`);
console.log(`missing in bn: ${missingBn.join(', ') || 'none'}`);
console.log(`missing in en: ${missingEn.join(', ') || 'none'}`);
console.log(`only in bn: ${onlyBn.join(', ') || 'none'}`);
console.log(`only in en: ${onlyEn.join(', ') || 'none'}`);

// Every material-icons-round ligature must have a matching symbol in assets/icons.svg
const iconFile = resolve(here, '../web/assets/icons.svg');
const sprite = readFileSync(iconFile, 'utf8');
const symbols = new Set([...sprite.matchAll(/id="icon-([A-Za-z0-9_]+)"/g)].map((m) => m[1]));
const ligatures = [
  ...new Set(
    [...html.matchAll(/<span class="material-icons-round"[^>]*>([A-Za-z0-9_]+)<\/span>/g)].map((m) => m[1])
  ),
];
const missingIcons = ligatures.filter((n) => !symbols.has(n));
console.log(`icon ligatures used: ${ligatures.length} | missing from sprite: ${missingIcons.join(', ') || 'none'}`);

// Referenced local assets must exist
const fsExists = (await import('fs')).existsSync;
const refs = [
  ...new Set(
    [...html.matchAll(/(?:src|href)="((?!https?:|mailto:|tel:|#)[^"]+)"/g)]
      .map((m) => m[1])
      .filter((p) => !p.startsWith('data:'))
  ),
];
const missingAssets = refs.filter((p) => !fsExists(resolve(here, '../web', p)));
console.log(`local refs: ${refs.length} | missing on disk: ${missingAssets.join(', ') || 'none'}`);

const refsForBackground = [...html.matchAll(/url\('([^']+)'\)/g)].map((m) => m[1]);
const missingBg = refsForBackground.filter((p) => !fsExists(resolve(here, '../web', p)));
console.log(`css url() refs: ${refsForBackground.length} | missing on disk: ${missingBg.join(', ') || 'none'}`);

const ok =
  !missingBn.length &&
  !missingEn.length &&
  !onlyBn.length &&
  !onlyEn.length &&
  !missingIcons.length &&
  !missingAssets.length &&
  !missingBg.length;
console.log(ok ? '\nRESULT: PASS' : '\nRESULT: FAIL');
process.exit(ok ? 0 : 1);
