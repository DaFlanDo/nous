#!/bin/bash

# Запуск фронтенда

echo "🌐 Запуск фронтенда..."

# Освобождаем порт
lsof -ti:8081 | xargs kill -9 2>/dev/null

cd frontend
yarn web