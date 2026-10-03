/**
 * Marketplace panel on the market page.
 *
 * Three tabs over one list container: public browse, the caller's own listings,
 * and the caller's orders. Everything renders through dom.js helpers, so a
 * farmer-supplied crop name or description is inserted as text and never as
 * markup.
 */

import { marketplace, getCredentials } from '../api.js';
import { t, applyI18n, getLang } from '../i18n.js';
import { el, clear, qs, qsa, replaceChildren } from '../dom.js';
import { setState, State } from '../states.js';
import { reportClientError } from '../telemetry.js';

const listNode = qs('#marketplaceList');
const searchNode = qs('#marketplaceSearch');
const postButton = qs('#marketplacePostBtn');

let activeTab = 'browse';
let searchTerm = '';

/** 1 maund is 37.324 kg; the API stores kilograms. */
const KG_PER_MAUND = 37.324;

function taka(value) {
  const n = Number(value);
  return Number.isFinite(n) ? `৳${n.toLocaleString('en-IN')}` : '—';
}

function cropName(listing) {
  return listing.crop_name_bn || listing.crop_name_en || '—';
}

/** Show the quantity in whichever unit the farmer quoted it in. */
function quantityLabel(listing) {
  const kg = Number(listing.quantity_kg);
  if (!Number.isFinite(kg)) return '—';
  if (listing.unit === 'maund') {
    return `${(kg / KG_PER_MAUND).toFixed(1)} মণ (${kg.toLocaleString('en-IN')} কেজি)`;
  }
  return `${kg.toLocaleString('en-IN')} কেজি`;
}

function placeLabel(listing) {
  return [listing.upazila, listing.area].filter(Boolean).join(', ') || '—';
}

function isSignedIn() {
  return Boolean(getCredentials()?.token);
}

function renderEmpty(message) {
  replaceChildren(listNode, el('p', { className: 'muted', text: message }));
  setState(listNode, State.EMPTY, { message, lang: getLang() });
}

function renderError(error, retry) {
  const lang = getLang();
  // A 401 is not a failure state: it just means this tab needs a sign-in.
  if (error?.status === 401) {
    renderEmpty(t('authRequired', lang));
    setState(listNode, State.UNAUTHORIZED, { message: t('authRequired', lang), lang });
    return;
  }
  reportClientError(error, { area: 'marketplace', tab: activeTab });
  replaceChildren(listNode, el('p', { className: 'muted', text: t('loadFailed', lang) }));
  setState(listNode, State.ERROR, { message: t('loadFailed', lang), retry, lang });
}

/** One listing card, with an order form for signed-in visitors. */
function listingCard(listing, { owned = false } = {}) {
  const lang = getLang();
  const signedIn = isSignedIn();
  const canOrder = !owned && signedIn && listing.status === 'open';

  const card = el('article', { className: 'panel marketplace-card' });
  card.append(
    el('header', { className: 'marketplace-card-head' }, [
      el('h3', { text: cropName(listing) }),
      listing.is_organic ? el('span', { className: 'chip', text: lang === 'bn' ? 'জৈব' : 'Organic' }) : null,
      owned && listing.status !== 'open' ? el('span', { className: 'chip', text: listing.status }) : null,
    ]),
    el('dl', { className: 'marketplace-facts' }, [
      el('div', {}, [el('dt', { text: t('availableQuantity', lang) }), el('dd', { text: quantityLabel(listing) })]),
      el('div', {}, [el('dt', { text: t('pricePerKg', lang) }), el('dd', { text: `${taka(listing.price_per_kg)}/kg` })]),
      el('div', {}, [el('dt', { text: t('district', lang) }), el('dd', { text: placeLabel(listing) })]),
    ]),
    (listing.description_bn || listing.description_en)
      ? el('p', { className: 'marketplace-note', text: listing.description_bn || listing.description_en })
      : null
  );

  if (owned) {
    const close = listing.status === 'open'
      ? el('button', {
        type: 'button', className: 'btn btn-soft',
        text: lang === 'bn' ? 'বিক্রয় বন্ধ করুন' : 'Close listing',
        onClick: () => updateListing(listing.id, { status: 'closed' }),
      })
      : null;
    const reopen = listing.status !== 'open'
      ? el('button', {
        type: 'button', className: 'btn btn-soft',
        text: lang === 'bn' ? 'আবার চালু করুন' : 'Reopen',
        onClick: () => updateListing(listing.id, { status: 'open' }),
      })
      : null;
    const remove = el('button', {
      type: 'button', className: 'btn btn-soft',
      text: lang === 'bn' ? 'মুছুন' : 'Delete',
      onClick: () => deleteListing(listing.id),
    });
    card.append(el('div', { className: 'marketplace-actions' }, [close, reopen, remove].filter(Boolean)));
    if (listing.contact) {
      card.append(el('p', { className: 'marketplace-contact', text: `${t('contactSeller', lang)}: ${listing.contact}` }));
    }
    return card;
  }

  if (canOrder) {
    const input = el('input', {
      type: 'number', min: '1', step: '1',
      value: String(listing.quantity_kg ?? ''),
      'aria-label': t('quantityKg', lang),
      className: 'marketplace-qty',
    });
    card.append(el('div', { className: 'marketplace-actions' }, [
      input,
      el('button', {
        type: 'button', className: 'btn btn-dark',
        text: t('orderNow', lang),
        onClick: () => placeOrder(listing, input),
      }),
    ]));
  } else if (!signedIn) {
    card.append(el('p', { className: 'marketplace-note', text: t('authRequired', lang) }));
  }

  return card;
}

const ORDER_STATUS_BN = {
  pending: 'অপেক্ষমাণ',
  confirmed: 'নিশ্চিত',
  shipped: 'পাঠানো হয়েছে',
  completed: 'সম্পন্ন',
  cancelled: 'বাতিল',
};

function orderCard(order, { seller = false } = {}) {
  const lang = getLang();
  const statusBn = ORDER_STATUS_BN[order.status];
  const statusLabel = lang === 'bn' && statusBn ? statusBn : order.status;

  const card = el('article', { className: 'panel marketplace-card' });
  card.append(
    el('header', { className: 'marketplace-card-head' }, [
      el('h3', { text: order.crop_name_bn || order.crop_name_en || '—' }),
      el('span', { className: 'chip', text: statusLabel }),
    ]),
    el('dl', { className: 'marketplace-facts' }, [
      el('div', {}, [
        el('dt', { text: t('availableQuantity', lang) }),
        el('dd', { text: `${Number(order.quantity_kg || 0).toLocaleString('en-IN')} কেজি` }),
      ]),
      el('div', {}, [el('dt', { text: 'মোট' }), el('dd', { text: taka(order.total_taka) })]),
      el('div', {}, [
        el('dt', { text: t('district', lang) }),
        el('dd', { text: [order.upazila, order.area].filter(Boolean).join(', ') || '—' }),
      ]),
    ])
  );

  // Only offer the action the API will actually accept from this side.
  const actions = [];
  if (seller && order.status === 'pending') {
    actions.push(el('button', {
      type: 'button', className: 'btn btn-soft',
      text: lang === 'bn' ? 'নিশ্চিত করুন' : 'Confirm',
      onClick: () => moveOrder(order.id, 'confirm'),
    }));
  }
  if (seller && order.status === 'confirmed') {
    actions.push(el('button', {
      type: 'button', className: 'btn btn-soft',
      text: lang === 'bn' ? 'পাঠিয়ে দিন' : 'Mark shipped',
      onClick: () => moveOrder(order.id, 'ship'),
    }));
  }
  if (order.status === 'pending') {
    actions.push(el('button', {
      type: 'button', className: 'btn btn-soft',
      text: lang === 'bn' ? 'বাতিল' : 'Cancel',
      onClick: () => moveOrder(order.id, 'cancel'),
    }));
  }
  if (actions.length) card.append(el('div', { className: 'marketplace-actions' }, actions));
  return card;
}

async function placeOrder(listing, input) {
  const quantity = Number(input?.value);
  if (!Number.isInteger(quantity) || quantity <= 0) {
    renderError({ status: 400, message: t('quantityKg', getLang()) }, () => render());
    return;
  }
  try {
    await marketplace.createOrder({ listing_id: listing.id, quantity_kg: quantity, delivery_method: 'pickup' });
    await render();
  } catch (error) {
    renderError(error, () => render());
  }
}

async function updateListing(id, patch) {
  try {
    await marketplace.updateListing(id, patch);
    await render();
  } catch (error) {
    renderError(error, () => render());
  }
}

async function deleteListing(id) {
  try {
    await marketplace.deleteListing(id);
    await render();
  } catch (error) {
    renderError(error, () => render());
  }
}

async function moveOrder(id, action) {
  try {
    await marketplace.updateOrder(id, action);
    await render();
  } catch (error) {
    renderError(error, () => render());
  }
}

async function render() {
  if (!listNode) return;
  const lang = getLang();
  setState(listNode, State.LOADING, { lang });
  clear(listNode);

  try {
    if (activeTab === 'browse') {
      const { data } = await marketplace.listings({ q: searchTerm || undefined, limit: 50 });
      const listings = data?.listings ?? [];
      if (!listings.length) return renderEmpty(t('noListings', lang));
      replaceChildren(listNode, listings.map((listing) => listingCard(listing)));
      setState(listNode, State.READY, { lang });
      return;
    }

    if (!isSignedIn()) {
      renderEmpty(t('authRequired', lang));
      setState(listNode, State.UNAUTHORIZED, { message: t('authRequired', lang), lang });
      return;
    }

    if (activeTab === 'mine') {
      const { data } = await marketplace.myListings();
      const listings = data?.listings ?? [];
      if (!listings.length) return renderEmpty(t('noListings', lang));
      replaceChildren(listNode, listings.map((listing) => listingCard(listing, { owned: true })));
      setState(listNode, State.READY, { lang });
      return;
    }

    // Orders tab shows both directions, so a farmer who also buys sees
    // everything in one place.
    const [asBuyer, asSeller] = await Promise.all([
      marketplace.orders('buyer'),
      marketplace.orders('seller'),
    ]);
    const rows = [
      ...(asSeller.data?.orders ?? []).map((order) => orderCard(order, { seller: true })),
      ...(asBuyer.data?.orders ?? []).map((order) => orderCard(order)),
    ];
    if (!rows.length) return renderEmpty(t('noOrders', lang));
    replaceChildren(listNode, rows);
    setState(listNode, State.READY, { lang });
  } catch (error) {
    renderError(error, () => render());
  }
}

function bindTabs() {
  for (const button of qsa('[data-mp-tab]')) {
    button.addEventListener('click', () => {
      activeTab = button.dataset.mpTab || 'browse';
      for (const other of qsa('[data-mp-tab]')) {
        other.setAttribute('aria-selected', String(other === button));
      }
      render();
    });
  }
}

function bindSearch() {
  if (!searchNode) return;
  // Debounce so a multi-character Bangla word does not fire a request per key.
  let timer = null;
  searchNode.addEventListener('input', () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      searchTerm = searchNode.value.trim();
      if (activeTab === 'browse') render();
    }, 300);
  });
}

function bindPostButton() {
  if (!postButton) return;
  postButton.addEventListener('click', () => {
    activeTab = 'mine';
    for (const tab of qsa('[data-mp-tab]')) {
      tab.setAttribute('aria-selected', String(tab.dataset.mpTab === 'mine'));
    }
    render();
  });
}

export function initMarketplace() {
  if (!listNode) return;
  bindTabs();
  bindSearch();
  bindPostButton();
  applyI18n();
  render();
}