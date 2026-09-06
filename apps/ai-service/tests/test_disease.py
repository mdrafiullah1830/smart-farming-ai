from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock
import os

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
    # Mock the ONNX session
    mock_output = MagicMock()
    mock_output.__getitem__.return_value = [0.1, 0.7, 0.05, 0.05, 0.03, 0.02, 0.02, 0.01, 0.01, 0.01]
    mock_session.run.return_value = [mock_output]
    mock_session.get_inputs.return_value = [MagicMock(name='input')]
    
    with patch('httpx.AsyncClient.get') as mock_get:
        mock_response = MagicMock()
        mock_response.content = b'fake image data'
        mock_response.raise_for_status = MagicMock()
        mock_get.return_value.__aenter__.return_value = mock_response
        
        with patch('PIL.Image.open') as mock_open:
            mock_img = MagicMock()
            mock_img.convert.return_value = mock_img
            mock_img.resize.return_value = mock_img
            mock_open.return_value = mock_img
            
            with patch('numpy.array') as mock_array:
                mock_array.return_value = MagicMock()
                with patch('numpy.transpose') as mock_transpose:
                    mock_transpose.return_value = MagicMock()
                    with patch('numpy.expand_dims') as mock_expand:
                        mock_expand.return_value = MagicMock()
                        with patch('numpy.exp') as mock_exp:
                            mock_exp.return_value = MagicMock()
                            with patch('numpy.sum') as mock_sum:
                                mock_sum.return_value = 1.0
                                with patch('numpy.argsort') as mock_argsort:
                                    mock_argsort.return_value = [1, 0, 2, 3, 4]
                                    
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