"""
Application Configuration
Централизованное управление настройками приложения
"""
import os
from pathlib import Path
from functools import lru_cache
from pydantic import field_validator
from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    """Application settings loaded from environment variables"""
    
    # MongoDB
    mongo_url: str = "mongodb://localhost:27017"
    db_name: str = "reflection_diary"
    
    # OpenAI / LLM API
    openai_api_key: str = ""
    openai_base_url: str = "https://api.openai.com/v1"
    openai_model: str = "claude-sonnet-4-5-20250929"
    openai_model_cheap: str = "gpt-4o-mini"  # Дешёвая модель для саммари (пока не используется)
    
    # Chat optimization
    chat_history_limit: int = 10  # Максимум сообщений в контексте
    chat_summarize_after: int = 6  # После скольких сообщений делать саммари
    chat_use_cheap_model_for_summary: bool = True
    ai_requests_per_hour: int = 60  # на пользователя, см. services/rate_limit.py  # Использовать дешёвую модель для саммаризации
    
    # JWT
    jwt_secret: str = ""
    jwt_algorithm: str = "HS256"
    jwt_expiration_days: int = 30
    
    # Google OAuth
    google_client_id: str = ""
    
    # Encryption
    encryption_key: str = ""

    # Демо-режим: «Попробовать без регистрации» — своя песочница каждому (services/demo.py)
    demo_mode: bool = False
    demo_ttl_hours: int = 24
    demo_sandboxes_per_ip_per_hour: int = 10
    demo_ai_requests_per_hour: int = 30  # на все песочницы вместе: ключ общий и платный
    
    # Server
    host: str = "0.0.0.0"
    port: int = 8000
    debug: bool = False
    allowed_origins: str = "*"
    
    @field_validator("jwt_secret", "encryption_key")
    @classmethod
    def _secret_must_be_set(cls, value: str, info) -> str:
        # Ключ из кода знает любой, кто видел репозиторий: подпись токенов
        # и шифрование заметок с ним ничего не защищают
        if not value or "change-in-production" in value:
            raise ValueError(
                f"{info.field_name.upper()} не задан — сгенерируйте: openssl rand -hex 32"
            )
        return value

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = False
        # Корневой .env общий с docker compose — чужие переменные не ошибка
        extra = "ignore"


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance"""
    return Settings()


# Convenience function for backward compatibility
settings = get_settings()
