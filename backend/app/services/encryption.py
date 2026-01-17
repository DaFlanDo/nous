"""
Server-side Encryption Service
Данные шифруются перед записью в БД, расшифровываются при чтении
"""
import base64
from typing import Optional, List
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
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,
            salt=b'nous_encryption_salt_v1',
            iterations=100000,
            backend=default_backend()
        )
        key = base64.urlsafe_b64encode(kdf.derive(secret_key.encode()))
        self.cipher = Fernet(key)
    
    def encrypt(self, data: str) -> str:
        """Шифрует строку"""
        if not data:
            return data
        encrypted = self.cipher.encrypt(data.encode())
        return base64.urlsafe_b64encode(encrypted).decode()
    
    def decrypt(self, encrypted_data: str) -> str:
        """Расшифровывает строку"""
        if not encrypted_data:
            return encrypted_data
        try:
            decoded = base64.urlsafe_b64decode(encrypted_data.encode())
            decrypted = self.cipher.decrypt(decoded)
            return decrypted.decode()
        except Exception:
            # Backward compatibility with unencrypted data
            return encrypted_data
    
    def encrypt_dict(self, data: dict, fields: List[str]) -> dict:
        """Шифрует указанные поля в словаре"""
        encrypted = data.copy()
        for field in fields:
            if field in encrypted and encrypted[field]:
                encrypted[field] = self.encrypt(encrypted[field])
        return encrypted
    
    def decrypt_dict(self, data: dict, fields: List[str]) -> dict:
        """Расшифровывает указанные поля в словаре"""
        decrypted = data.copy()
        for field in fields:
            if field in decrypted and decrypted[field]:
                decrypted[field] = self.decrypt(decrypted[field])
        return decrypted
    
    # === Entity-specific encryption helpers ===
    
    def encrypt_note(self, note_dict: dict) -> dict:
        """Шифрует чувствительные поля заметки"""
        return self.encrypt_dict(note_dict, ['title', 'content'])
    
    def decrypt_note(self, note_dict: dict) -> dict:
        """Расшифровывает чувствительные поля заметки"""
        return self.decrypt_dict(note_dict, ['title', 'content'])
    
    def encrypt_checklist_template(self, template_dict: dict) -> dict:
        """Шифрует чувствительные поля шаблона чеклиста"""
        encrypted = template_dict.copy()
        if 'name' in encrypted:
            encrypted['name'] = self.encrypt(encrypted['name'])
        if 'items' in encrypted and encrypted['items']:
            encrypted['items'] = [self.encrypt(item) for item in encrypted['items']]
        return encrypted
    
    def decrypt_checklist_template(self, template_dict: dict) -> dict:
        """Расшифровывает чувствительные поля шаблона чеклиста"""
        decrypted = template_dict.copy()
        if 'name' in decrypted:
            decrypted['name'] = self.decrypt(decrypted['name'])
        if 'items' in decrypted and decrypted['items']:
            decrypted['items'] = [self.decrypt(item) for item in decrypted['items']]
        return decrypted
    
    def encrypt_checklist(self, checklist_dict: dict) -> dict:
        """Шифрует чувствительные поля дневного чеклиста"""
        encrypted = checklist_dict.copy()
        if 'items' in encrypted and encrypted['items']:
            encrypted['items'] = [
                {**item, 'text': self.encrypt(item['text'])} if 'text' in item else item
                for item in encrypted['items']
            ]
        return encrypted
    
    def decrypt_checklist(self, checklist_dict: dict) -> dict:
        """Расшифровывает чувствительные поля дневного чеклиста"""
        decrypted = checklist_dict.copy()
        if 'items' in decrypted and decrypted['items']:
            decrypted['items'] = [
                {**item, 'text': self.decrypt(item['text'])} if 'text' in item else item
                for item in decrypted['items']
            ]
        return decrypted
    
    def encrypt_chat_session(self, session_dict: dict) -> dict:
        """Шифрует чувствительные поля сессии чата"""
        encrypted = session_dict.copy()
        if 'title' in encrypted:
            encrypted['title'] = self.encrypt(encrypted['title'])
        if 'messages' in encrypted and encrypted['messages']:
            encrypted['messages'] = [
                {**msg, 'content': self.encrypt(msg['content'])} if 'content' in msg else msg
                for msg in encrypted['messages']
            ]
        return encrypted
    
    def decrypt_chat_session(self, session_dict: dict) -> dict:
        """Расшифровывает чувствительные поля сессии чата"""
        decrypted = session_dict.copy()
        if 'title' in decrypted:
            decrypted['title'] = self.decrypt(decrypted['title'])
        if 'messages' in decrypted and decrypted['messages']:
            decrypted['messages'] = [
                {**msg, 'content': self.decrypt(msg['content'])} if 'content' in msg else msg
                for msg in decrypted['messages']
            ]
        return decrypted
    
    def encrypt_state_record(self, state_dict: dict) -> dict:
        """Шифрует чувствительные поля записи состояния"""
        return self.encrypt_dict(state_dict, ['analysis'])
    
    def decrypt_state_record(self, state_dict: dict) -> dict:
        """Расшифровывает чувствительные поля записи состояния"""
        return self.decrypt_dict(state_dict, ['analysis'])


# Singleton instance
_encryption_service: Optional[EncryptionService] = None


def init_encryption(secret_key: str):
    """Инициализация сервиса шифрования"""
    global _encryption_service
    _encryption_service = EncryptionService(secret_key)


def get_encryption() -> EncryptionService:
    """Получить сервис шифрования"""
    if _encryption_service is None:
        raise RuntimeError("Encryption not initialized. Call init_encryption() first.")
    return _encryption_service
