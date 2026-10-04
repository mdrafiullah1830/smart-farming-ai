-- ---------------------------------------------------------------------------
-- 0009b_flood_zones_seed.sql
--
-- Seed the flood zones the engine scores against. Without rows the feature is
-- a scoring function nobody can call, so these are the basins and low-lying
-- areas that flood first, with the depth and duration that decide whether a
-- standing crop survives.
--
-- Provenance and honesty about the numbers:
--  * Depth and duration are typical order-of-magnitude values for the basin
--    type, not measurements for a specific village. They are the kind of figure
--    published in BBAD/BWDB and Bangladesh Flood Action Plan material, rounded
--    to the nearest 0.1 m and day. They are NOT modelled per-parcel, and the
--    UI must not present them as a survey of the farmer's own field.
--  * A farmer's own field picture comes from `flood_exposures.drainage_class`,
--    which they set. The zone supplies the basin-level baseline.
--  * `flood_seasons` follows the Bengali crop calendar the engine uses:
--    boro (winter rice, ~Nov-Mar), aman (monsoon rice, ~Apr-Oct), aus (autumn).
--    Empty means the basin floods regardless of season, which is true of the
--    permanently waterlogged delta channels.
--  * district_id values are the numeric ids seeded in 0002_seed_districts.sql,
--    confirmed against the table rather than assumed from the name.
--
-- Depths in the Meghna/Surma-Kishoreganj haor system and the Ganges-Brahmaputra
-- delta are larger and longer-lived than the flash-flood-prone north-west
-- chars, so the engine distinguishes them through these columns.
-- ---------------------------------------------------------------------------

INSERT OR IGNORE INTO flood_zones
  (id, district_id, name_en, name_bn, flood_depth_m, flood_duration_days, flood_seasons, note)
VALUES
  -- Sylhet: the haor basin floods first and hardest in the pre-monsoon boro crop.
  ('fz-syl-baniaganj', '42', 'Baniaganj haor', 'বানিয়াগঞ্জ হাওর', 2.4, 21, 'boro,aman', 'Flash flood catchment; boro transplanting is most exposed'),
  ('fz-syl-kausai',    '42', 'Kausai river basin', 'কৌসাই নদী বেসিন', 1.8, 12, 'aman', 'Flash flood area'),
  ('fz-syl-golapganj', '42', 'Golapganj floodplain', 'গোলাপগঞ্জ প্লাবনভূমি', 1.5, 14, 'boro,aman', NULL),

  -- Sunamganj: the deepest haors in the country.
  ('fz-sun-takabil',  '45', 'Takabil haor', 'তাকাবিল হাওর', 2.8, 25, 'boro,aman', 'One of the deepest haors; evacuation usually needed'),
  ('fz-sun-dowar',    '45', 'Dowar basin', 'দুয়ার বেসিন', 2.2, 20, 'boro,aman', NULL),

  -- Kishoreganj: second-largest haor cluster.
  ('fz-kis-bhulta',   '5',  'Bhulta haor', 'ভুলতা হাওর', 2.5, 24, 'boro,aman', 'Ballast and polders reduce but do not remove risk'),
  ('fz-kis-italy',    '5',  'Italy basin', 'ইতালী বেসিন', 2.0, 18, 'boro,aman', NULL),

  -- Gaibandha: Teesta breach history, deep Teesta basin.
  ('fz-gai-teesta',   '55', 'Teesta basin', 'তিস্তা বেসিন', 2.3, 15, 'aman,aus', '2022 embankment breach was in this basin'),
  ('fz-gai-gaibandha','55', 'Gaibandha char', 'গাইবান্ধা চর', 1.9, 12, 'aman,aus', 'Riverine char land'),

  -- Rangpur: Teesta and Brahmaputra, mostly shallow and fast.
  ('fz-rng-teesta',   '52', 'Teesta floodplain', 'তিস্তা প্লাবনভূমি', 1.4, 7, 'aman', 'Shallow but fast rising'),
  ('fz-rng-brahma',   '52', 'Brahmaputra char', 'ব্রহ্মপুত্র চর', 1.6, 10, 'aman', NULL),

  -- Bogra: flash-flood chars, shallow and brief.
  ('fz-bog-bogura',   '25', 'Bogura char', 'বগুড়া চর', 1.2, 5, 'aman', 'Flash flood; short duration but no warning time'),

  -- Coastal delta: permanent waterlogging plus tidal storm surge risk.
  ('fz-lak-gamgachh', '19', 'Gamgachharia haor', 'গাংগাচরিয়া হাওর', 1.7, 16, 'boro,aman', NULL),
  ('fz-noa-kalmakanda','20','Kalmakanda floodplain', 'কলমাকান্দা প্লাবনভূমি', 1.3, 9, 'aman', 'Close to the old Meghna channel'),
  ('fz-fen-lua',      '16', 'Lua basin', 'লুয়া বেসিন', 1.2, 8, 'aman,aus', NULL),
  ('fz-bag-khulna',  '35', 'Khulna coastal belt', 'খুলনা উপকূলীয় অঞ্চল', 1.6, 14, 'boro,aus', 'Cyclone storm surge rather than riverine flood'),

  -- Barisal delta: permanently waterlogged.
  ('fz-bar-kirtimukha','46','Kirtimukha estuary', 'কীর্তমুখা মোহনা', 1.4, 20, 'boro,aus', 'Permanently waterlogged; crops here are flood-tolerant'),
  ('fz-pat-patuakhali','48','Patuakhali coastal', 'পটুয়াখালী উপকূল', 1.5, 18, 'boro,aus', NULL),
  ('fz-pir-pirojpur', '49', 'Pirojpur coastal', 'পিরোজপুর উপকূল', 1.3, 17, 'boro,aus', NULL),
  ('fz-jha-jhalokati', '50', 'Jhalokati river island', 'ঝালকাঠি নদী দ্বীপ', 1.1, 15, 'boro,aus', 'Char land; permanent waterlogging');