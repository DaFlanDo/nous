"""Лимит запросов к ИИ, вход через Google."""
import pytest

import app.routes.chat as chat_routes
import app.services.auth as auth_service
from app.config import settings
from app.services import rate_limit


class EchoAI:
    async def get_reflection_response(self, message, **kwargs):
        return {"response": message}


async def test_ai_requests_are_limited_per_user(app_client, register, monkeypatch):
    monkeypatch.setattr(chat_routes, "get_ai_service", lambda: EchoAI())
    monkeypatch.setattr(settings, "ai_requests_per_hour", 2)
    monkeypatch.setattr(rate_limit, "_calls", rate_limit.defaultdict(rate_limit.deque))
    alice, bob = await register("alice"), await register("bob")

    codes = [(await app_client.post("/api/chat", headers=alice, json={"message": "hi"})).status_code
             for _ in range(3)]
    assert codes == [200, 200, 429]
    # Лимит у каждого свой
    assert (await app_client.post("/api/chat", headers=bob, json={"message": "hi"})).status_code == 200


def test_quota_window_slides():
    calls = rate_limit.defaultdict(rate_limit.deque)
    original = rate_limit._calls
    rate_limit._calls = calls
    try:
        assert rate_limit.check_ai_quota("u", 1, now=0)
        assert not rate_limit.check_ai_quota("u", 1, now=10)
        assert rate_limit.check_ai_quota("u", 1, now=rate_limit.WINDOW_SECONDS + 1)
    finally:
        rate_limit._calls = original


async def test_google_login_disabled_without_client_id(app_client, monkeypatch):
    monkeypatch.setattr(settings, "google_client_id", "")
    r = await app_client.post("/api/auth/google", json={"id_token": "x"})
    assert r.status_code == 503


class FakeGoogle:
    """Подменяет httpx.AsyncClient: tokeninfo возвращает заданный ответ."""

    def __init__(self, payload):
        self.payload = payload

    def __call__(self, *a, **kw):
        return self

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False

    async def get(self, url):
        class R:
            status_code = 200
            json = staticmethod(lambda: self.payload)
        return R()


@pytest.mark.parametrize("payload", [
    {"aud": "other-app.apps.googleusercontent.com", "sub": "1", "email": "a@x.com", "email_verified": "true"},
    {"aud": "our-app", "sub": "1", "email": "a@x.com", "email_verified": "false"},
])
async def test_google_token_rejected(app_client, monkeypatch, payload):
    monkeypatch.setattr(settings, "google_client_id", "our-app")
    monkeypatch.setattr(auth_service.httpx, "AsyncClient", FakeGoogle(payload))
    r = await app_client.post("/api/auth/google", json={"id_token": "x"})
    assert r.status_code == 401


async def test_google_token_accepted(app_client, monkeypatch):
    monkeypatch.setattr(settings, "google_client_id", "our-app")
    monkeypatch.setattr(auth_service.httpx, "AsyncClient", FakeGoogle(
        {"aud": "our-app", "sub": "g-1", "email": "g@x.com", "email_verified": "true", "name": "G"}))
    r = await app_client.post("/api/auth/google", json={"id_token": "x"})
    assert r.status_code == 200
    assert r.json()["user"]["email"] == "g@x.com"
