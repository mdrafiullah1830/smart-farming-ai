"""
Bangla Agricultural Chatbot - Enhanced Version
Smart Farming AI Platform Bangladesh
Uses comprehensive Q&A dataset for agricultural advice
"""
import json
import os
import pickle
import re
from typing import List, Optional, Dict
from difflib import SequenceMatcher


class AgriculturalChatbot:
    def __init__(self):
        self.training_data = self._load_training_data()
        self.qa_pairs = self.training_data.get("qa_pairs", [])
        self.knowledge_base = self._build_knowledge_base()
        self.greetings = self.training_data.get("greetings", {})
        self.fallback_responses = self.training_data.get("fallback_responses", {})

    def _load_training_data(self) -> dict:
        """Load training data from JSON file."""
        data_path = os.path.join(os.path.dirname(__file__), "training_data.json")
        try:
            with open(data_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except FileNotFoundError:
            print(f"Training data not found at {data_path}")
            return {"qa_pairs": [], "greetings": {}, "fallback_responses": {}}

    def _build_knowledge_base(self) -> dict:
        """Build knowledge base from training data."""
        kb = {}
        for qa in self.qa_pairs:
            topic = qa.get("topic", "general")
            if topic not in kb:
                kb[topic] = []
            kb[topic].append(qa)
        return kb

    def _calculate_similarity(self, text1: str, text2: str) -> float:
        """Calculate similarity between two texts."""
        return SequenceMatcher(None, text1.lower(), text2.lower()).ratio()

    def _find_best_match(self, query: str, language: str = "bn") -> Optional[dict]:
        """Find the best matching QA pair for a query."""
        query_lower = query.lower().strip()
        best_match = None
        best_score = 0

        # Check greetings first
        if language == "bn":
            greetings_bn = ["হ্যালো", "হাই", "নমস্কার", "আসসালামু আলাইকুম", "কেমন আছেন", "সুপ্রভাত", "শুভ সন্ধ্যা"]
            for g in greetings_bn:
                if g in query_lower:
                    return {"type": "greeting", "response": self.greetings.get("bn", {}).get("hello", "")}
        else:
            greetings_en = ["hello", "hi", "hey", "good morning", "good evening", "how are you"]
            for g in greetings_en:
                if g in query_lower:
                    return {"type": "greeting", "response": self.greetings.get("en", {}).get("hello", "")}

        # Search through QA pairs
        for qa in self.qa_pairs:
            keywords = qa.get(f"keywords_{language}", [])
            score = 0

            # Exact keyword match
            for keyword in keywords:
                if keyword.lower() in query_lower:
                    score += 10

            # Partial keyword match
            for keyword in keywords:
                for word in query_lower.split():
                    if self._calculate_similarity(word, keyword) > 0.7:
                        score += 5

            # Question similarity
            question = qa.get(f"question_{language}", "")
            if question:
                sim = self._calculate_similarity(query_lower, question)
                score += sim * 20

            if score > best_score:
                best_score = score
                best_match = qa

        if best_match and best_score > 3:
            return {"type": "qa", "data": best_match, "score": best_score}

        return None

    def get_response(self, query: str, language: str = "bn") -> dict:
        """Get response for a user query."""
        if not query or not query.strip():
            return self._get_empty_response(language)

        match = self._find_best_match(query, language)

        if match:
            if match["type"] == "greeting":
                return {
                    "response": match["response"],
                    "topic": "greeting",
                    "confidence": 1.0,
                    "suggestions": self._get_suggestions(language),
                }

            if match["type"] == "qa":
                qa = match["data"]
                response_key = f"answer_{language}"
                tips_key = f"tips_{language}"

                return {
                    "response": qa.get(response_key, qa.get("answer_bn", "")),
                    "topic": qa.get("topic", "general"),
                    "tips": qa.get(tips_key, qa.get("tips_bn", [])),
                    "season": qa.get("season", ""),
                    "profit": qa.get("profit", ""),
                    "confidence": min(match["score"] / 20, 0.95),
                    "suggestions": self._get_contextual_suggestions(qa.get("topic", ""), language),
                }

        # Fallback response
        fallback = self.fallback_responses.get(language, self.fallback_responses.get("bn", []))
        import random
        response = random.choice(fallback) if fallback else "I can help with farming questions."

        return {
            "response": response,
            "topic": "general",
            "confidence": 0.3,
            "suggestions": self._get_suggestions(language),
        }

    def _get_empty_response(self, language: str) -> dict:
        """Return response for empty query."""
        if language == "bn":
            response = "আপনি কোনো প্রশ্ন করেননি। কৃষি সম্পর্কে কিছু জানতে চান?"
        else:
            response = "You didn't ask anything. Want to know something about agriculture?"
        return {
            "response": response,
            "topic": "empty",
            "confidence": 1.0,
            "suggestions": self._get_suggestions(language),
        }

    def _get_suggestions(self, language: str) -> list:
        """Get general suggestions."""
        if language == "bn":
            return ["ধান চাষ কিভাবে করব?", "ফসলে রোগ হয়েছে", "কোন ফসলে বেশি লাভ?", "সেচ কিভাবে দেবেন?"]
        else:
            return ["How to cultivate rice?", "Crop disease detected", "Which crop is profitable?", "How to irrigate?"]

    def _get_contextual_suggestions(self, topic: str, language: str) -> list:
        """Get contextual suggestions based on topic."""
        suggestions_map = {
            "bn": {
                "crops": ["আরও ফসল সম্পর্কে জানুন", "রোগ প্রতিরোধ শিখুন", "বাজার মূল্য জানুন"],
                "disease": ["চিকিৎসা পদ্ধতি জানুন", "প্রতিরোধী জাত জানুন", "কীটনাশক ব্যবহার"],
                "soil": ["মাটি পরীক্ষা করুন", "সার ব্যবহার শিখুন", "জৈব চাষ শিখুন"],
                "irrigation": ["ড্রিপ সেচ শিখুন", "পানি সংরক্ষণ শিখুন", "বৃষ্টির পানি ব্যবহার"],
                "market": ["সরাসরি বিক্রি শিখুন", "সমবায়ে যোগ দিন", "মূল্য সংরক্ষণ"],
            },
            "en": {
                "crops": ["Learn about more crops", "Disease prevention", "Market prices"],
                "disease": ["Treatment methods", "Resistant varieties", "Pesticide use"],
                "soil": ["Test soil", "Learn fertilizer use", "Learn organic farming"],
                "irrigation": ["Learn drip irrigation", "Learn water conservation", "Use rainwater"],
                "market": ["Learn direct selling", "Join cooperative", "Value preservation"],
            },
        }
        return suggestions_map.get(language, suggestions_map["bn"]).get(topic, self._get_suggestions(language))

    def get_seasonal_advice(self, month: int, district: str = None) -> dict:
        """Get seasonal advice for a specific month."""
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

    def get_all_topics(self) -> list:
        """Get all available topics."""
        return list(self.knowledge_base.keys())

    def get_topic_count(self) -> dict:
        """Get count of QA pairs per topic."""
        return {topic: len(qas) for topic, qas in self.knowledge_base.items()}

    def save(self, path: str):
        """Save chatbot model."""
        os.makedirs(os.path.dirname(path), exist_ok=True)
        model_data = {
            "training_data": self.training_data,
            "knowledge_base": self.knowledge_base,
            "model_info": {
                "version": "2.0",
                "total_qa_pairs": len(self.qa_pairs),
                "topics": list(self.knowledge_base.keys()),
            },
        }
        with open(path, "wb") as f:
            pickle.dump(model_data, f)
        print(f"Chatbot model saved to {path}")
        print(f"Total QA pairs: {len(self.qa_pairs)}")
        print(f"Topics: {list(self.knowledge_base.keys())}")

    @classmethod
    def load(cls, path: str):
        """Load chatbot model."""
        with open(path, "rb") as f:
            model_data = pickle.load(f)
        instance = cls()
        instance.training_data = model_data.get("training_data", instance.training_data)
        instance.knowledge_base = model_data.get("knowledge_base", instance.knowledge_base)
        instance.qa_pairs = instance.training_data.get("qa_pairs", [])
        return instance


if __name__ == "__main__":
    chatbot = AgriculturalChatbot()

    print("=" * 60)
    print("Smart Farming AI Chatbot - Training Complete")
    print("=" * 60)
    print(f"\nTotal QA Pairs: {len(chatbot.qa_pairs)}")
    print(f"Topics: {chatbot.get_all_topics()}")
    print(f"Topic Counts: {chatbot.get_topic_count()}")

    # Test queries
    test_queries = [
        ("ধান চাষ কিভাবে করব?", "bn"),
        ("ফসলে রোগ হয়েছে, কী করব?", "bn"),
        ("সেচ কিভাবে দেবেন?", "bn"),
        ("বাজারে ভালো দাম কিভাবে পাব?", "bn"),
        ("কোন ফসলে বেশি লাভ হয়?", "bn"),
        ("How to cultivate rice?", "en"),
        ("What is the best fertilizer?", "en"),
        ("How to control pests?", "en"),
        ("Hello", "en"),
        ("নমস্কার", "bn"),
    ]

    print("\n" + "=" * 60)
    print("Test Responses")
    print("=" * 60)

    for query, lang in test_queries:
        response = chatbot.get_response(query, lang)
        print(f"\n{'─' * 40}")
        print(f"Q ({lang}): {query}")
        print(f"A: {response['response'][:200]}...")
        print(f"Topic: {response['topic']} | Confidence: {response['confidence']:.2f}")

    # Save model
    model_path = os.path.join(os.path.dirname(__file__), "trained_models", "chatbot_v2.pkl")
    chatbot.save(model_path)
