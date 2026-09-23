from app.main import app
from fastapi.testclient import TestClient

client = TestClient(app)


def test_health() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["service"] == "smart-farming-ai"
    models = data["models"]
    assert set(models) == {"disease", "crop", "yield", "market", "advisory", "travel"}
    assert models["disease"] == "unavailable"   # no model deployed in the test env
    assert models["crop"] == "unavailable"
    assert models["yield"] == "unavailable"
    assert models["market"] == "unavailable"
    assert models["advisory"] == "ok"           # rule-based, no artifact needed
    assert models["travel"] in ("ok", "unavailable")  # depends on RAG index readiness


def test_disease_requires_service_token() -> None:
    response = client.post(
        "/v1/disease/analyze",
        json={"job_id": "job-1", "image_url": "https://example.com/image.jpg"},
    )
    assert response.status_code in (401, 503)
