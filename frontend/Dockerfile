# Frontend Dockerfile (Multi-stage build)
# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Получение build arguments
ARG EXPO_PUBLIC_BACKEND_URL
ARG EXPO_PUBLIC_GOOGLE_CLIENT_ID

# Установка переменных окружения для сборки
ENV EXPO_PUBLIC_BACKEND_URL=$EXPO_PUBLIC_BACKEND_URL
ENV EXPO_PUBLIC_GOOGLE_CLIENT_ID=$EXPO_PUBLIC_GOOGLE_CLIENT_ID

# Копирование package.json и yarn.lock
COPY package.json yarn.lock* ./

# Установка зависимостей
RUN yarn install --frozen-lockfile

# Копирование исходного кода
COPY . .

# Сборка приложения для web
RUN yarn build:web

# Stage 2: Production
FROM nginx:alpine

# Копирование собранных файлов
COPY --from=builder /app/dist /usr/share/nginx/html

# Копирование конфигурации nginx
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Экспонирование порта
EXPOSE 80

# Запуск nginx
CMD ["nginx", "-g", "daemon off;"]
