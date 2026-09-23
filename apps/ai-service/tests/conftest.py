import os
import sys

# Add the app directory to the path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

import pytest

# Force a single known token for the whole suite so dynamic SERVICE_TOKEN reads stay stable.
os.environ["SERVICE_TOKEN"] = "test-token"
os.environ.setdefault("MODEL_PATH", "/nonexistent/model.onnx")


@pytest.fixture(autouse=True)
def mock_env():
    """Mock environment for tests."""
    yield
