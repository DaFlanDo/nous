"""
Authentication Routes
"""
from fastapi import APIRouter, HTTPException, Depends
from datetime import datetime
import logging

from ..models import User, GoogleAuthRequest, EmailRegisterRequest, EmailLoginRequest, AuthResponse
from ..database import get_users_collection
from ..services.auth import (
    create_access_token,
    verify_google_token,
    verify_password,
    hash_password,
    validate_email,
    require_auth,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/google", response_model=AuthResponse)
async def google_auth(request: GoogleAuthRequest):
    """Авторизация через Google"""
    token_info = await verify_google_token(request.id_token)
    
    google_id = token_info.get("sub")
    email = token_info.get("email")
    name = token_info.get("name", email.split("@")[0])
    picture = token_info.get("picture")
    
    users = get_users_collection()
    existing_user = await users.find_one({"google_id": google_id})
    
    if existing_user:
        await users.update_one(
            {"google_id": google_id},
            {"$set": {"last_login": datetime.utcnow(), "name": name, "picture": picture}}
        )
        user = User(**existing_user)
        user.last_login = datetime.utcnow()
    else:
        user = User(
            email=email,
            name=name,
            picture=picture,
            google_id=google_id
        )
        await users.insert_one(user.model_dump())
    
    access_token = create_access_token(user.id, user.email)
    
    return AuthResponse(
        access_token=access_token,
        user={
            "id": user.id,
            "email": user.email,
            "name": user.name,
            "picture": user.picture
        }
    )


@router.post("/register", response_model=AuthResponse)
async def register_with_email(request: EmailRegisterRequest):
    """Регистрация по email/пароль"""
    if not validate_email(request.email):
        raise HTTPException(status_code=400, detail="Неверный формат email")
    
    if len(request.password) < 6:
        raise HTTPException(status_code=400, detail="Пароль должен быть минимум 6 символов")
    
    users = get_users_collection()
    existing_user = await users.find_one({"email": request.email.lower()})
    if existing_user:
        raise HTTPException(status_code=400, detail="Пользователь с таким email уже существует")
    
    password_hash = hash_password(request.password)
    
    user = User(
        email=request.email.lower(),
        name=request.name,
        password_hash=password_hash
    )
    await users.insert_one(user.model_dump())
    
    access_token = create_access_token(user.id, user.email)
    
    return AuthResponse(
        access_token=access_token,
        user={
            "id": user.id,
            "email": user.email,
            "name": user.name,
            "picture": user.picture
        }
    )


@router.post("/login", response_model=AuthResponse)
async def login_with_email(request: EmailLoginRequest):
    """Вход по email/пароль"""
    users = get_users_collection()
    user_data = await users.find_one({"email": request.email.lower()})
    
    if not user_data:
        raise HTTPException(status_code=401, detail="Неверный email или пароль")
    
    if not user_data.get("password_hash"):
        raise HTTPException(
            status_code=401,
            detail="Этот аккаунт использует вход через Google"
        )
    
    if not verify_password(request.password, user_data["password_hash"]):
        raise HTTPException(status_code=401, detail="Неверный email или пароль")
    
    await users.update_one(
        {"email": request.email.lower()},
        {"$set": {"last_login": datetime.utcnow()}}
    )
    
    user = User(**user_data)
    access_token = create_access_token(user.id, user.email)
    
    return AuthResponse(
        access_token=access_token,
        user={
            "id": user.id,
            "email": user.email,
            "name": user.name,
            "picture": user.picture
        }
    )


@router.get("/me")
async def get_me(user: User = Depends(require_auth)):
    """Получить информацию о текущем пользователе"""
    return {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "picture": user.picture
    }


@router.post("/logout")
async def logout():
    """Выход (на клиенте нужно удалить токен)"""
    return {"message": "Logged out successfully"}
