"""
Тесты чата и поиска по заметкам — приложение работает в процессе теста,
с настоящей MongoDB (MONGO_URL), а ИИ подменяется заглушкой.
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

from app.main import app
from app.database import database
from app.services.encryption import init_encryption
from app.config import settings
import app.routes.chat as chat_routes


class FakeAI:
    """Отвечает эхом и запоминает, какие заметки попали в контекст."""

    def __init__(self, search_query=None):
        self.search_query = search_query
        self.calls = []

    async def get_reflection_response(self, message, history, history_summary, notes_context):
        self.calls.append([n.get("title") for n in notes_context])
        result = {"response": f"echo: {message}"}
        if self.search_query and len(self.calls) == 1:
            result["search_notes_query"] = self.search_query
        return result


@pytest.fixture
async def client():
    await database.connect()
    init_encryption(settings.encryption_key)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c
    await database.client.drop_database(settings.db_name)
    await database.disconnect()


async def register(client, name):
    r = await client.post("/api/auth/register", json={
        "email": f"{name}_{uuid.uuid4().hex[:6]}@example.com",
        "password": "password123",
        "name": name,
    })
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


async def test_cannot_write_into_foreign_chat_session(client, monkeypatch):
    monkeypatch.setattr(chat_routes, "get_ai_service", lambda: FakeAI())
    alice, mallory = await register(client, "alice"), await register(client, "mallory")

    session = (await client.post("/api/chat/sessions", json={"title": "Личное"}, headers=alice)).json()

    # Mallory знает id чужой сессии и шлёт сообщение с ним
    r = await client.post("/api/chat", headers=mallory,
                          json={"message": "подброшено", "session_id": session["id"]})
    assert r.status_code in (403, 404)

    own = (await client.get(f"/api/chat/sessions/{session['id']}", headers=alice)).json()
    assert own["messages"] == []


async def test_own_chat_session_is_saved(client, monkeypatch):
    monkeypatch.setattr(chat_routes, "get_ai_service", lambda: FakeAI())
    alice = await register(client, "alice")
    session = (await client.post("/api/chat/sessions", json={"title": "Личное"}, headers=alice)).json()

    r = await client.post("/api/chat", headers=alice, json={"message": "привет", "session_id": session["id"]})
    assert r.status_code == 200
    saved = (await client.get(f"/api/chat/sessions/{session['id']}", headers=alice)).json()
    assert [m["content"] for m in saved["messages"]] == ["привет", "echo: привет"]


async def test_ai_search_finds_old_notes(client, monkeypatch):
    """Поиск ИИ должен идти по всем заметкам, а не только по последним трём."""
    ai = FakeAI(search_query="отпуск")
    monkeypatch.setattr(chat_routes, "get_ai_service", lambda: ai)
    alice = await register(client, "alice")

    await client.post("/api/notes", headers=alice, json={"title": "Планы на отпуск", "content": "Море"})
    for i in range(10):
        await client.post("/api/notes", headers=alice, json={"title": f"Будни {i}", "content": "работа"})

    r = await client.post("/api/chat", headers=alice, json={"message": "что я писал про отпуск?"})
    assert r.status_code == 200
    # Второй запрос к ИИ получил найденную старую заметку
    assert "Планы на отпуск" in ai.calls[-1]


async def test_chat_error_does_not_leak_details(client, monkeypatch):
    class BrokenAI(FakeAI):
        async def get_reflection_response(self, *args, **kwargs):
            raise RuntimeError("secret internal detail: api key sk-xxx")

    monkeypatch.setattr(chat_routes, "get_ai_service", lambda: BrokenAI())
    alice = await register(client, "alice")
    r = await client.post("/api/chat", headers=alice, json={"message": "привет"})
    assert r.status_code == 500
    assert "secret internal detail" not in r.text
