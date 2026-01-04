# Nous - Пространство для мыслей

Приложение для рефлексии и самоанализа с AI-ассистентом.

## Технологии

- **Frontend**: React Native (Expo) + TypeScript
- **Backend**: FastAPI + Python
- **База данных**: MongoDB
- **Авторизация**: Google OAuth 2.0

## Быстрый старт

### 1. Настройка Google OAuth (обязательно)

Для работы авторизации нужно создать проект в Google Cloud Console:

1. Перейдите на [Google Cloud Console](https://console.cloud.google.com/)
2. Создайте новый проект или выберите существующий
3. Перейдите в **APIs & Services** → **Credentials**
4. Нажмите **Create Credentials** → **OAuth client ID**
5. Выберите тип приложения:
   - Для веб-версии: **Web application**
   - Добавьте в **Authorized JavaScript origins**:
     - `http://localhost:8081` (для разработки)
     - `http://localhost:19006` (для Expo web)
   - Добавьте в **Authorized redirect URIs**:
     - `https://auth.expo.io/@your-username/frontend`
6. Скопируйте **Client ID**

### 2. Настройка переменных окружения

**Backend** (`backend/.env`):
```env
MONGO_URL=mongodb://localhost:27017
DB_NAME=reflection_diary
OPENAI_API_KEY=your-openai-api-key
OPENAI_BASE_URL=https://api.openai.com/v1

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production

# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
```

**Frontend** (`frontend/.env`):
```env
EXPO_PUBLIC_BACKEND_URL=http://localhost:8000
EXPO_PUBLIC_GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
```

### 3. Запуск

```bash
# Запустить всё (MongoDB должен быть запущен)
./start.sh

# Или отдельно:
./start-backend.sh  # Backend на порту 8000
./start-frontend.sh # Frontend на порту 8081
```

## Структура проекта

```
nous/
├── backend/
│   ├── server.py      # FastAPI сервер
│   ├── .env           # Переменные окружения
│   └── requirements.txt
├── frontend/
│   ├── app/
│   │   ├── _layout.tsx    # Корневой layout с авторизацией
│   │   ├── auth.tsx       # Экран входа и хуки авторизации
│   │   ├── index.tsx      # Записи
│   │   ├── checklists.tsx # Чеклисты
│   │   ├── state.tsx      # Состояние
│   │   └── chat.tsx       # AI-чат
│   └── .env
└── README.md
```

## API Endpoints

### Авторизация
- `POST /api/auth/google` - Вход через Google
- `GET /api/auth/me` - Получить текущего пользователя
- `POST /api/auth/logout` - Выход

### Записи
- `GET /api/notes` - Список записей
- `POST /api/notes` - Создать запись
- `PUT /api/notes/{id}` - Обновить запись
- `DELETE /api/notes/{id}` - Удалить запись

### Чеклисты
- `GET /api/checklists/{date}` - Чеклист на дату
- `POST /api/checklists` - Создать/обновить чеклист
- `GET /api/templates` - Шаблоны чеклистов

### AI
- `POST /api/chat` - Отправить сообщение AI
- `GET /api/chat/sessions` - Список сессий чата
- `POST /api/states/analyze` - Анализ состояния

## Авторизация

Приложение использует Google OAuth 2.0 для авторизации:

1. Пользователь нажимает "Войти через Google"
2. Google возвращает ID Token
3. Backend верифицирует токен через Google API
4. Создаётся/обновляется пользователь в MongoDB
5. Backend возвращает JWT токен
6. JWT сохраняется в AsyncStorage и используется для всех запросов

## Разработка

### Добавление защиты эндпоинтов

Для защиты эндпоинта добавьте зависимость `require_auth`:

```python
from server import require_auth, User

@api_router.get("/protected")
async def protected_endpoint(user: User = Depends(require_auth)):
    return {"message": f"Hello, {user.name}!"}
```

### Получение текущего пользователя (опционально)

```python
from server import get_current_user, User

@api_router.get("/optional-auth")
async def optional_auth_endpoint(user: User = Depends(get_current_user)):
    if user:
        return {"message": f"Hello, {user.name}!"}
    return {"message": "Hello, anonymous!"}
