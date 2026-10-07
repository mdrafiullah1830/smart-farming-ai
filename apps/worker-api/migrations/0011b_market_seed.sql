-- ---------------------------------------------------------------------------
-- 0011b_market_seed.sql
--
-- Seed the commodity catalog and the first live source for the Market
-- Analysis feature.
--
-- Design notes:
-- * The catalog is authored to match how each publisher actually labels its
--   goods. `name_bn`/`name_en` are the literal published labels, so an exact
--   match on them needs no fuzzy guessing; `aliases_json` covers the other
--   spellings a source or a farmer may use.
-- * DAM's national retail ticker publishes a name and a min/max pair and no
--   unit. We therefore record the conventional unit from this catalog and
--   mark every such record unverified (see src/market-analysis/trust.ts) --
--   the unit is our inference, not the publisher's statement.
-- * Commodity ids reuse the crop_key spelling already used by
--   datasets/dam_prices, so the two datasets describe the same goods.
-- ---------------------------------------------------------------------------

-- 22 goods the Department of Agricultural Marketing currently publishes on
-- its national retail ticker, plus the wider catalog the app already offers.
INSERT OR IGNORE INTO market_commodities
  (id, name_en, name_bn, aliases_json, category, default_unit, valid_units_json, season)
VALUES
  ('rice_aman_fine',   'Rice (Aman, fine)',      'আমন চাল - সরু',                '["Aman-Fine","আমন চাল সরু","আমন চাল"]',                      'Rice & Grains',  'kg', '["kg"]',                 'all'),
  ('rice_aman_medium', 'Rice (Aman, medium)',    'আমন চাল - মাঝারি',             '["Aman-Medium","আমন চাল মাঝারি"]',                            'Rice & Grains',  'kg', '["kg"]',                 'all'),
  ('rice_aman_coarse', 'Rice (Aman, coarse)',    'আমন চাল - মোটা',               '["Aman-Coarse","আমন চাল মোটা"]',                              'Rice & Grains',  'kg', '["kg"]',                 'all'),
  ('rice_boro_fine',   'Rice (Boro, fine)',      'বোরো চাল - সরু',                '["Boro-Fine","বোরো চাল সরু"]',                                'Rice & Grains',  'kg', '["kg"]',                 'all'),
  ('rice_boro_medium', 'Rice (Boro, medium)',    'বোরো চাল - মাঝারি',             '["Boro-Medium","বোরো চাল মাঝারি"]',                           'Rice & Grains',  'kg', '["kg"]',                 'all'),
  ('rice_boro_coarse', 'Rice (Boro, coarse)',    'বোরো চাল - মোটা',               '["Boro-Coarse","বোরো চাল মোটা"]',                             'Rice & Grains',  'kg', '["kg"]',                 'all'),
  ('atta_packet',      'Ata (packet)',           'আটা (প্যাকেটজাত)',              '["Ata (packet)","আটা"]',                                      'Rice & Grains',  'kg', '["kg"]',                 'all'),
  ('wheat',            'Wheat',                  'গম',                            '["Wheat","আটার শস্য"]',                                        'Rice & Grains',  'kg', '["kg"]',                 'rabi'),
  ('potato',           'Potato',                 'আলু',                           '["Potato","আলু ভাজি"]',                                        'Vegetables',     'kg', '["kg"]',                 'rabi'),
  ('tomato',           'Tomato',                 'টমেটো',                         '["Tomato"]',                                                   'Vegetables',     'kg', '["kg"]',                 'winter'),
  ('onion_local',      'Onion (local)',          'পেঁয়াজ - দেশী',                '["Onion-local","Onion","দেশী পেঁয়াজ"]',                        'Vegetables',     'kg', '["kg"]',                 'rabi'),
  ('garlic_local',     'Garlic (local)',         'রসুন - দেশী',                  '["Garlic-local","Garlic","দেশী রসুন"]',                        'Vegetables',     'kg', '["kg"]',                 'rabi'),
  ('garlic_imported',  'Garlic (imported)',      'রসুন - আমদানিকৃত',             '["Garlic-Imported","আমদানিকৃত রসুন"]',                         'Vegetables',     'kg', '["kg"]',                 'all'),
  ('ginger_local',     'Ginger (local)',         'আদা - দেশী',                    '["Ginger-local","Ginger","দেশী আদা"]',                         'Spices',         'kg', '["kg"]',                 'all'),
  ('ginger_imported',  'Ginger (imported)',      'আদা - আমদানিকৃত',               '["Ginger-Imported","আমদানিকৃত আদা"]',                          'Spices',         'kg', '["kg"]',                 'all'),
  ('chili_green',      'Green chili',            'কাঁচা মরিচ',                    '["Green Chili","কাঁচা মরিচ"]',                                 'Spices',         'kg', '["kg"]',                 'all'),
  ('mung',             'Mung dal',               'মুগ ডাল',                       '["Mung","মুগ"]',                                               'Oilseeds & Pulses', 'kg', '["kg"]',              'all'),
  ('gram_whole',       'Gram (whole)',           'ছোলা - গোটা',                   '["Gram-Whole","ছোলা"]',                                        'Oilseeds & Pulses', 'kg', '["kg"]',              'rabi'),
  ('lentil',           'Lentil',                 'মসুর ডাল',                      '["Lentil","মসুর"]',                                            'Oilseeds & Pulses', 'kg', '["kg"]',              'rabi'),
  ('soybean_oil',      'Soybean oil',            'সয়াবিন তেল',                   '["Soybean","Soybean oil"]',                                     'Oilseeds & Pulses', 'kg', '["kg","litre"]',       'all'),
  ('sugar_local',      'Sugar (local)',          'চিনি (দেশী)',                   '["Sugar (Local)","Sugar","দেশী চিনি"]',                         'Other',          'kg', '["kg"]',                 'all'),
  ('salt_iodized',     'Iodized salt (packed)',  'আয়োডিনযুক্ত লবণ (প্যাকেটজাত)', '["Iodized Salt (Packed)","Salt","লবণ"]',                        'Other',          'kg', '["kg"]',                 'all'),
  ('beef',             'Beef',                   'মাংসঃ– গরু',                    '["Beef","গরুর মাংস","রুডমাংস"]',                                'Meat & Dairy',   'kg', '["kg"]',                 'all'),
  ('mutton',           'Mutton',                 'খাসী',                          '["Mutton","খাসীর মাংস"]',                                       'Meat & Dairy',   'kg', '["kg"]',                 'all'),
  ('chicken_farm',     'Farm-raised chicken',    'খামারের মুরগী',                 '["Farm-raised Hen","খামারের মুরগী"]',                           'Meat & Dairy',   'kg', '["kg"]',                 'all'),
  ('egg_farm_red',     'Farm egg (red)',         'ডিম ফার্ম - লাল',               '["Egg Farm-Red","ডিম ফার্ম লাল"]',                              'Meat & Dairy',   'kg', '["kg"]',                 'all'),
  ('jute',             'Jute',                   'পাট',                           '["Jute"]',                                                     'Fiber Crops',    'kg', '["kg","maund"]',        'kharif'),
  ('banana',           'Banana',                 'কলা',                           '["Banana"]',                                                   'Fruits',         'kg', '["kg","dozen"]',        'all');

-- ---------------------------------------------------------------------------
-- The one live source this feature ships with.
--
-- DAM's homepage renders a national retail ticker server-side as
--   <a href="#LABEL">LABEL</a>: ৭২.০০ - ৭৫.০০
-- with Bengali digits under ?L=B. Its report pages are POST+CSRF and render
-- no rows without a session, so the ticker -- not the report URL -- is the
-- only server-rendered price list DAM exposes. Hence parser_type 'custom':
-- a pattern, not a table shape.
--
-- parser_config_json:
--   pattern     regex whose capture groups, in order, are groupNames
--   groupNames  field name for each capture group
--   defaultUnit used when the payload publishes no unit column
--   marketName  applied when the payload publishes no market column
--
-- update_frequency_hours is 6 because DAM republishes the national list
-- through the day; refetching sooner only costs rate limit on their side.
-- ---------------------------------------------------------------------------
INSERT OR IGNORE INTO market_sources
  (id, name_en, name_bn, source_type, base_url, parser_type, trust_tier,
   update_frequency_hours, enabled, region, supported_categories_json,
   parser_config_json, rate_limit_rps, timeout_ms, user_agent, headers_json)
VALUES
  ('dam_gov',
   'Department of Agricultural Marketing',
   'কৃষি বিপণন অধিদপ্তর',
   'government',
   'https://market.dam.gov.bd/?L=B',
   'custom',
   1,
   6,
   1,
   NULL,
   '["Rice & Grains","Vegetables","Spices","Oilseeds & Pulses","Meat & Dairy","Other"]',
   '{"pattern":"<a\\b[^>]*href\\s*=\\s*[\\u0027\\u0022]#[^\\u0027\\u0022]*[\\u0027\\u0022][^>]*>\\s*([^<]+?)\\s*</a>\\s*:?\\s*([\\d\\u09E6-\\u09EF][\\d\\u09E6-\\u09EF.,]*)\\s*(?:-|\\u2013|\\u2014)\\s*([\\d\\u09E6-\\u09EF][\\d\\u09E6-\\u09EF.,]*)","groupNames":["commodity","priceMin","priceMax"],"defaultUnit":"kg","marketName":"National retail average","maxMatches":500}',
   0.2,
   10000,
   'Mozilla/5.0 (compatible; SmartFarmingBD/1.0; +https://smart-farming-ai-bice.vercel.app)',
   '{}');
