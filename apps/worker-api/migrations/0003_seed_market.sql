INSERT OR IGNORE INTO crops (id, name_en, name_bn, season) VALUES
('rice','Rice','ধান','all'),('onion','Onion','পেঁয়াজ','rabi'),
('potato','Potato','আলু','rabi'),('tomato','Tomato','টমেটো','winter'),
('vegetables','Vegetables','শাকসবজি','all'),('wheat','Wheat','গম','rabi'),
('jute','Jute','পাট','kharif'),('chili','Chili','মরিচ','all'),
('lentils','Lentils','ডাল','rabi'),('banana','Banana','কলা','all');

INSERT OR IGNORE INTO market_prices
(id, crop_id, district_id, market_name, price_min, price_max, unit, source, recorded_at) VALUES
('seed-rice','rice',NULL,'National',35,42,'kg','Seed baseline (not live)','2026-06-23T13:38:01Z'),
('seed-onion','onion',NULL,'National',60,80,'kg','Seed baseline (not live)','2026-06-23T13:38:01Z'),
('seed-potato','potato',NULL,'National',25,35,'kg','Seed baseline (not live)','2026-06-23T13:38:01Z'),
('seed-tomato','tomato',NULL,'National',40,55,'kg','Seed baseline (not live)','2026-06-23T13:38:01Z'),
('seed-vegetables','vegetables',NULL,'National',20,30,'bundle','Seed baseline (not live)','2026-06-23T13:38:01Z'),
('seed-wheat','wheat',NULL,'National',28,35,'kg','Seed baseline (not live)','2026-06-23T13:38:01Z'),
('seed-jute','jute',NULL,'National',4000,5500,'maund','Seed baseline (not live)','2026-06-23T13:38:01Z'),
('seed-chili','chili',NULL,'National',80,150,'kg','Seed baseline (not live)','2026-06-23T13:38:01Z'),
('seed-lentils','lentils',NULL,'National',100,140,'kg','Seed baseline (not live)','2026-06-23T13:38:01Z'),
('seed-banana','banana',NULL,'National',30,50,'dozen','Seed baseline (not live)','2026-06-23T13:38:01Z');
