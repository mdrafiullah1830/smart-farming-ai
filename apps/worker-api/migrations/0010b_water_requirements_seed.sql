-- ---------------------------------------------------------------------------
-- 0010b_water_requirements_seed.sql
--
-- Crop-stage water requirement, the number the whole feature hangs on. Without
-- a requirement there is no "needs water" judgement, only a gauge reading.
--
-- Provenance and honesty about these numbers:
--  * Figures are millimetres per day for the crop at that growth stage, the form
--    irrigation schedules in Bangladesh (BRRI/BAU extension material and DAE
--    guidance) are written in. They are advisory guidance, NOT measurements of
--    any farmer's field. The API returns them labelled as guidance, and the UI
--    says so.
--  * The heavy monsoon crop (boro) is the deepest-rooted and the longest season,
--    so it carries the highest figures; aman is lower and shorter because it
--    rides on rainfall. These are the shapes that are well established.
--  * Rice is water-intensive, which is exactly why this matters: a boro field in
--    peak panicle stage can need 8-10 mm/day, and that is the figure a farmer
--    over-irrigates -- wasting pumped water and the fuel to move it.
--  * Rows with a NULL district apply everywhere. Two districts are overridden:
--    the coastal belt (salinity pushes demand up and shortens tolerable
--    standing water) and the north-west (higher evapotranspiration).
--  * district_id values were read from the districts table, not assumed.
-- ---------------------------------------------------------------------------

-- Boro rice (winter, Nov-Mar). Deepest water demand of the three seasons.
INSERT OR IGNORE INTO water_requirements
  (id, district_id, crop_name_en, crop_name_bn, season, stage, mm_per_day, note)
VALUES
  ('wr-boro-transplanted', NULL, 'Rice', 'ধান', 'boro', 'transplanted', 4.0, 'প্রতিবার লাগানোর পর প্রাথমিক সেচ'),
  ('wr-boro-tillering',    NULL, 'Rice', 'ধান', 'boro', 'tillering', 6.5, 'ক্ষুদ্র শাখা পর্যায়'),
  ('wr-boro-panicle',      NULL, 'Rice', 'ধান', 'boro', 'panicle', 9.0, 'শস্য গিঁট পড়ার সময় সর্বোচ্চ চাহিদা'),
  ('wr-boro-maturity',     NULL, 'Rice', 'ধান', 'boro', 'maturity', 3.0, 'পাক ধাপে চাহিদা কমে'),
  ('wr-boro-sowing',       NULL, 'Rice', 'ধান', 'boro', 'sowing', 2.5, 'বীজ বোনার সময়');

-- Aman rice (monsoon, Apr-Oct). Rides on rain, so demand is lower.
INSERT OR IGNORE INTO water_requirements
  (id, district_id, crop_name_en, crop_name_bn, season, stage, mm_per_day, note)
VALUES
  ('wr-aman-transplanted', NULL, 'Rice', 'ধান', 'aman', 'transplanted', 3.0, NULL),
  ('wr-aman-tillering',    NULL, 'Rice', 'ধান', 'aman', 'tillering', 4.5, NULL),
  ('wr-aman-panicle',      NULL, 'Rice', 'ধান', 'aman', 'panicle', 6.0, NULL),
  ('wr-aman-maturity',     NULL, 'Rice', 'ধান', 'aman', 'maturity', 2.0, NULL);

-- Aus rice (autumn). Shortest season, lowest demand.
INSERT OR IGNORE INTO water_requirements
  (id, district_id, crop_name_en, crop_name_bn, season, stage, mm_per_day, note)
VALUES
  ('wr-aus-transplanted', NULL, 'Rice', 'ধান', 'aus', 'transplanted', 2.5, NULL),
  ('wr-aus-tillering',    NULL, 'Rice', 'ধান', 'aus', 'tillering', 3.5, NULL),
  ('wr-aus-panicle',      NULL, 'Rice', 'ধান', 'aus', 'panicle', 4.5, NULL),
  ('wr-aus-maturity',     NULL, 'Rice', 'ধান', 'aus', 'maturity', 1.5, NULL);

-- Non-rice crops. DAE figures; far lower demand than rice.
INSERT OR IGNORE INTO water_requirements
  (id, district_id, crop_name_en, crop_name_bn, season, stage, mm_per_day, note)
VALUES
  ('wr-wheat-sowing',   NULL, 'Wheat', 'গম',       'other', 'sowing', 4.0, NULL),
  ('wr-wheat-vegetative', NULL, 'Wheat', 'গম',     'other', 'vegetative', 5.0, NULL),
  ('wr-wheat-flowering',  NULL, 'Wheat', 'গম',      'other', 'flowering', 5.5, NULL),
  ('wr-mustard-vegetative', NULL, 'Mustard', 'সরিষা', 'other', 'vegetative', 4.5, NULL),
  ('wr-mustard-flowering',  NULL, 'Mustard', 'সরিষা', 'other', 'flowering', 5.0, NULL),
  ('wr-lentil-vegetative',  NULL, 'Lentil', 'ডাল',   'other', 'vegetative', 3.5, NULL),
  ('wr-lentil-flowering',   NULL, 'Lentil', 'ডাল',   'other', 'flowering', 4.0, NULL),
  ('wr-potato-vegetative',  NULL, 'Potato', 'আলু',  'other', 'vegetative', 5.0, NULL),
  ('wr-maize-tasseling',    NULL, 'Maize', 'ভুট্টা',  'other', 'tasseling', 5.5, NULL),
  ('wr-vegetable-vegetative', NULL, 'Vegetables', 'শাকসবজি', 'other', 'vegetative', 5.0, NULL);

-- North-west: higher evapotranspiration in the dry season, so the same crop
-- genuinely needs more water there than in the humid east.
INSERT OR IGNORE INTO water_requirements
  (id, district_id, crop_name_en, crop_name_bn, season, stage, mm_per_day, note)
VALUES
  ('wr-rng-boro-tillering', '52', 'Rice', 'ধান', 'boro', 'tillering', 7.5, 'শুকনো উত্তর-পশ্চিমে বেশি বাষ্পীভবন'),
  ('wr-rng-boro-panicle',   '52', 'Rice', 'ধান', 'boro', 'panicle', 10.0, 'শুকনো উত্তর-পশ্চিমে সর্বোচ্চ চাহিদা'),
  ('wr-bog-boro-panicle',   '25', 'Rice', 'ধান', 'boro', 'panicle', 9.5, NULL);

-- Coastal belt: salinity means less standing water is tolerable, so the advice
-- is to irrigate more often and thinner rather than deeper and rarer.
INSERT OR IGNORE INTO water_requirements
  (id, district_id, crop_name_en, crop_name_bn, season, stage, mm_per_day, note)
VALUES
  ('wr-khul-boro-panicle', '32', 'Rice', 'ধান', 'boro', 'panicle', 8.0, 'লবণাক্ততায় কম পানি রেখে বেশিবার সেচ'),
  ('wr-brs-boro-panicle', '46', 'Rice', 'ধান', 'boro', 'panicle', 8.0, 'লবণাক্ততায় কম পানি রেখে বেশিবার সেচ'),
  ('wr-pat-boro-panicle', '48', 'Rice', 'ধান', 'boro', 'panicle', 8.5, 'উপকূলীয় লবণাক্ততা'),
  ('wr-cml-aman-tillering', '15', 'Rice', 'ধান', 'aman', 'tillering', 5.0, NULL);