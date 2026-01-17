#!/bin/bash

# Скрипт для быстрого переключения между конфигурациями Docker

set -e

# Цвета для вывода
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

ENV_FILE=".env"

show_help() {
    echo "Использование: ./switch-env.sh [environment]"
    echo ""
    echo "Доступные окружения:"
    echo "  dev, development    - Режим разработки"
    echo "  prod, production    - Production режим"
    echo "  current            - Показать текущую конфигурацию"
    echo ""
    echo "Примеры:"
    echo "  ./switch-env.sh dev      # Переключиться на development"
    echo "  ./switch-env.sh prod     # Переключиться на production"
    echo "  ./switch-env.sh current  # Показать текущую конфигурацию"
}

show_current() {
    if [ ! -f "$ENV_FILE" ]; then
        echo -e "${RED}Файл .env не найден${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}Текущая конфигурация (.env):${NC}"
    echo "-----------------------------------"
    grep -v '^#' "$ENV_FILE" | grep -v '^$' | head -10
    echo "-----------------------------------"
}

switch_env() {
    local target_env=$1
    local source_file=""
    
    case $target_env in
        dev|development)
            source_file=".env.development"
            target_name="Development"
            ;;
        prod|production)
            source_file=".env.production"
            target_name="Production"
            ;;
        *)
            echo -e "${RED}Неизвестное окружение: $target_env${NC}"
            show_help
            exit 1
            ;;
    esac
    
    if [ ! -f "$source_file" ]; then
        echo -e "${RED}Файл $source_file не найден${NC}"
        exit 1
    fi
    
    # Создаём бэкап текущего .env
    if [ -f "$ENV_FILE" ]; then
        backup_file=".env.backup.$(date +%Y%m%d_%H%M%S)"
        cp "$ENV_FILE" "$backup_file"
        echo -e "${YELLOW}Создан бэкап: $backup_file${NC}"
    fi
    
    # Копируем новую конфигурацию
    cp "$source_file" "$ENV_FILE"
    echo -e "${GREEN}✓ Переключено на $target_name окружение${NC}"
    
    # Спрашиваем о перезапуске
    echo ""
    read -p "Перезапустить Docker контейнеры? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${YELLOW}Перезапуск контейнеров...${NC}"
        docker-compose down
        docker-compose up -d --build
        echo -e "${GREEN}✓ Контейнеры перезапущены${NC}"
    else
        echo -e "${YELLOW}Не забудьте перезапустить контейнеры: docker-compose up -d --build${NC}"
    fi
}

# Главная логика
if [ $# -eq 0 ]; then
    show_help
    exit 0
fi

case $1 in
    -h|--help|help)
        show_help
        ;;
    current|show)
        show_current
        ;;
    *)
        switch_env "$1"
        ;;
esac
