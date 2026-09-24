"""One-time script to build the travel RAG index from data files."""

import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from app.travel.rag.embedder import TravelEmbedder

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


def main():
    logger.info("Building travel RAG index...")
    embedder = TravelEmbedder()
    embedder.build_index()
    logger.info("Index build complete!")


if __name__ == "__main__":
    main()
