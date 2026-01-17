"""
Checklist Models
"""
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime
import uuid


class ChecklistItem(BaseModel):
    """Single checklist item"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    text: str
    completed: bool = False


class ChecklistTemplateCreate(BaseModel):
    """Request for creating a checklist template"""
    name: str
    items: List[str]


class ChecklistTemplate(BaseModel):
    """Checklist template model"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    name: str
    items: List[str]
    created_at: datetime = Field(default_factory=datetime.utcnow)


class DailyChecklistCreate(BaseModel):
    """Request for creating/updating daily checklist"""
    date: str  # YYYY-MM-DD format
    items: List[ChecklistItem]
    template_id: Optional[str] = None


class DailyChecklist(BaseModel):
    """Daily checklist model"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    date: str
    items: List[ChecklistItem]
    template_id: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
