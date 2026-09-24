import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

# Set test environment variables before importing app
os.environ["SECRET_KEY"] = "test-secret-key-for-testing-only"
os.environ["APP_ENV"] = "test"

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT))


def repo_database() -> str:
    """Path to the seeded database, building it on first use.

    `database/*.db` is gitignored, so a fresh CI checkout has no database to
    copy. Rebuild it exactly the way backend/Dockerfile does, by running
    scripts/setup_db.py, which seeds districts, market prices, notifications
    and the soil survey JSON.
    """
    repo_db = REPO_ROOT / "database" / "smart_farming.db"
    if not repo_db.exists():
        subprocess.run([sys.executable, str(REPO_ROOT / "scripts" / "setup_db.py")], check=True)
    if not repo_db.exists():
        raise FileNotFoundError(repo_db)
    return str(repo_db)


@pytest.fixture(scope="session")
def client():
    """TestClient bound to a scratch copy of the SQLite database.

    Tests register real users and write disease reports; pointing them at the
    repository's database would dirty the working tree on every run.
    """
    scratch_dir = tempfile.mkdtemp(prefix="smart-farming-tests-")
    scratch_db = Path(scratch_dir) / "smart_farming.db"
    shutil.copyfile(repo_database(), scratch_db)
    os.environ["SMART_FARMING_DB"] = str(scratch_db)

    # Imported here because backend.main reads SMART_FARMING_DB once, at module
    # import time, to compute DB_PATH.
    from backend.main import app  # noqa: PLC0415

    with TestClient(app) as c:
        yield c

    shutil.rmtree(scratch_dir, ignore_errors=True)
    os.environ.pop("SMART_FARMING_DB", None)
