"""
Chat Models
"""
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime
import uuid


class ChatMessage(BaseModel):
    """Single chat message"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    role: str  # 'user' or 'assistant'
    content: str
    created_at: datetime = Field(default_factory=datetime.utcnow)


class ChatSession(BaseModel):
    """Chat session model"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    title: str = "Новый диалог"
    messages: List[ChatMessage] = []
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class ChatSessionCreate(BaseModel):
    """Request for creating a chat session"""
    title: Optional[str] = "Новый диалог"


class ChatRequest(BaseModel):
    """Request for sending a chat message"""
    message: str
    session_id: Optional[str] = None
    history: List[dict] = []
    update_state: bool = False


class ChecklistSuggestion(BaseModel):
    """AI-generated checklist suggestion"""
    items: List[str]
    reasoning: str
