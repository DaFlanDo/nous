"""Шифрование полей: без базы и сети."""
import logging
import os
import sys

os.environ.setdefault("JWT_SECRET", "test-secret")
os.environ.setdefault("ENCRYPTION_KEY", "test-encryption-key")
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from app.services.encryption import EncryptionService


def test_roundtrip_and_ciphertext_differs():
    enc = EncryptionService("key-1")
    token = enc.encrypt("Сегодня было тревожно")
    assert token != "Сегодня было тревожно"
    assert enc.decrypt(token) == "Сегодня было тревожно"


def test_same_text_encrypts_differently():
    enc = EncryptionService("key-1")
    assert enc.encrypt("одно и то же") != enc.encrypt("одно и то же")


def test_legacy_plaintext_passes_through_silently(caplog):
    enc = EncryptionService("key-1")
    with caplog.at_level(logging.ERROR):
        assert enc.decrypt("запись до шифрования") == "запись до шифрования"
    assert not caplog.records


def test_wrong_key_is_logged(caplog):
    token = EncryptionService("key-1").encrypt("секрет")
    with caplog.at_level(logging.ERROR):
        EncryptionService("other-key").decrypt(token)
    assert any("ENCRYPTION_KEY" in r.message for r in caplog.records)


def test_note_fields():
    enc = EncryptionService("key-1")
    note = {"id": "1", "title": "Заголовок", "content": "Текст", "user_id": "u"}
    stored = enc.encrypt_note(note)
    assert stored["user_id"] == "u" and stored["title"] != "Заголовок"
    assert enc.decrypt_note(stored) == note
