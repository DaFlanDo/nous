"""
Chat Routes
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import List
from datetime import datetime
import logging

from ..models import (
    User, ChatSession, ChatSessionCreate, ChatRequest,
    ChatMessage, Note, StateRecord, StateMetrics
)
from ..database import (
    get_chat_sessions_collection,
    get_notes_collection,
    get_states_collection
)
from ..services.auth import require_auth
from ..services.encryption import get_encryption
from ..services.ai import get_ai_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/chat", tags=["Chat"])


@router.post("")
async def chat_with_ai(request: ChatRequest, user: User = Depends(require_auth)):
    """Отправить сообщение AI с оптимизацией истории"""
    try:
        ai = get_ai_service()
        enc = get_encryption()
        
        # Get AI response with optimized history
        result = await ai.get_reflection_response(
            message=request.message,
            history=request.history,
            history_summary=request.history_summary
        )
        
        # Save messages to session if session_id provided
        if request.session_id:
            user_msg = ChatMessage(role="user", content=request.message)
            assistant_msg = ChatMessage(role="assistant", content=result["response"])
            
            encrypted_user_msg = user_msg.model_dump()
            encrypted_user_msg['content'] = enc.encrypt(encrypted_user_msg['content'])
            encrypted_assistant_msg = assistant_msg.model_dump()
            encrypted_assistant_msg['content'] = enc.encrypt(encrypted_assistant_msg['content'])
            
            # Сохраняем также history_summary в сессии
            update_data = {
                "$push": {"messages": {"$each": [encrypted_user_msg, encrypted_assistant_msg]}},
                "$set": {"updated_at": datetime.utcnow()}
            }
            
            # Если обновился саммари - сохраним его
            if result.get("history_summary"):
                update_data["$set"]["history_summary"] = enc.encrypt(result["history_summary"])
            
            sessions = get_chat_sessions_collection()
            await sessions.update_one(
                {"id": request.session_id},
                update_data
            )
        
        # Update state if requested
        if request.update_state:
            try:
                # Build context for state analysis
                context = "\n".join([
                    f"{'Пользователь' if m['role'] == 'user' else 'Ассистент'}: {m['content']}"
                    for m in request.history
                ])
                context += f"\nПользователь: {request.message}"
                
                state_data = await ai.analyze_state(context)
                
                if state_data:
                    state_record = StateRecord(
                        user_id=user.id,
                        metrics=StateMetrics(**state_data.get("metrics", {})),
                        analysis=state_data.get("analysis", "")
                    )
                    
                    encrypted_state = enc.encrypt_state_record(state_record.model_dump())
                    states = get_states_collection()
                    await states.insert_one(encrypted_state)
                    
                    result["state_updated"] = True
                    result["state"] = state_record.model_dump()
            except Exception as e:
                logger.error(f"State analysis error: {str(e)}")
        
        return result
        
    except Exception as e:
        logger.error(f"Chat error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/sessions", response_model=ChatSession)
async def create_chat_session(
    user: User = Depends(require_auth),
    session: ChatSessionCreate = None
):
    """Создать новую сессию чата"""
    session_obj = ChatSession(
        user_id=user.id,
        title=session.title if session and session.title else "Новый диалог"
    )
    
    enc = get_encryption()
    encrypted_session = enc.encrypt_chat_session(session_obj.model_dump())
    
    sessions = get_chat_sessions_collection()
    await sessions.insert_one(encrypted_session)
    
    return session_obj


@router.get("/sessions", response_model=List[ChatSession])
async def get_chat_sessions(user: User = Depends(require_auth), limit: int = 50):
    """Получить список сессий чата"""
    sessions = get_chat_sessions_collection()
    cursor = sessions.find({"user_id": user.id}).sort("updated_at", -1).limit(limit)
    sessions_list = await cursor.to_list(limit)
    
    enc = get_encryption()
    return [ChatSession(**enc.decrypt_chat_session(s)) for s in sessions_list]


@router.get("/sessions/{session_id}", response_model=ChatSession)
async def get_chat_session(session_id: str, user: User = Depends(require_auth)):
    """Получить сессию чата по ID"""
    sessions = get_chat_sessions_collection()
    session = await sessions.find_one({"id": session_id, "user_id": user.id})
    
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    enc = get_encryption()
    return ChatSession(**enc.decrypt_chat_session(session))


@router.put("/sessions/{session_id}/title")
async def update_session_title(
    session_id: str,
    title: str,
    user: User = Depends(require_auth)
):
    """Обновить название сессии"""
    enc = get_encryption()
    encrypted_title = enc.encrypt(title)
    
    sessions = get_chat_sessions_collection()
    result = await sessions.update_one(
        {"id": session_id, "user_id": user.id},
        {"$set": {"title": encrypted_title, "updated_at": datetime.utcnow()}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Session not found")
    
    return {"message": "Title updated"}


@router.delete("/sessions/{session_id}")
async def delete_chat_session(session_id: str, user: User = Depends(require_auth)):
    """Удалить сессию чата"""
    sessions = get_chat_sessions_collection()
    result = await sessions.delete_one({"id": session_id, "user_id": user.id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Session not found")
    
    return {"message": "Session deleted"}


@router.post("/sessions/{session_id}/summary")
async def create_summary_from_session(session_id: str, user: User = Depends(require_auth)):
    """Создать выжимку (записку) на основе диалога"""
    sessions = get_chat_sessions_collection()
    session = await sessions.find_one({"id": session_id, "user_id": user.id})
    
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    enc = get_encryption()
    decrypted_session = enc.decrypt_chat_session(session)
    session_obj = ChatSession(**decrypted_session)
    
    if len(session_obj.messages) < 2:
        raise HTTPException(status_code=400, detail="Not enough messages for summary")
    
    dialog_text = "\n".join([
        f"{'Пользователь' if m.role == 'user' else 'Ассистент'}: {m.content}"
        for m in session_obj.messages
    ])
    
    ai = get_ai_service()
    summary_data = await ai.create_summary(dialog_text)
    
    if not summary_data:
        raise HTTPException(status_code=500, detail="Failed to create summary")
    
    note_content = f"🤖 AI-выжимка из диалога\n\n{summary_data.get('content', '')}"
    
    note_obj = Note(
        user_id=user.id,
        title=f"✨ {summary_data.get('title', 'Выжимка из диалога')}",
        content=note_content
    )
    
    encrypted_note = enc.encrypt_note(note_obj.model_dump())
    notes = get_notes_collection()
    await notes.insert_one(encrypted_note)
    
    return {
        "note": note_obj.model_dump(),
        "message": "Выжимка создана и сохранена в записки"
    }


@router.post("/suggest-tasks")
async def suggest_tasks(request: ChatRequest, user: User = Depends(require_auth)):
    """Получить предложения задач на основе диалога"""
    try:
        ai = get_ai_service()
        return await ai.suggest_tasks(request.message, request.history)
    except Exception as e:
        logger.error(f"Suggest tasks error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
