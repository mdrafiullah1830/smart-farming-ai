"""Retrieval module for travel RAG."""

import logging
from typing import List, Dict, Any, Optional

import numpy as np

from .embedder import TravelEmbedder, _import_faiss

logger = logging.getLogger(__name__)


class TravelRetriever:
    """Handles query embedding and retrieval from FAISS index."""

    def __init__(self, embedder: Optional[TravelEmbedder] = None, top_k: int = 5):
        self.embedder = embedder or TravelEmbedder()
        self.top_k = top_k

    def retrieve(self, query: str, top_k: Optional[int] = None, filter_category: Optional[str] = None) -> List[Dict[str, Any]]:
        """Retrieve top-k relevant chunks for a query."""
        if not self.embedder.is_ready():
            logger.warning("Index not ready, attempting to load...")
            if not self.embedder.load_index():
                return []

        faiss = _import_faiss()
        k = top_k or self.top_k
        query_embedding = self.embedder.model.encode([query], convert_to_numpy=True)
        query_embedding = query_embedding.astype(np.float32)
        faiss.normalize_L2(query_embedding)

        scores, indices = self.embedder.index.search(query_embedding, k * 3)

        results = []
        for score, idx in zip(scores[0], indices[0]):
            if idx >= len(self.embedder.metadata):
                continue

            chunk = self.embedder.metadata[idx]
            if filter_category and chunk["metadata"].get("category") != filter_category:
                continue

            results.append({
                "text": chunk["text"],
                "score": float(score),
                "metadata": chunk["metadata"],
            })

            if len(results) >= k:
                break

        return results

    def retrieve_by_district(self, query: str, district: str, top_k: Optional[int] = None) -> List[Dict[str, Any]]:
        """Retrieve chunks filtered by district."""
        if not self.embedder.is_ready():
            return []

        faiss = _import_faiss()
        k = top_k or self.top_k
        query_embedding = self.embedder.model.encode([query], convert_to_numpy=True)
        query_embedding = query_embedding.astype(np.float32)
        faiss.normalize_L2(query_embedding)

        scores, indices = self.embedder.index.search(query_embedding, k * 5)

        results = []
        district_lower = district.lower()
        for score, idx in zip(scores[0], indices[0]):
            if idx >= len(self.embedder.metadata):
                continue

            chunk = self.embedder.metadata[idx]
            meta = chunk["metadata"]
            source = meta.get("source", "").lower()
            title = meta.get("title", "").lower()

            if district_lower in source or district_lower in title:
                results.append({
                    "text": chunk["text"],
                    "score": float(score),
                    "metadata": meta,
                })

                if len(results) >= k:
                    break

        return results

    def get_sources(self, results: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Extract unique sources from retrieval results."""
        seen = set()
        sources = []
        for r in results:
            meta = r["metadata"]
            key = (meta.get("title"), meta.get("category"), meta.get("source"))
            if key not in seen:
                seen.add(key)
                sources.append({
                    "title": meta.get("title", "Unknown"),
                    "category": meta.get("category", "general"),
                    "source": meta.get("source", ""),
                    "district": meta.get("district"),
                })
        return sources
