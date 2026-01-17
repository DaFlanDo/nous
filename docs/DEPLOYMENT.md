# 🚀 Деплой Nous

Инструкция по развертыванию приложения в production.

## 📋 Предварительные требования

- Docker и Docker Compose (для Docker деплоя)
- Node.js 18+ и Yarn (для ручного деплоя)
- Python 3.10+ (для ручного деплоя)
- MongoDB (локальный или облачный, например MongoDB Atlas)
- Google OAuth Client ID
- OpenAI API ключ
- Сервер для деплоя (VPS, Railway, Render и т.д.)

## 🐳 Деплой с Docker (Рекомендуется)

### Быстрый старт

1. **Клонируйте репозиторий:**
```bash
git clone https://github.com/yourusername/nous.git
cd nous
```

2. **Настройте переменные окружения:**
```bash
cp .env.example .env
nano .env
```

Заполните все переменные в `.env` файле:
```env
# MongoDB
MONGO_PASSWORD=your-secure-mongo-password

# Backend
ENCRYPTION_KEY=your-32-byte-encryption-key-here
JWT_SECRET=your-jwt-secret-key-here
OPENAI_API_KEY=sk-proj-your-openai-api-key
OPENAI_BASE_URL=https://api.openai.com/v1

# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret

# CORS (разделенные запятой URL)
ALLOWED_ORIGINS=http://localhost:3000,https://yourdomain.com

# Frontend
EXPO_PUBLIC_BACKEND_URL=http://localhost:8000
```

3. **Запустите все сервисы:**
```bash
docker-compose up -d
```

4. **Проверьте статус:**
```bash
docker-compose ps
docker-compose logs -f
```

Приложение будет доступно по адресам:
- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- MongoDB: localhost:27017

### Docker команды

```bash
# Запуск всех сервисов
docker-compose up -d

# Остановка всех сервисов
docker-compose down

# Перезапуск конкретного сервиса
docker-compose restart backend

# Просмотр логов
docker-compose logs -f backend
docker-compose logs -f frontend

# Пересборка образов
docker-compose build --no-cache

# Удаление всех данных (включая MongoDB)
docker-compose down -v
```

### Production деплой с Docker

Для production на VPS:

1. **Установите Docker на сервере:**
```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
```

2. **Установите Docker Compose:**
```bash
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
```

3. **Клонируйте и настройте:**
```bash
git clone https://github.com/yourusername/nous.git
cd nous
cp .env.example .env
nano .env  # Заполните production значения
```

4. **Настройте Nginx reverse proxy (опционально):**

Создайте `/etc/nginx/sites-available/nous`:
```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /api {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

5. **Запустите:**
```bash
docker-compose up -d
```

6. **Настройте SSL (Let's Encrypt):**
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

---

## 🔧 Ручной деплой (без Docker)

### 1. Backend Configuration

#### Создайте `.env` файл в `/backend`:

```bash
cd backend
cp .env.example .env
```

#### Заполните переменные окружения:

```env
# MongoDB - используйте MongoDB Atlas для production
MONGO_URL=mongodb+srv://username:password@cluster.mongodb.net/
DB_NAME=nous

# Генерация ключа шифрования (ВАЖНО! Используйте уникальный ключ)
# Выполните: python -c "import secrets; print(secrets.token_urlsafe(32))"
ENCRYPTION_KEY=ваш-сгенерированный-ключ

# JWT Secret (генерируйте случайную строку минимум 32 символа)
JWT_SECRET=ваш-jwt-секрет-минимум-32-символа
JWT_ALGORITHM=HS256

# OpenAI API
OPENAI_API_KEY=sk-proj-ваш-ключ
OPENAI_BASE_URL=https://api.openai.com/v1

# Google OAuth (из Google Cloud Console)
GOOGLE_CLIENT_ID=ваш-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=ваш-client-secret

# Server
PORT=8000
HOST=0.0.0.0

# CORS - укажите ваш домен
ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
```

#### Установите зависимости:

```bash
pip install -r requirements.txt
```

### 2. Frontend Configuration

#### Создайте `.env` файл в `/frontend`:

```bash
cd frontend
cp .env.example .env
```

#### Заполните переменные:

```env
# URL вашего backend API
EXPO_PUBLIC_BACKEND_URL=https://api.yourdomain.com

# Google OAuth Client ID (тот же, что и в backend)
EXPO_PUBLIC_GOOGLE_CLIENT_ID=ваш-client-id.apps.googleusercontent.com
```

#### Установите зависимости:

```bash
yarn install
```

## 🌐 Деплой Backend

### Вариант 1: Railway

1. Зарегистрируйтесь на [Railway.app](https://railway.app)
2. Создайте новый проект
3. Добавьте MongoDB (из маркетплейса Railway) или подключите MongoDB Atlas
4. Добавьте Python сервис:
   - Подключите ваш GitHub репозиторий
   - Root Directory: `/backend`
   - Start Command: `uvicorn server:app --host 0.0.0.0 --port $PORT`
5. Добавьте все переменные окружения из `.env`
6. Deploy!

### Вариант 2: Render

1. Зарегистрируйтесь на [Render.com](https://render.com)
2. Создайте Web Service
3. Подключите GitHub репозиторий
4. Настройки:
   - Build Command: `pip install -r requirements.txt`
   - Start Command: `uvicorn server:app --host 0.0.0.0 --port $PORT`
   - Root Directory: `backend`
5. Добавьте переменные окружения
6. Deploy!

### Вариант 3: VPS (Ubuntu)

```bash
# На сервере
git clone https://github.com/yourusername/nous.git
cd nous/backend

# Установите Python и зависимости
sudo apt update
sudo apt install python3-pip python3-venv nginx

# Создайте виртуальное окружение
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Скопируйте .env файл
nano .env
# Вставьте ваши переменные окружения

# Запустите с помощью Gunicorn + Uvicorn
pip install gunicorn
gunicorn server:app --workers 4 --worker-class uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000

# Настройте systemd для автозапуска (опционально)
# Настройте Nginx как reverse proxy
```

## 🎨 Деплой Frontend

### Вариант 1: Vercel (Рекомендуется для PWA)

1. Зарегистрируйтесь на [Vercel.com](https://vercel.com)
2. Установите Vercel CLI:
   ```bash
   npm install -g vercel
   ```
3. В папке `/frontend` выполните:
   ```bash
   # Сборка production версии
   yarn build:web
   
   # Деплой
   cd dist
   vercel --prod
   ```
4. Добавьте переменные окружения в Vercel Dashboard
5. Настройте custom domain (опционально)

### Вариант 2: Netlify

1. Зарегистрируйтесь на [Netlify.com](https://netlify.com)
2. Соберите приложение:
   ```bash
   yarn build:web
   ```
3. Перетащите папку `dist` в Netlify Drop
4. Или используйте Netlify CLI:
   ```bash
   npm install -g netlify-cli
   netlify deploy --prod --dir=dist
   ```

### Вариант 3: Статический хостинг (GitHub Pages, CloudFlare Pages и т.д.)

```bash
# Соберите приложение
yarn build:web

# Загрузите содержимое папки dist на ваш хостинг
```

## 📱 Сборка мобильных приложений

### iOS (требуется macOS)

```bash
# Установите EAS CLI
npm install -g eas-cli

# Войдите в Expo
eas login

# Конфигурация
eas build:configure

# Сборка
eas build --platform ios
```

### Android

```bash
# Сборка APK
eas build --platform android --profile preview

# Или сборка AAB для Google Play
eas build --platform android --profile production
```

## 🔒 Настройка Google OAuth

1. Откройте [Google Cloud Console](https://console.cloud.google.com/)
2. Создайте проект или выберите существующий
3. Перейдите в APIs & Services → Credentials
4. Создайте OAuth 2.0 Client ID:
   - **Web application**
   - Authorized JavaScript origins:
     - `https://yourdomain.com`
     - `https://www.yourdomain.com`
   - Authorized redirect URIs:
     - `https://yourdomain.com/auth`
     - Для Expo: `https://auth.expo.io/@yourusername/frontend`
5. Скопируйте Client ID и Client Secret

## ✅ Чек-лист перед деплоем

- [ ] Обновлены все переменные окружения
- [ ] Сгенерированы безопасные ключи (ENCRYPTION_KEY, JWT_SECRET)
- [ ] MongoDB настроен и доступен
- [ ] Google OAuth настроен с правильными redirect URIs
- [ ] OpenAI API ключ действителен
- [ ] CORS настроен правильно (backend)
- [ ] Frontend собран с правильным BACKEND_URL
- [ ] Протестирована авторизация
- [ ] Протестированы основные функции (заметки, чат, состояние)
- [ ] PWA манифест настроен
- [ ] Иконки приложения добавлены

## 🐛 Решение проблем

### Backend не запускается

- Проверьте подключение к MongoDB
- Убедитесь что все переменные окружения установлены
- Проверьте логи: `tail -f logs/app.log`

### Frontend не подключается к Backend

- Проверьте EXPO_PUBLIC_BACKEND_URL
- Проверьте CORS настройки в backend
- Убедитесь что backend доступен по указанному URL

### Google OAuth не работает

- Проверьте что redirect URIs правильно настроены
- Проверьте что Client ID совпадает в frontend и backend
- Убедитесь что используете HTTPS в production

## 📊 Мониторинг

Рекомендуется настроить мониторинг:
- Backend логи (Railway/Render предоставляют встроенные логи)
- MongoDB мониторинг (MongoDB Atlas Monitoring)
- Frontend аналитика (Google Analytics, Plausible и т.д.)
- Uptime мониторинг (UptimeRobot, Pingdom)

## 🔄 Обновления

```bash
# Backend
git pull
pip install -r requirements.txt
# Перезапустите сервис

# Frontend
git pull
yarn install
yarn build:web
# Загрузите новую версию
```

## 📞 Поддержка

При возникновении проблем:
1. Проверьте логи backend и frontend
2. Убедитесь что все переменные окружения корректны
3. Проверьте документацию используемых сервисов

---

**Успешного деплоя! 🚀**
