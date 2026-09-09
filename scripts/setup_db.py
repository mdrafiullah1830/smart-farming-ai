#!/usr/bin/env python3
"""Create SQLite database with all tables from schema.sql concept."""
import json
import os
import sqlite3

DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'database', 'smart_farming.db')

def create_database():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()

    # Users table (farmers)
    c.execute('''CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name_en TEXT NOT NULL,
        name_bn TEXT,
        email TEXT UNIQUE NOT NULL,
        phone TEXT,
        password_hash TEXT NOT NULL,
        district TEXT,
        upazila TEXT,
        division TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )''')

    # Districts
    c.execute('''CREATE TABLE IF NOT EXISTS districts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name_en TEXT NOT NULL,
        name_bn TEXT,
        division TEXT,
        lat REAL,
        lng REAL,
        soil_type TEXT,
        climate TEXT,
        major_crops TEXT
    )''')

    # Soil reports (from parsed xlsx)
    c.execute('''CREATE TABLE IF NOT EXISTS soil_reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        district TEXT NOT NULL,
        upazila TEXT,
        feature_name TEXT NOT NULL,
        feature_value TEXT,
        area_ha REAL,
        category TEXT,
        source_file TEXT
    )''')

    # Weather logs
    c.execute('''CREATE TABLE IF NOT EXISTS weather_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        district TEXT,
        lat REAL,
        lng REAL,
        temperature REAL,
        humidity REAL,
        wind_speed REAL,
        weather_code INTEGER,
        condition TEXT,
        logged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )''')

    # Crop recommendations
    c.execute('''CREATE TABLE IF NOT EXISTS crop_recommendations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        district TEXT,
        upazila TEXT,
        division TEXT,
        recommended_crops TEXT,
        sources_used INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
    )''')

    # Disease reports
    c.execute('''CREATE TABLE IF NOT EXISTS disease_reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        image_path TEXT,
        disease_name TEXT,
        confidence REAL,
        description TEXT,
        treatments TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
    )''')

    # Market prices
    c.execute('''CREATE TABLE IF NOT EXISTS market_prices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        crop_name TEXT NOT NULL,
        crop_name_bn TEXT,
        price_min REAL,
        price_max REAL,
        unit TEXT DEFAULT 'kg',
        market TEXT,
        district TEXT,
        recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )''')

    # Notifications
    c.execute('''CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        title TEXT,
        title_bn TEXT,
        message TEXT,
        message_bn TEXT,
        type TEXT DEFAULT 'info',
        is_read INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
    )''')

    # Chat history
    c.execute('''CREATE TABLE IF NOT EXISTS chat_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        message TEXT,
        reply TEXT,
        lang TEXT DEFAULT 'bn',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
    )''')

    # Soil report data from xlsx (bulk insert)
    c.execute('''CREATE TABLE IF NOT EXISTS soil_report_data (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category TEXT,
        subcategory TEXT,
        file_name TEXT,
        sheet_name TEXT,
        record_json TEXT
    )''')

    conn.commit()
    print('Database tables created.')
    return conn

def seed_districts(conn):
    """Seed 64 districts from server.js DIVISIONS data."""
    districts_json = os.path.join(os.path.dirname(__file__), '..', 'frontend', 'web', 'bd_districts.js')
    # We'll use a hardcoded list instead
    DIVISIONS = {
        "Dhaka": {"name_bn":"ঢাকা","districts":{"Dhaka":{"name_bn":"ঢাকা","lat":23.81,"lng":90.41,"soil":"Alluvial","crops":"ধান,সবজি,মাছ"},"Faridpur":{"name_bn":"ফরিদপুর","lat":23.54,"lng":89.83,"soil":"Alluvial","crops":"ধান,পাট,গম"},"Gazipur":{"name_bn":"গাজীপুর","lat":24.0,"lng":90.42,"soil":"Alluvial","crops":"ধান,সবজি"},"Gopalganj":{"name_bn":"গোপালগঞ্জ","lat":23.0,"lng":89.83,"soil":"Clay","crops":"ধান,পাট"},"Kishoreganj":{"name_bn":"কিশোরগঞ্জ","lat":24.43,"lng":90.78,"soil":"Alluvial","crops":"ধান,গম,ডাল"},"Madaripur":{"name_bn":"মাদারীপুর","lat":23.17,"lng":90.17,"soil":"Clay","crops":"ধান,পাট"},"Manikganj":{"name_bn":"মানিকগঞ্জ","lat":23.87,"lng":90.0,"soil":"Alluvial","crops":"ধান,পাট,সবজি"},"Munshiganj":{"name_bn":"মুন্সিগঞ্জ","lat":23.55,"lng":90.5,"soil":"Alluvial","crops":"ধান,পাট,সবজি"},"Narayanganj":{"name_bn":"নারায়ণগঞ্জ","lat":23.63,"lng":90.5,"soil":"Alluvial","crops":"ধান,সবজি"},"Narsingdi":{"name_bn":"নরসিংদী","lat":23.93,"lng":90.72,"soil":"Alluvial","crops":"ধান,পাট,সবজি"},"Rajbari":{"name_bn":"রাজবাড়ি","lat":23.75,"lng":89.6,"soil":"Clay","crops":"ধান,পাট"},"Shariatpur":{"name_bn":"শরীয়তপুর","lat":23.2,"lng":90.45,"soil":"Clay","crops":"ধান,পাট"}}},
        "Chittagong": {"name_bn":"চট্টগ্রাম","districts":{"Chittagong":{"name_bn":"চট্টগ্রাম","lat":22.36,"lng":91.78,"soil":"Coastal","crops":"ধান,পাট,আখ"},"Cox's Bazar":{"name_bn":"কক্সবাজার","lat":21.43,"lng":92.01,"soil":"Coastal","crops":"ধান,মরিচ,চা"},"Comilla":{"name_bn":"কুমিল্লা","lat":23.46,"lng":91.18,"soil":"Alluvial","crops":"ধান,গম,ডাল"},"Feni":{"name_bn":"ফেনী","lat":23.02,"lng":91.4,"soil":"Alluvial","crops":"ধান,পাট,মরিচ"},"Brahmanbaria":{"name_bn":"ব্রাহ্মণবাড়িয়া","lat":23.96,"lng":91.11,"soil":"Alluvial","crops":"ধান,পাট,সবজি"},"Chandpur":{"name_bn":"চাঁদপুর","lat":23.22,"lng":90.66,"soil":"Clay","crops":"ধান,পাট,মাছ"},"Lakshmipur":{"name_bn":"লক্ষ্মীপুর","lat":22.94,"lng":90.83,"soil":"Coastal","crops":"ধান,মাছ,নুন"},"Noakhali":{"name_bn":"নোয়াখালী","lat":22.87,"lng":91.1,"soil":"Coastal","crops":"ধান,মাছ,পাট"},"Bandarban":{"name_bn":"বান্দরবান","lat":22.2,"lng":92.22,"soil":"Hill","crops":"ধান,তুলা,চা"},"Rangamati":{"name_bn":"রাঙ্গামাটি","lat":22.64,"lng":92.2,"soil":"Hill","crops":"ধান,চা,কাঁঠাল"},"Khagrachari":{"name_bn":"খাগড়াছড়ি","lat":23.11,"lng":91.98,"soil":"Hill","crops":"ধান,চা,কলা"}}},
        "Rajshahi": {"name_bn":"রাজশাহী","districts":{"Rajshahi":{"name_bn":"রাজশাহী","lat":24.37,"lng":88.6,"soil":"Alluvial","crops":"ধান,গম,আম"},"Bogra":{"name_bn":"বগুড়া","lat":24.85,"lng":89.35,"soil":"Alluvial","crops":"ধান,গম,আলু"},"Chapainawabganj":{"name_bn":"চাঁপাইনবাবগঞ্জ","lat":24.6,"lng":88.28,"soil":"Alluvial","crops":"আম,পেঁয়াজ,আলু"},"Naogaon":{"name_bn":"নওগাঁ","lat":24.81,"lng":88.93,"soil":"Alluvial","crops":"ধান,গম,সরিষা"},"Natore":{"name_bn":"নাটোর","lat":24.42,"lng":89.0,"soil":"Alluvial","crops":"ধান,গম,আলু"},"Pabna":{"name_bn":"পাবনা","lat":24.01,"lng":89.24,"soil":"Alluvial","crops":"ধান,পাট,সবজি"},"Sirajganj":{"name_bn":"সিরাজগঞ্জ","lat":24.46,"lng":89.71,"soil":"Alluvial","crops":"ধান,পাট,সবজি"},"Joypurhat":{"name_bn":"জয়পুরহাট","lat":25.1,"lng":89.03,"soil":"Alluvial","crops":"ধান,গম,আম"}}},
        "Khulna": {"name_bn":"খুলনা","districts":{"Khulna":{"name_bn":"খুলনা","lat":22.85,"lng":89.54,"soil":"Coastal","crops":"ধান,পাট,চিংড়ি"},"Jessore":{"name_bn":"যশোর","lat":23.17,"lng":89.21,"soil":"Alluvial","crops":"ধান,গম,আলু"},"Satkhira":{"name_bn":"সাতক্ষীরা","lat":21.74,"lng":89.07,"soil":"Coastal","crops":"ধান,চিংড়ি,নুন"},"Bagerhat":{"name_bn":"বাগেরহাট","lat":22.66,"lng":89.79,"soil":"Coastal","crops":"ধান,মাছ,নারিকেল"},"Chuadanga":{"name_bn":"চুয়াডাঙ্গা","lat":23.64,"lng":88.86,"soil":"Alluvial","crops":"ধান,গম,পেঁয়াজ"},"Meherpur":{"name_bn":"মেহেরপুর","lat":23.77,"lng":88.63,"soil":"Alluvial","crops":"ধান,গম,সরিষা"},"Kushtia":{"name_bn":"কুষ্টিয়া","lat":23.91,"lng":89.13,"soil":"Alluvial","crops":"ধান,পাট,সবজি"},"Magura":{"name_bn":"মাগুরা","lat":23.42,"lng":89.42,"soil":"Alluvial","crops":"ধান,গম,সবজি"},"Narail":{"name_bn":"নড়াইল","lat":23.17,"lng":89.51,"soil":"Alluvial","crops":"ধান,পাট,আম"},"Jhenaidah":{"name_bn":"ঝিনাইদহ","lat":23.54,"lng":89.15,"soil":"Alluvial","crops":"ধান,গম,পেঁয়াজ"}}},
        "Sylhet": {"name_bn":"সিলেট","districts":{"Sylhet":{"name_bn":"সিলেট","lat":24.9,"lng":91.87,"soil":"Hill","crops":"ধান,চা,কমলা"},"Habiganj":{"name_bn":"হবিগঞ্জ","lat":24.38,"lng":91.42,"soil":"Hill","crops":"চা,ধান,কমলা"},"Moulvibazar":{"name_bn":"মৌলভীবাজার","lat":24.48,"lng":91.77,"soil":"Hill","crops":"চা,ধান,কমলা"},"Sunamganj":{"name_bn":"সুনামগঞ্জ","lat":25.07,"lng":91.4,"soil":"Haor","crops":"ধান,মাছ,তুলা"}}},
        "Barisal": {"name_bn":"বরিশাল","districts":{"Barisal":{"name_bn":"বরিশাল","lat":22.7,"lng":90.35,"soil":"Clay","crops":"ধান,পাট,লবণ"},"Bhola":{"name_bn":"ভোলা","lat":22.69,"lng":90.64,"soil":"Coastal","crops":"ধান,মাছ,তুলা"},"Patuakhali":{"name_bn":"পটুয়াখালী","lat":22.36,"lng":90.33,"soil":"Coastal","crops":"ধান,মাছ,নারিকেল"},"Pirojpur":{"name_bn":"পিরোজপুর","lat":22.58,"lng":90.0,"soil":"Coastal","crops":"ধান,মাছ,নারিকেল"},"Jhalokati":{"name_bn":"ঝালকাঠি","lat":22.64,"lng":90.19,"soil":"Clay","crops":"ধান,পাট"},"Barguna":{"name_bn":"বরগুনা","lat":22.16,"lng":90.12,"soil":"Coastal","crops":"ধান,মাছ,নারিকেল"}}},
        "Rangpur": {"name_bn":"রংপুর","districts":{"Rangpur":{"name_bn":"রংপুর","lat":25.75,"lng":89.25,"soil":"Alluvial","crops":"ধান,গম,আলু"},"Dinajpur":{"name_bn":"দিনাজপুর","lat":25.63,"lng":88.63,"soil":"Alluvial","crops":"ধান,গম,আম"},"Kurigram":{"name_bn":"কুড়িগ্রাম","lat":25.81,"lng":89.64,"soil":"Alluvial","crops":"ধান,গম,তুলা"},"Gaibandha":{"name_bn":"গাইবান্ধা","lat":25.33,"lng":89.54,"soil":"Alluvial","crops":"ধান,গম,আলু"},"Lalmonirhat":{"name_bn":"লালমনিরহাট","lat":25.92,"lng":89.47,"soil":"Alluvial","crops":"ধান,গম,পেঁয়াজ"},"Nilphamari":{"name_bn":"নীলফামারী","lat":25.93,"lng":88.85,"soil":"Alluvial","crops":"ধান,গম,আলু"},"Panchagarh":{"name_bn":"পঞ্চগড়","lat":26.34,"lng":88.55,"soil":"Alluvial","crops":"ধান,গম,আলু"},"Thakurgaon":{"name_bn":"ঠাকুরগাঁও","lat":26.03,"lng":88.47,"soil":"Alluvial","crops":"ধান,গম,পেঁয়াজ"}}},
        "Mymensingh": {"name_bn":"ময়মনসিংহ","districts":{"Mymensingh":{"name_bn":"ময়মনসিংহ","lat":24.75,"lng":90.4,"soil":"Alluvial","crops":"ধান,পাট,গম"},"Jamalpur":{"name_bn":"জামালপুর","lat":24.93,"lng":89.95,"soil":"Alluvial","crops":"ধান,পাট,আম"},"Netrakona":{"name_bn":"নেত্রকোণা","lat":24.88,"lng":90.73,"soil":"Alluvial","crops":"ধান,পাট,সবজি"},"Sherpur":{"name_bn":"শেরপুর","lat":25.02,"lng":90.02,"soil":"Alluvial","crops":"ধান,পাট,সবজি"}}}
    }

    c = conn.cursor()
    count = 0
    for div_key, div_data in DIVISIONS.items():
        for dist_key, dist_data in div_data['districts'].items():
            c.execute('''INSERT OR IGNORE INTO districts (name_en, name_bn, division, lat, lng, soil_type, climate, major_crops)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?)''',
                      (dist_key, dist_data['name_bn'], div_key, dist_data['lat'], dist_data['lng'],
                       dist_data['soil'], 'Subtropical', dist_data['crops']))
            count += 1
    conn.commit()
    print(f'Seeded {count} districts.')

def seed_market_prices(conn):
    """Seed initial market prices."""
    prices = [
        ('Rice', 'ধান', 35, 42, 'kg', 'National', ''),
        ('Onion', 'পেঁয়াজ', 60, 80, 'kg', 'National', ''),
        ('Potato', 'আলু', 25, 35, 'kg', 'National', ''),
        ('Tomato', 'টমেটো', 40, 55, 'kg', 'National', ''),
        ('Vegetables', 'শাকসবজি', 20, 30, 'bundle', 'National', ''),
        ('Wheat', 'গম', 28, 35, 'kg', 'National', ''),
        ('Jute', 'পাট', 4000, 5500, 'maund', 'National', ''),
        ('Chili', 'মরিচ', 80, 150, 'kg', 'National', ''),
        ('Lentils', 'ডাল', 100, 140, 'kg', 'National', ''),
        ('Banana', 'কলা', 30, 50, 'dozen', 'National', ''),
    ]
    c = conn.cursor()
    for p in prices:
        c.execute('INSERT INTO market_prices (crop_name, crop_name_bn, price_min, price_max, unit, market, district) VALUES (?,?,?,?,?,?,?)', p)
    conn.commit()
    print(f'Seeded {len(prices)} market prices.')

def load_soil_data(conn):
    """Load parsed xlsx data into database."""
    json_path = os.path.join(os.path.dirname(__file__), '..', 'datasets', 'soil_report_all.json')
    if not os.path.exists(json_path):
        print('No parsed soil data found. Run parse_xlsx.py first.')
        return

    with open(json_path, encoding='utf-8') as f:
        data = json.load(f)

    c = conn.cursor()
    count = 0
    for category, subcategories in data.items():
        for subcategory, files in subcategories.items():
            for file_entry in files:
                fname = file_entry.get('file', '')
                file_data = file_entry.get('data', {})
                if isinstance(file_data, dict):
                    for sheet_name, records in file_data.items():
                        if isinstance(records, list):
                            for record in records:
                                c.execute('INSERT INTO soil_report_data (category, subcategory, file_name, sheet_name, record_json) VALUES (?,?,?,?,?)',
                                          (category, subcategory, fname, sheet_name, json.dumps(record, default=str)))
                                count += 1
    conn.commit()
    print(f'Loaded {count} soil records into database.')

def seed_notifications(conn):
    """Seed default notifications."""
    notifs = [
        ('Weather Alert', 'আবহাওয়ার সতর্কতা', 'Heavy rain expected tomorrow in your area.', 'আগামীকাল আপনার এলাকায় ভারী বৃষ্টি হতে পারে।', 'weather', 0),
        ('Market Update', 'বাজার আপডেট', 'Rice price increased by 5% this week.', 'ধানের দাম গত সপ্তাহে ৫% বৃদ্ধি পেয়েছে।', 'market', 0),
        ('Disease Alert', 'রোগ সতর্কতা', 'Leaf blight disease detected in your area.', 'আপনার এলাকায় ধানের পাতা ঝলসানো রোগ দেখা দিয়েছে।', 'disease', 0),
    ]
    c = conn.cursor()
    for n in notifs:
        c.execute('INSERT INTO notifications (user_id, title, title_bn, message, message_bn, type, is_read) VALUES (NULL,?,?,?,?,?,?)', n)
    conn.commit()
    print(f'Seeded {len(notifs)} notifications.')

if __name__ == '__main__':
    print('=== Creating Smart Farming Database ===')
    conn = create_database()
    seed_districts(conn)
    seed_market_prices(conn)
    seed_notifications(conn)
    load_soil_data(conn)
    conn.close()
    print(f'\nDatabase created at: {DB_PATH}')
    print('Done!')
