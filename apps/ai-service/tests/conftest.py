import sys
import os

# Add the app directory to the path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

import pytest

# Set required env vars for all tests
os.environ.setdefault("SERVICE_TOKEN", "test-token")
os.environ.setdefault("MODEL_PATH", "/nonexistent/model.onnx")


@pytest.fixture(autouse=True)
def mock_env():
    """Mock environment for tests."""
    yield