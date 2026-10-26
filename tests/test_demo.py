"""Демо-режим: своя песочница каждому посетителю, срок жизни, лимиты."""
from datetime import datetime, timedelta

import app.routes.chat as chat_routes
import app.services.demo as demo
from app.config import settings
from app.database import get_notes_collection, get_users_collection
from app.services import rate_limit


class EchoAI:
    async def get_reflection_response(self, message, **kwargs):
        return {"response": message}


def enable_demo(monkeypatch):
    monkeypatch.setattr(settings, "demo_mode", True)
    monkeypatch.setattr(demo, "_created", demo.defaultdict(demo.deque))
    monkeypatch.setattr(demo, "_demo_ai_calls", demo.deque())


async def start_demo(client) -> dict:
    r = await client.post("/api/auth/demo")
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


async def test_demo_disabled_by_default(app_client):
    assert (await app_client.get("/api/auth/demo")).json() == {"enabled": False}
    assert (await app_client.post("/api/auth/demo")).status_code == 404


async def test_sandbox_has_demo_content(app_client, monkeypatch):
    enable_demo(monkeypatch)
    headers = await start_demo(app_client)

    me = (await app_client.get("/api/auth/me", headers=headers)).json()
    assert me["is_demo"] is True and me["demo_expires_at"]

    notes = (await app_client.get("/api/notes", headers=headers)).json()
    assert len(notes) == len(demo.NOTES)
    assert notes[0]["title"] == "План на неделю"  # свежие сверху, расшифрованы
    assert (await app_client.get("/api/states", headers=headers)).json()
    assert (await app_client.get("/api/templates", headers=headers)).json()
    today = datetime.utcnow().strftime("%Y-%m-%d")
    checklist = (await app_client.get(f"/api/checklists/{today}", headers=headers)).json()
    assert checklist and checklist["items"][0]["text"] == "Стакан воды"
    sessions = (await app_client.get("/api/chat/sessions", headers=headers)).json()
    assert sessions and sessions[0]["title"] == "Сон и концентрация"


async def test_sandboxes_are_isolated(app_client, monkeypatch):
    enable_demo(monkeypatch)
    alice, bob = await start_demo(app_client), await start_demo(app_client)
    await app_client.post("/api/notes", headers=alice, json={"title": "Только моё", "content": "секрет"})
    bob_titles = [n["title"] for n in (await app_client.get("/api/notes", headers=bob)).json()]
    assert "Только моё" not in bob_titles


async def test_expired_sandbox_is_rejected_and_cleaned_up(app_client, monkeypatch):
    enable_demo(monkeypatch)
    headers = await start_demo(app_client)
    me = (await app_client.get("/api/auth/me", headers=headers)).json()
    await get_users_collection().update_one(
        {"id": me["id"]}, {"$set": {"demo_expires_at": datetime.utcnow() - timedelta(minutes=1)}})

    assert (await app_client.get("/api/notes", headers=headers)).status_code == 401
    assert await demo.cleanup_expired_demo_users() == 1
    assert await get_notes_collection().count_documents({"user_id": me["id"]}) == 0


async def test_sandbox_creation_is_limited_per_ip(app_client, monkeypatch):
    enable_demo(monkeypatch)
    monkeypatch.setattr(settings, "demo_sandboxes_per_ip_per_hour", 2)
    codes = [(await app_client.post("/api/auth/demo")).status_code for _ in range(3)]
    assert codes == [200, 200, 429]


async def test_ai_limit_is_shared_by_all_sandboxes(app_client, register, monkeypatch):
    enable_demo(monkeypatch)
    monkeypatch.setattr(chat_routes, "get_ai_service", lambda: EchoAI())
    monkeypatch.setattr(rate_limit, "_calls", rate_limit.defaultdict(rate_limit.deque))
    monkeypatch.setattr(settings, "demo_ai_requests_per_hour", 2)
    guests = [await start_demo(app_client) for _ in range(3)]

    codes = [(await app_client.post("/api/chat", headers=g, json={"message": "hi"})).status_code
             for g in guests]
    assert codes == [200, 200, 429]
    # Обычных пользователей общий демо-лимит не касается
    user = await register("real")
    assert (await app_client.post("/api/chat", headers=user, json={"message": "hi"})).status_code == 200
