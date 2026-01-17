"""
Notes Routes
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import List
from datetime import datetime
import logging

from ..models import User, Note, NoteCreate, NoteUpdate
from ..database import get_notes_collection
from ..services.auth import require_auth
from ..services.encryption import get_encryption

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/notes", tags=["Notes"])


@router.post("", response_model=Note)
async def create_note(note: NoteCreate, user: User = Depends(require_auth)):
    """Создать новую заметку"""
    note_obj = Note(**note.model_dump(), user_id=user.id)
    
    enc = get_encryption()
    encrypted_data = enc.encrypt_note(note_obj.model_dump())
    
    notes = get_notes_collection()
    await notes.insert_one(encrypted_data)
    
    return note_obj


@router.get("", response_model=List[Note])
async def get_notes(user: User = Depends(require_auth)):
    """Получить все заметки пользователя"""
    notes = get_notes_collection()
    cursor = notes.find({"user_id": user.id}).sort("updated_at", -1)
    notes_list = await cursor.to_list(1000)
    
    enc = get_encryption()
    return [Note(**enc.decrypt_note(note)) for note in notes_list]


@router.get("/{note_id}", response_model=Note)
async def get_note(note_id: str, user: User = Depends(require_auth)):
    """Получить заметку по ID"""
    notes = get_notes_collection()
    note = await notes.find_one({"id": note_id, "user_id": user.id})
    
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    
    enc = get_encryption()
    return Note(**enc.decrypt_note(note))


@router.put("/{note_id}", response_model=Note)
async def update_note(note_id: str, note_update: NoteUpdate, user: User = Depends(require_auth)):
    """Обновить заметку"""
    notes = get_notes_collection()
    note = await notes.find_one({"id": note_id, "user_id": user.id})
    
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    
    update_data = {k: v for k, v in note_update.model_dump().items() if v is not None}
    update_data["updated_at"] = datetime.utcnow()
    
    enc = get_encryption()
    encrypted_update = enc.encrypt_note(update_data)
    
    await notes.update_one({"id": note_id, "user_id": user.id}, {"$set": encrypted_update})
    
    updated_note = await notes.find_one({"id": note_id, "user_id": user.id})
    return Note(**enc.decrypt_note(updated_note))


@router.delete("/{note_id}")
async def delete_note(note_id: str, user: User = Depends(require_auth)):
    """Удалить заметку"""
    notes = get_notes_collection()
    result = await notes.delete_one({"id": note_id, "user_id": user.id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Note not found")
    
    return {"message": "Note deleted successfully"}
