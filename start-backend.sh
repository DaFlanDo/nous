#!/bin/bash

# Запуск бэкенда

echo "🔧 Запуск бэкенда..."

# Освобождаем порт
lsof -ti:8000 | xargs kill -9 2>/dev/null

cd backend
uvicorn server:app --host 0.0.0.0 --port 8000 --reload