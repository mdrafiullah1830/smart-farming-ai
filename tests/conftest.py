import os
import shutil
import sys
import tempfile

import pytest
from fastapi.testclient import TestClient

# Set test environment variables before importing app
os.environ["SECRET_KEY"] = "test-secret-key-for-testing-only"
os.environ["APP_ENV"] = "test"

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))


@pytest.fixture(scope="session")
def client():
    """TestClient bound to a scratch copy of the SQLite database.

    Tests register real users and write disease reports; pointing them at the
    repository's database would dirty the working tree on every run.
    """
    repo_db = os.path.join(os.path.dirname(__file__), '..', 'database', 'smart_farming.db')
    scratch_dir = tempfile.mkdtemp(prefix='smart-farming-tests-')
    scratch_db = os.path.join(scratch_dir, 'smart_farming.db')
    shutil.copyfile(repo_db, scratch_db)
    os.environ["SMART_FARMING_DB"] = scratch_db

    from backend.main import app

    with TestClient(app) as c:
        yield c

    shutil.rmtree(scratch_dir, ignore_errors=True)
    os.environ.pop("SMART_FARMING_DB", None)
