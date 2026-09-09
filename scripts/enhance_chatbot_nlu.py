"""
Bangla NLU enhancement for the agricultural chatbot.

The existing chatbot (`ai_models/chatbot/train_enhanced.py`) uses keyword
matching + difflib SequenceMatcher. This module adds a semantic layer on top:

  1. `paraphrase-multilingual-MiniLM-L12-v2` — a multilingual sentence
     embedding model that understands Bangla and English in the same vector
     space. It is loaded lazily (downloaded on first use) so importing this
     module never blocks startup.
  2. A precomputed embedding index over the 150 Q&A pairs in
     `training_data.json`. At query time we embed the query and return the
     nearest neighbour by cosine similarity, which handles paraphrases,
     spelling variants and Banglish that keyword matching misses.

This is a drop-in `match(query, language)` function that the chatbot can call
as a fallback when keyword scoring is below threshold.

Models (both free, Apache-2.0 / MIT, no auth):
  - sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2
  - sentence-transformers/all-MiniLM-L6-v2 (English-only fallback)

Usage:
  python scripts/enhance_chatbot_nlu.py            # build & save the index
  python scripts/enhance_chatbot_nlu.py --test "ধানের রোগ"  # demo match
"""
import argparse
import json
import os
import sys

import numpy as np

HERE = os.path.dirname(__file__)
CHATBOT_DIR = os.path.join(HERE, "..", "ai_models", "chatbot")
TRAINING_JSON = os.path.join(CHATBOT_DIR, "training_data.json")
INDEX_PATH = os.path.join(CHATBOT_DIR, "nlu_index.npy")
META_PATH = os.path.join(CHATBOT_DIR, "nlu_index_meta.json")

# Lazy-loaded; imported only when actually needed.
EMBED_MODEL = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
EN_EMBED_MODEL = "sentence-transformers/all-MiniLM-L6-v2"


def load_training_data():
    with open(TRAINING_JSON, encoding="utf-8") as f:
        return json.load(f)


def build_index():
    """Embed every Q&A pair and save the index + metadata."""
    from sentence_transformers import SentenceTransformer

    data = load_training_data()
    pairs = data.get("qa_pairs", [])
    if not pairs:
        raise RuntimeError("no qa_pairs in training_data.json")

    texts = []
    for qa in pairs:
        # Concatenate question + answer so the embedding captures meaning,
        # not just the question phrasing.
        q = qa.get("question_bn") or qa.get("question_en") or ""
        a = qa.get("answer_bn") or qa.get("answer_en") or ""
        texts.append(f"{q} {a}")

    print(f"Loading {EMBED_MODEL} ...")
    model = SentenceTransformer(EMBED_MODEL)
    print(f"Embedding {len(texts)} Q&A pairs ...")
    embeddings = model.encode(texts, normalize_embeddings=True, show_progress_bar=True)
    np.save(INDEX_PATH, np.asarray(embeddings, dtype=np.float32))

    meta = {
        "model": EMBED_MODEL,
        "count": len(pairs),
        "pairs": [
            {
                "topic": qa.get("topic", "general"),
                "question_bn": qa.get("question_bn", ""),
                "question_en": qa.get("question_en", ""),
                "answer_bn": qa.get("answer_bn", ""),
                "answer_en": qa.get("answer_en", ""),
                "keywords_bn": qa.get("keywords_bn", []),
                "keywords_en": qa.get("keywords_en", []),
            }
            for qa in pairs
        ],
    }
    with open(META_PATH, "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)
    print(f"Wrote {INDEX_PATH} ({embeddings.shape}) and {META_PATH}")
    return meta


def load_index():
    if not os.path.exists(INDEX_PATH):
        raise RuntimeError(f"Index not built. Run: python {__file__} --build")
    return np.load(INDEX_PATH), json.load(open(META_PATH, encoding="utf-8"))


def _embed(text, model_name):
    from sentence_transformers import SentenceTransformer
    model = SentenceTransformer(model_name)
    return np.asarray(model.encode([text], normalize_embeddings=True), dtype=np.float32)


def match(query, language="bn", top_k=1):
    """
    Return the best matching Q&A pair for `query` using cosine similarity
    over the precomputed embedding index.

    Returns (pair, score) where score in [0,1]. Returns (None, 0.0) when the
    index is unavailable.
    """
    try:
        index, meta = load_index()
    except Exception as e:
        print(f"NLU index unavailable: {e}", file=sys.stderr)
        return None, 0.0

    model_name = EMBED_MODEL if language == "bn" else EN_EMBED_MODEL
    q_emb = _embed(query, model_name)
    scores = float((q_emb @ index.T)[0])
    # cosine similarity (embeddings already normalised)
    sims = (q_emb @ index.T)[0]
    best = int(np.argmax(sims))
    return meta["pairs"][best], float(sims[best])


def main():
    ap = argparse.ArgumentParser(description="Bangla NLU for chatbot")
    ap.add_argument("--build", action="store_true", help="build the embedding index")
    ap.add_argument("--test", help="test a query against the index")
    args = ap.parse_args()

    if args.build:
        build_index()
        return

    if args.test:
        pair, score = match(args.test)
        if pair:
            print(f"score={score:.3f}")
            print("  topic:", pair.get("topic"))
            print("  Q (bn):", pair.get("question_bn"))
            print("  A (bn):", pair.get("answer_bn"))
        else:
            print("no match")


if __name__ == "__main__":
    main()
