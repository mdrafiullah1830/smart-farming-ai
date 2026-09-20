import os
import sys

import pytest
from fastapi.testclient import TestClient

# Set test environment variables before importing app
os.environ["SECRET_KEY"] = "test-secret-key-for-testing-only"
os.environ["APP_ENV"] = "test"

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))


@pytest.fixture(scope="session")
def client():
    from backend.main import app
    with TestClient(app) as c:
        yield c
