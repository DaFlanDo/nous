"""
Фикстуры для тестов «в процессе»: приложение работает прямо в pytest,
с настоящей MongoDB (MONGO_URL), без внешнего ИИ.
test_api.py ходит в отдельно запущенный сервер и эти фикстуры не использует.
"""
import os
import sys
import uuid

os.environ.setdefault("JWT_SECRET", "test-secret")
os.environ.setdefault("ENCRYPTION_KEY", "test-encryption-key")
os.environ["OPENAI_API_KEY"] = ""
os.environ["DB_NAME"] = f"nous_test_{uuid.uuid4().hex[:8]}"
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

import pytest
from httpx import ASGITransport, AsyncClient


@pytest.fixture
async def app_client():
    from app.main import app
    from app.database import database
    from app.services.encryption import init_encryption
    from app.config import settings

    await database.connect()
    init_encryption(settings.encryption_key)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c
    await database.client.drop_database(settings.db_name)
    await database.disconnect()


@pytest.fixture
def register(app_client):
    async def _register(name: str) -> dict:
        r = await app_client.post("/api/auth/register", json={
            "email": f"{name}_{uuid.uuid4().hex[:6]}@example.com",
            "password": "password123",
            "name": name,
        })
        return {"Authorization": f"Bearer {r.json()['access_token']}"}
    return _register
