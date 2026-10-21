"""
Чат и поиск по заметкам: ИИ подменяется заглушкой.
"""
import pytest

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


async def test_cannot_write_into_foreign_chat_session(app_client, register, monkeypatch):
    monkeypatch.setattr(chat_routes, "get_ai_service", lambda: FakeAI())
    alice, mallory = await register("alice"), await register("mallory")

    session = (await app_client.post("/api/chat/sessions", json={"title": "Личное"}, headers=alice)).json()

    # Mallory знает id чужой сессии и шлёт сообщение с ним
    r = await app_client.post("/api/chat", headers=mallory,
                          json={"message": "подброшено", "session_id": session["id"]})
    assert r.status_code in (403, 404)

    own = (await app_client.get(f"/api/chat/sessions/{session['id']}", headers=alice)).json()
    assert own["messages"] == []


async def test_own_chat_session_is_saved(app_client, register, monkeypatch):
    monkeypatch.setattr(chat_routes, "get_ai_service", lambda: FakeAI())
    alice = await register("alice")
    session = (await app_client.post("/api/chat/sessions", json={"title": "Личное"}, headers=alice)).json()

    r = await app_client.post("/api/chat", headers=alice, json={"message": "привет", "session_id": session["id"]})
    assert r.status_code == 200
    saved = (await app_client.get(f"/api/chat/sessions/{session['id']}", headers=alice)).json()
    assert [m["content"] for m in saved["messages"]] == ["привет", "echo: привет"]


async def test_ai_search_finds_old_notes(app_client, register, monkeypatch):
    """Поиск ИИ должен идти по всем заметкам, а не только по последним трём."""
    ai = FakeAI(search_query="отпуск")
    monkeypatch.setattr(chat_routes, "get_ai_service", lambda: ai)
    alice = await register("alice")

    await app_client.post("/api/notes", headers=alice, json={"title": "Планы на отпуск", "content": "Море"})
    for i in range(10):
        await app_client.post("/api/notes", headers=alice, json={"title": f"Будни {i}", "content": "работа"})

    r = await app_client.post("/api/chat", headers=alice, json={"message": "что я писал про отпуск?"})
    assert r.status_code == 200
    # Второй запрос к ИИ получил найденную старую заметку
    assert "Планы на отпуск" in ai.calls[-1]


async def test_chat_error_does_not_leak_details(app_client, register, monkeypatch):
    class BrokenAI(FakeAI):
        async def get_reflection_response(self, *args, **kwargs):
            raise RuntimeError("secret internal detail: api key sk-xxx")

    monkeypatch.setattr(chat_routes, "get_ai_service", lambda: BrokenAI())
    alice = await register("alice")
    r = await app_client.post("/api/chat", headers=alice, json={"message": "привет"})
    assert r.status_code == 500
    assert "secret internal detail" not in r.text
