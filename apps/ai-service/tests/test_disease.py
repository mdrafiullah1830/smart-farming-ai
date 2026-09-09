from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock
import os
import numpy as np

# Set required env vars before importing app
os.environ["SERVICE_TOKEN"] = "test-token"
os.environ["MODEL_PATH"] = "/nonexistent/model.onnx"

from app.main import app

client = TestClient(app)


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["service"] == "smart-farming-ai"
    assert "model_loaded" in data


def test_disease_requires_service_token():
    response = client.post(
        "/v1/disease/analyze",
        json={"job_id": "job-1", "image_url": "https://example.com/image.jpg"},
    )
    assert response.status_code in (401, 503)


def test_disease_with_valid_token_but_no_model():
    response = client.post(
        "/v1/disease/analyze",
        json={"job_id": "job-1", "image_url": "https://example.com/image.jpg"},
        headers={"Authorization": "Bearer test-token"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "model_unavailable"
    assert "not been deployed" in data["message"]


def test_disease_invalid_url():
    response = client.post(
        "/v1/disease/analyze",
        json={"job_id": "job-1", "image_url": "not-a-url"},
        headers={"Authorization": "Bearer test-token"},
    )
    assert response.status_code == 422  # Pydantic validation error


def test_disease_missing_job_id():
    response = client.post(
        "/v1/disease/analyze",
        json={"image_url": "https://example.com/image.jpg"},
        headers={"Authorization": "Bearer test-token"},
    )
    assert response.status_code == 422


@patch('app.main.ORT_AVAILABLE', True)
@patch('app.main.model_loaded', True)
@patch('app.main.model_session')
def test_disease_success_with_model(mock_session):
    # Mock the ONNX session to return a real 10-class logits array.
    # The Paddy Doctor label order matches app.main.DISEASE_CLASSES:
    #   BLB, BLS, BPB, Blast, BrownSpot, DeadHeart, DownyMildew, Hispa, Healthy, Tungro
    logits = np.array(
        [0.1, 0.7, 0.05, 0.05, 0.03, 0.02, 0.02, 0.01, 3.0, 0.01],
        dtype=np.float32,
    )
    mock_output = MagicMock()
    mock_output.__getitem__.return_value = logits
    mock_session.run.return_value = [mock_output]
    mock_session.get_inputs.return_value = [MagicMock(name='input')]

    dummy_input = np.zeros((1, 3, 224, 224), dtype=np.float32)

    with patch('httpx.AsyncClient.get') as mock_get:
        mock_response = MagicMock()
        mock_response.content = b'fake image data'
        mock_response.raise_for_status = MagicMock()
        mock_get.return_value.__aenter__.return_value = mock_response

        # preprocess_image is already covered by its own tests; here we feed a
        # real tensor so the softmax + top-5 + severity logic runs on real numpy.
        with patch('app.main.preprocess_image', return_value=dummy_input):
            response = client.post(
                "/v1/disease/analyze",
                json={"job_id": "job-1", "image_url": "https://example.com/image.jpg"},
                headers={"Authorization": "Bearer test-token"},
            )
            assert response.status_code == 200
            data = response.json()
            assert data["status"] == "success"
            assert "predictions" in data
            assert len(data["predictions"]) <= 5
            # "Healthy" (index 8) has the highest logit -> must be top prediction.
            assert data["predictions"][0]["disease_en"] == "Healthy"


def test_disease_download_failure():
    with patch('httpx.AsyncClient.get') as mock_get:
        mock_get.side_effect = Exception("Network error")
        
        response = client.post(
            "/v1/disease/analyze",
            json={"job_id": "job-1", "image_url": "https://example.com/image.jpg"},
            headers={"Authorization": "Bearer test-token"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "error"