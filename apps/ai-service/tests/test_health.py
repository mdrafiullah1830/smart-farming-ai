from app.main import app
from fastapi.testclient import TestClient

client = TestClient(app)


def test_health() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data == {
        "status": "ok",
        "service": "smart-farming-ai",
        "model_loaded": str(False),  # no model deployed in the test env
    }


def test_disease_requires_service_token() -> None:
    response = client.post(
        "/v1/disease/analyze",
        json={"job_id": "job-1", "image_url": "https://example.com/image.jpg"},
    )
    assert response.status_code in (401, 503)
