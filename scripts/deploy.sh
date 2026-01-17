#!/bin/bash
set -e

echo "🚀 Deploying Nous to VPS..."

# Конфигурация
SERVER_IP="${SERVER_IP:-147.45.72.115}"
SERVER_USER="${SERVER_USER:-root}"
APP_DIR="${APP_DIR:-/opt/nous}"

echo "📍 Server: $SERVER_USER@$SERVER_IP"
echo "📁 Deploy directory: $APP_DIR"

# Обновление кода на сервере
echo "📦 Pulling latest code..."
ssh $SERVER_USER@$SERVER_IP << 'ENDSSH'
cd /opt/nous

# Pull latest changes
git pull origin main

# Backend deploy
echo "🔧 Deploying backend..."
cd backend

# Create .env if not exists
if [ ! -f .env ]; then
    echo "⚠️  Warning: .env file not found. Please configure manually."
fi

# Install/update dependencies
pip3 install -r requirements.txt

# Restart backend service
if systemctl is-active --quiet nous-backend; then
    systemctl restart nous-backend
    echo "✅ Backend restarted"
else
    echo "⚠️  Backend service not running. Start manually or configure systemd."
fi

# Frontend deploy
echo "🎨 Deploying frontend..."
cd ../frontend

# Install dependencies
yarn install --frozen-lockfile

# Build production version
yarn build:web

# Restart frontend service (if using nginx or similar)
if systemctl is-active --quiet nginx; then
    systemctl reload nginx
    echo "✅ Nginx reloaded"
fi

cd ..

echo "✨ Deployment complete!"
ENDSSH

echo ""
echo "🎉 Deployment to $SERVER_IP completed successfully!"
echo ""
echo "📊 Check status:"
echo "   Backend:  http://$SERVER_IP:8000/api/health"
echo "   Frontend: http://$SERVER_IP"
