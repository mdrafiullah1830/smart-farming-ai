"""Centralized translations for API responses."""

TRANSLATIONS = {
    "bn": {
        "weather": {
            "sunny": "রোদ",
            "cloudy": "মেঘলা",
            "rainy": "বৃষ্টি",
            "stormy": "ঝড়",
            "foggy": "কুয়াশাচ্ছন্ন",
            "humid": "আর্দ্র",
            "windy": "বাতাসযুক্ত",
            "clear": "পরিষ্কার",
        },
        "crops": {
            "rice": "ধান",
            "wheat": "গম",
            "jute": "পাট",
            "potato": "আলু",
            "onion": "পেঁয়াজ",
            "chili": "মরিচ",
            "tomato": "টমেটো",
            "banana": "কলা",
            "mango": "আম",
            "sugarcane": "আখ",
            "lentil": "মসুর ডাল",
            "mustard": "সরিষা",
        },
        "seasons": {
            "kharif": "খরিফ (গ্রীষ্ম)",
            "rabi": "রবি (শীত)",
            "zaid": "জায়দ (হালকা গ্রীষ্ম)",
        },
        "diseases": {
            "blast": "ধানের ব্লাস্ট রোগ",
            "rust": "খয়েরি গাছের রোগ",
            "blight": "পাতা ঝলসানো",
            "wilt": "মরছে রোগ",
            "root_rot": "মূল পচা",
        },
        "soil": {
            "excellent": "চমৎকার",
            "good": "ভালো",
            "average": "মাঝারি",
            "poor": "খারাপ",
            "very_poor": "অত্যন্ত খারাপ",
        },
        "market": {
            "price_increased": "দাম বেড়েছে",
            "price_decreased": "দাম কমেছে",
            "price_stable": "দাম স্থিতিশীল",
            "high_demand": "চাহিদা বেশি",
            "low_demand": "চাহিদা কম",
        },
        "notifications": {
            "rain_alert": "বৃষ্টি সতর্কতা",
            "cyclone_alert": "ঘূর্ণিঝড় সতর্কতা",
            "flood_alert": "বন্যা সতর্কতা",
            "drought_alert": "খরা সতর্কতা",
            "crop_reminder": "ফসল রিমাইন্ডার",
            "fertilizer_reminder": "সার রিমাইন্ডার",
            "market_update": "বাজার আপডেট",
        },
        "errors": {
            "not_found": "পাওয়া যায়নি",
            "unauthorized": "অনুমতি নেই",
            "bad_request": "ভুল অনুরোধ",
            "server_error": "সার্ভার ত্রুটি",
            "validation_error": "তথ্য যাচাইকরণ ত্রুটি",
        },
        "common": {
            "loading": "লোড হচ্ছে...",
            "save": "সংরক্ষণ করুন",
            "cancel": "বাতিল",
            "delete": "মুছুন",
            "edit": "সম্পাদনা",
            "submit": "জমা দিন",
            "back": "ফিরুন",
            "next": "পরবর্তী",
            "previous": "পূর্ববর্তী",
            "search": "অনুসন্ধান",
            "filter": "ফিল্টার",
            "sort": "সাজান",
        },
    },
    "en": {
        "weather": {
            "sunny": "Sunny",
            "cloudy": "Cloudy",
            "rainy": "Rainy",
            "stormy": "Stormy",
            "foggy": "Foggy",
            "humid": "Humid",
            "windy": "Windy",
            "clear": "Clear",
        },
        "crops": {
            "rice": "Rice",
            "wheat": "Wheat",
            "jute": "Jute",
            "potato": "Potato",
            "onion": "Onion",
            "chili": "Chili",
            "tomato": "Tomato",
            "banana": "Banana",
            "mango": "Mango",
            "sugarcane": "Sugarcane",
            "lentil": "Lentil",
            "mustard": "Mustard",
        },
        "seasons": {
            "kharif": "Kharif (Summer)",
            "rabi": "Rabi (Winter)",
            "zaid": "Zaid (Light Summer)",
        },
        "diseases": {
            "blast": "Rice Blast Disease",
            "rust": "Brown Leaf Spot",
            "blight": "Leaf Blight",
            "wilt": "Wilt Disease",
            "root_rot": "Root Rot",
        },
        "soil": {
            "excellent": "Excellent",
            "good": "Good",
            "average": "Average",
            "poor": "Poor",
            "very_poor": "Very Poor",
        },
        "market": {
            "price_increased": "Price increased",
            "price_decreased": "Price decreased",
            "price_stable": "Price stable",
            "high_demand": "High demand",
            "low_demand": "Low demand",
        },
        "notifications": {
            "rain_alert": "Rain Alert",
            "cyclone_alert": "Cyclone Alert",
            "flood_alert": "Flood Alert",
            "drought_alert": "Drought Alert",
            "crop_reminder": "Crop Reminder",
            "fertilizer_reminder": "Fertilizer Reminder",
            "market_update": "Market Update",
        },
        "errors": {
            "not_found": "Not found",
            "unauthorized": "Unauthorized",
            "bad_request": "Bad request",
            "server_error": "Server error",
            "validation_error": "Validation error",
        },
        "common": {
            "loading": "Loading...",
            "save": "Save",
            "cancel": "Cancel",
            "delete": "Delete",
            "edit": "Edit",
            "submit": "Submit",
            "back": "Back",
            "next": "Next",
            "previous": "Previous",
            "search": "Search",
            "filter": "Filter",
            "sort": "Sort",
        },
    },
}


def t(key: str, locale: str = "bn", category: str = "common") -> str:
    """Get translated string by key, locale, and category."""
    lang = TRANSLATIONS.get(locale, TRANSLATIONS["bn"])
    category_dict = lang.get(category, lang.get("common", {}))
    return category_dict.get(key, key)


def get_weather_translation(condition: str, locale: str = "bn") -> str:
    """Translate weather condition."""
    return t(condition.lower(), locale, "weather")


def get_crop_translation(crop: str, locale: str = "bn") -> str:
    """Translate crop name."""
    return t(crop.lower(), locale, "crops")


def get_notification_translation(notification_type: str, locale: str = "bn") -> str:
    """Translate notification type."""
    return t(notification_type.lower(), locale, "notifications")
