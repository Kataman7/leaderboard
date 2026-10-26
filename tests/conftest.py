"""Pytest configuration and fixtures."""
import os
import tempfile
import pytest
from fastapi.testclient import TestClient

from app.repositories.database import init_db, get_connection
from app.api.dependencies import get_db
from app.main import app


@pytest.fixture
def temp_db():
    """Create a temporary SQLite database for test isolation."""
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    init_db(path)

    yield path

    if os.path.exists(path):
        os.remove(path)


@pytest.fixture
def client(temp_db):
    """TestClient configured with the isolated temporary database."""
    def override_get_db():
        conn = get_connection(temp_db)
        try:
            yield conn
        finally:
            conn.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
