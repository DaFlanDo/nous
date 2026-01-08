#!/bin/bash
set -e

echo "🔧 Setting up VPS for Nous deployment..."

# Обновление системы
echo "📦 Updating system packages..."
apt update && apt upgrade -y

# Установка необходимых пакетов
echo "📦 Installing dependencies..."
apt install -y git curl nginx python3 python3-pip python3-venv nodejs npm mongodb-community

# Установка Yarn
echo "📦 Installing Yarn..."
npm install -g yarn

# Установка Docker (опционально)
echo "🐳 Installing Docker..."
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh
systemctl enable docker
systemctl start docker

# Установка Docker Compose
echo "🐳 Installing Docker Compose..."
curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose

# Создание директории для приложения
echo "📁 Creating app directory..."
mkdir -p /opt/nous
cd /opt/nous

# Клонирование репозитория (замените на ваш)
echo "📥 Cloning repository..."
# git clone https://github.com/yourusername/nous.git .

# Настройка Nginx
echo "🌐 Configuring Nginx..."
cat > /etc/nginx/sites-available/nous << 'EOF'
server {
    listen 80;
    server_name _;

    # Frontend
    location / {
        root /opt/nous/frontend/dist;
        try_files $uri $uri/ /index.html;
    }

    # Backend API
    location /api {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

ln -sf /etc/nginx/sites-available/nous /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl enable nginx
systemctl restart nginx

# Настройка systemd для backend
echo "⚙️  Configuring systemd service..."
cat > /etc/systemd/system/nous-backend.service << 'EOF'
[Unit]
Description=Nous Backend Service
After=network.target mongodb.service

[Service]
Type=simple
User=root
WorkingDirectory=/opt/nous/backend
Environment="PATH=/usr/bin:/usr/local/bin"
ExecStart=/usr/bin/python3 -m uvicorn server:app --host 0.0.0.0 --port 8000
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable nous-backend

# Настройка MongoDB
echo "🍃 Configuring MongoDB..."
systemctl enable mongodb
systemctl start mongodb

# Настройка firewall
echo "🔥 Configuring firewall..."
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo ""
echo "✅ VPS setup complete!"
echo ""
echo "📝 Next steps:"
echo "1. Configure /opt/nous/backend/.env with your settings"
echo "2. Configure /opt/nous/frontend/.env with your settings"
echo "3. Deploy the application: ./deploy.sh"
echo "4. Setup SSL with: certbot --nginx -d yourdomain.com"
echo ""
echo "🔗 Your server is ready at: http://147.45.72.115"
