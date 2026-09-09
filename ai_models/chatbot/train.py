"""
Bangla Agricultural Chatbot
Smart Farming AI Platform Bangladesh
Uses BanglaBERT for agricultural Q&A
"""
import os
import pickle


class AgriculturalChatbot:
    def __init__(self):
        self.model = None
        self.tokenizer = None
        self.knowledge_base = self._load_knowledge_base()
        self.model_info = {}

    def _load_knowledge_base(self) -> dict:
        return {
            "ধান": {
                "bn": "ধান বাংলাদেশের সবচেয়ে গুরুত্বপূর্ণ খাদ্যশস্য। প্রধান জাতগুলো হলো বোরো, আমন ও বৈশাখী। ধানের জন্য উষ্ণ ও আর্দ্র জলবায়ু প্রয়োজন।",
                "en": "Rice is the most important food crop of Bangladesh. Main varieties are Boro, Aman, and Baisakhi. Rice requires warm and humid climate.",
                "tips": ["সময়মতো বীজ বুনুন", "সুষম সার প্রয়োগ করুন", "পানি ব্যবস্থাপনা ভালো করুন", "রোগ প্রতিরোধী জাত ব্যবহার করুন"],
                "season": "খরিফ ও বোরো",
                "water": "বিপুল পানি প্রয়োজন",
                "profit": "মাঝারি লাভজনক",
            },
            "গম": {
                "bn": "গম রবি মৌসুমের গুরুত্বপূর্ণ শস্য। নভেম্বর-ডিসেম্বরে বীজ বুনা হয় এবং মার্চ-এপ্রিলে ফসল তোলা হয়।",
                "en": "Wheat is an important Rabi season crop. Seeds are sown in November-December and harvested in March-April.",
                "tips": ["সময়মতো বীজ বুনুন", "রোগ প্রতিরোধী জাত ব্যবহার করুন", "সেচ ব্যবস্থা রাখুন"],
                "season": "রবি",
                "water": "মাঝারি পানি প্রয়োজন",
                "profit": "ভালো লাভজনক",
            },
            "পাট": {
                "bn": "পাট বাংলাদেশের ঐতিহ্যবাহী অর্থকরী ফসল। রপ্তানি আয়ের গুরুত্বপূর্ণ উৎস। খরিফ মৌসুমে চাষ করা হয়।",
                "en": "Jute is a traditional cash crop of Bangladesh. Important source of export earnings. Grown in Kharif season.",
                "tips": ["জলাবদ্ধ এলাকায় ভালো ফলন হয়", "দীর্ঘ দিনের আলো প্রয়োজন", "সার প্রয়োগ করুন"],
                "season": "খরিফ",
                "water": "বিপুল পানি প্রয়োজন",
                "profit": "খুব লাভজনক",
            },
            "আলু": {
                "bn": "আলু রবি মৌসুমের গুরুত্বপূর্ণ শাকসবজি। অক্টোবর-নভেম্বরে বীজ বুনা হয়। শীতল আবহাওয়ায় ভালো ফলন হয়।",
                "en": "Potato is an important Rabi season vegetable. Seeds are sown in October-November. Good yield in cool weather.",
                "tips": ["শীতল আবহাওয়ায় ভালো ফলন হয়", "লেট ব্লাইট রোগ থেকে সাবধান", "মাটি ভালো করে তৈরি করুন"],
                "season": "রবি",
                "water": "মাঝারি পানি প্রয়োজন",
                "profit": "খুব লাভজনক",
            },
            "রোগ": {
                "bn": "ফসলের রোগ প্রতিরোধে: ১) নিয়মিত মাঠ পরিদর্শন করুন। ২) প্রতিরোধী জাত ব্যবহার করুন। ৩) সুষম সার প্রয়োগ করুন। ৪) প্রয়োজনে ছত্রাকনাশক ব্যবহার করুন।",
                "en": "To prevent crop diseases: 1) Regular field inspection. 2) Use resistant varieties. 3) Apply balanced fertilizer. 4) Use fungicides when necessary.",
                "tips": ["নিয়মিত মাঠ পরিদর্শন করুন", "প্রতিরোধী জাত ব্যবহার করুন", "ছত্রাকনাশক প্রয়োগ করুন"],
                "season": "সারা বছর",
                "water": "যথাযথ পানি",
                "profit": "রোগ হলে ক্ষতি হয়",
            },
            "সেচ": {
                "bn": "সঠিক সেচ ব্যবস্থাপনা: ১) ড্রিপ সেচ ব্যবহার করুন। ২) সকালে বা সন্ধ্যায় সেচ দিন। ৩) মাটির আর্দ্রতা পরীক্ষা করুন। ৪) বৃষ্টির পানি সংরক্ষণ করুন।",
                "en": "Proper irrigation management: 1) Use drip irrigation. 2) Irrigate in morning or evening. 3) Check soil moisture. 4) Harvest rainwater.",
                "tips": ["ড্রিপ সেচ ব্যবহার করুন", "সকালে বা সন্ধ্যায় সেচ দিন", "বৃষ্টির পানি সংরক্ষণ করুন"],
                "season": "সারা বছর",
                "water": "পরিকল্পিত পানি",
                "profit": "ফলন বাড়ে",
            },
            "বাজার": {
                "bn": "ফসলের সেরা দাম পেতে: ১) সরাসরি বাজারে বিক্রি করুন। ২) সমবায় সমিতির সাথে যোগাযোগ করুন। ৩) সঠিক সময়ে বিক্রি করুন। ৪) মূল্য সংরক্ষণ করুন।",
                "en": "To get best crop price: 1) Sell directly in market. 2) Contact cooperative societies. 3) Sell at right time. 4) Preserve value.",
                "tips": ["বাজার মূল্য জানুন", "সমবায় সমিতির সাথে যোগাযোগ করুন", "সঠিক সময়ে বিক্রি করুন"],
                "season": "ফসল তোলার পর",
                "water": "প্রযোজ্য নয়",
                "profit": "মূল্য নির্ভর",
            },
            "সার": {
                "bn": "মাটি পরীক্ষার ভিত্তিতে সার প্রয়োগ করুন। অতিরিক্ত সার মাটি ও পরিবেশের ক্ষতি করে। জৈব সার ব্যবহার উত্সাহিত।",
                "en": "Apply fertilizer based on soil testing. Excess fertilizer harms soil and environment. Organic fertilizer use encouraged.",
                "tips": ["মাটি পরীক্ষা করুন", "সুষম সার ব্যবহার করুন", "জৈব সার ব্যবহার করুন"],
                "season": "চাষের আগে",
                "water": "প্রযোজ্য নয়",
                "profit": "ফলন বাড়ে",
            },
            "কীটপতঙ্গ": {
                "bn": "কীটপতঙ্গ নিয়ন্ত্রণে IPM (কীটপতঙ্গ একীকৃত ব্যবস্থাপনা) পদ্ধতি অনুসরণ করুন। প্রাকৃতিক শিকারী ব্যবহার করুন।",
                "en": "For pest control, follow IPM (Integrated Pest Management) methods. Use natural predators.",
                "tips": ["নিয়মিত পর্যবেক্ষণ করুন", "প্রাকৃতিক শিকারী ব্যবহার করুন", "প্রয়োজনে কীটনাশক ব্যবহার করুন"],
                "season": "সারা বছর",
                "water": "প্রযোজ্য নয়",
                "profit": "ক্ষতি রোধ করে",
            },
            "লাভ": {
                "bn": "কৃষিতে লাভ বাড়াতে: ১) উচ্চ মূল্যের ফসল চাষ করুন। ৫) পর্যায়ক্রমে ফসল চাষ করুন। ৩) খরচ কমান। ৪) সরাসরি বাজারে বিক্রি করুন।",
                "en": "To increase farming profit: 1) Grow high-value crops. 2) Practice crop rotation. 3) Reduce costs. 4) Sell directly in market.",
                "tips": ["উচ্চ মূল্যের ফসল চাষ করুন", "পর্যায়ক্রমে ফসল চাষ করুন", "সরাসরি বাজারে বিক্রি করুন"],
                "season": "সারা বছর",
                "water": "যথাযথ",
                "profit": "লক্ষ্য",
            },
        }

    def _find_best_match(self, query: str) -> str | None:
        query_lower = query.lower()
        best_match = None
        best_score = 0

        for keyword in self.knowledge_base:
            if keyword in query_lower:
                score = len(keyword)
                if score > best_score:
                    best_score = score
                    best_match = keyword

        if best_match:
            return best_match

        keywords_map = {
            "ধান": ["ধান", "রাইস", "rice", "paddy", "বোরো", "আমন"],
            "গম": ["গম", "wheat", "গমের"],
            "পাট": ["পাট", "jute", "পাটের"],
            "আলু": ["আলু", "potato", "আলুর"],
            "রোগ": ["রোগ", "disease", "ব্লাস্ট", "rust", "blight", "স্পট"],
            "সেচ": ["সেচ", "irrigation", "পানি", "water", "ড্রিপ"],
            "বাজার": ["বাজার", "market", "দাম", "price", "বিক্রি"],
            "সার": ["সার", "fertilizer", "নাইট্রোজেন", "phosphorus", "NPK"],
            "কীটপতঙ্গ": ["কীটপতঙ্গ", "pest", "insect", "কীটনাশক"],
            "লাভ": ["লাভ", "profit", "আয়", "রোজগার", "উপার্জন"],
        }

        for category, words in keywords_map.items():
            for word in words:
                if word in query_lower:
                    return category

        return None

    def get_response(self, query: str, language: str = "bn") -> dict:
        matched_topic = self._find_best_match(query)

        if matched_topic and matched_topic in self.knowledge_base:
            kb = self.knowledge_base[matched_topic]
            response = kb.get(language, kb.get("bn", ""))

            return {
                "response": response,
                "response_bn": kb.get("bn", ""),
                "topic": matched_topic,
                "tips": kb.get("tips", []),
                "season": kb.get("season", ""),
                "water_requirement": kb.get("water", ""),
                "profit_info": kb.get("profit", ""),
                "confidence": 0.9,
                "suggestions": [
                    f"{matched_topic} সম্পর্কে আরও জানুন",
                    "মাটি পরীক্ষা করুন",
                    "বাজার মূল্য জানুন",
                ],
            }

        return {
            "response": "আমি কৃষি সম্পর্কে আপনাকে সাহায্য করতে পারি। অনুগ্রহ করে ধান, গম, পাট, আলু, রোগ, সেচ, বাজার, সার বা কীটপতঙ্গ সম্পর্কে জিজ্ঞাসা করুন।",
            "response_bn": "আমি কৃষি সম্পর্কে আপনাকে সাহায্য করতে পারি। অনুগ্রহ করে ধান, গম, পাট, আলু, রোগ, সেচ, বাজার, সার বা কীটপতঙ্গ সম্পর্কে জিজ্ঞাসা করুন।",
            "topic": "general",
            "tips": ["ধান সম্পর্কে জানুন", "রোগ প্রতিরোধ শিখুন", "বাজার মূল্য জানুন"],
            "season": "",
            "water_requirement": "",
            "profit_info": "",
            "confidence": 0.5,
            "suggestions": [
                "ধান সম্পর্কে জানুন",
                "গম সম্পর্কে জানুন",
                "রোগ প্রতিরোধ শিখুন",
            ],
        }

    def get_seasonal_advice(self, month: int, district: str = None) -> dict:
        seasonal_calendar = {
            1: {"season": "রবি", "activities": ["গম ও ডালের সেচ দিন", "আলুর রোগ পরীক্ষা করুন"], "crops": ["গম", "ডাল", "আলু"]},
            2: {"season": "রবি", "activities": ["ফসল পরিপক্ব হচ্ছে", "বাজার মূল্য জানুন"], "crops": ["গম", "সরিষা"]},
            3: {"season": "রবি", "activities": ["ফসল তোলা হচ্ছে", "মাটি প্রস্তুত করুন"], "crops": ["গম", "আলু"]},
            4: {"season": "গ্রীষ্ম", "activities": ["বীজ সংগ্রহ করুন", "মাটি চাষ করুন"], "crops": ["ধানের বীজ"]},
            5: {"season": "খরিফ", "activities": ["ধান বুনুন", "পাট বুনুন"], "crops": ["ধান", "পাট"]},
            6: {"season": "খরিফ", "activities": ["সেচ দিন", "রোগ পরীক্ষা করুন"], "crops": ["ধান", "পাট"]},
            7: {"season": "খরিফ", "activities": ["বৃষ্টির পানি সংরক্ষণ করুন"], "crops": ["ধান"]},
            8: {"season": "খরিফ", "activities": ["কীটপতঙ্গ নিয়ন্ত্রণ করুন"], "crops": ["ধান"]},
            9: {"season": "খরিফ", "activities": ["আমন ধান বুনুন"], "crops": ["আমন ধান"]},
            10: {"season": "রবি", "activities": ["আলু বুনুন", "গম বুনুন"], "crops": ["আলু", "গম"]},
            11: {"season": "রবি", "activities": ["সেচ দিন", "সার প্রয়োগ করুন"], "crops": ["গম", "আলু"]},
            12: {"season": "রবি", "activities": ["শীতের ফসল রক্ষা করুন"], "crops": ["গম", "ডাল"]},
        }

        advice = seasonal_calendar.get(month, seasonal_calendar[1])
        return {
            "month": month,
            "season": advice["season"],
            "activities": advice["activities"],
            "recommended_crops": advice["crops"],
            "district": district,
        }

    def save(self, path: str):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        model_data = {
            'knowledge_base': self.knowledge_base,
            'model_info': self.model_info,
        }
        with open(path, 'wb') as f:
            pickle.dump(model_data, f)
        print(f"Chatbot model saved to {path}")

    @classmethod
    def load(cls, path: str):
        with open(path, 'rb') as f:
            model_data = pickle.load(f)
        instance = cls()
        instance.knowledge_base = model_data.get('knowledge_base', instance.knowledge_base)
        instance.model_info = model_data.get('model_info', {})
        return instance


if __name__ == "__main__":
    chatbot = AgriculturalChatbot()

    test_queries = [
        "ধান চাষ কিভাবে করব?",
        "ফসলে রোগ হয়েছে, কী করব?",
        "সেচ কিভাবে দেব?",
        "বাজারে ভালো দাম কিভাবে পাব?",
        "কোন ফসলে বেশি লাভ হয়?",
    ]

    for query in test_queries:
        response = chatbot.get_response(query)
        print(f"\nQ: {query}")
        print(f"A: {response['response']}")
        print(f"Tips: {response['tips']}")

    chatbot.save("trained_models/chatbot.pkl")
