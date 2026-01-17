"""
Authentication Service
"""
from datetime import datetime, timedelta
from typing import Optional
import re
import httpx
import logging

from jose import jwt, JWTError
from passlib.context import CryptContext
from fastapi import HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from ..config import settings
from ..database import get_users_collection, database
from ..models import User

logger = logging.getLogger(__name__)

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Security
security = HTTPBearer(auto_error=False)


def create_access_token(user_id: str, email: str) -> str:
    """Create JWT access token"""
    expire = datetime.utcnow() + timedelta(days=settings.jwt_expiration_days)
    to_encode = {
        "sub": user_id,
        "email": email,
        "exp": expire
    }
    return jwt.encode(to_encode, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify password against hash"""
    return pwd_context.verify(plain_password, hashed_password)


def hash_password(password: str) -> str:
    """Hash a password"""
    return pwd_context.hash(password)


def validate_email(email: str) -> bool:
    """Validate email format"""
    email_regex = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    return bool(re.match(email_regex, email))


async def verify_google_token(id_token: str) -> dict:
    """Verify Google ID token"""
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"https://oauth2.googleapis.com/tokeninfo?id_token={id_token}"
            )
            if response.status_code != 200:
                raise HTTPException(status_code=401, detail="Invalid Google token")
            
            token_info = response.json()
            
            logger.debug(f"Token aud: {token_info.get('aud')}")
            logger.debug(f"Expected GOOGLE_CLIENT_ID: {settings.google_client_id}")
            
            # Verify audience
            if settings.google_client_id and token_info.get("aud") != settings.google_client_id:
                raise HTTPException(status_code=401, detail="Token was not issued for this app")
            
            return token_info
    except httpx.RequestError as e:
        logger.error(f"Google token verification error: {e}")
        raise HTTPException(status_code=401, detail="Failed to verify Google token")


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security)
) -> Optional[User]:
    """Get current user from JWT token (optional auth)"""
    if not credentials:
        return None
    
    try:
        payload = jwt.decode(
            credentials.credentials,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm]
        )
        user_id = payload.get("sub")
        if not user_id:
            return None
        
        users = get_users_collection()
        user_data = await users.find_one({"id": user_id})
        if not user_data:
            return None
        
        return User(**user_data)
    except JWTError:
        return None


async def require_auth(
    credentials: HTTPAuthorizationCredentials = Depends(security)
) -> User:
    """Require authenticated user"""
    if not credentials:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    # Проверяем подключение к базе данных
    if not await database.check_connection():
        raise HTTPException(
            status_code=503,
            detail="Database unavailable. Please try again later."
        )
    
    try:
        payload = jwt.decode(
            credentials.credentials,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm]
        )
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")
        
        users = get_users_collection()
        user_data = await users.find_one({"id": user_id})
        if not user_data:
            raise HTTPException(status_code=401, detail="User not found")
        
        return User(**user_data)
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
