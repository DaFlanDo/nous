"""
API Integration Tests для Nous
Тестирование регистрации, логина и создания заметок
"""
import pytest
import httpx
import os
from datetime import datetime

# Конфигурация
BASE_URL = os.getenv("API_BASE_URL", "http://localhost:8000")
API_URL = f"{BASE_URL}/api"


@pytest.fixture
async def client():
    """Асинхронный HTTP клиент для тестов"""
    async with httpx.AsyncClient(timeout=30.0) as client:
        yield client


@pytest.fixture
async def registered_user(client):
    """Создает тестового пользователя с уникальным email и возвращает токен"""
    # Генерируем уникальный email для каждого теста
    unique_email = f"test_{datetime.now().timestamp()}_{os.urandom(4).hex()}@example.com"
    test_user = {
        "email": unique_email,
        "password": "TestPassword123!",
        "name": "Test User"
    }
    
    response = await client.post(
        f"{API_URL}/auth/register",
        json=test_user
    )
    assert response.status_code == 200, f"Registration failed: {response.text}"
    data = response.json()
    return {
        "token": data["access_token"],
        "user": data["user"],
        "credentials": test_user
    }


class TestAuthentication:
    """Тесты авторизации"""
    
    @pytest.mark.asyncio
    async def test_register_new_user(self, client):
        """Тест регистрации нового пользователя"""
        unique_email = f"test_{datetime.now().timestamp()}@example.com"
        user_data = {
            "email": unique_email,
            "password": "TestPassword123!",
            "name": "New Test User"
        }
        
        response = await client.post(
            f"{API_URL}/auth/register",
            json=user_data
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert "access_token" in data
        assert "user" in data
        assert data["user"]["email"] == unique_email
        assert data["user"]["name"] == user_data["name"]
        assert "password" not in data["user"]
        assert "password_hash" not in data["user"]
    
    @pytest.mark.asyncio
    async def test_register_duplicate_email(self, client, registered_user):
        """Тест регистрации с существующим email"""
        response = await client.post(
            f"{API_URL}/auth/register",
            json=registered_user["credentials"]
        )
        
        assert response.status_code == 400
        detail = response.json()["detail"].lower()
        assert "уже существует" in detail or "already" in detail
    
    @pytest.mark.asyncio
    async def test_login_success(self, client, registered_user):
        """Тест успешного логина"""
        response = await client.post(
            f"{API_URL}/auth/login",
            json={
                "email": registered_user["credentials"]["email"],
                "password": registered_user["credentials"]["password"]
            }
        )
        
        assert response.status_code == 200
        data = response.json()
        
        assert "access_token" in data
        assert "user" in data
        assert data["user"]["email"] == registered_user["credentials"]["email"]
    
    @pytest.mark.asyncio
    async def test_login_wrong_password(self, client, registered_user):
        """Тест логина с неверным паролем"""
        response = await client.post(
            f"{API_URL}/auth/login",
            json={
                "email": registered_user["credentials"]["email"],
                "password": "WrongPassword123!"
            }
        )
        
        assert response.status_code == 401
        detail = response.json()["detail"].lower()
        assert "invalid" in detail or "неверный" in detail
    
    @pytest.mark.asyncio
    async def test_login_nonexistent_user(self, client):
        """Тест логина несуществующего пользователя"""
        response = await client.post(
            f"{API_URL}/auth/login",
            json={
                "email": "nonexistent@example.com",
                "password": "SomePassword123!"
            }
        )
        
        assert response.status_code == 401
    
    @pytest.mark.asyncio
    async def test_get_current_user(self, client, registered_user):
        """Тест получения информации о текущем пользователе"""
        response = await client.get(
            f"{API_URL}/auth/me",
            headers={"Authorization": f"Bearer {registered_user['token']}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        
        assert data["email"] == registered_user["credentials"]["email"]
        assert "password" not in data
        assert "password_hash" not in data
    
    @pytest.mark.asyncio
    async def test_get_current_user_invalid_token(self, client):
        """Тест получения пользователя с невалидным токеном"""
        response = await client.get(
            f"{API_URL}/auth/me",
            headers={"Authorization": "Bearer invalid_token"}
        )
        
        assert response.status_code == 401


class TestNotes:
    """Тесты работы с заметками"""
    
    @pytest.mark.asyncio
    async def test_create_note(self, client, registered_user):
        """Тест создания заметки"""
        note_data = {
            "title": "Test Note",
            "content": "This is a test note content"
        }
        
        response = await client.post(
            f"{API_URL}/notes",
            json=note_data,
            headers={"Authorization": f"Bearer {registered_user['token']}"}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert "id" in data
        assert data["title"] == note_data["title"]
        assert data["content"] == note_data["content"]
        assert data["user_id"] == registered_user["user"]["id"]
        assert "created_at" in data
        assert "updated_at" in data
    
    @pytest.mark.asyncio
    async def test_create_note_without_auth(self, client):
        """Тест создания заметки без авторизации"""
        note_data = {
            "title": "Test Note",
            "content": "This is a test note content"
        }
        
        response = await client.post(
            f"{API_URL}/notes",
            json=note_data
        )
        
        assert response.status_code == 401
    
    @pytest.mark.asyncio
    async def test_get_notes(self, client, registered_user):
        """Тест получения списка заметок"""
        # Создаем заметку
        note_data = {
            "title": "Test Note for List",
            "content": "Content"
        }
        await client.post(
            f"{API_URL}/notes",
            json=note_data,
            headers={"Authorization": f"Bearer {registered_user['token']}"}
        )
        
        # Получаем список
        response = await client.get(
            f"{API_URL}/notes",
            headers={"Authorization": f"Bearer {registered_user['token']}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        
        assert isinstance(data, list)
        assert len(data) > 0
        assert any(note["title"] == note_data["title"] for note in data)
    
    @pytest.mark.asyncio
    async def test_get_note_by_id(self, client, registered_user):
        """Тест получения заметки по ID"""
        # Создаем заметку
        note_data = {
            "title": "Test Note for Get",
            "content": "Content for get test"
        }
        create_response = await client.post(
            f"{API_URL}/notes",
            json=note_data,
            headers={"Authorization": f"Bearer {registered_user['token']}"}
        )
        note_id = create_response.json()["id"]
        
        # Получаем заметку
        response = await client.get(
            f"{API_URL}/notes/{note_id}",
            headers={"Authorization": f"Bearer {registered_user['token']}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        
        assert data["id"] == note_id
        assert data["title"] == note_data["title"]
    
    @pytest.mark.asyncio
    async def test_update_note(self, client, registered_user):
        """Тест обновления заметки"""
        # Создаем заметку
        note_data = {
            "title": "Original Title",
            "content": "Original content"
        }
        create_response = await client.post(
            f"{API_URL}/notes",
            json=note_data,
            headers={"Authorization": f"Bearer {registered_user['token']}"}
        )
        note_id = create_response.json()["id"]
        
        # Обновляем заметку
        updated_data = {
            "title": "Updated Title",
            "content": "Updated content"
        }
        response = await client.put(
            f"{API_URL}/notes/{note_id}",
            json=updated_data,
            headers={"Authorization": f"Bearer {registered_user['token']}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        
        assert data["title"] == updated_data["title"]
        assert data["content"] == updated_data["content"]
    
    @pytest.mark.asyncio
    async def test_delete_note(self, client, registered_user):
        """Тест удаления заметки"""
        # Создаем заметку
        note_data = {
            "title": "Note to Delete",
            "content": "This note will be deleted"
        }
        create_response = await client.post(
            f"{API_URL}/notes",
            json=note_data,
            headers={"Authorization": f"Bearer {registered_user['token']}"}
        )
        note_id = create_response.json()["id"]
        
        # Удаляем заметку
        response = await client.delete(
            f"{API_URL}/notes/{note_id}",
            headers={"Authorization": f"Bearer {registered_user['token']}"}
        )
        
        assert response.status_code == 200
        
        # Проверяем что заметка удалена
        get_response = await client.get(
            f"{API_URL}/notes/{note_id}",
            headers={"Authorization": f"Bearer {registered_user['token']}"}
        )
        assert get_response.status_code == 404


class TestNotesSecurity:
    """Тесты безопасности заметок"""
    
    @pytest.mark.asyncio
    async def test_cannot_access_other_user_note(self, client):
        """Тест: пользователь не может получить доступ к чужой заметке"""
        # Создаем первого пользователя и его заметку
        user1_data = {
            "email": f"user1_{datetime.now().timestamp()}@example.com",
            "password": "Password123!",
            "name": "User One"
        }
        user1_response = await client.post(f"{API_URL}/auth/register", json=user1_data)
        user1_token = user1_response.json()["access_token"]
        
        note_response = await client.post(
            f"{API_URL}/notes",
            json={"title": "Private Note", "content": "Private content"},
            headers={"Authorization": f"Bearer {user1_token}"}
        )
        note_id = note_response.json()["id"]
        
        # Создаем второго пользователя
        user2_data = {
            "email": f"user2_{datetime.now().timestamp()}@example.com",
            "password": "Password123!",
            "name": "User Two"
        }
        user2_response = await client.post(f"{API_URL}/auth/register", json=user2_data)
        user2_token = user2_response.json()["access_token"]
        
        # Пытаемся получить доступ к заметке первого пользователя
        response = await client.get(
            f"{API_URL}/notes/{note_id}",
            headers={"Authorization": f"Bearer {user2_token}"}
        )
        
        assert response.status_code in [403, 404]  # Forbidden или Not Found


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
