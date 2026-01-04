"""
Server-side encryption module
Данные шифруются перед записью в БД, расшифровываются при чтении
"""
import os
import base64
from typing import Optional
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.backends import default_backend

class EncryptionService:
    """Сервис для шифрования/дешифрования данных"""
    
    def __init__(self, secret_key: str):
        """
        Инициализация с секретным ключом
        Args:
            secret_key: Секретный ключ из переменных окружения
        """
        # Генерируем ключ из секрета используя PBKDF2
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,
            salt=b'nous_encryption_salt_v1',  # Статическая соль для детерминированного ключа
            iterations=100000,
            backend=default_backend()
        )
        key = base64.urlsafe_b64encode(kdf.derive(secret_key.encode()))
        self.cipher = Fernet(key)
    
    def encrypt(self, data: str) -> str:
        """
        Шифрует строку
        Args:
            data: Исходная строка
        Returns:
            Зашифрованная строка в base64
        """
        if not data:
            return data
        encrypted = self.cipher.encrypt(data.encode())
        return base64.urlsafe_b64encode(encrypted).decode()
    
    def decrypt(self, encrypted_data: str) -> str:
        """
        Расшифровывает строку
        Args:
            encrypted_data: Зашифрованная строка в base64
        Returns:
            Исходная строка
        """
        if not encrypted_data:
            return encrypted_data
        try:
            decoded = base64.urlsafe_b64decode(encrypted_data.encode())
            decrypted = self.cipher.decrypt(decoded)
            return decrypted.decode()
        except Exception as e:
            # Если расшифровка не удалась (например, данные не зашифрованы), возвращаем как есть
            # Это для обратной совместимости с незашифрованными данными
            return encrypted_data
    
    def encrypt_dict(self, data: dict, fields: list[str]) -> dict:
        """
        Шифрует указанные поля в словаре
        Args:
            data: Словарь с данными
            fields: Список полей для шифрования
        Returns:
            Словарь с зашифрованными полями
        """
        encrypted = data.copy()
        for field in fields:
            if field in encrypted and encrypted[field]:
                encrypted[field] = self.encrypt(encrypted[field])
        return encrypted
    
    def decrypt_dict(self, data: dict, fields: list[str]) -> dict:
        """
        Расшифровывает указанные поля в словаре
        Args:
            data: Словарь с данными
            fields: Список полей для расшифровки
        Returns:
            Словарь с расшифрованными полями
        """
        decrypted = data.copy()
        for field in fields:
            if field in decrypted and decrypted[field]:
                decrypted[field] = self.decrypt(decrypted[field])
        return decrypted


# Singleton instance
_encryption_service: Optional[EncryptionService] = None

def init_encryption(secret_key: str):
    """Инициализация сервиса шифрования"""
    global _encryption_service
    _encryption_service = EncryptionService(secret_key)

def get_encryption() -> EncryptionService:
    """Получить instance сервиса шифрования"""
    if _encryption_service is None:
        raise RuntimeError("Encryption service not initialized. Call init_encryption() first.")
    return _encryption_service
