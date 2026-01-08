# 🖥️ Деплой на VPS

Пошаговая инструкция по развертыванию Nous на VPS сервере **147.45.72.115**.

## 📋 Предварительные требования

- VPS с Ubuntu 20.04+ (147.45.72.115)
- Root или sudo доступ
- SSH ключ для доступа
- Доменное имя (опционально, для SSL)

## 🚀 Быстрый старт

### 1. Первоначальная настройка сервера

Выполните на вашем локальном компьютере:

```bash
# Скопируйте скрипт настройки на сервер
scp setup-vps.sh root@147.45.72.115:/root/

# Подключитесь к серверу
ssh root@147.45.72.115

# Запустите настройку
chmod +x setup-vps.sh
./setup-vps.sh
```

Этот скрипт установит:
- Nginx (веб-сервер)
- Python 3.10+ и pip
- Node.js и Yarn
- MongoDB
- Docker и Docker Compose
- Systemd сервисы

### 2. Клонирование репозитория

```bash
cd /opt/nous
git clone https://github.com/daflando/nous.git .
```

### 3. Настройка Backend

```bash
cd /opt/nous/backend

# Создайте .env файл
nano .env
```

Добавьте следующие переменные:

```env
# MongoDB
MONGO_URL=mongodb://localhost:27017/
DB_NAME=nous

# Генерируйте безопасные ключи!
ENCRYPTION_KEY=your-32-byte-encryption-key-here
JWT_SECRET=your-jwt-secret-minimum-32-characters
JWT_ALGORITHM=HS256

# OpenAI API
OPENAI_API_KEY=sk-proj-your-openai-api-key
OPENAI_BASE_URL=https://api.openai.com/v1

# Google OAuth
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret

# Server
PORT=8000
HOST=0.0.0.0

# CORS - укажите ваш домен или IP
ALLOWED_ORIGINS=http://147.45.72.115,https://yourdomain.com
```

Генерация ключей:
```bash
# ENCRYPTION_KEY
python3 -c "import secrets; print(secrets.token_urlsafe(32))"

# JWT_SECRET
python3 -c "import secrets; print(secrets.token_hex(32))"
```

Установите зависимости:
```bash
pip3 install -r requirements.txt
```

### 4. Настройка Frontend

```bash
cd /opt/nous/frontend

# Создайте .env файл
nano .env
```

Добавьте:
```env
EXPO_PUBLIC_BACKEND_URL=http://147.45.72.115/api
EXPO_PUBLIC_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
```

Соберите приложение:
```bash
yarn install
yarn build:web
```

### 5. Запуск сервисов

```bash
# Запустите MongoDB
sudo systemctl start mongodb
sudo systemctl enable mongodb

# Запустите backend
sudo systemctl start nous-backend
sudo systemctl enable nous-backend

# Проверьте статус
sudo systemctl status nous-backend

# Запустите Nginx
sudo systemctl restart nginx
sudo systemctl enable nginx
```

### 6. Проверка работы

Откройте в браузере:
- **Frontend**: http://147.45.72.115
- **Backend API**: http://147.45.72.115/api/health

Проверка через curl:
```bash
curl http://147.45.72.115/api/health
# Ожидаемый ответ: {"status":"healthy"}
```

## 🔄 Автоматический деплой через GitHub Actions

### Настройка GitHub Secrets

Добавьте в Settings → Secrets and variables → Actions:

```
VPS_HOST=147.45.72.115
VPS_USER=root
VPS_SSH_KEY=<ваш приватный SSH ключ>
```

### Генерация SSH ключа

На локальном компьютере:
```bash
# Генерируйте новый ключ для деплоя
ssh-keygen -t ed25519 -C "deploy@nous" -f ~/.ssh/nous_deploy

# Скопируйте публичный ключ на сервер
ssh-copy-id -i ~/.ssh/nous_deploy.pub root@147.45.72.115

# Скопируйте приватный ключ (добавьте в GitHub Secrets)
cat ~/.ssh/nous_deploy
```

### Настройка репозитория на сервере

```bash
# На сервере
cd /opt/nous
git config --global --add safe.directory /opt/nous

# Настройте git для автоматического pull
git config pull.rebase false
```

### Запуск деплоя

После настройки secrets, каждый push в `main` будет автоматически:
1. Запускать тесты
2. Собирать Docker образы
3. Деплоить на VPS
4. Проверять health check

## 🔧 Ручной деплой

Для ручного деплоя используйте скрипт:

```bash
# На локальном компьютере
./deploy.sh
```

Или с переменными окружения:
```bash
SERVER_IP=147.45.72.115 SERVER_USER=root ./deploy.sh
```

## 🔐 Настройка SSL (HTTPS)

### С доменом

```bash
# Установите Certbot
sudo apt install certbot python3-certbot-nginx

# Получите SSL сертификат
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

# Автообновление сертификата
sudo certbot renew --dry-run
```

### Обновите конфигурацию

После получения SSL обновите:

**Backend .env:**
```env
ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
```

**Frontend .env:**
```env
EXPO_PUBLIC_BACKEND_URL=https://yourdomain.com/api
```

Пересоберите frontend:
```bash
cd /opt/nous/frontend
yarn build:web
sudo systemctl reload nginx
```

## 📊 Мониторинг

### Логи

```bash
# Backend логи
sudo journalctl -u nous-backend -f

# Nginx логи
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log

# MongoDB логи
sudo journalctl -u mongodb -f
```

### Статус сервисов

```bash
# Проверка всех сервисов
sudo systemctl status nous-backend
sudo systemctl status nginx
sudo systemctl status mongodb
```

### Использование ресурсов

```bash
# CPU и память
htop

# Дисковое пространство
df -h

# MongoDB статистика
mongo --eval "db.stats()"
```

## 🔄 Обновление приложения

### Автоматическое (через CI/CD)
Просто сделайте push в `main` - деплой произойдет автоматически.

### Ручное

```bash
ssh root@147.45.72.115

cd /opt/nous
git pull origin main

# Backend
cd backend
pip3 install -r requirements.txt
sudo systemctl restart nous-backend

# Frontend
cd ../frontend
yarn install
yarn build:web
sudo systemctl reload nginx
```

## 🐛 Решение проблем

### Backend не запускается

```bash
# Проверьте логи
sudo journalctl -u nous-backend -n 50

# Проверьте .env файл
cat /opt/nous/backend/.env

# Проверьте MongoDB
sudo systemctl status mongodb
```

### Nginx ошибки

```bash
# Проверьте конфигурацию
sudo nginx -t

# Просмотрите ошибки
sudo tail -f /var/log/nginx/error.log
```

### MongoDB проблемы

```bash
# Перезапустите MongoDB
sudo systemctl restart mongodb

# Проверьте подключение
mongo --eval "db.adminCommand('ping')"
```

### Проблемы с памятью

```bash
# Добавьте swap файл
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# Постоянно
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

## 🔒 Безопасность

### Firewall

```bash
# Проверьте правила
sudo ufw status

# Должны быть открыты только:
# 22/tcp (SSH)
# 80/tcp (HTTP)
# 443/tcp (HTTPS)
```

### Обновления безопасности

```bash
# Автоматические обновления
sudo apt install unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades
```

### Смена SSH порта

```bash
# Измените порт в /etc/ssh/sshd_config
sudo nano /etc/ssh/sshd_config
# Port 2222

sudo systemctl restart sshd
sudo ufw allow 2222/tcp
```

## 📈 Масштабирование

### Несколько worker процессов

Измените systemd service:
```bash
sudo nano /etc/systemd/system/nous-backend.service
```

```ini
ExecStart=/usr/bin/gunicorn server:app --workers 4 --worker-class uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000
```

### Redis для кэширования

```bash
sudo apt install redis-server
sudo systemctl enable redis-server
```

## 🔗 Полезные команды

```bash
# Быстрый перезапуск всего
sudo systemctl restart nous-backend nginx mongodb

# Очистка логов
sudo journalctl --vacuum-time=7d

# Проверка портов
sudo netstat -tulpn | grep LISTEN

# Проверка дискового пространства
du -sh /opt/nous/*
```

## 📞 Поддержка

При проблемах:
1. Проверьте логи сервисов
2. Убедитесь что все .env файлы настроены
3. Проверьте firewall правила
4. Проверьте доступность MongoDB

---

**Успешного деплоя! 🚀**

Ваше приложение доступно по адресу: **http://147.45.72.115**
