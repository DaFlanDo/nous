"""
Лимит на запросы к ИИ — каждый запрос стоит денег провайдеру.
Скользящее окно в памяти процесса: хватает для одного инстанса backend;
при нескольких воркерах счётчик нужно вынести в Redis.
"""
import time
from collections import defaultdict, deque

from fastapi import Depends, HTTPException

from ..config import settings
from ..models import User
from .auth import require_auth
from .demo import check_demo_ai_quota

WINDOW_SECONDS = 3600
_calls: dict[str, deque] = defaultdict(deque)


def check_ai_quota(user_id: str, limit: int, now: float | None = None) -> bool:
    """True — запрос можно выполнить (и он засчитан), False — лимит исчерпан."""
    now = time.monotonic() if now is None else now
    calls = _calls[user_id]
    while calls and now - calls[0] > WINDOW_SECONDS:
        calls.popleft()
    if len(calls) >= limit:
        return False
    calls.append(now)
    return True


async def ai_rate_limit(user: User = Depends(require_auth)) -> User:
    """Зависимость для эндпоинтов, которые ходят в ИИ."""
    if not check_ai_quota(user.id, settings.ai_requests_per_hour):
        raise HTTPException(
            status_code=429,
            detail="Слишком много запросов к ассистенту. Попробуйте через некоторое время.",
        )
    check_demo_ai_quota(user)
    return user
