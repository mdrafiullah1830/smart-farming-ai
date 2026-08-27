from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_health() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "smart-farming-ai"}


def test_disease_requires_service_token() -> None:
    response = client.post(
        "/v1/disease/analyze",
        json={"job_id": "job-1", "image_url": "https://example.com/image.jpg"},
    )
    assert response.status_code in (401, 503)
