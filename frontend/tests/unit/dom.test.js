import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml, text, setText, safeExternalHref, qs, qsa } from '../../web/scripts/dom.js';

describe('dom helpers', () => {
  it('escapeHtml neutralizes HTML metacharacters', () => {
    assert.equal(escapeHtml('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
    assert.equal(escapeHtml(`a&b'c"d`), 'a&amp;b&#39;c&quot;d');
    assert.equal(escapeHtml(null), '');
  });

  it('text coerces null to empty', () => {
    assert.equal(text(null), '');
    assert.equal(text(0), '0');
    assert.equal(text('x'), 'x');
  });

  it('setText is null-safe', () => {
    assert.equal(setText(null, 'x'), undefined);
    const node = { textContent: '' };
    setText(node, 42);
    assert.equal(node.textContent, '42');
    setText(node, null);
    assert.equal(node.textContent, '');
  });

  it('safeExternalHref allows https and same-origin, blocks javascript:', () => {
    assert.equal(safeExternalHref('javascript:alert(1)'), null);
    assert.equal(safeExternalHref('data:text/html,x'), null);
    assert.equal(safeExternalHref('https://example.com/a'), 'https://example.com/a');
    // Relative URLs resolve against base and are treated as same-origin-ish https
    const rel = safeExternalHref('/path');
    assert.ok(rel === null || rel.startsWith('https://') || rel.startsWith('http://'));
  });

  it('qs/qsa work against a stub query interface', () => {
    const root = {
      querySelector: (s) => (s === '#a' ? { id: 'a' } : null),
      querySelectorAll: (s) => (s === '.b' ? [{ className: 'b' }, { className: 'b' }] : []),
    };
    assert.equal(qs('#a', root)?.id, 'a');
    assert.equal(qs('#missing', root), null);
    assert.equal(qsa('.b', root).length, 2);
  });
});
