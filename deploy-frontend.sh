#!/bin/bash
set -e

echo "🚀 Deploying Frontend to VPS..."

# Конфигурация
SERVER_IP="${SERVER_IP:-77.239.105.44}"
SERVER_USER="${SERVER_USER:-root}"
SERVER_PATH="/root/nous/frontend"

echo "📦 Building frontend locally..."
cd frontend

# Сборка
yarn install
yarn build:web

echo "📤 Uploading to server..."
# Создаем директорию на сервере
ssh $SERVER_USER@$SERVER_IP "mkdir -p $SERVER_PATH/dist"

# Копируем собранные файлы
rsync -avz --delete dist/ $SERVER_USER@$SERVER_IP:$SERVER_PATH/dist/

echo "🔧 Updating Nginx config..."
ssh $SERVER_USER@$SERVER_IP << 'ENDSSH'
# Обновляем конфигурацию Nginx
cat > /etc/nginx/sites-available/nous << 'EOF'
server {
    listen 3000;
    server_name _;
    root /root/nous/frontend/dist;
    index index.html;

    # Основной маршрут
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Backend API proxy
    location /api {
        proxy_pass http://localhost:8000;
        rewrite ^/api/(.*) /$1 break;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Кэширование статики
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
EOF

# Включаем конфигурацию
ln -sf /etc/nginx/sites-available/nous /etc/nginx/sites-enabled/

# Тестируем и перезапускаем Nginx
nginx -t && systemctl restart nginx

echo "✅ Nginx restarted"
ENDSSH

cd ..

echo ""
echo "🎉 Frontend deployed successfully!"
echo "🔗 Access at: http://$SERVER_IP:3000"
