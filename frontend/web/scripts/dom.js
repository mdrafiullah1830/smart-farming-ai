/** Safe DOM helpers — never inject untrusted HTML via innerHTML for dynamic data. */

const HTML_ESCAPES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

export function text(value) {
  return value == null ? '' : String(value);
}

/** Set textContent safely */
export function setText(el, value) {
  if (!el) return;
  el.textContent = value == null ? '' : String(value);
}

export function setHtmlUnsafe(el, html) {
  if (!el) return;
  el.innerHTML = html;
}

/** Create an element with attributes and children (no HTML strings for data). */
export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value == null || value === false) continue;
    if (key === 'className') node.className = value;
    else if (key === 'text') node.textContent = String(value);
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (value === true) node.setAttribute(key, '');
    else node.setAttribute(key, String(value));
  }
  for (const child of [].concat(children)) {
    if (child == null || child === false) continue;
    node.append(typeof child === 'string' || typeof child === 'number' ? document.createTextNode(String(child)) : child);
  }
  return node;
}

export function clear(node) {
  if (!node) return;
  while (node.firstChild) node.removeChild(node.firstChild);
}

export function replaceChildren(node, children) {
  clear(node);
  for (const child of [].concat(children)) {
    if (child == null || child === false) continue;
    node.append(typeof child === 'string' || typeof child === 'number' ? document.createTextNode(String(child)) : child);
  }
}

/** Fragment from list */
export function fragment(children) {
  const f = document.createDocumentFragment();
  for (const child of [].concat(children)) {
    if (child == null || child === false) continue;
    f.append(typeof child === 'string' || typeof child === 'number' ? document.createTextNode(String(child)) : child);
  }
  return f;
}

/** Only allow same-origin or https links when building anchors from API data */
export function safeExternalHref(url) {
  try {
    const u = new URL(url, typeof location !== 'undefined' ? location.href : 'https://example.invalid');
    if (u.protocol === 'https:' || u.protocol === 'http:') {
      if (typeof location !== 'undefined' && u.origin === location.origin) return u.href;
      if (u.protocol === 'https:') return u.href;
    }
  } catch {
    /* invalid */
  }
  return null;
}

export function on(root, selector, event, handler) {
  const nodes = root.querySelectorAll(selector);
  nodes.forEach((node) => node.addEventListener(event, handler));
  return () => nodes.forEach((node) => node.removeEventListener(event, handler));
}

export function qs(selector, root = document) {
  return root.querySelector(selector);
}

export function qsa(selector, root = document) {
  return [...root.querySelectorAll(selector)];
}
