# Backend - Модульная архитектура

## 📁 Структура проекта

```
backend/
├── app/
│   ├── __init__.py
│   ├── main.py              # Точка входа FastAPI
│   ├── config.py            # Конфигурация приложения
│   ├── database.py          # Управление подключением к MongoDB
│   ├── models/              # Pydantic модели
│   │   ├── __init__.py
│   │   ├── user.py
│   │   ├── note.py
│   │   ├── checklist.py
│   │   ├── chat.py
│   │   └── state.py
│   ├── routes/              # API endpoints
│   │   ├── __init__.py
│   │   ├── auth.py
│   │   ├── notes.py
│   │   ├── checklists.py
│   │   ├── chat.py
│   │   └── state.py
│   └── services/            # Бизнес-логика
│       ├── __init__.py
│       ├── auth.py          # JWT, пароли, авторизация
│       ├── encryption.py    # Шифрование данных
│       └── ai.py            # OpenAI/LLM интеграция
├── .env                     # Переменные окружения
├── requirements.txt
└── Dockerfile
```

## 🚀 Запуск

### Разработка

```bash
# Из корня проекта
./start-backend.sh

# Или вручную
cd backend
python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### Production (Docker)

```bash
docker-compose up backend
```

## ⚙️ Конфигурация

Все настройки в `.env`:

```env
# MongoDB
MONGO_URL=mongodb://localhost:27017
DB_NAME=reflection_diary

# OpenAI / LLM API
OPENAI_API_KEY=your-key
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o

# JWT
JWT_SECRET=your-secret
JWT_ALGORITHM=HS256
JWT_EXPIRATION_DAYS=30

# Google OAuth
GOOGLE_CLIENT_ID=your-client-id

# Encryption
ENCRYPTION_KEY=your-encryption-key

# Server
HOST=0.0.0.0
PORT=8000
DEBUG=False
ALLOWED_ORIGINS=*
```

## 🔧 Основные изменения

### 1. **Модульная архитектура**
- Разделён монолитный `server.py` (1099 строк)
- Каждый модуль отвечает за свою область
- Легче тестировать и поддерживать

### 2. **Улучшенная обработка ошибок**
- Retry логика при подключении к MongoDB
- Graceful degradation если база недоступна
- HTTP 503 вместо краша при проблемах с БД

### 3. **Централизованная конфигурация**
- `pydantic-settings` для управления настройками
- Валидация переменных окружения
- Автоматическая загрузка из `.env`

### 4. **Dependency Injection**
- Использование `Depends()` для инжекции зависимостей
- Единая точка доступа к БД и сервисам
- Упрощённое тестирование

## 🧪 Тестирование

```bash
# Установка зависимостей для тестов
pip install -r tests/requirements.txt

# Запуск тестов
pytest tests/

# С покрытием
pytest tests/ --cov=app
```

## 📊 API Documentation

После запуска доступна автоматическая документация:
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

## 🔍 Health Check

```bash
curl http://localhost:8000/health
```

Ответ:
```json
{
  "status": "healthy",
  "database": "connected",
  "version": "2.0.0"
}
```

## 🐛 Troubleshooting

### ModuleNotFoundError: No module named 'pydantic_settings'

```bash
pip install pydantic-settings
```

### MongoDB connection refused

Убедитесь, что MongoDB запущен:
```bash
# macOS (Homebrew)
brew services start mongodb-community

# Linux
sudo systemctl start mongod

# Docker
docker-compose up mongodb
```

### Port 8000 already in use

```bash
lsof -ti:8000 | xargs kill -9
```

## 📝 Миграция со старой структуры

Старый импорт:
```python
from server import app, User, Note
```

Новый импорт:
```python
from app.main import app
from app.models import User, Note
from app.services import get_encryption, get_ai_service
```

Точка входа изменена:
```bash
# Старый способ
uvicorn server:app

# Новый способ
uvicorn app.main:app
```
