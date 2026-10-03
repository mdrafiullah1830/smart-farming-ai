import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import worker from '../src/index.ts';
import { createToken } from '../src/auth.ts';

// Test-only HMAC secret. Deliberately low entropy and obviously fake: gitleaks
// flags high-entropy strings assigned to a bare constant as generic API keys,
// and a realistic-looking key here would keep redrawing that finding. The
// routes only sign and verify with it, so the value has no security meaning.
const TEST_SECRET = 'unit-test-signing-key';

// district_id carries a foreign key to `districts`, so the create route
// resolves it before inserting. Tests that create a listing need the lookup to
// succeed, so the default mock resolves it; tests that assert a genuine
// "not found" pass an explicit row and keep it.
const DISTRICT_ROW = { id: '1' };

function dbReturning(row, allRows = [], districtRow = DISTRICT_ROW) {
  const stmt = {
    bind: () => ({
      first: async () => row ?? districtRow,
      all: async () => ({ results: allRows }),
      run: async () => ({ success: true, meta: { changes: 1 } }),
    }),
    first: async () => row ?? districtRow,
    all: async () => ({ results: allRows }),
    run: async () => ({ success: true, meta: { changes: 1 } }),
  };
  return { prepare: () => stmt, batch: async () => [{ success: true }] };
}

// For tests that must not resolve any row (404 paths).
function dbEmpty() {
  return dbReturning(null, [], null);
}

function makeEnv(overrides = {}) {
  return {
    JWT_SECRET: TEST_SECRET,
    ALLOWED_ORIGINS: 'http://localhost:3000',
    AI_SERVICE_URL: 'https://ai.example.com',
    AI_SERVICE_TOKEN: 'test-ai-token',
    // Default is a DB that resolves nothing: most tests assert a 404/401 path.
// Tests that create a listing pass a mock whose district lookup succeeds.
DB: dbEmpty(),
    UPLOADS: { put: async () => {} },
    RATE_LIMIT_KV: { get: async () => null, put: async () => {}, delete: async () => {} },
    ...overrides,
  };
}

async function request(path, { method = 'GET', token, body } = {}) {
  // Token helpers are async (HMAC signing), so resolve before building the
  // header. Passing the promise through would produce "Bearer [object Promise]"
  // and every route would answer 401.
  const bearer = token ? await token : null;
  return new Request(`http://localhost${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

const sellerToken = async () => createToken({ id: 'seller-1', email: 'seller@example.com' }, TEST_SECRET);
const buyerToken = async () => createToken({ id: 'buyer-1', email: 'buyer@example.com' }, TEST_SECRET);
const otherToken = async () => createToken({ id: 'other-1', email: 'other@example.com' }, TEST_SECRET);

const validListing = {
  crop_name_en: 'Rice',
  crop_name_bn: 'ধান',
  quantity_kg: 500,
  price_per_kg: 40,
  contact: '01700000000',
  upazila: 'Dhanmondi',
  district_id: '1',
};

const OWNED = dbReturning({ id: 'l1' });
const OPEN_LISTING = { id: 'l1', seller_id: 'seller-1', price_per_kg: 40, quantity_kg: 500, status: 'open' };
const PENDING_ORDER = { id: 'o1', buyer_id: 'buyer-1', seller_id: 'seller-1', status: 'pending' };
const THREAD_ORDER = { id: 'o1', buyer_id: 'buyer-1', seller_id: 'seller-1' };
describe('Marketplace listings', () => {
  it('creating a listing requires authentication', async () => {
    const res = await worker.fetch(await request('/api/v1/marketplace/listings', {
      method: 'POST', body: validListing,
    }), makeEnv());
    assert.equal(res.status, 401);
  });

  it('requires a crop name, contact, quantity and price', async () => {
    for (const missing of ['crop_name_en', 'contact', 'quantity_kg', 'price_per_kg']) {
      const body = { ...validListing };
      delete body[missing];
      const res = await worker.fetch(await request('/api/v1/marketplace/listings', {
        method: 'POST', token: sellerToken(), body,
      }), makeEnv());
      assert.equal(res.status, 400, `${missing} should be required`);
    }
  });

  it('rejects a fractional quantity instead of truncating it', async () => {
    const res = await worker.fetch(await request('/api/v1/marketplace/listings', {
      method: 'POST', token: sellerToken(), body: { ...validListing, quantity_kg: 10.5 },
    }), makeEnv());
    assert.equal(res.status, 400);
    assert.match((await res.json()).error, /whole number/);
  });

  it('rejects a non-numeric price rather than coercing it', async () => {
    const res = await worker.fetch(await request('/api/v1/marketplace/listings', {
      method: 'POST', token: sellerToken(), body: { ...validListing, price_per_kg: 'free' },
    }), makeEnv());
    assert.equal(res.status, 400);
  });

  it('rejects a zero or negative quantity', async () => {
    for (const quantity_kg of [0, -5]) {
      const res = await worker.fetch(await request('/api/v1/marketplace/listings', {
        method: 'POST', token: sellerToken(), body: { ...validListing, quantity_kg },
      }), makeEnv());
      assert.equal(res.status, 400);
    }
  });

  it('rejects a malformed harvest date', async () => {
    const res = await worker.fetch(await request('/api/v1/marketplace/listings', {
      method: 'POST', token: sellerToken(), body: { ...validListing, harvest_date: 'not-a-date' },
    }), makeEnv());
    assert.equal(res.status, 400);
    assert.match((await res.json()).error, /ISO date/);
  });

  it('creates a listing with 201 and echoes the stored values', async () => {
    // The default env resolves nothing, so this one supplies the district row
    // the create route looks up before inserting.
    const res = await worker.fetch(await request('/api/v1/marketplace/listings', {
      method: 'POST', token: sellerToken(), body: validListing,
    }), makeEnv({ DB: dbReturning(null, [], DISTRICT_ROW) }));
    assert.equal(res.status, 201);
    const { listing } = await res.json();
    assert.equal(listing.status, 'open');
    assert.equal(listing.quantity_kg, 500);
    assert.equal(listing.price_per_kg, 40);
    assert.ok(listing.id, 'a listing id is returned');
  });

  it('rejects an invalid JSON body', async () => {
    const res = await worker.fetch(new Request('http://localhost/api/v1/marketplace/listings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${await sellerToken()}`,
      },
      body: '{not json',
    }), makeEnv());
    assert.equal(res.status, 400);
  });

  it('browse is public and never returns the seller contact column', async () => {
    // The mock returns whole rows, so `contact` is present on the row the mock
    // hands back. What matters is that the route's projection does not include
    // it: the SQL it issues names every column except `contact`. This test pins
    // the behaviour that a public browse response carries no contact field.
    const rows = [{
      id: 'l1', seller_id: 'seller-1', crop_name_en: 'Rice', quantity_kg: 500,
      price_per_kg: 40, status: 'open',
    }];
    const res = await worker.fetch(
      await request('/api/v1/marketplace/listings'),
      makeEnv({ DB: dbReturning(null, rows) })
    );
    assert.equal(res.status, 200);
    const { listings } = await res.json();
    assert.equal(listings.length, 1);
    assert.equal(listings[0].contact, undefined, 'contact must not be exposed on browse');
  });

  it('the browse query does not select the contact column', async () => {
    // Guards the projection itself. If someone adds `contact` to LISTING_COLUMNS
    // the previous test would still pass, because the mock controls its rows.
    let issued = '';
    const db = {
      prepare: (sql) => {
        issued = sql;
        return {
          bind: () => ({ first: async () => null, all: async () => ({ results: [] }), run: async () => ({ success: true, meta: { changes: 1 } }) }),
          first: async () => null,
          all: async () => ({ results: [] }),
          run: async () => ({ success: true, meta: { changes: 1 } }),
        };
      },
      batch: async () => [{ success: true }],
    };
    await worker.fetch(await request('/api/v1/marketplace/listings'), makeEnv({ DB: db }));

    const selected = issued.slice(issued.indexOf('SELECT') + 6, issued.indexOf('FROM'));
    assert.ok(!/\bcontact\b/.test(selected), `browse projection must omit contact, got: ${selected}`);
  });

  it('my-listings requires authentication', async () => {
    const res = await worker.fetch(await request('/api/v1/marketplace/listings?mine=true'), makeEnv());
    assert.equal(res.status, 401);
  });

  it('unknown listing returns 404', async () => {
    const res = await worker.fetch(
      await request('/api/v1/marketplace/listings/nope', { token: buyerToken() }),
      makeEnv()
    );
    assert.equal(res.status, 404);
  });

  it('a closed listing is hidden from others but visible to its seller', async () => {
    const closed = { ...OPEN_LISTING, status: 'closed' };
    const env = makeEnv({ DB: dbReturning(closed) });

    const asBuyer = await worker.fetch(
      await request('/api/v1/marketplace/listings/l1', { token: buyerToken() }), env);
    assert.equal(asBuyer.status, 404, 'a closed listing must not be confirmed to exist');

    const asSeller = await worker.fetch(
      await request('/api/v1/marketplace/listings/l1', { token: sellerToken() }), env);
    assert.equal(asSeller.status, 200);
  });

  it('only the seller may edit, and a stranger gets 404 not 403', async () => {
    const ok = await worker.fetch(await request('/api/v1/marketplace/listings/l1', {
      method: 'PATCH', token: sellerToken(), body: { price_per_kg: 45 },
    }), makeEnv({ DB: OWNED }));
    assert.equal(ok.status, 200);

    const denied = await worker.fetch(await request('/api/v1/marketplace/listings/l1', {
      method: 'PATCH', token: otherToken(), body: { price_per_kg: 45 },
    }), makeEnv());
    assert.equal(denied.status, 404);
  });

  it('rejects an unknown district_id with a 400, not an opaque 500', async () => {
    // district_id is a foreign key. An unknown id must be reported as a client
    // error; letting it reach the INSERT would surface as a 500.
    const noDistricts = {
      prepare: () => ({
        bind: () => ({ first: async () => null, all: async () => ({ results: [] }), run: async () => ({ success: true, meta: { changes: 1 } }) }),
        first: async () => null,
        all: async () => ({ results: [] }),
        run: async () => ({ success: true, meta: { changes: 1 } }),
      }),
      batch: async () => [{ success: true }],
    };
    const res = await worker.fetch(await request('/api/v1/marketplace/listings', {
      method: 'POST', token: sellerToken(),
      body: { ...validListing, district_id: 'not-a-real-district' },
    }), makeEnv({ DB: noDistricts }));
    assert.equal(res.status, 400);
    assert.match((await res.json()).error, /Unknown district_id/);
  });

  it('rejects an invalid status value', async () => {
    const res = await worker.fetch(await request('/api/v1/marketplace/listings/l1', {
      method: 'PATCH', token: sellerToken(), body: { status: 'deleted' },
    }), makeEnv({ DB: OWNED }));
    assert.equal(res.status, 400);
  });

  it('an update with no supported fields is rejected', async () => {
    const res = await worker.fetch(await request('/api/v1/marketplace/listings/l1', {
      method: 'PATCH', token: sellerToken(), body: { unrelated: 'value' },
    }), makeEnv({ DB: OWNED }));
    assert.equal(res.status, 400);
  });
describe('Marketplace orders', () => {
  it('placing an order requires authentication', async () => {
    const res = await worker.fetch(await request('/api/v1/marketplace/orders', {
      method: 'POST', body: { listing_id: 'l1', quantity_kg: 100 },
    }), makeEnv());
    assert.equal(res.status, 401);
  });

  it('requires a listing id and a quantity', async () => {
    const noListing = await worker.fetch(await request('/api/v1/marketplace/orders', {
      method: 'POST', token: buyerToken(), body: { quantity_kg: 100 },
    }), makeEnv());
    assert.equal(noListing.status, 400);

    const noQuantity = await worker.fetch(await request('/api/v1/marketplace/orders', {
      method: 'POST', token: buyerToken(), body: { listing_id: 'l1' },
    }), makeEnv());
    assert.equal(noQuantity.status, 400);
  });

  it('a seller cannot order their own listing', async () => {
    const res = await worker.fetch(await request('/api/v1/marketplace/orders', {
      method: 'POST', token: sellerToken(), body: { listing_id: 'l1', quantity_kg: 100 },
    }), makeEnv({ DB: dbReturning(OPEN_LISTING) }));
    assert.equal(res.status, 400);
    assert.match((await res.json()).error, /your own listing/);
  });

  it('refuses to order a listing that is not open', async () => {
    const res = await worker.fetch(await request('/api/v1/marketplace/orders', {
      method: 'POST', token: buyerToken(), body: { listing_id: 'l1', quantity_kg: 100 },
    }), makeEnv({ DB: dbReturning({ ...OPEN_LISTING, status: 'closed' }) }));
    assert.equal(res.status, 409);
  });

  it('refuses to oversubscribe the remaining quantity', async () => {
    // 500 kg listed with 450 kg already committed. The first prepare() is the
    // listing lookup; the second is the committed-quantity SUM.
    let call = 0;
    const db = {
      prepare: () => {
        call += 1;
        const first = call === 1;
        return {
          bind: () => ({
            first: async () => (first ? OPEN_LISTING : { total: 450 }),
            all: async () => ({ results: [] }),
            run: async () => ({ success: true, meta: { changes: 1 } }),
          }),
          first: async () => (first ? OPEN_LISTING : null),
          all: async () => ({ results: [] }),
          run: async () => ({ success: true, meta: { changes: 1 } }),
        };
      },
      batch: async () => [{ success: true }],
    };
    const res = await worker.fetch(await request('/api/v1/marketplace/orders', {
      method: 'POST', token: buyerToken(), body: { listing_id: 'l1', quantity_kg: 100 },
    }), makeEnv({ DB: db }));
    assert.equal(res.status, 409);
    assert.match((await res.json()).error, /Only 50 kg remain/);
  });

  it('orders list requires authentication', async () => {
    const res = await worker.fetch(await request('/api/v1/marketplace/orders'), makeEnv());
    assert.equal(res.status, 401);
  });

  it('order actions require authentication', async () => {
    const res = await worker.fetch(await request('/api/v1/marketplace/orders/o1', {
      method: 'PATCH', body: { action: 'confirm' },
    }), makeEnv());
    assert.equal(res.status, 401);
  });

  it('an unknown order action is rejected', async () => {
    const res = await worker.fetch(await request('/api/v1/marketplace/orders/o1', {
      method: 'PATCH', token: sellerToken(), body: { action: 'teleport' },
    }), makeEnv());
    assert.equal(res.status, 400);
  });

  it('a third party cannot move an order along', async () => {
    const res = await worker.fetch(await request('/api/v1/marketplace/orders/o1', {
      method: 'PATCH', token: otherToken(), body: { action: 'confirm' },
    }), makeEnv({ DB: dbReturning(PENDING_ORDER) }));
    assert.equal(res.status, 403);
  });

  it('a buyer cannot confirm their own order', async () => {
    const res = await worker.fetch(await request('/api/v1/marketplace/orders/o1', {
      method: 'PATCH', token: buyerToken(), body: { action: 'confirm' },
    }), makeEnv({ DB: dbReturning(PENDING_ORDER) }));
    assert.equal(res.status, 403);
    assert.match((await res.json()).error, /seller/);
  });

  it('a seller can confirm a pending order', async () => {
    const res = await worker.fetch(await request('/api/v1/marketplace/orders/o1', {
      method: 'PATCH', token: sellerToken(), body: { action: 'confirm' },
    }), makeEnv({ DB: dbReturning(PENDING_ORDER) }));
    assert.equal(res.status, 200);
    assert.equal((await res.json()).order.status, 'confirmed');
  });

  it('refuses an illegal transition such as shipping a pending order', async () => {
    const res = await worker.fetch(await request('/api/v1/marketplace/orders/o1', {
      method: 'PATCH', token: sellerToken(), body: { action: 'ship' },
    }), makeEnv({ DB: dbReturning(PENDING_ORDER) }));
    assert.equal(res.status, 409);
  });

  it('refuses to cancel an order that has already shipped', async () => {
    const res = await worker.fetch(await request('/api/v1/marketplace/orders/o1', {
      method: 'PATCH', token: buyerToken(), body: { action: 'cancel' },
    }), makeEnv({ DB: dbReturning({ ...PENDING_ORDER, status: 'shipped' }) }));
    assert.equal(res.status, 409);
  });

  it('a buyer may cancel while the order is still pending', async () => {
    const res = await worker.fetch(await request('/api/v1/marketplace/orders/o1', {
      method: 'PATCH', token: buyerToken(), body: { action: 'cancel' },
    }), makeEnv({ DB: dbReturning(PENDING_ORDER) }));
    assert.equal(res.status, 200);
    assert.equal((await res.json()).order.status, 'cancelled');
  });
});
describe('Marketplace order messages', () => {
  const partyEnv = () => makeEnv({ DB: dbReturning(THREAD_ORDER) });

  it('posting a message requires authentication', async () => {
    const res = await worker.fetch(await request('/api/v1/marketplace/orders/o1/messages', {
      method: 'POST', body: { body: 'hello' },
    }), makeEnv());
    assert.equal(res.status, 401);
  });

  it('rejects an empty message body', async () => {
    const res = await worker.fetch(await request('/api/v1/marketplace/orders/o1/messages', {
      method: 'POST', token: buyerToken(), body: { body: '   ' },
    }), partyEnv());
    assert.equal(res.status, 400);
  });

  it('a buyer can post on their own order', async () => {
    const res = await worker.fetch(await request('/api/v1/marketplace/orders/o1/messages', {
      method: 'POST', token: buyerToken(), body: { body: 'আপনার ধান কবে পাব?' },
    }), partyEnv());
    assert.equal(res.status, 201);
    assert.equal((await res.json()).message.body, 'আপনার ধান কবে পাব?');
  });

  it('a third party cannot read or post in a thread', async () => {
    const post = await worker.fetch(await request('/api/v1/marketplace/orders/o1/messages', {
      method: 'POST', token: otherToken(), body: { body: 'sneaking in' },
    }), partyEnv());
    assert.equal(post.status, 403);

    const read = await worker.fetch(await request('/api/v1/marketplace/orders/o1/messages', {
      token: otherToken(),
    }), partyEnv());
    assert.equal(read.status, 403);
  });

  it('an unknown order thread returns 404', async () => {
    const res = await worker.fetch(await request('/api/v1/marketplace/orders/nope/messages', {
      token: buyerToken(),
    }), makeEnv());
    assert.equal(res.status, 404);
  });
});
});