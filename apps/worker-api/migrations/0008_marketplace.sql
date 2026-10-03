-- ---------------------------------------------------------------------------
-- 0008_marketplace.sql
--
-- Direct farmer-to-buyer marketplace. The gap this closes: today a farmer
-- sells to a middleman who sells to a wholesaler, and roughly 40% of the
-- consumer price never reaches the farm. A listing lets a farmer name a price
-- and quantity, and lets a buyer in any district find it, order it, and talk
-- to the seller directly.
--
-- Design notes:
--  * Prices are INTEGER taka. Floating point money is never acceptable here,
--    and D1 has no decimal type that would avoid it.
--  * quantity_kg is a whole number of kilograms, which is what farmers
--    actually negotiate in; 1 maund ≈ 37.324 kg.
--  * Status transitions are enforced by CHECK constraints so an invalid state
--    is impossible at the storage layer, not just in the route.
--  * `contact` is a single free-text field (phone / Messenger ID). A dedicated
--    messaging table keeps the negotiation on-platform instead of pushing
--    farmers back onto phone calls, which is what re-introduces the middleman.
--  * Orders carry a denormalised price_agreed snapshot. A later price change on
--    the listing must never silently rewrite what both sides agreed to.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS produce_listings (
  id TEXT PRIMARY KEY,
  seller_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  crop_id TEXT REFERENCES crops(id) ON DELETE SET NULL,
  crop_name_en TEXT NOT NULL,
  crop_name_bn TEXT NOT NULL DEFAULT '',
  -- Denormalised so a search result renders without a join to `districts`.
  district_id TEXT REFERENCES districts(id) ON DELETE SET NULL,
  upazila TEXT,
  -- Free text the farmer types; kept separate from the structured district so a
  -- listing can still be posted from a village that is not in the gazetteer.
  area TEXT,
  quantity_kg INTEGER NOT NULL CHECK (quantity_kg > 0),
  price_per_kg INTEGER NOT NULL CHECK (price_per_kg > 0),
  -- 'kg' | 'maund' -- what the farmer quoted in.
  unit TEXT NOT NULL DEFAULT 'kg' CHECK (unit IN ('kg', 'maund')),
  -- Quality grade as the farmer describes it, shown to buyers as a label.
  quality TEXT,
  harvest_date TEXT,
  is_organic INTEGER NOT NULL DEFAULT 0 CHECK (is_organic IN (0, 1)),
  description_bn TEXT NOT NULL DEFAULT '',
  description_en TEXT NOT NULL DEFAULT '',
  -- How a buyer reaches the seller: phone number, Messenger ID, or both.
  contact TEXT NOT NULL,
  -- open  = accepting orders
  -- closed= farmer paused the listing (sold out, price changed)
  -- sold  = fully allocated
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'sold')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- The browse query: open listings, newest first, optionally narrowed to a crop
-- or a district. Composite indexes so the filtered and unfiltered paths both
-- stay index-ordered instead of sorting the whole table.
CREATE INDEX IF NOT EXISTS idx_listings_browse ON produce_listings(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_listings_crop ON produce_listings(crop_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_listings_district ON produce_listings(district_id, status, created_at DESC);

-- "My listings" for the seller, including the closed/sold ones the browse
-- query deliberately hides.
CREATE INDEX IF NOT EXISTS idx_listings_seller ON produce_listings(seller_id, created_at DESC);

-- A buyer order against one listing.
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL REFERENCES produce_listings(id) ON DELETE CASCADE,
  -- Denormalised so the order survives the seller deleting their listing.
  buyer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seller_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  quantity_kg INTEGER NOT NULL CHECK (quantity_kg > 0),
  -- Snapshot of the listing price at order time. Never recomputed from
  -- `produce_listings`, so a later price edit cannot rewrite the deal.
  price_per_kg INTEGER NOT NULL CHECK (price_per_kg > 0),
  total_taka INTEGER NOT NULL CHECK (total_taka > 0),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'shipped', 'completed', 'cancelled')),
  delivery_note TEXT NOT NULL DEFAULT '',
  -- How the goods will move. Logistics is a real constraint in Bangladesh:
  -- 'pickup' means the buyer collects from the farm gate.
  delivery_method TEXT NOT NULL DEFAULT 'pickup'
    CHECK (delivery_method IN ('pickup', 'courier', 'transport')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- A buyer's order list and a seller's incoming-order list.
CREATE INDEX IF NOT EXISTS idx_orders_buyer ON orders(buyer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_seller ON orders(seller_id, created_at DESC);
-- Guards against two buyers claiming the last of the same listing.
CREATE INDEX IF NOT EXISTS idx_orders_listing ON orders(listing_id, status);

-- On-platform negotiation, so the deal does not have to happen over the phone.
CREATE TABLE IF NOT EXISTS order_messages (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_order_messages_order ON order_messages(order_id, created_at);