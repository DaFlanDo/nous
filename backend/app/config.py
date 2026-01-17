"""
Application Configuration
Централизованное управление настройками приложения
"""
import os
from pathlib import Path
from functools import lru_cache
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
    openai_model: str = "gpt-4o"
    openai_model_cheap: str = "gpt-4o-mini"  # Дешёвая модель для саммари
    
    # Chat optimization
    chat_history_limit: int = 10  # Максимум сообщений в контексте
    chat_summarize_after: int = 6  # После скольких сообщений делать саммари
    chat_use_cheap_model_for_summary: bool = True  # Использовать дешёвую модель для саммаризации
    
    # JWT
    jwt_secret: str = "your-super-secret-key-change-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expiration_days: int = 30
    
    # Google OAuth
    google_client_id: str = ""
    
    # Encryption
    encryption_key: str = "default-encryption-key-change-in-production"
    
    # Server
    host: str = "0.0.0.0"
    port: int = 8000
    debug: bool = False
    allowed_origins: str = "*"
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = False


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance"""
    return Settings()


# Convenience function for backward compatibility
settings = get_settings()
