"""
Демо-режим (DEMO_MODE=true): «Попробовать без регистрации».

Дневник личный, поэтому общий демо-аккаунт здесь не годится — каждый посетитель
получает свою песочницу: временного пользователя с готовыми записями,
историей состояния, чек-листами и диалогом. Через DEMO_TTL_HOURS песочница
удаляется (при создании следующих и при старте сервера), так что cron не нужен.
"""
from __future__ import annotations

import logging
import time
import uuid
from collections import defaultdict, deque
from datetime import datetime, timedelta

from fastapi import HTTPException

from ..config import settings
from ..database import (
    get_chat_sessions_collection,
    get_checklists_collection,
    get_notes_collection,
    get_states_collection,
    get_templates_collection,
    get_users_collection,
)
from ..models import (
    ChatMessage,
    ChatSession,
    ChecklistItem,
    ChecklistTemplate,
    DailyChecklist,
    Note,
    StateMetrics,
    StateRecord,
    User,
)
from .encryption import get_encryption

logger = logging.getLogger(__name__)

DEMO_EMAIL_DOMAIN = "demo.nous"

# (дней назад, заголовок, текст)
NOTES = [
    (9, "Новый проект", "Взялся за backend на FastAPI. Сначала всё казалось простым, "
        "потом упёрся в асинхронную работу с базой. Голова гудит, но интересно."),
    (7, "Плохо спал", "Лёг в два, встал в семь. Весь день как в тумане, кофе не помогает. "
        "Обещал себе не сидеть ночью над кодом — и снова."),
    (5, "Тренировка", "Наконец-то дошёл до зала. После пробежки мысли разложились по полочкам, "
        "вечером спокойно дописал модуль авторизации."),
    (3, "Сложный разговор", "Обсуждали с командой сроки. Я переживал, что не успеваю, "
        "но оказалось, что все в похожей ситуации. Договорились убрать лишнее из релиза."),
    (1, "Фокус", "Три часа глубокой работы без телефона. Закрыл задачу, которую откладывал неделю. "
        "Заметил: лучше всего думается утром, до сообщений и почты."),
    (0, "План на неделю", "1. Дописать тесты к синхронизации.\n2. Ложиться до полуночи.\n"
        "3. Два раза в спорт.\n4. Вечер без экрана в пятницу."),
]

# (дней назад, метрики, разбор) — по записям видно, как сон и спорт меняют состояние
STATES = [
    (7, dict(dopamine=4, serotonin=4, gaba=3, noradrenaline=6, cortisol=8, testosterone=4,
             pfc_activity=3, focus=3, energy=2, motivation=4),
     "Недосып поднял кортизол и просадил префронтальную кору: внимание рассеивается, "
     "решения даются тяжело. Сегодня лучше взять рутинные задачи и лечь пораньше."),
    (5, dict(dopamine=6, serotonin=6, gaba=6, noradrenaline=6, cortisol=5, testosterone=6,
             pfc_activity=6, focus=6, energy=7, motivation=7),
     "Физическая нагрузка сработала: стресс ниже, энергия и мотивация выросли. "
     "Хороший момент для задач, требующих концентрации."),
    (3, dict(dopamine=5, serotonin=5, gaba=4, noradrenaline=7, cortisol=7, testosterone=5,
             pfc_activity=5, focus=5, energy=5, motivation=6),
     "Напряжение из-за сроков, но разговор с командой его снял частично. "
     "Помогут короткие перерывы и чёткий список приоритетов."),
    (1, dict(dopamine=7, serotonin=7, gaba=7, noradrenaline=6, cortisol=3, testosterone=6,
             pfc_activity=8, focus=8, energy=7, motivation=8),
     "Лучшее состояние за неделю: утренний фокус без отвлечений дал ощущение прогресса. "
     "Стоит закрепить привычку — первые часы дня под самую сложную задачу."),
]

TEMPLATES = [
    ("Утро", ["Стакан воды", "10 минут без телефона", "Записать три главные задачи дня"]),
    ("Глубокая работа", ["Телефон в другой комнате", "Один таймер на 90 минут", "Записать, что сделано"]),
]

TODAY_ITEMS = [
    ("Стакан воды", True),
    ("10 минут без телефона", True),
    ("Дописать тесты к синхронизации", False),
    ("Пробежка 30 минут", False),
    ("Лечь до полуночи", False),
]

CHAT = [
    ("user", "Почему после бессонной ночи я не могу ни на чём сосредоточиться?"),
    ("assistant", "Недосып бьёт по префронтальной коре — она отвечает за внимание и планирование. "
                  "Плюс растёт кортизол, и мозг держится в режиме тревоги. По твоей записи от прошлой "
                  "недели это хорошо видно: фокус 3 из 10. Помогают свет утром, короткая прогулка и "
                  "отказ от сложных задач в такой день."),
    ("user", "А что сделать, чтобы это не повторялось?"),
    ("assistant", "Судя по записям, лучшие дни у тебя после спорта и раннего отбоя. Предлагаю добавить в "
                  "чек-лист «Лечь до полуночи» и «Пробежка» — я уже вижу их в задачах на сегодня. "
                  "Через неделю сравним состояние."),
]


def demo_enabled() -> bool:
    return settings.demo_mode


def is_demo_user(user: User | None) -> bool:
    return user is not None and user.is_demo


# Песочницы создаются без пароля, поэтому ограничиваем частоту с одного адреса
_created: dict[str, deque] = defaultdict(deque)


def check_create_quota(client_ip: str, now: float | None = None) -> None:
    now = time.monotonic() if now is None else now
    calls = _created[client_ip]
    while calls and now - calls[0] > 3600:
        calls.popleft()
    if len(calls) >= settings.demo_sandboxes_per_ip_per_hour:
        raise HTTPException(status_code=429, detail="Слишком много демо-входов. Попробуйте позже.")
    calls.append(now)


# Все песочницы вместе тратят один платный ключ — общий лимит сверх личного
_demo_ai_calls: deque = deque()


def check_demo_ai_quota(user: User, now: float | None = None) -> None:
    if not is_demo_user(user):
        return
    now = time.monotonic() if now is None else now
    while _demo_ai_calls and now - _demo_ai_calls[0] > 3600:
        _demo_ai_calls.popleft()
    if len(_demo_ai_calls) >= settings.demo_ai_requests_per_hour:
        raise HTTPException(
            status_code=429,
            detail="Демо: лимит запросов к ассистенту на этот час исчерпан. "
                   "Попробуйте позже или запустите проект у себя.",
        )
    _demo_ai_calls.append(now)


async def create_demo_user() -> User:
    """Новый гость со своей копией демо-данных."""
    now = datetime.utcnow()
    user = User(
        email=f"guest-{uuid.uuid4().hex[:10]}@{DEMO_EMAIL_DOMAIN}",
        name="Гость",
        is_demo=True,
        demo_expires_at=now + timedelta(hours=settings.demo_ttl_hours),
    )
    await get_users_collection().insert_one(user.model_dump())
    await _seed_user(user.id, now)
    return user


async def _seed_user(user_id: str, now: datetime) -> None:
    enc = get_encryption()

    notes = []
    for days, title, content in NOTES:
        at = now - timedelta(days=days, hours=2)
        notes.append(enc.encrypt_note(Note(user_id=user_id, title=title, content=content,
                                           created_at=at, updated_at=at).model_dump()))
    await get_notes_collection().insert_many(notes)

    states = [
        enc.encrypt_state_record(StateRecord(
            user_id=user_id, metrics=StateMetrics(**metrics), analysis=analysis,
            created_at=now - timedelta(days=days, hours=1),
        ).model_dump())
        for days, metrics, analysis in STATES
    ]
    await get_states_collection().insert_many(states)

    templates = [ChecklistTemplate(user_id=user_id, name=name, items=items) for name, items in TEMPLATES]
    await get_templates_collection().insert_many(
        [enc.encrypt_checklist_template(t.model_dump()) for t in templates])

    # Дата чек-листа берётся на устройстве по местному времени — кладём соседние дни тоже
    checklists = []
    for offset in (-1, 0, 1):
        items = [ChecklistItem(text=text, completed=done) for text, done in TODAY_ITEMS]
        day = (now + timedelta(days=offset)).strftime("%Y-%m-%d")
        checklists.append(enc.encrypt_checklist(DailyChecklist(
            user_id=user_id, date=day, items=items, template_id=templates[0].id,
        ).model_dump()))
    await get_checklists_collection().insert_many(checklists)

    started = now - timedelta(days=2)
    messages = [ChatMessage(role=role, content=text, created_at=started + timedelta(minutes=i))
                for i, (role, text) in enumerate(CHAT)]
    session = ChatSession(user_id=user_id, title="Сон и концентрация", messages=messages,
                          created_at=started, updated_at=messages[-1].created_at)
    await get_chat_sessions_collection().insert_one(enc.encrypt_chat_session(session.model_dump()))


async def cleanup_expired_demo_users() -> int:
    """Удаляет песочницы с истёкшим сроком вместе со всеми их данными."""
    users = get_users_collection()
    expired = await users.find(
        {"is_demo": True, "demo_expires_at": {"$lt": datetime.utcnow()}}, {"id": 1}
    ).to_list(None)
    ids = [u["id"] for u in expired]
    if not ids:
        return 0
    for collection in (get_notes_collection(), get_states_collection(), get_templates_collection(),
                       get_checklists_collection(), get_chat_sessions_collection()):
        await collection.delete_many({"user_id": {"$in": ids}})
    await users.delete_many({"id": {"$in": ids}})
    logger.info("Удалено демо-песочниц: %s", len(ids))
    return len(ids)
