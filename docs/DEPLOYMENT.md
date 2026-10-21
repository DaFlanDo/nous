# Деплой на свой сервер

Nous целиком поднимается через Docker Compose: MongoDB, backend и собранный фронт
за nginx. Подойдёт любой Linux-сервер с Docker.

## 1. Настройки

```bash
git clone https://github.com/DaFlanDo/nous.git && cd nous
cp .env.example .env
```

В `.env` обязательно заполнить:

| Переменная | Что это |
|---|---|
| `MONGO_PASSWORD` | пароль MongoDB внутри compose |
| `JWT_SECRET`, `ENCRYPTION_KEY` | секреты backend, `openssl rand -hex 32` каждый. **`ENCRYPTION_KEY` после запуска не менять** — записи, зашифрованные старым ключом, перестанут читаться |
| `EXPO_PUBLIC_BACKEND_URL` | адрес сайта, каким его видит браузер, без `/api` в конце — например `https://nous.example.com` (фронт сам обращается к `/api/...`). Вшивается во фронт при сборке |
| `ALLOWED_ORIGINS` | адрес фронта, например `https://nous.example.com` |

По желанию: `OPENAI_API_KEY` и `OPENAI_BASE_URL` — для ассистента,
`GOOGLE_CLIENT_ID` — для входа через Google (в Google Cloud Console добавить адрес
фронта в Authorized JavaScript origins).

## 2. Запуск

```bash
docker compose up -d --build
docker compose ps        # все три сервиса должны стать healthy
```

Фронт слушает порт 3000, API — 8000. MongoDB наружу не публикуется.

## 3. Домен и HTTPS

Удобнее всего поставить перед контейнерами nginx (или Caddy) на сервере:

```nginx
server {
    server_name nous.example.com;

    location /api/ { proxy_pass http://127.0.0.1:8000; }
    location /     { proxy_pass http://127.0.0.1:3000; }
}
```

Сертификат — `certbot --nginx -d nous.example.com`. PWA и service worker работают
только по HTTPS.

## Обновление

```bash
git pull
docker compose up -d --build
```

Данные MongoDB лежат в томе `mongodb_data` и при пересборке не теряются.
