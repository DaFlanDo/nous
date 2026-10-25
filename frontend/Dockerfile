# Frontend Dockerfile (Multi-stage build with caching)
# Stage 1: Dependencies (cached layer)
FROM node:20-alpine AS deps

WORKDIR /app

# Копируем только package.json для кэширования зависимостей
COPY package.json yarn.lock* ./

# Установка зависимостей (этот слой кэшируется если package.json не изменился)
RUN yarn install --frozen-lockfile --network-timeout 100000

# Stage 2: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Build arguments
ARG EXPO_PUBLIC_BACKEND_URL
ARG EXPO_PUBLIC_GOOGLE_CLIENT_ID

# Environment для сборки
ENV EXPO_PUBLIC_BACKEND_URL=$EXPO_PUBLIC_BACKEND_URL
ENV EXPO_PUBLIC_GOOGLE_CLIENT_ID=$EXPO_PUBLIC_GOOGLE_CLIENT_ID
ENV NODE_ENV=production
ENV EXPO_USE_FAST_RESOLVER=1

# Копируем зависимости из предыдущего этапа
COPY --from=deps /app/node_modules ./node_modules
COPY package.json yarn.lock* ./

# Копируем только необходимые файлы для сборки
COPY app ./app
COPY lib ./lib
COPY assets ./assets
COPY public ./public
COPY tsconfig.json app.json metro.config.js ./

# Копируем опциональные файлы (если есть)
COPY expo-env.d.ts* eslint.config.js* ./

# Сборка приложения
RUN yarn build:web

# Версия кеша Service Worker — своя у каждой сборки: после деплоя новый SW
# удаляет кеш со старыми бандлами (раньше версию надо было менять руками)
RUN BUILD_ID=$(date -u +%Y%m%d%H%M%S) && \
    sed -i "s/const SW_VERSION = '[^']*';/const SW_VERSION = '$BUILD_ID';/" dist/sw.js && \
    grep -q "SW_VERSION = '$BUILD_ID'" dist/sw.js

# Stage 3: Production (minimal image)
FROM nginx:alpine AS production

# Копирование собранных файлов
COPY --from=builder /app/dist /usr/share/nginx/html

# Копирование конфигурации nginx
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Healthcheck
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:80/ || exit 1

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
