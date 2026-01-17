"""
Note Models
"""
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
import uuid


class NoteBase(BaseModel):
    """Base note fields"""
    title: str
    content: str


class NoteCreate(NoteBase):
    """Request for creating a note"""
    pass


class NoteUpdate(BaseModel):
    """Request for updating a note"""
    title: Optional[str] = None
    content: Optional[str] = None


class Note(NoteBase):
    """Note model with all fields"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
