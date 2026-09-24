"""Embedding and FAISS index building for travel RAG.

Heavy deps (sentence-transformers → torch) are imported lazily so the API
can boot on Render free (512 MB) where torch cannot be installed.
"""

import json
import logging
import pickle
from pathlib import Path
from typing import Any, Any as _Any

logger = logging.getLogger(__name__)

DEFAULT_EMBEDDING_MODEL = "sentence-transformers/all-MiniLM-L6-v2"
CHUNK_SIZE = 500
CHUNK_OVERLAP = 50
INDEX_DIR = Path(__file__).parent.parent / "data" / "index"

# Dependency diagnostics are named constants so the `raise` sites stay
# message-free (TRY003).
FAISS_MISSING_MSG = "faiss-cpu is required for travel RAG"
SENTENCE_TRANSFORMERS_MISSING_MSG = (
    "sentence-transformers is not installed (requirements-rag.txt); "
    "travel retrieval is unavailable on this deployment"
)
NO_CHUNKS_MSG = "No chunks to index"


def _import_faiss():
    try:
        import faiss
    except ImportError as exc:
        raise RuntimeError(FAISS_MISSING_MSG) from exc
    return faiss


def _import_sentence_transformer():
    try:
        from sentence_transformers import SentenceTransformer
    except ImportError as exc:
        raise RuntimeError(SENTENCE_TRANSFORMERS_MISSING_MSG) from exc
    return SentenceTransformer


def embedding_available() -> bool:
    """True when the embedding model can be loaded on this host."""
    try:
        _import_sentence_transformer()
        _import_faiss()
    except Exception:
        return False
    return True


class TravelEmbedder:
    """Handles embedding generation and FAISS index management."""

    def __init__(self, model_name: str = DEFAULT_EMBEDDING_MODEL, index_dir: Path | None = None):
        self.model_name = model_name
        self.index_dir = index_dir or INDEX_DIR
        self.index_dir.mkdir(parents=True, exist_ok=True)
        self._model: _Any | None = None
        self._index: _Any | None = None
        self._metadata: list[dict[str, Any]] = []

    @property
    def model(self) -> _Any:
        if self._model is None:
            st = _import_sentence_transformer()
            logger.info(f"Loading embedding model: {self.model_name}")
            self._model = st(self.model_name)
        return self._model

    def get_embedding_dimension(self) -> int:
        dim: int = self.model.get_sentence_embedding_dimension()
        return dim

    def chunk_text(self, text: str, metadata: dict[str, Any]) -> list[dict[str, Any]]:
        """Split text into chunks with metadata."""
        try:
            from langchain_text_splitters import RecursiveCharacterTextSplitter

            splitter = RecursiveCharacterTextSplitter(
                chunk_size=CHUNK_SIZE,
                chunk_overlap=CHUNK_OVERLAP,
                separators=["\n\n", "\n", ". ", " ", ""],
            )
            chunks = splitter.split_text(text)
        except ImportError:
            # Fallback splitter when langchain-text-splitters is absent.
            chunks = []
            step = CHUNK_SIZE
            for i in range(0, len(text), step - CHUNK_OVERLAP or step):
                piece = text[i : i + step]
                if piece.strip():
                    chunks.append(piece)
        return [
            {
                "text": chunk,
                "metadata": {**metadata, "chunk_index": i, "total_chunks": len(chunks)},
            }
            for i, chunk in enumerate(chunks)
        ]

    def load_data_files(self) -> list[dict[str, Any]]:
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
                    metadata: dict[str, Any] = {
                        "source": str(file_path.relative_to(data_dir)),
                        "category": category,
                        "title": title,
                        "district": category if category == "districts" else None,
                    }
                    chunks = self.chunk_text(content, metadata)
                    all_chunks.extend(chunks)
                    logger.info(f"Loaded {len(chunks)} chunks from {file_path.name}")
                except Exception:
                    logger.exception(f"Failed to load {file_path}")

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
                except Exception:
                    logger.exception(f"Failed to load {file_path}")

        return all_chunks

    def build_index(self, chunks: list[dict[str, Any]] | None = None) -> _Any:
        """Build FAISS index from chunks."""
        faiss = _import_faiss()
        if chunks is None:
            chunks = self.load_data_files()

        if not chunks:
            raise ValueError(NO_CHUNKS_MSG)

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
        faiss = _import_faiss()

        index_path = self.index_dir / "travel_index.faiss"
        metadata_path = self.index_dir / "travel_metadata.pkl"

        faiss.write_index(self._index, str(index_path))
        with metadata_path.open("wb") as f:
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
            faiss = _import_faiss()
            self._index = faiss.read_index(str(index_path))
            with metadata_path.open("rb") as f:
                self._metadata = pickle.load(f)  # nosec B301  # index metadata written by the local RAG build step
        except Exception:
            logger.exception("Failed to load index")
            return False
        else:
            logger.info(f"Loaded index with {self._index.ntotal} vectors")
            return True

    @property
    def index(self) -> _Any | None:
        if self._index is None:
            self.load_index()
        return self._index

    @property
    def metadata(self) -> list[dict[str, Any]]:
        if not self._metadata and self._index is None:
            self.load_index()
        return self._metadata

    def is_ready(self) -> bool:
        """True only when both the index and the embedding model can serve queries."""
        if not embedding_available():
            return False
        return self.index is not None and self._index is not None and self._index.ntotal > 0
