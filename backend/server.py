from fastapi import FastAPI, APIRouter, HTTPException, Depends, Header
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional
import uuid
from datetime import datetime, timedelta
import httpx
from jose import jwt, JWTError
from passlib.context import CryptContext
import re
from encryption import init_encryption, get_encryption

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# OpenAI API configuration
OPENAI_API_KEY = os.environ.get('OPENAI_API_KEY', '')
OPENAI_BASE_URL = os.environ.get('OPENAI_BASE_URL', 'https://www.api.xcmfai.com/v1')

# JWT Configuration
JWT_SECRET = os.environ.get('JWT_SECRET', 'your-super-secret-key-change-in-production')
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_DAYS = 30

# Google OAuth Configuration
GOOGLE_CLIENT_ID = os.environ.get('GOOGLE_CLIENT_ID', '')

# Encryption Configuration
ENCRYPTION_KEY = os.environ.get('ENCRYPTION_KEY', 'default-encryption-key-change-in-production')
init_encryption(ENCRYPTION_KEY)

# Security
security = HTTPBearer(auto_error=False)

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Create the main app
app = FastAPI()
api_router = APIRouter(prefix="/api")

# Configure logging
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("server")
logger.setLevel(logging.DEBUG)

# Log configuration on startup
logger.info(f"OPENAI_BASE_URL: {OPENAI_BASE_URL}")
logger.info(f"OPENAI_API_KEY configured: {'Yes' if OPENAI_API_KEY else 'No'}")
logger.info(f"OPENAI_API_KEY length: {len(OPENAI_API_KEY)}")

# ============ MODELS ============

# User Models
class User(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    email: str
    name: str
    picture: Optional[str] = None
    google_id: Optional[str] = None  # Опционально для email/password пользователей
    password_hash: Optional[str] = None  # Для email/password авторизации
    created_at: datetime = Field(default_factory=datetime.utcnow)
    last_login: datetime = Field(default_factory=datetime.utcnow)

class GoogleAuthRequest(BaseModel):
    id_token: str

class EmailRegisterRequest(BaseModel):
    email: str
    password: str
    name: str

class EmailLoginRequest(BaseModel):
    email: str
    password: str

class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict

# Note Models
class NoteBase(BaseModel):
    title: str
    content: str

class NoteCreate(NoteBase):
    pass

class NoteUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None

class Note(NoteBase):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

# Checklist Models
class ChecklistItem(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    text: str
    completed: bool = False

class ChecklistTemplateCreate(BaseModel):
    name: str
    items: List[str]

class ChecklistTemplate(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    name: str
    items: List[str]
    created_at: datetime = Field(default_factory=datetime.utcnow)

class DailyChecklistCreate(BaseModel):
    date: str  # YYYY-MM-DD format
    items: List[ChecklistItem]
    template_id: Optional[str] = None

class DailyChecklist(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    date: str
    items: List[ChecklistItem]
    template_id: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

# Chat Models
class ChatMessage(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    role: str  # 'user' or 'assistant'
    content: str
    created_at: datetime = Field(default_factory=datetime.utcnow)

class ChatSession(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    title: str = "Новый диалог"
    messages: List[ChatMessage] = []
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class ChatSessionCreate(BaseModel):
    title: Optional[str] = "Новый диалог"

class ChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = None  # ID сессии чата
    history: List[dict] = []
    update_state: bool = False  # Флаг для обновления состояния

# State Models (Нейромедиаторы и когнитивные показатели)
class StateMetrics(BaseModel):
    # Нейромедиаторы (0-10)
    dopamine: float = 5.0
    serotonin: float = 5.0
    gaba: float = 5.0
    noradrenaline: float = 5.0
    cortisol: float = 5.0
    testosterone: float = 5.0
    # Когнитивные (0-10)
    pfc_activity: float = 5.0  # Префронтальная кора
    focus: float = 5.0
    energy: float = 5.0
    motivation: float = 5.0

class StateRecord(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    metrics: StateMetrics
    analysis: str = ""  # AI анализ состояния
    created_at: datetime = Field(default_factory=datetime.utcnow)

class ChecklistSuggestion(BaseModel):
    items: List[str]
    reasoning: str

class SummaryRequest(BaseModel):
    session_id: str
    source_session_id: str
    is_ai_generated: bool = True

# ============ ENCRYPTION HELPERS ============

def encrypt_note(note_dict: dict) -> dict:
    """Шифрует чувствительные поля заметки перед сохранением в БД"""
    enc = get_encryption()
    return enc.encrypt_dict(note_dict, ['title', 'content'])

def decrypt_note(note_dict: dict) -> dict:
    """Расшифровывает чувствительные поля заметки после чтения из БД"""
    enc = get_encryption()
    return enc.decrypt_dict(note_dict, ['title', 'content'])

def encrypt_checklist_template(template_dict: dict) -> dict:
    """Шифрует чувствительные поля шаблона чеклиста"""
    enc = get_encryption()
    encrypted = template_dict.copy()
    if 'name' in encrypted:
        encrypted['name'] = enc.encrypt(encrypted['name'])
    if 'items' in encrypted and encrypted['items']:
        encrypted['items'] = [enc.encrypt(item) for item in encrypted['items']]
    return encrypted

def decrypt_checklist_template(template_dict: dict) -> dict:
    """Расшифровывает чувствительные поля шаблона чеклиста"""
    enc = get_encryption()
    decrypted = template_dict.copy()
    if 'name' in decrypted:
        decrypted['name'] = enc.decrypt(decrypted['name'])
    if 'items' in decrypted and decrypted['items']:
        decrypted['items'] = [enc.decrypt(item) for item in decrypted['items']]
    return decrypted

def encrypt_checklist(checklist_dict: dict) -> dict:
    """Шифрует чувствительные поля дневного чеклиста"""
    enc = get_encryption()
    encrypted = checklist_dict.copy()
    if 'items' in encrypted and encrypted['items']:
        encrypted['items'] = [
            {**item, 'text': enc.encrypt(item['text'])} if 'text' in item else item
            for item in encrypted['items']
        ]
    return encrypted

def decrypt_checklist(checklist_dict: dict) -> dict:
    """Расшифровывает чувствительные поля дневного чеклиста"""
    enc = get_encryption()
    decrypted = checklist_dict.copy()
    if 'items' in decrypted and decrypted['items']:
        decrypted['items'] = [
            {**item, 'text': enc.decrypt(item['text'])} if 'text' in item else item
            for item in decrypted['items']
        ]
    return decrypted

def encrypt_chat_session(session_dict: dict) -> dict:
    """Шифрует чувствительные поля сессии чата"""
    enc = get_encryption()
    encrypted = session_dict.copy()
    if 'title' in encrypted:
        encrypted['title'] = enc.encrypt(encrypted['title'])
    if 'messages' in encrypted and encrypted['messages']:
        encrypted['messages'] = [
            {**msg, 'content': enc.encrypt(msg['content'])} if 'content' in msg else msg
            for msg in encrypted['messages']
        ]
    return encrypted

def decrypt_chat_session(session_dict: dict) -> dict:
    """Расшифровывает чувствительные поля сессии чата"""
    enc = get_encryption()
    decrypted = session_dict.copy()
    if 'title' in decrypted:
        decrypted['title'] = enc.decrypt(decrypted['title'])
    if 'messages' in decrypted and decrypted['messages']:
        decrypted['messages'] = [
            {**msg, 'content': enc.decrypt(msg['content'])} if 'content' in msg else msg
            for msg in decrypted['messages']
        ]
    return decrypted

def encrypt_state_record(state_dict: dict) -> dict:
    """Шифрует чувствительные поля записи состояния"""
    enc = get_encryption()
    return enc.encrypt_dict(state_dict, ['analysis'])

def decrypt_state_record(state_dict: dict) -> dict:
    """Расшифровывает чувствительные поля записи состояния"""
    enc = get_encryption()
    return enc.decrypt_dict(state_dict, ['analysis'])

# ============ AUTH HELPERS ============


class AISummaryNote(BaseModel):
    title: str
    content: str
    source_session_id: str
    is_ai_generated: bool = True

# ============ AUTH HELPERS ============

def create_access_token(user_id: str, email: str) -> str:
    """Создать JWT токен"""
    expire = datetime.utcnow() + timedelta(days=JWT_EXPIRATION_DAYS)
    to_encode = {
        "sub": user_id,
        "email": email,
        "exp": expire
    }
    return jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGORITHM)

async def verify_google_token(id_token: str) -> dict:
    """Верифицировать Google ID токен"""
    try:
        # Верификация через Google API
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"https://oauth2.googleapis.com/tokeninfo?id_token={id_token}"
            )
            if response.status_code != 200:
                raise HTTPException(status_code=401, detail="Invalid Google token")
            
            token_info = response.json()
            
            # Логируем для отладки
            logger.info(f"Token aud: {token_info.get('aud')}")
            logger.info(f"Expected GOOGLE_CLIENT_ID: {GOOGLE_CLIENT_ID}")
            
            # Проверяем audience (client_id)
            if GOOGLE_CLIENT_ID and token_info.get("aud") != GOOGLE_CLIENT_ID:
                raise HTTPException(status_code=401, detail="Token was not issued for this app")
            
            return token_info
    except httpx.RequestError as e:
        logger.error(f"Google token verification error: {e}")
        raise HTTPException(status_code=401, detail="Failed to verify Google token")

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> Optional[User]:
    """Получить текущего пользователя из JWT токена"""
    if not credentials:
        return None
    
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("sub")
        if not user_id:
            return None
        
        user_data = await db.users.find_one({"id": user_id})
        if not user_data:
            return None
        
        return User(**user_data)
    except JWTError:
        return None

async def require_auth(credentials: HTTPAuthorizationCredentials = Depends(security)) -> User:
    """Требовать авторизацию"""
    if not credentials:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")
        
        user_data = await db.users.find_one({"id": user_id})
        if not user_data:
            raise HTTPException(status_code=401, detail="User not found")
        
        return User(**user_data)
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

# ============ AUTH ENDPOINTS ============

@api_router.post("/auth/google", response_model=AuthResponse)
async def google_auth(request: GoogleAuthRequest):
    """Авторизация через Google"""
    # Верифицируем токен Google
    token_info = await verify_google_token(request.id_token)
    
    google_id = token_info.get("sub")
    email = token_info.get("email")
    name = token_info.get("name", email.split("@")[0])
    picture = token_info.get("picture")
    
    # Ищем или создаём пользователя
    existing_user = await db.users.find_one({"google_id": google_id})
    
    if existing_user:
        # Обновляем last_login
        await db.users.update_one(
            {"google_id": google_id},
            {"$set": {"last_login": datetime.utcnow(), "name": name, "picture": picture}}
        )
        user = User(**existing_user)
        user.last_login = datetime.utcnow()
    else:
        # Создаём нового пользователя
        user = User(
            email=email,
            name=name,
            picture=picture,
            google_id=google_id
        )
        await db.users.insert_one(user.model_dump())
    
    # Создаём JWT токен
    access_token = create_access_token(user.id, user.email)
    
    return AuthResponse(
        access_token=access_token,
        user={
            "id": user.id,
            "email": user.email,
            "name": user.name,
            "picture": user.picture
        }
    )

@api_router.get("/auth/me")
async def get_me(user: User = Depends(require_auth)):
    """Получить информацию о текущем пользователе"""
    return {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "picture": user.picture
    }

@api_router.post("/auth/logout")
async def logout():
    """Выход (на клиенте нужно удалить токен)"""
    return {"message": "Logged out successfully"}

@api_router.post("/auth/register", response_model=AuthResponse)
async def register_with_email(request: EmailRegisterRequest):
    """Регистрация по email/пароль"""
    # Валидация email
    email_regex = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    if not re.match(email_regex, request.email):
        raise HTTPException(status_code=400, detail="Неверный формат email")
    
    # Валидация пароля
    if len(request.password) < 6:
        raise HTTPException(status_code=400, detail="Пароль должен быть минимум 6 символов")
    
    # Проверяем, не занят ли email
    existing_user = await db.users.find_one({"email": request.email.lower()})
    if existing_user:
        raise HTTPException(status_code=400, detail="Пользователь с таким email уже существует")
    
    # Хешируем пароль и создаём пользователя
    password_hash = pwd_context.hash(request.password)
    
    user = User(
        email=request.email.lower(),
        name=request.name,
        password_hash=password_hash
    )
    await db.users.insert_one(user.model_dump())
    
    # Создаём JWT токен
    access_token = create_access_token(user.id, user.email)
    
    return AuthResponse(
        access_token=access_token,
        user={
            "id": user.id,
            "email": user.email,
            "name": user.name,
            "picture": user.picture
        }
    )

@api_router.post("/auth/login", response_model=AuthResponse)
async def login_with_email(request: EmailLoginRequest):
    """Вход по email/пароль"""
    # Ищем пользователя
    user_data = await db.users.find_one({"email": request.email.lower()})
    
    if not user_data:
        raise HTTPException(status_code=401, detail="Неверный email или пароль")
    
    # Проверяем, что у пользователя есть пароль (не Google-only аккаунт)
    if not user_data.get("password_hash"):
        raise HTTPException(
            status_code=401,
            detail="Этот аккаунт использует вход через Google"
        )
    
    # Проверяем пароль
    if not pwd_context.verify(request.password, user_data["password_hash"]):
        raise HTTPException(status_code=401, detail="Неверный email или пароль")
    
    # Обновляем last_login
    await db.users.update_one(
        {"email": request.email.lower()},
        {"$set": {"last_login": datetime.utcnow()}}
    )
    
    user = User(**user_data)
    # Создаём JWT токен
    access_token = create_access_token(user.id, user.email)
    
    return AuthResponse(
        access_token=access_token,
        user={
            "id": user.id,
            "email": user.email,
            "name": user.name,
            "picture": user.picture
        }
    )

# ============ NOTE ENDPOINTS ============

@api_router.post("/notes", response_model=Note)
async def create_note(note: NoteCreate, user: User = Depends(require_auth)):
    note_obj = Note(**note.model_dump(), user_id=user.id)
    # Шифруем перед сохранением в БД
    encrypted_data = encrypt_note(note_obj.model_dump())
    await db.notes.insert_one(encrypted_data)
    return note_obj

@api_router.get("/notes", response_model=List[Note])
async def get_notes(user: User = Depends(require_auth)):
    notes = await db.notes.find({"user_id": user.id}).sort("updated_at", -1).to_list(1000)
    # Расшифровываем после чтения из БД
    return [Note(**decrypt_note(note)) for note in notes]

@api_router.get("/notes/{note_id}", response_model=Note)
async def get_note(note_id: str, user: User = Depends(require_auth)):
    note = await db.notes.find_one({"id": note_id, "user_id": user.id})
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    # Расшифровываем после чтения из БД
    return Note(**decrypt_note(note))

@api_router.put("/notes/{note_id}", response_model=Note)
async def update_note(note_id: str, note_update: NoteUpdate, user: User = Depends(require_auth)):
    note = await db.notes.find_one({"id": note_id, "user_id": user.id})
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    
    update_data = {k: v for k, v in note_update.model_dump().items() if v is not None}
    update_data["updated_at"] = datetime.utcnow()
    # Шифруем обновлённые поля
    encrypted_update = encrypt_note(update_data)
    
    await db.notes.update_one({"id": note_id, "user_id": user.id}, {"$set": encrypted_update})
    updated_note = await db.notes.find_one({"id": note_id, "user_id": user.id})
    # Расшифровываем после чтения
    return Note(**decrypt_note(updated_note))

@api_router.delete("/notes/{note_id}")
async def delete_note(note_id: str, user: User = Depends(require_auth)):
    result = await db.notes.delete_one({"id": note_id, "user_id": user.id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Note not found")
    return {"message": "Note deleted successfully"}

# ============ CHECKLIST TEMPLATE ENDPOINTS ============

@api_router.post("/templates", response_model=ChecklistTemplate)
async def create_template(template: ChecklistTemplateCreate, user: User = Depends(require_auth)):
    template_obj = ChecklistTemplate(**template.model_dump(), user_id=user.id)
    # Шифруем перед сохранением
    encrypted_data = encrypt_checklist_template(template_obj.model_dump())
    await db.templates.insert_one(encrypted_data)
    return template_obj

@api_router.get("/templates", response_model=List[ChecklistTemplate])
async def get_templates(user: User = Depends(require_auth)):
    templates = await db.templates.find({"user_id": user.id}).to_list(100)
    # Расшифровываем после чтения
    return [ChecklistTemplate(**decrypt_checklist_template(t)) for t in templates]

@api_router.delete("/templates/{template_id}")
async def delete_template(template_id: str, user: User = Depends(require_auth)):
    result = await db.templates.delete_one({"id": template_id, "user_id": user.id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Template not found")
    return {"message": "Template deleted successfully"}

# ============ DAILY CHECKLIST ENDPOINTS ============

@api_router.post("/checklists", response_model=DailyChecklist)
async def create_or_update_daily_checklist(checklist: DailyChecklistCreate, user: User = Depends(require_auth)):
    # Check if checklist for this date exists
    existing = await db.checklists.find_one({"date": checklist.date, "user_id": user.id})
    
    if existing:
        # Update existing
        items_dict = [item.model_dump() for item in checklist.items]
        # Шифруем items
        encrypted_items = encrypt_checklist({"items": items_dict})["items"]
        await db.checklists.update_one(
            {"date": checklist.date, "user_id": user.id},
            {"$set": {"items": encrypted_items}}
        )
        updated = await db.checklists.find_one({"date": checklist.date, "user_id": user.id})
        # Расшифровываем перед возвратом
        return DailyChecklist(**decrypt_checklist(updated))
    else:
        # Create new
        checklist_obj = DailyChecklist(**checklist.model_dump(), user_id=user.id)
        checklist_dict = checklist_obj.model_dump()
        checklist_dict["items"] = [item.model_dump() for item in checklist_obj.items]
        # Шифруем перед сохранением
        encrypted_data = encrypt_checklist(checklist_dict)
        await db.checklists.insert_one(encrypted_data)
        return checklist_obj

@api_router.get("/checklists/{date}", response_model=Optional[DailyChecklist])
async def get_daily_checklist(date: str, user: User = Depends(require_auth)):
    checklist = await db.checklists.find_one({"date": date, "user_id": user.id})
    if not checklist:
        return None
    # Расшифровываем перед возвратом
    return DailyChecklist(**decrypt_checklist(checklist))

@api_router.put("/checklists/{date}/items/{item_id}")
async def toggle_checklist_item(date: str, item_id: str, user: User = Depends(require_auth)):
    checklist = await db.checklists.find_one({"date": date, "user_id": user.id})
    if not checklist:
        raise HTTPException(status_code=404, detail="Checklist not found")
    
    # Items уже зашифрованы в БД, просто меняем completed без расшифровки
    items = checklist.get("items", [])
    for item in items:
        if item["id"] == item_id:
            item["completed"] = not item["completed"]
            break
    
    # Сохраняем обратно (text остаётся зашифрованным)
    await db.checklists.update_one({"date": date, "user_id": user.id}, {"$set": {"items": items}})
    return {"message": "Item toggled"}

# ============ AI CHAT ENDPOINT ============

STATE_ANALYSIS_PROMPT = """Проанализируй записи и оцени текущее психофизиологическое состояние.

Верни JSON в формате:
{
    "metrics": {
        "dopamine": 0-10,
        "serotonin": 0-10,
        "gaba": 0-10,
        "noradrenaline": 0-10,
        "cortisol": 0-10,
        "testosterone": 0-10,
        "pfc_activity": 0-10,
        "focus": 0-10,
        "energy": 0-10,
        "motivation": 0-10
    },
    "analysis": "Краткий анализ состояния (2-3 предложения)"
}

ВАЖНО: В поле "analysis" пиши обращаясь напрямую к человеку на "ты", как будто разговариваешь с ним лично.
НЕ пиши в третьем лице ("пользователь", "он/она").
Пример правильного стиля: "Ты недоспал и чувствуешь усталость, но при этом сохраняешь позитивный настрой..."

Описание метрик:
- dopamine: удовольствие, награда, мотивация к действию
- serotonin: настроение, спокойствие, удовлетворённость
- gaba: расслабление, снижение тревоги
- noradrenaline: бдительность, концентрация, стресс-реакция
- cortisol: уровень стресса (высокий = плохо)
- testosterone: уверенность, энергия, доминантность
- pfc_activity: активность префронтальной коры, самоконтроль
- focus: способность концентрироваться
- energy: общий уровень энергии
- motivation: желание действовать

Оценивай на основе того, что человек рассказывает о своём состоянии, настроении, делах."""

CHECKLIST_SUGGESTION_PROMPT = """На основе диалога с пользователем, предложи задачи которые могут быть полезны.

Верни JSON:
{
    "items": ["задача 1", "задача 2", ...],
    "reasoning": "Почему эти задачи могут помочь (1-2 предложения)"
}

Предлагай только релевантные задачи, максимум 5 штук."""

async def call_openai_chat(messages: List[dict], model: str = "claude-sonnet-4-5-20250929") -> str:
    """Вызов OpenAI-совместимого API"""
    logger.debug(f"call_openai_chat called with model: {model}")
    logger.debug(f"Messages count: {len(messages)}")
    
    if not OPENAI_API_KEY:
        logger.error("OpenAI API key not configured")
        raise HTTPException(status_code=503, detail="OpenAI API key not configured")
    
    url = f"{OPENAI_BASE_URL}/chat/completions"
    logger.debug(f"Calling API: {url}")
    
    try:
        async with httpx.AsyncClient(timeout=60.0) as http_client:
            request_body = {
                "model": model,
                "messages": messages
            }
            logger.debug(f"Request body: {request_body}")
            
            response = await http_client.post(
                url,
                headers={
                    "Authorization": f"Bearer {OPENAI_API_KEY}",
                    "Content-Type": "application/json"
                },
                json=request_body
            )
            
            logger.debug(f"Response status: {response.status_code}")
            logger.debug(f"Response headers: {dict(response.headers)}")
            
            if response.status_code != 200:
                logger.error(f"API error response: {response.text}")
                response.raise_for_status()
            
            data = response.json()
            logger.debug(f"Response data keys: {data.keys()}")
            
            content = data["choices"][0]["message"]["content"]
            logger.debug(f"Response content length: {len(content)}")
            return content
            
    except httpx.HTTPStatusError as e:
        logger.error(f"HTTP error: {e.response.status_code} - {e.response.text}")
        raise
    except httpx.RequestError as e:
        logger.error(f"Request error: {type(e).__name__} - {str(e)}")
        raise
    except Exception as e:
        logger.error(f"Unexpected error in call_openai_chat: {type(e).__name__} - {str(e)}")
        raise

@api_router.post("/chat")
async def chat_with_ai(request: ChatRequest, user: User = Depends(require_auth)):
    try:
        import json
        
        # Формируем сообщения для API
        messages = [
            {"role": "system", "content": """Ты - помощник для рефлексии и самоанализа. Помогай пользователю размышлять о своих мыслях, чувствах и опыте. Отвечай на русском языке, будь эмпатичным и поддерживающим. Задавай наводящие вопросы для глубокой рефлексии. Будь кратким но содержательным.

Если пользователь спрашивает что делать или просит задачи - можешь предложить добавить их в чеклист. В этом случае добавь в конце ответа специальный маркер [SUGGEST_CHECKLIST] чтобы система предложила пользователю создать чеклист.

Если пользователь просит оценить состояние - можешь проанализировать его нейромедиаторы."""}
        ]
        
        # Добавляем историю
        for msg in request.history:
            messages.append({"role": msg["role"], "content": msg["content"]})
        
        # Добавляем текущее сообщение
        messages.append({"role": "user", "content": request.message})
        
        # Отправляем запрос
        response = await call_openai_chat(messages)
        
        # Проверяем наличие маркера для предложения чеклиста
        suggest_checklist = "[SUGGEST_CHECKLIST]" in response
        clean_response = response.replace("[SUGGEST_CHECKLIST]", "").strip()
        
        result = {
            "response": clean_response,
            "suggest_checklist": suggest_checklist
        }
        
        # Сохраняем сообщения в сессию если указан session_id
        if request.session_id:
            user_msg = ChatMessage(role="user", content=request.message)
            assistant_msg = ChatMessage(role="assistant", content=clean_response)
            
            # Шифруем сообщения перед сохранением
            enc = get_encryption()
            encrypted_user_msg = user_msg.model_dump()
            encrypted_user_msg['content'] = enc.encrypt(encrypted_user_msg['content'])
            encrypted_assistant_msg = assistant_msg.model_dump()
            encrypted_assistant_msg['content'] = enc.encrypt(encrypted_assistant_msg['content'])
            
            await db.chat_sessions.update_one(
                {"id": request.session_id},
                {
                    "$push": {"messages": {"$each": [encrypted_user_msg, encrypted_assistant_msg]}},
                    "$set": {"updated_at": datetime.utcnow()}
                }
            )
        
        # Если запрошено обновление состояния
        if request.update_state:
            try:
                state_messages = [
                    {"role": "system", "content": STATE_ANALYSIS_PROMPT}
                ]
                for msg in request.history:
                    state_messages.append({"role": msg["role"], "content": msg["content"]})
                state_messages.append({"role": "user", "content": f"Последнее сообщение пользователя: {request.message}\n\nПроанализируй состояние и верни JSON."})
                
                state_response = await call_openai_chat(state_messages)
                
                # Парсим JSON из ответа
                try:
                    # Ищем JSON в ответе
                    json_start = state_response.find('{')
                    json_end = state_response.rfind('}') + 1
                    if json_start != -1 and json_end > json_start:
                        state_data = json.loads(state_response[json_start:json_end])
                        
                        # Сохраняем в базу
                        state_record = StateRecord(
                            user_id=user.id,
                            metrics=StateMetrics(**state_data.get("metrics", {})),
                            analysis=state_data.get("analysis", "")
                        )
                        # Шифруем перед сохранением
                        encrypted_state = encrypt_state_record(state_record.model_dump())
                        await db.states.insert_one(encrypted_state)
                        result["state_updated"] = True
                        result["state"] = state_record.model_dump()
                except json.JSONDecodeError:
                    logger.error(f"Failed to parse state JSON: {state_response}")
            except Exception as e:
                logger.error(f"State analysis error: {str(e)}")
        
        return result
            
    except Exception as e:
        logger.error(f"Chat error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# ============ CHAT SESSION ENDPOINTS ============

@api_router.post("/chat/sessions", response_model=ChatSession)
async def create_chat_session(user: User = Depends(require_auth), session: ChatSessionCreate = None):
    """Создать новую сессию чата"""
    session_obj = ChatSession(
        user_id=user.id,
        title=session.title if session and session.title else "Новый диалог"
    )
    # Шифруем перед сохранением
    encrypted_session = encrypt_chat_session(session_obj.model_dump())
    await db.chat_sessions.insert_one(encrypted_session)
    return session_obj

@api_router.get("/chat/sessions", response_model=List[ChatSession])
async def get_chat_sessions(user: User = Depends(require_auth), limit: int = 50):
    """Получить список сессий чата"""
    sessions = await db.chat_sessions.find({"user_id": user.id}).sort("updated_at", -1).limit(limit).to_list(limit)
    # Расшифровываем перед отправкой клиенту
    return [ChatSession(**decrypt_chat_session(s)) for s in sessions]

@api_router.get("/chat/sessions/{session_id}", response_model=ChatSession)
async def get_chat_session(session_id: str, user: User = Depends(require_auth)):
    """Получить сессию чата по ID"""
    session = await db.chat_sessions.find_one({"id": session_id, "user_id": user.id})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    # Расшифровываем перед отправкой клиенту
    return ChatSession(**decrypt_chat_session(session))

@api_router.put("/chat/sessions/{session_id}/title")
async def update_session_title(session_id: str, title: str, user: User = Depends(require_auth)):
    """Обновить название сессии"""
    # Шифруем title перед сохранением
    enc = get_encryption()
    encrypted_title = enc.encrypt(title)
    result = await db.chat_sessions.update_one(
        {"id": session_id, "user_id": user.id},
        {"$set": {"title": encrypted_title, "updated_at": datetime.utcnow()}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"message": "Title updated"}

@api_router.delete("/chat/sessions/{session_id}")
async def delete_chat_session(session_id: str, user: User = Depends(require_auth)):
    """Удалить сессию чата"""
    result = await db.chat_sessions.delete_one({"id": session_id, "user_id": user.id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"message": "Session deleted"}

@api_router.post("/chat/sessions/{session_id}/summary")
async def create_summary_from_session(session_id: str, user: User = Depends(require_auth)):
    """Создать выжимку (записку) на основе диалога"""
    import json
    
    session = await db.chat_sessions.find_one({"id": session_id, "user_id": user.id})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    # Расшифровываем перед обработкой
    decrypted_session = decrypt_chat_session(session)
    session_obj = ChatSession(**decrypted_session)
    
    if len(session_obj.messages) < 2:
        raise HTTPException(status_code=400, detail="Not enough messages for summary")
    
    # Формируем текст диалога (уже расшифрованный)
    dialog_text = "\n".join([
        f"{'Пользователь' if m.role == 'user' else 'Ассистент'}: {m.content}"
        for m in session_obj.messages
    ])
    
    summary_prompt = """На основе диалога создай краткую выжимку - записку с ключевыми мыслями и инсайтами.

Верни JSON:
{
    "title": "Краткий заголовок (3-5 слов)",
    "content": "Структурированная выжимка с ключевыми мыслями, инсайтами и выводами из диалога. Используй маркированные списки где уместно."
}

Пиши от первого лица, как будто это личная записка пользователя."""

    messages = [
        {"role": "system", "content": summary_prompt},
        {"role": "user", "content": f"Диалог:\n{dialog_text}\n\nСоздай выжимку и верни JSON."}
    ]
    
    try:
        response = await call_openai_chat(messages)
        
        json_start = response.find('{')
        json_end = response.rfind('}') + 1
        if json_start != -1 and json_end > json_start:
            summary_data = json.loads(response[json_start:json_end])
            
            # Создаём записку с пометкой AI
            note_content = f"🤖 AI-выжимка из диалога\n\n{summary_data.get('content', '')}"
            
            note_obj = Note(
                user_id=user.id,
                title=f"✨ {summary_data.get('title', 'Выжимка из диалога')}",
                content=note_content
            )
            # Шифруем перед сохранением
            encrypted_note = encrypt_note(note_obj.model_dump())
            await db.notes.insert_one(encrypted_note)
            
            return {
                "note": note_obj.model_dump(),
                "message": "Выжимка создана и сохранена в записки"
            }
        else:
            raise HTTPException(status_code=500, detail="Failed to parse AI response")
            
    except json.JSONDecodeError as e:
        logger.error(f"JSON decode error in summary: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to create summary")

@api_router.post("/chat/suggest-tasks")
async def suggest_tasks(request: ChatRequest, user: User = Depends(require_auth)):
    """Получить предложения задач на основе диалога"""
    try:
        import json
        
        messages = [
            {"role": "system", "content": CHECKLIST_SUGGESTION_PROMPT}
        ]
        for msg in request.history:
            messages.append({"role": msg["role"], "content": msg["content"]})
        messages.append({"role": "user", "content": f"Последнее сообщение: {request.message}\n\nПредложи задачи и верни JSON."})
        
        response = await call_openai_chat(messages)
        
        try:
            json_start = response.find('{')
            json_end = response.rfind('}') + 1
            if json_start != -1 and json_end > json_start:
                data = json.loads(response[json_start:json_end])
                return data
        except json.JSONDecodeError:
            pass
        
        return {"items": [], "reasoning": "Не удалось сгенерировать предложения"}
        
    except Exception as e:
        logger.error(f"Suggest tasks error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# ============ STATE ENDPOINTS ============

@api_router.get("/states")
async def get_states(user: User = Depends(require_auth), limit: int = 30):
    """Получить историю состояний"""
    states = await db.states.find({"user_id": user.id}).sort("created_at", -1).limit(limit).to_list(limit)
    # Расшифровываем перед отправкой клиенту
    return [StateRecord(**decrypt_state_record(s)) for s in states]

@api_router.get("/states/latest")
async def get_latest_state(user: User = Depends(require_auth)):
    """Получить последнее состояние"""
    state = await db.states.find_one({"user_id": user.id}, sort=[("created_at", -1)])
    if state:
        # Расшифровываем перед отправкой клиенту
        return StateRecord(**decrypt_state_record(state))
    return None

@api_router.post("/states/analyze")
async def analyze_state_from_notes(user: User = Depends(require_auth)):
    """Проанализировать состояние на основе последних записей"""
    logger.info("analyze_state_from_notes called")
    
    try:
        import json
        import traceback
        
        # Получаем последние записи ТОЛЬКО ТЕКУЩЕГО ПОЛЬЗОВАТЕЛЯ
        logger.debug("Fetching notes from database...")
        notes = await db.notes.find({"user_id": user.id}).sort("created_at", -1).limit(5).to_list(5)
        logger.info(f"Found {len(notes)} notes")
        
        if not notes:
            logger.warning("No notes found for analysis")
            raise HTTPException(status_code=400, detail="No notes found for analysis")
        
        # Расшифровываем заметки перед отправкой в AI
        decrypted_notes = [decrypt_note(n) for n in notes]
        notes_text = "\n\n".join([f"**{n['title']}**\n{n['content']}" for n in decrypted_notes])
        logger.debug(f"Notes text length: {len(notes_text)}")
        
        messages = [
            {"role": "system", "content": STATE_ANALYSIS_PROMPT},
            {"role": "user", "content": f"Записи пользователя:\n{notes_text}\n\nПроанализируй состояние и верни JSON."}
        ]
        
        logger.info("Calling OpenAI API for state analysis...")
        response = await call_openai_chat(messages)
        logger.info(f"Got response, length: {len(response)}")
        logger.debug(f"Response content: {response[:500]}...")
        
        try:
            json_start = response.find('{')
            json_end = response.rfind('}') + 1
            logger.debug(f"JSON boundaries: start={json_start}, end={json_end}")
            
            if json_start != -1 and json_end > json_start:
                json_str = response[json_start:json_end]
                logger.debug(f"Extracted JSON: {json_str[:200]}...")
                
                state_data = json.loads(json_str)
                logger.info(f"Parsed state data: {state_data.keys()}")
                
                state_record = StateRecord(
                    user_id=user.id,
                    metrics=StateMetrics(**state_data.get("metrics", {})),
                    analysis=state_data.get("analysis", "")
                )
                logger.debug(f"Created StateRecord: {state_record.id}")
                
                # Шифруем перед сохранением
                encrypted_state = encrypt_state_record(state_record.model_dump())
                await db.states.insert_one(encrypted_state)
                logger.info(f"Saved state record to database: {state_record.id}")
                
                return state_record
            else:
                logger.error(f"No JSON found in response: {response}")
                raise HTTPException(status_code=500, detail="No JSON found in AI response")
                
        except json.JSONDecodeError as e:
            logger.error(f"JSON decode error: {str(e)}")
            logger.error(f"Failed to parse: {response}")
            raise HTTPException(status_code=500, detail=f"Failed to parse AI response: {str(e)}")
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Analyze state error: {type(e).__name__} - {str(e)}")
        logger.error(f"Traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"{type(e).__name__}: {str(e)}")

# ============ HEALTH CHECK ============

@api_router.get("/")
async def root():
    return {"message": "Reflection Diary API", "status": "running"}

# Include router
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
