-- ============================================================
-- Seed Data for Smart Farming AI Platform Bangladesh
-- ============================================================

-- Districts (64 districts of Bangladesh)
INSERT INTO districts (id, name, name_bn, division, division_bn, latitude, longitude, area_sq_km, population, agricultural_land_pct, soil_type, climate_zone, major_crops) VALUES

-- Dhaka Division
('d1e00000-0000-0000-0000-000000000001', 'Dhaka', 'ঢাকা', 'Dhaka', 'ঢাকা', 23.8103, 90.4125, 1463.93, 12043974, 45.2, 'Alluvial', 'Subtropical', ARRAY['Rice', 'Jute', 'Vegetables']),
('d1e00000-0000-0000-0000-000000000002', 'Faridpur', 'ফরিদপুর', 'Dhaka', 'ঢাকা', 23.5422, 89.8300, 1952.92, 1895867, 68.5, 'Alluvial', 'Subtropical', ARRAY['Rice', 'Jute', 'Wheat']),
('d1e00000-0000-0000-0000-000000000003', 'Gazipur', 'গাজীপুর', 'Dhaka', 'ঢাকা', 24.0000, 90.4200, 1048.44, 4646944, 35.2, 'Alluvial', 'Subtropical', ARRAY['Rice', 'Vegetables']),
('d1e00000-0000-0000-0000-000000000004', 'Gopalganj', 'গোপালগঞ্জ', 'Dhaka', 'ঢাকা', 23.0000, 89.8300, 1028.00, 1172415, 72.3, 'Clay', 'Subtropical', ARRAY['Rice', 'Jute']),
('d1e00000-0000-0000-0000-000000000005', 'Kishoreganj', 'কিশোরগঞ্জ', 'Dhaka', 'ঢাকা', 24.4333, 90.7833, 2688.62, 3026454, 62.1, 'Alluvial', 'Subtropical', ARRAY['Rice', 'Wheat', 'Pulses']),
('d1e00000-0000-0000-0000-000000000006', 'Madaripur', 'মাদারীপুর', 'Dhaka', 'ঢাকা', 23.1667, 90.1667, 1144.74, 1169532, 69.8, 'Clay', 'Subtropical', ARRAY['Rice', 'Jute']),
('d1e00000-0000-0000-0000-000000000007', 'Manikganj', 'মানিকগঞ্জ', 'Dhaka', 'ঢাকা', 23.8667, 90.0000, 1381.45, 1390795, 58.3, 'Alluvial', 'Subtropical', ARRAY['Rice', 'Jute', 'Vegetables']),
('d1e00000-0000-0000-0000-000000000008', 'Munshiganj', 'মুন্সিগঞ্জ', 'Dhaka', 'ঢাকা', 23.5500, 90.5000, 1004.29, 1445335, 55.6, 'Alluvial', 'Subtropical', ARRAY['Rice', 'Jute', 'Vegetables']),
('d1e00000-0000-0000-0000-000000000009', 'Narayanganj', 'নারায়ণগঞ্জ', 'Dhaka', 'ঢাকা', 23.6333, 90.5000, 704.98, 3359450, 42.1, 'Alluvial', 'Subtropical', ARRAY['Rice', 'Vegetables']),
('d1e00000-0000-0000-0000-000000000010', 'Narsingdi', 'নরসিংদী', 'Dhaka', 'ঢাকা', 23.9333, 90.7167, 732.23, 2305883, 52.4, 'Alluvial', 'Subtropical', ARRAY['Rice', 'Jute', 'Vegetables']),
('d1e00000-0000-0000-0000-000000000011', 'Rajbari', 'রাজবাড়ি', 'Dhaka', 'ঢাকা', 23.7500, 89.6000, 1097.82, 1049389, 65.2, 'Clay', 'Subtropical', ARRAY['Rice', 'Jute']),
('d1e00000-0000-0000-0000-000000000012', 'Shariatpur', 'শরীয়তপুর', 'Dhaka', 'ঢাকা', 23.2000, 90.4500, 1178.98, 1155832, 70.1, 'Clay', 'Subtropical', ARRAY['Rice', 'Jute']),

-- Chittagong Division
('d1e00000-0000-0000-0000-000000000013', 'Chittagong', 'চট্টগ্রাম', 'Chittagong', 'চট্টগ্রাম', 22.3569, 91.7832, 5282.82, 8261647, 38.5, 'Coastal', 'Tropical', ARRAY['Rice', 'Jute', 'Sugarcane']),
('d1e00000-0000-0000-0000-000000000014', 'Cox''s Bazar', 'কক্সবাজার', 'Chittagong', 'চট্টগ্রাম', 21.4272, 92.0065, 2491.61, 2744757, 42.3, 'Coastal', 'Tropical', ARRAY['Rice', 'Jute', 'Spices']),
('d1e00000-0000-0000-0000-000000000015', 'Comilla', 'কুমিল্লা', 'Chittagong', 'চট্টগ্রাম', 23.4607, 91.1809, 1509.00, 5989568, 58.2, 'Alluvial', 'Subtropical', ARRAY['Rice', 'Wheat', 'Pulses']),

-- Rajshahi Division
('d1e00000-0000-0000-0000-000000000016', 'Rajshahi', 'রাজশাহী', 'Rajshahi', 'রাজশাহী', 24.3740, 88.6011, 2407.84, 2575574, 62.8, 'Alluvial', 'Subtropical', ARRAY['Rice', 'Wheat', 'Mango']),
('d1e00000-0000-0000-0000-000000000017', 'Bogra', 'বগুড়া', 'Rajshahi', 'রাজশাহী', 24.8500, 89.3500, 2061.76, 3500000, 65.3, 'Alluvial', 'Subtropical', ARRAY['Rice', 'Wheat', 'Potato']),

-- Khulna Division
('d1e00000-0000-0000-0000-000000000018', 'Khulna', 'খুলনা', 'Khulna', 'খুলনা', 22.8456, 89.5403, 4394.46, 2315000, 55.2, 'Coastal', 'Tropical', ARRAY['Rice', 'Jute', 'Shrimp']),
('d1e00000-0000-0000-0000-000000000019', 'Jessore', 'যশোর', 'Khulna', 'খুলনা', 23.1700, 89.2100, 2635.77, 2763000, 62.5, 'Alluvial', 'Subtropical', ARRAY['Rice', 'Wheat', 'Potato']),

-- Sylhet Division
('d1e00000-0000-0000-0000-000000000020', 'Sylhet', 'সিলেট', 'Sylhet', 'সিলেট', 24.8950, 91.8681, 3452.07, 3718000, 48.2, 'Hill', 'Subtropical', ARRAY['Rice', 'Tea', 'Citrus']),

-- Barisal Division
('d1e00000-0000-0000-0000-000000000021', 'Barisal', 'বরিশাল', 'Barisal', 'বরিশাল', 22.7010, 90.3535, 2785.14, 2324000, 68.5, 'Clay', 'Subtropical', ARRAY['Rice', 'Jute', 'Salt']),

-- Rangpur Division
('d1e00000-0000-0000-0000-000000000022', 'Rangpur', 'রংপুর', 'Rangpur', 'রংপুর', 25.7500, 89.2500, 2374.94, 2882000, 68.2, 'Alluvial', 'Subtropical', ARRAY['Rice', 'Wheat', 'Potato']),
('d1e00000-0000-0000-0000-000000000023', 'Dinajpur', 'দিনাজপুর', 'Rangpur', 'রংপুর', 25.6333, 88.6333, 3075.14, 3016000, 65.8, 'Alluvial', 'Subtropical', ARRAY['Rice', 'Wheat', 'Mango']),

-- Mymensingh Division
('d1e00000-0000-0000-0000-000000000024', 'Mymensingh', 'ময়মনসিংহ', 'Mymensingh', 'ময়মনসিংহ', 24.7500, 90.4000, 4365.52, 5147000, 58.9, 'Alluvial', 'Subtropical', ARRAY['Rice', 'Jute', 'Wheat']);


-- Crops
INSERT INTO crops (id, name, name_bn, category, growing_season, min_temp, max_temp, min_rainfall_mm, max_rainfall_mm, min_ph, max_ph, growth_duration_days, water_requirement_mm, avg_yield_per_acre, avg_price_per_kg) VALUES
('c1e00000-0000-0000-0000-000000000001', 'Rice', 'ধান', 'Cereal', 'kharif', 20, 35, 100, 300, 5.5, 7.0, 120, 150, 2.5, 55.00),
('c1e00000-0000-0000-0000-000000000002', 'Wheat', 'গম', 'Cereal', 'rabi', 10, 25, 30, 100, 6.0, 7.5, 110, 60, 1.8, 40.00),
('c1e00000-0000-0000-0000-000000000003', 'Jute', 'পাট', 'Fiber', 'kharif', 25, 35, 150, 250, 6.0, 7.5, 150, 200, 8.0, 35.00),
('c1e00000-0000-0000-0000-000000000004', 'Potato', 'আলু', 'Vegetable', 'rabi', 15, 25, 50, 100, 5.0, 6.5, 90, 70, 12.0, 30.00),
('c1e00000-0000-0000-0000-000000000005', 'Onion', 'পেঁয়াজ', 'Vegetable', 'rabi', 15, 25, 30, 80, 6.0, 7.0, 120, 50, 8.0, 45.00),
('c1e00000-0000-0000-0000-000000000006', 'Tomato', 'টমেটো', 'Vegetable', 'rabi', 20, 30, 40, 80, 6.0, 7.0, 80, 60, 10.0, 50.00),
('c1e00000-0000-0000-0000-000000000007', 'Chili', 'মরিচ', 'Spice', 'rabi', 20, 30, 40, 80, 6.0, 7.0, 90, 50, 3.0, 80.00),
('c1e00000-0000-0000-0000-000000000008', 'Mango', 'আম', 'Fruit', 'perennial', 24, 30, 75, 200, 5.5, 7.5, 150, 100, 15.0, 60.00),
('c1e00000-0000-0000-0000-000000000009', 'Banana', 'কলা', 'Fruit', 'perennial', 25, 35, 100, 250, 6.0, 7.5, 120, 120, 20.0, 25.00),
('c1e00000-0000-0000-0000-000000000010', 'Sugarcane', 'আখ', 'Cash', 'kharif', 20, 35, 100, 180, 6.0, 7.5, 365, 150, 25.0, 15.00),
('c1e00000-0000-0000-0000-000000000011', 'Mustard', 'সরিষা', 'Oilseed', 'rabi', 10, 25, 30, 80, 6.0, 7.5, 80, 50, 1.2, 120.00),
('c1e00000-0000-0000-0000-000000000012', 'Lentil', 'মসুর ডাল', 'Pulse', 'rabi', 15, 25, 30, 80, 6.0, 7.5, 100, 40, 1.0, 90.00),
('c1e00000-0000-0000-0000-000000000013', 'Groundnut', 'বাদাম', 'Oilseed', 'kharif', 25, 30, 50, 100, 6.0, 7.0, 120, 60, 1.5, 100.00),
('c1e00000-0000-0000-0000-000000000014', 'Sesame', 'তিল', 'Oilseed', 'kharif', 25, 35, 50, 100, 5.5, 8.0, 90, 40, 0.8, 150.00),
('c1e00000-0000-0000-0000-000000000015', 'Lentil', 'খেসারি', 'Pulse', 'rabi', 15, 25, 30, 80, 6.0, 7.5, 100, 40, 0.9, 85.00);
