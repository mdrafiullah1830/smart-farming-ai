"""Embedding and FAISS index building for travel RAG."""

import json
import logging
import os
import pickle
from pathlib import Path
from typing import List, Dict, Any, Optional

import faiss
import numpy as np
from sentence_transformers import SentenceTransformer
from langchain_text_splitters import RecursiveCharacterTextSplitter

logger = logging.getLogger(__name__)

DEFAULT_EMBEDDING_MODEL = "sentence-transformers/all-MiniLM-L6-v2"
CHUNK_SIZE = 500
CHUNK_OVERLAP = 50
INDEX_DIR = Path(__file__).parent.parent / "data" / "index"


class TravelEmbedder:
    """Handles embedding generation and FAISS index management."""

    def __init__(self, model_name: str = DEFAULT_EMBEDDING_MODEL, index_dir: Optional[Path] = None):
        self.model_name = model_name
        self.index_dir = index_dir or INDEX_DIR
        self.index_dir.mkdir(parents=True, exist_ok=True)
        self._model: Optional[SentenceTransformer] = None
        self._index: Optional[faiss.Index] = None
        self._metadata: List[Dict[str, Any]] = []

    @property
    def model(self) -> SentenceTransformer:
        if self._model is None:
            logger.info(f"Loading embedding model: {self.model_name}")
            self._model = SentenceTransformer(self.model_name)
        return self._model

    def get_embedding_dimension(self) -> int:
        return self.model.get_sentence_embedding_dimension()

    def chunk_text(self, text: str, metadata: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Split text into chunks with metadata."""
        splitter = RecursiveCharacterTextSplitter(
            chunk_size=CHUNK_SIZE,
            chunk_overlap=CHUNK_OVERLAP,
            separators=["\n\n", "\n", ". ", " ", ""],
        )
        chunks = splitter.split_text(text)
        return [
            {
                "text": chunk,
                "metadata": {**metadata, "chunk_index": i, "total_chunks": len(chunks)},
            }
            for i, chunk in enumerate(chunks)
        ]

    def load_data_files(self) -> List[Dict[str, Any]]:
        """Load all markdown/json data files and return chunks with metadata."""
        all_chunks = []
        data_dir = self.index_dir.parent

        for category_dir in data_dir.iterdir():
            if not category_dir.is_dir():
                continue

            category = category_dir.name
            for file_path in category_dir.glob("*.md"):
                try:
                    content = file_path.read_text(encoding="utf-8")
                    title = file_path.stem.replace("_", " ").title()
                    metadata = {
                        "source": str(file_path.relative_to(data_dir)),
                        "category": category,
                        "title": title,
                        "district": category if category == "districts" else None,
                    }
                    chunks = self.chunk_text(content, metadata)
                    all_chunks.extend(chunks)
                    logger.info(f"Loaded {len(chunks)} chunks from {file_path.name}")
                except Exception as e:
                    logger.error(f"Failed to load {file_path}: {e}")

            for file_path in category_dir.glob("*.json"):
                try:
                    content = file_path.read_text(encoding="utf-8")
                    data = json.loads(content)
                    title = file_path.stem.replace("_", " ").title()
                    metadata = {
                        "source": str(file_path.relative_to(data_dir)),
                        "category": category,
                        "title": title,
                        "is_structured": True,
                    }
                    text = json.dumps(data, ensure_ascii=False, indent=2)
                    chunks = self.chunk_text(text, metadata)
                    all_chunks.extend(chunks)
                    logger.info(f"Loaded {len(chunks)} chunks from {file_path.name}")
                except Exception as e:
                    logger.error(f"Failed to load {file_path}: {e}")

        return all_chunks

    def build_index(self, chunks: Optional[List[Dict[str, Any]]] = None) -> faiss.Index:
        """Build FAISS index from chunks."""
        if chunks is None:
            chunks = self.load_data_files()

        if not chunks:
            raise ValueError("No chunks to index")

        logger.info(f"Encoding {len(chunks)} chunks...")
        texts = [chunk["text"] for chunk in chunks]
        embeddings = self.model.encode(texts, show_progress_bar=True, convert_to_numpy=True)

        dimension = embeddings.shape[1]
        index = faiss.IndexFlatIP(dimension)
        faiss.normalize_L2(embeddings)
        index.add(embeddings)

        self._index = index
        self._metadata = chunks

        self.save_index()
        logger.info(f"Built index with {index.ntotal} vectors, dimension {dimension}")
        return index

    def save_index(self) -> None:
        """Save FAISS index and metadata to disk."""
        if self._index is None:
            return

        index_path = self.index_dir / "travel_index.faiss"
        metadata_path = self.index_dir / "travel_metadata.pkl"

        faiss.write_index(self._index, str(index_path))
        with open(metadata_path, "wb") as f:
            pickle.dump(self._metadata, f)

        logger.info(f"Saved index to {index_path}")

    def load_index(self) -> bool:
        """Load FAISS index and metadata from disk."""
        index_path = self.index_dir / "travel_index.faiss"
        metadata_path = self.index_dir / "travel_metadata.pkl"

        if not index_path.exists() or not metadata_path.exists():
            logger.warning("Index files not found")
            return False

        try:
            self._index = faiss.read_index(str(index_path))
            with open(metadata_path, "rb") as f:
                self._metadata = pickle.load(f)
            logger.info(f"Loaded index with {self._index.ntotal} vectors")
            return True
        except Exception as e:
            logger.error(f"Failed to load index: {e}")
            return False

    @property
    def index(self) -> Optional[faiss.Index]:
        if self._index is None:
            self.load_index()
        return self._index

    @property
    def metadata(self) -> List[Dict[str, Any]]:
        if not self._metadata and self._index is None:
            self.load_index()
        return self._metadata

    def is_ready(self) -> bool:
        return self.index is not None and self._index.ntotal > 0