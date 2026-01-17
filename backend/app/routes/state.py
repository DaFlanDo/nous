"""
State Routes (Neurotransmitters and Cognitive Metrics)
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional
import logging
import traceback

from ..models import User, StateRecord, StateMetrics
from ..database import get_states_collection, get_notes_collection
from ..services.auth import require_auth
from ..services.encryption import get_encryption
from ..services.ai import get_ai_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/states", tags=["State"])


@router.get("", response_model=List[StateRecord])
async def get_states(user: User = Depends(require_auth), limit: int = 30):
    """Получить историю состояний"""
    states = get_states_collection()
    cursor = states.find({"user_id": user.id}).sort("created_at", -1).limit(limit)
    states_list = await cursor.to_list(limit)
    
    enc = get_encryption()
    return [StateRecord(**enc.decrypt_state_record(s)) for s in states_list]


@router.get("/latest", response_model=Optional[StateRecord])
async def get_latest_state(user: User = Depends(require_auth)):
    """Получить последнее состояние"""
    states = get_states_collection()
    state = await states.find_one(
        {"user_id": user.id},
        sort=[("created_at", -1)]
    )
    
    if state:
        enc = get_encryption()
        return StateRecord(**enc.decrypt_state_record(state))
    
    return None


@router.post("/analyze", response_model=StateRecord)
async def analyze_state_from_notes(user: User = Depends(require_auth)):
    """Проанализировать состояние на основе последних записей"""
    logger.info("analyze_state_from_notes called")
    
    try:
        notes_coll = get_notes_collection()
        cursor = notes_coll.find({"user_id": user.id}).sort("created_at", -1).limit(5)
        notes = await cursor.to_list(5)
        
        logger.info(f"Found {len(notes)} notes")
        
        if not notes:
            raise HTTPException(status_code=400, detail="No notes found for analysis")
        
        enc = get_encryption()
        decrypted_notes = [enc.decrypt_note(n) for n in notes]
        notes_text = "\n\n".join([
            f"**{n['title']}**\n{n['content']}"
            for n in decrypted_notes
        ])
        
        logger.debug(f"Notes text length: {len(notes_text)}")
        
        ai = get_ai_service()
        state_data = await ai.analyze_state(f"Записи пользователя:\n{notes_text}")
        
        if not state_data:
            raise HTTPException(status_code=500, detail="Failed to analyze state")
        
        state_record = StateRecord(
            user_id=user.id,
            metrics=StateMetrics(**state_data.get("metrics", {})),
            analysis=state_data.get("analysis", "")
        )
        
        encrypted_state = enc.encrypt_state_record(state_record.model_dump())
        states = get_states_collection()
        await states.insert_one(encrypted_state)
        
        logger.info(f"Saved state record: {state_record.id}")
        
        return state_record
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Analyze state error: {type(e).__name__} - {str(e)}")
        logger.error(f"Traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"{type(e).__name__}: {str(e)}")
