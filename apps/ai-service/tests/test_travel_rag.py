"""Unit tests for travel RAG module."""

import pytest

from app.travel.rag import TravelEmbedder, TravelRetriever


class TestTravelEmbedder:
    @pytest.fixture(scope="class")
    def embedder(self):
        return TravelEmbedder()

    def test_model_loading(self, embedder):
        model = embedder.model
        assert model is not None
        assert hasattr(model, "encode")

    def test_embedding_dimension(self, embedder):
        dim = embedder.get_embedding_dimension()
        assert dim == 384  # all-MiniLM-L6-v2 dimension

    def test_chunk_text(self, embedder):
        text = "This is a test. " * 100  # Long text
        metadata = {"title": "Test", "category": "test"}
        chunks = embedder.chunk_text(text, metadata)
        assert len(chunks) > 1
        for chunk in chunks:
            assert "text" in chunk
            assert "metadata" in chunk
            assert chunk["metadata"]["title"] == "Test"
            assert "chunk_index" in chunk["metadata"]

    def test_load_data_files(self, embedder):
        chunks = embedder.load_data_files()
        assert len(chunks) > 0
        for chunk in chunks:
            assert "text" in chunk
            assert "metadata" in chunk
            assert "source" in chunk["metadata"]
            assert "category" in chunk["metadata"]
            assert "title" in chunk["metadata"]


class TestTravelRetriever:
    @pytest.fixture(scope="class")
    def embedder(self):
        return TravelEmbedder()

    @pytest.fixture(scope="class")
    def retriever(self, embedder):
        embedder.build_index()
        return TravelRetriever(embedder)

    def test_retrieve_basic(self, retriever):
        results = retriever.retrieve("Lalbagh Fort history")
        assert len(results) > 0
        assert len(results) <= 5  # top_k default
        for result in results:
            assert "text" in result
            assert "score" in result
            assert "metadata" in result
            assert isinstance(result["score"], float)
            assert 0 <= result["score"] <= 1

    def test_retrieve_with_top_k(self, retriever):
        results = retriever.retrieve("Sylhet tourism", top_k=3)
        assert len(results) <= 3

    def test_retrieve_by_district(self, retriever):
        results = retriever.retrieve_by_district("historical sites", "dhaka")
        assert len(results) > 0
        for result in results:
            source = result["metadata"].get("source", "").lower()
            title = result["metadata"].get("title", "").lower()
            assert "dhaka" in source or "dhaka" in title or "lalbagh" in title or "ahsan" in title

    def test_retrieve_bangla_query(self, retriever):
        # Note: Data is primarily in English, so Bangla queries may have lower recall
        # This tests that the system doesn't crash on Bangla input
        results = retriever.retrieve("লালবাগ কেল্লার ইতিহাস")
        assert len(results) > 0
        # Should return some results even if not perfect match

    def test_get_sources(self, retriever):
        results = retriever.retrieve("Dhaka historical sites")
        sources = retriever.get_sources(results)
        assert len(sources) > 0
        for source in sources:
            assert "title" in source
            assert "category" in source
            assert "source" in source

    def test_get_sources_unique(self, retriever):
        results = retriever.retrieve("Lalbagh Fort")
        sources = retriever.get_sources(results)
        titles = [s["title"] for s in sources]
        assert len(titles) == len(set(titles))  # No duplicates


class TestRAGIntegration:
    @pytest.fixture(scope="class")
    def embedder(self):
        return TravelEmbedder()

    @pytest.fixture(scope="class")
    def retriever(self, embedder):
        embedder.build_index()
        return TravelRetriever(embedder)

    def test_sylhet_query_returns_sylhet_content(self, retriever):
        results = retriever.retrieve("What to visit in Sylhet")
        sylhet_results = [r for r in results if "sylhet" in r["metadata"].get("source", "").lower() or "sylhet" in r["metadata"].get("title", "").lower()]
        assert len(sylhet_results) > 0

    def test_coxs_bazar_query_returns_beach_content(self, retriever):
        results = retriever.retrieve("Cox's Bazar beach")
        coxs_results = [r for r in results if "coxs" in r["metadata"].get("source", "").lower() or "coxs" in r["metadata"].get("title", "").lower()]
        assert len(coxs_results) > 0

    def test_historical_site_query(self, retriever):
        results = retriever.retrieve("Somapura Mahavihara UNESCO")
        mahavihara_results = [r for r in results if "mahavihara" in r["metadata"].get("title", "").lower() or "somapura" in r["metadata"].get("title", "").lower()]
        assert len(mahavihara_results) > 0


if __name__ == "__main__":
    pytest.main([__file__, "-v"])