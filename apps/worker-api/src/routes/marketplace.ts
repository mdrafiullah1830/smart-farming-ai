import type { Env } from '../types.ts';
import { json, error, isMissingRelation } from '../http.ts';
import { currentUser } from '../auth.ts';

async function body<T>(request: Request): Promise<T | null> {
  try { return await request.json<T>(); } catch { return null; }
}

// Longest text a farmer will realistically type into a phone form. Anything
// beyond this is a paste accident, and it is bounded at the edge.
const MAX_TEXT = 2000;
const MAX_CONTACT = 120;

/** Trim, then bound. Returns '' for null/undefined so callers can coalesce. */
function cleanText(value: unknown, max = MAX_TEXT): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, max);
}

/**
 * Whole kilograms / whole taka only. Number() on "12abc" yields NaN, which the
 * integer test rejects; a float like 10.5 kg is refused rather than silently
 * truncated, because a farmer who typed 10.5 means it.
 */
function positiveInteger(value: unknown, max: number): number | null {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0 || n > max) return null;
  return n;
}

// `contact` is deliberately absent from this projection: a public listing
// response should not hand every visitor a seller's phone number.
const LISTING_COLUMNS = `id, seller_id, crop_id, crop_name_en, crop_name_bn, district_id,
  upazila, area, quantity_kg, price_per_kg, unit, quality, harvest_date,
  is_organic, description_bn, description_en, status, created_at, updated_at`;

/** Read the contact column separately so it never lands in a browse result. */
async function contactFor(env: Env, listingId: string, sellerId: string): Promise<string | null> {
  try {
    const row = await env.DB.prepare('SELECT contact FROM produce_listings WHERE id = ? AND seller_id = ?')
      .bind(listingId, sellerId).first<{ contact: string }>();
    return row?.contact ?? null;
  } catch {
    return null;
  }
}

/**
 * POST /api/v1/marketplace/listings - a farmer posts what they have.
 */
export async function createListingRoute(request: Request, env: Env): Promise<Response> {
  const user = await currentUser(request, env);
  if (!user) return error(request, env, 401, 'Authentication required');

  const data = await body<{
    crop_name_en?: string; crop_name_bn?: string; crop_id?: string;
    district_id?: string; upazila?: string; area?: string;
    quantity_kg?: unknown; price_per_kg?: unknown; unit?: string;
    quality?: string; harvest_date?: string; is_organic?: unknown;
    description_bn?: string; description_en?: string; contact?: string;
  }>(request);
  if (!data) return error(request, env, 400, 'Invalid JSON body');

  const cropNameEn = cleanText(data.crop_name_en, 100);
  if (!cropNameEn) return error(request, env, 400, 'crop_name_en is required');

  const contact = cleanText(data.contact, MAX_CONTACT);
  if (!contact) return error(request, env, 400, 'contact is required so buyers can reach you');

  const quantity = positiveInteger(data.quantity_kg, 1_000_000);
  if (quantity === null) return error(request, env, 400, 'quantity_kg must be a whole number of kilograms greater than 0');

  const price = positiveInteger(data.price_per_kg, 1_000_000);
  if (price === null) return error(request, env, 400, 'price_per_kg must be a whole number of taka greater than 0');

  // A malformed harvest_date would break any client that tries to render it.
  let harvestDate: string | null = null;
  if (typeof data.harvest_date === 'string' && data.harvest_date.trim()) {
    if (Number.isNaN(Date.parse(data.harvest_date))) {
      return error(request, env, 400, 'harvest_date must be an ISO date');
    }
    harvestDate = data.harvest_date.trim();
  }

  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO produce_listings
       (id, seller_id, crop_id, crop_name_en, crop_name_bn, district_id, upazila, area,
        quantity_kg, price_per_kg, unit, quality, harvest_date, is_organic,
        description_bn, description_en, contact, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open')`
  ).bind(
    id, user.id,
    cleanText(data.crop_id, 64) || null,
    cropNameEn,
    cleanText(data.crop_name_bn, 100),
    cleanText(data.district_id, 64) || null,
    cleanText(data.upazila, 100),
    cleanText(data.area, 160),
    quantity, price,
    data.unit === 'maund' ? 'maund' : 'kg',
    cleanText(data.quality, 100),
    harvestDate,
    data.is_organic ? 1 : 0,
    cleanText(data.description_bn, MAX_TEXT),
    cleanText(data.description_en, MAX_TEXT),
    contact,
  ).run();

  return json(request, env, {
    success: true,
    listing: { id, status: 'open', quantity_kg: quantity, price_per_kg: price },
  }, 201);
}

/**
 * GET /api/v1/marketplace/listings - public browse.
 *
 * Filters: crop_id, district_id, q (free text over crop name and area), and
 * mine=true for the caller's own listings including closed/sold ones.
 */
export async function listListingsRoute(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const cropId = url.searchParams.get('crop_id')?.trim();
  const districtId = url.searchParams.get('district_id')?.trim();
  const q = url.searchParams.get('q')?.trim();
  const mine = url.searchParams.get('mine');

  // Bound the page size rather than trusting the caller.
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 50, 1), 100);
  const offset = Math.max(Number(url.searchParams.get('offset')) || 0, 0);

  const user = await currentUser(request, env);
  const conditions: string[] = [];
  const bindings: string[] = [];

  if (mine === 'true') {
    // "My listings" shows closed and sold stock, so it skips the open filter
    // and requires an authenticated owner.
    if (!user) return error(request, env, 401, 'Authentication required');
    conditions.push('seller_id = ?');
    bindings.push(user.id);
  } else {
    conditions.push(`status = 'open'`);
  }

  if (cropId) { conditions.push('crop_id = ?'); bindings.push(cropId); }
  if (districtId) { conditions.push('district_id = ?'); bindings.push(districtId); }
  if (q) {
    // Escape LIKE wildcards: a search for "100%" must not match every row.
    const needle = `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
    conditions.push(
      `(crop_name_en LIKE ? ESCAPE '\\' OR crop_name_bn LIKE ? ESCAPE '\\' OR area LIKE ? ESCAPE '\\')`
    );
    bindings.push(needle, needle, needle);
  }

  try {
    const rows = await env.DB.prepare(
      `SELECT ${LISTING_COLUMNS} FROM produce_listings WHERE ${conditions.join(' AND ')}
       ORDER BY created_at DESC LIMIT ? OFFSET ?`
    ).bind(...bindings, limit, offset).all();
    return json(request, env, { success: true, listings: rows.results });
  } catch (cause) {
    if (isMissingRelation(cause)) {
      // Migration 0008 is not applied to this binding yet.
      return json(request, env, { success: true, synced: false, listings: [] });
    }
    console.error('marketplace_list_error', cause);
    return error(request, env, 500, 'Could not load listings');
  }
}

/**
 * GET /api/v1/marketplace/listings/:id
 *
 * Open listings are public. A closed or sold listing is visible only to its
 * seller, so a buyer cannot order stock that is already gone.
 */
export async function getListingRoute(request: Request, env: Env, listingId: string): Promise<Response> {
  const user = await currentUser(request, env);
  let row: Record<string, unknown> | null = null;
  try {
    row = await env.DB.prepare(`SELECT ${LISTING_COLUMNS} FROM produce_listings WHERE id = ?`)
      .bind(listingId).first<Record<string, unknown>>();
  } catch (cause) {
    if (isMissingRelation(cause)) return json(request, env, { success: true, synced: false, listing: null });
    console.error('marketplace_get_error', cause);
    return error(request, env, 500, 'Could not load listing');
  }
  if (!row) return error(request, env, 404, 'Listing not found');

  const sellerId = String(row.seller_id);
  const isSeller = user?.id === sellerId;
  if (String(row.status) !== 'open' && !isSeller) {
    // Same answer as a missing listing, so the endpoint does not confirm that
    // a closed listing exists.
    return error(request, env, 404, 'Listing not found');
  }

  return json(request, env, {
    success: true,
    listing: isSeller ? { ...row, contact: await contactFor(env, listingId, sellerId) } : row,
  });
}
/**
 * PATCH /api/v1/marketplace/listings/:id - seller edits price, quantity, status.
 *
 * A price change never rewrites existing orders: each order carries its own
 * price_per_kg snapshot.
 */
export async function updateListingRoute(request: Request, env: Env, listingId: string): Promise<Response> {
  const user = await currentUser(request, env);
  if (!user) return error(request, env, 401, 'Authentication required');

  const owned = await env.DB.prepare('SELECT id FROM produce_listings WHERE id = ? AND seller_id = ?')
    .bind(listingId, user.id).first();
  if (!owned) return error(request, env, 404, 'Listing not found');

  const data = await body<{
    price_per_kg?: unknown; quantity_kg?: unknown; status?: string; contact?: string;
    description_bn?: string; description_en?: string;
  }>(request);
  if (!data) return error(request, env, 400, 'Invalid JSON body');

  const updates: string[] = [];
  // Column values, so the array holds numbers as well as strings.
  const bindings: Array<string | number> = [];

  if (data.price_per_kg !== undefined) {
    const price = positiveInteger(data.price_per_kg, 1_000_000);
    if (price === null) return error(request, env, 400, 'price_per_kg must be a whole number of taka greater than 0');
    updates.push('price_per_kg = ?');
    bindings.push(price);
  }
  if (data.quantity_kg !== undefined) {
    const quantity = positiveInteger(data.quantity_kg, 1_000_000);
    if (quantity === null) return error(request, env, 400, 'quantity_kg must be a whole number of kilograms greater than 0');
    updates.push('quantity_kg = ?');
    bindings.push(quantity);
  }
  if (data.status !== undefined) {
    if (!['open', 'closed', 'sold'].includes(String(data.status))) {
      return error(request, env, 400, 'status must be one of: open, closed, sold');
    }
    updates.push('status = ?');
    bindings.push(String(data.status));
  }
  if (typeof data.contact === 'string') {
    const contact = cleanText(data.contact, MAX_CONTACT);
    if (!contact) return error(request, env, 400, 'contact cannot be empty');
    updates.push('contact = ?');
    bindings.push(contact);
  }
  if (typeof data.description_bn === 'string') { updates.push('description_bn = ?'); bindings.push(cleanText(data.description_bn, MAX_TEXT)); }
  if (typeof data.description_en === 'string') { updates.push('description_en = ?'); bindings.push(cleanText(data.description_en, MAX_TEXT)); }

  if (!updates.length) return error(request, env, 400, 'No supported fields to update');

  updates.push('updated_at = CURRENT_TIMESTAMP');
  await env.DB.prepare(`UPDATE produce_listings SET ${updates.join(', ')} WHERE id = ? AND seller_id = ?`)
    .bind(...bindings, listingId, user.id).run();

  return json(request, env, { success: true, listing: { id: listingId } });
}

/** DELETE /api/v1/marketplace/listings/:id - seller removes a listing. */
export async function deleteListingRoute(request: Request, env: Env, listingId: string): Promise<Response> {
  const user = await currentUser(request, env);
  if (!user) return error(request, env, 401, 'Authentication required');
  const result = await env.DB.prepare('DELETE FROM produce_listings WHERE id = ? AND seller_id = ?')
    .bind(listingId, user.id).run();
  if (!result.meta.changes) return error(request, env, 404, 'Listing not found');
  return json(request, env, { success: true });
}

/**
 * POST /api/v1/marketplace/orders - a buyer reserves stock from a listing.
 *
 * Two checks matter: a buyer cannot order their own listing, and the requested
 * quantity must fit inside what is still unallocated across non-cancelled
 * orders. That allocation check lives in the route because D1 has no trigger
 * support, so the guarantee is only ever as strong as this read-then-write.
 */
export async function createOrderRoute(request: Request, env: Env): Promise<Response> {
  const user = await currentUser(request, env);
  if (!user) return error(request, env, 401, 'Authentication required');

  const data = await body<{
    listing_id?: string; quantity_kg?: unknown;
    delivery_method?: string; delivery_note?: string;
  }>(request);
  if (!data) return error(request, env, 400, 'Invalid JSON body');

  const listingId = cleanText(data.listing_id, 64);
  if (!listingId) return error(request, env, 400, 'listing_id is required');

  const quantity = positiveInteger(data.quantity_kg, 1_000_000);
  if (quantity === null) return error(request, env, 400, 'quantity_kg must be a whole number of kilograms greater than 0');

  const deliveryMethod = ['pickup', 'courier', 'transport'].includes(String(data.delivery_method))
    ? String(data.delivery_method)
    : 'pickup';

  let listing: Record<string, unknown> | null = null;
  try {
    listing = await env.DB.prepare('SELECT id, seller_id, price_per_kg, quantity_kg, status FROM produce_listings WHERE id = ?')
      .bind(listingId).first<Record<string, unknown>>();
  } catch (cause) {
    if (isMissingRelation(cause)) return error(request, env, 503, 'Marketplace is not ready yet');
    console.error('marketplace_order_error', cause);
    return error(request, env, 500, 'Could not place order');
  }

  if (!listing) return error(request, env, 404, 'Listing not found');
  if (String(listing.status) !== 'open') return error(request, env, 409, 'This listing is no longer accepting orders');
  if (String(listing.seller_id) === user.id) return error(request, env, 400, 'You cannot order your own listing');

  const committed = await env.DB.prepare(
    `SELECT COALESCE(SUM(quantity_kg), 0) AS total FROM orders WHERE listing_id = ? AND status != 'cancelled'`
  ).bind(listingId).first<{ total: number }>();
  const available = Number(listing.quantity_kg) - Number(committed?.total ?? 0);
  if (quantity > available) {
    return error(request, env, 409, available <= 0
      ? 'This listing is fully ordered'
      : `Only ${available} kg remain available`);
  }

  const price = Number(listing.price_per_kg);
  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO orders
       (id, listing_id, buyer_id, seller_id, quantity_kg, price_per_kg, total_taka, status, delivery_note, delivery_method)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`
  ).bind(
    id, listingId, user.id, String(listing.seller_id), quantity, price,
    quantity * price,
    cleanText(data.delivery_note, MAX_TEXT),
    deliveryMethod,
  ).run();

  return json(request, env, {
    success: true,
    order: {
      id, listing_id: listingId, quantity_kg: quantity, price_per_kg: price,
      total_taka: quantity * price, status: 'pending', delivery_method: deliveryMethod,
    },
  }, 201);
}

/**
 * GET /api/v1/marketplace/orders - the caller's orders, as buyer or as seller.
 */
export async function listOrdersRoute(request: Request, env: Env): Promise<Response> {
  const user = await currentUser(request, env);
  if (!user) return error(request, env, 401, 'Authentication required');

  // `role` is resolved against a fixed pair before it reaches the SQL string; it
  // is never interpolated raw from user input.
  const role = new URL(request.url).searchParams.get('role') === 'seller' ? 'seller_id' : 'buyer_id';
  try {
    const rows = await env.DB.prepare(
      `SELECT o.id, o.listing_id, o.quantity_kg, o.price_per_kg, o.total_taka, o.status,
              o.delivery_method, o.delivery_note, o.created_at, o.updated_at,
              o.buyer_id, o.seller_id,
              l.crop_name_en, l.crop_name_bn, l.unit, l.upazila, l.area
       FROM orders o LEFT JOIN produce_listings l ON l.id = o.listing_id
       WHERE o.${role} = ?
       ORDER BY o.created_at DESC LIMIT 100`
    ).bind(user.id).all();
    return json(request, env, { success: true, orders: rows.results });
  } catch (cause) {
    if (isMissingRelation(cause)) return json(request, env, { success: true, synced: false, orders: [] });
    console.error('marketplace_orders_error', cause);
    return error(request, env, 500, 'Could not load orders');
  }
}
/**
 * PATCH /api/v1/marketplace/orders/:id - move an order along.
 *
 * Only the two parties may act, and the seller drives every forward transition.
 * cancel is open to either side, because a farmer may withdraw stock and a buyer
 * may no longer be able to pay, but only while the order is still pending; once
 * goods have shipped, cancelling is a refund dispute rather than a cancellation.
 */
const ORDER_TRANSITIONS: Record<string, { from: string[]; to: string }> = {
  confirm: { from: ['pending'], to: 'confirmed' },
  ship: { from: ['confirmed'], to: 'shipped' },
  complete: { from: ['shipped', 'confirmed'], to: 'completed' },
  cancel: { from: ['pending'], to: 'cancelled' },
};

export async function updateOrderRoute(request: Request, env: Env, orderId: string): Promise<Response> {
  const user = await currentUser(request, env);
  if (!user) return error(request, env, 401, 'Authentication required');

  const data = await body<{ action?: string }>(request);
  const action = String(data?.action ?? '');
  const rule = ORDER_TRANSITIONS[action];
  if (!rule) return error(request, env, 400, 'action must be one of: confirm, ship, complete, cancel');

  let order: Record<string, unknown> | null = null;
  try {
    order = await env.DB.prepare('SELECT id, buyer_id, seller_id, status FROM orders WHERE id = ?')
      .bind(orderId).first<Record<string, unknown>>();
  } catch (cause) {
    if (isMissingRelation(cause)) return error(request, env, 503, 'Marketplace is not ready yet');
    console.error('marketplace_order_update_error', cause);
    return error(request, env, 500, 'Could not update order');
  }

  if (!order) return error(request, env, 404, 'Order not found');

  const isBuyer = String(order.buyer_id) === user.id;
  const isSeller = String(order.seller_id) === user.id;
  if (!isBuyer && !isSeller) return error(request, env, 403, 'Not your order');
  // A buyer cannot mark their own order confirmed or shipped; that is the
  // seller's assertion that the goods exist and have left.
  if (!isSeller && action !== 'cancel') return error(request, env, 403, 'Only the seller can do that');

  const currentStatus = String(order.status);
  if (!rule.from.includes(currentStatus)) {
    return error(request, env, 409, `Cannot ${action} an order that is already ${currentStatus}`);
  }

  await env.DB.prepare('UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .bind(rule.to, orderId).run();

  return json(request, env, { success: true, order: { id: orderId, status: rule.to } });
}

/**
 * Confirms the caller is a party to the order.
 *
 * Returns the error response to send, or null when access is fine. Keeps the
 * 404-versus-403 distinction in one place: an order that does not exist answers
 * 404 to everyone, an order that belongs to two other people answers 403.
 */
async function authorizeOrderParty(
  request: Request, env: Env, orderId: string, userId: string,
): Promise<Response | null> {
  let order: Record<string, unknown> | null = null;
  try {
    order = await env.DB.prepare('SELECT id, buyer_id, seller_id FROM orders WHERE id = ?')
      .bind(orderId).first<Record<string, unknown>>();
  } catch (cause) {
    if (isMissingRelation(cause)) return error(request, env, 503, 'Marketplace is not ready yet');
    console.error('marketplace_message_error', cause);
    return error(request, env, 500, 'Could not load order');
  }
  if (!order) return error(request, env, 404, 'Order not found');
  if (String(order.buyer_id) !== userId && String(order.seller_id) !== userId) {
    return error(request, env, 403, 'Not your order');
  }
  return null;
}

/**
 * POST /api/v1/marketplace/orders/:id/messages - on-platform negotiation.
 *
 * Keeping the negotiation here matters: pushing farmers back onto phone calls
 * is exactly what lets the middleman step back in.
 */
export async function createOrderMessageRoute(request: Request, env: Env, orderId: string): Promise<Response> {
  const user = await currentUser(request, env);
  if (!user) return error(request, env, 401, 'Authentication required');

  const denied = await authorizeOrderParty(request, env, orderId, user.id);
  if (denied) return denied;

  const data = await body<{ body?: string }>(request);
  const text = cleanText(data?.body, MAX_TEXT);
  if (!text) return error(request, env, 400, 'body is required');

  const id = crypto.randomUUID();
  await env.DB.prepare('INSERT INTO order_messages (id, order_id, sender_id, body) VALUES (?, ?, ?, ?)')
    .bind(id, orderId, user.id, text).run();

  return json(request, env, { success: true, message: { id, order_id: orderId, body: text } }, 201);
}

/**
 * GET /api/v1/marketplace/orders/:id/messages - the thread for one order.
 */
export async function listOrderMessagesRoute(request: Request, env: Env, orderId: string): Promise<Response> {
  const user = await currentUser(request, env);
  if (!user) return error(request, env, 401, 'Authentication required');

  const denied = await authorizeOrderParty(request, env, orderId, user.id);
  if (denied) return denied;

  const rows = await env.DB.prepare(
    'SELECT id, sender_id, body, created_at FROM order_messages WHERE order_id = ? ORDER BY created_at ASC LIMIT 500'
  ).bind(orderId).all();

  return json(request, env, { success: true, messages: rows.results });
}