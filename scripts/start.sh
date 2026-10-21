#!/bin/bash

# Скрипт запуска проекта Nous

# Цвета для вывода
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Запуск проекта Nous...${NC}"

# Убиваем процессы на портах если они заняты
echo -e "${BLUE}📦 Освобождаем порты...${NC}"
lsof -ti:8000 | xargs kill -9 2>/dev/null
lsof -ti:8081 | xargs kill -9 2>/dev/null

# Запуск бэкенда
echo -e "${GREEN}🔧 Запуск бэкенда (порт 8000)...${NC}"
cd backend
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!
cd ..

# Ждём запуска бэкенда
sleep 2

# Запуск фронтенда
echo -e "${GREEN}🌐 Запуск фронтенда (порт 8081)...${NC}"
cd frontend
yarn web &
FRONTEND_PID=$!
cd ..

echo -e "${GREEN}✅ Проект запущен!${NC}"
echo -e "${BLUE}📍 Бэкенд: http://localhost:8000${NC}"
echo -e "${BLUE}📍 Фронтенд: http://localhost:8081${NC}"
echo ""
echo -e "Нажмите Ctrl+C для остановки..."

# Обработка Ctrl+C
trap "echo -e '\n${BLUE}🛑 Остановка...${NC}'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0" SIGINT SIGTERM

# Ждём завершения
wait