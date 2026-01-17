"""
User Models
"""
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
import uuid


class User(BaseModel):
    """User model"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    email: str
    name: str
    picture: Optional[str] = None
    google_id: Optional[str] = None
    password_hash: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    last_login: datetime = Field(default_factory=datetime.utcnow)


class GoogleAuthRequest(BaseModel):
    """Request for Google OAuth authentication"""
    id_token: str


class EmailRegisterRequest(BaseModel):
    """Request for email/password registration"""
    email: str
    password: str
    name: str


class EmailLoginRequest(BaseModel):
    """Request for email/password login"""
    email: str
    password: str


class AuthResponse(BaseModel):
    """Response for authentication endpoints"""
    access_token: str
    token_type: str = "bearer"
    user: dict
