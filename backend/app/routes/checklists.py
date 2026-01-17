"""
Checklists Routes
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional
import logging

from ..models import (
    User, ChecklistTemplate, ChecklistTemplateCreate,
    DailyChecklist, DailyChecklistCreate
)
from ..database import get_templates_collection, get_checklists_collection
from ..services.auth import require_auth
from ..services.encryption import get_encryption

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Checklists"])


# ============ TEMPLATES ============

@router.post("/templates", response_model=ChecklistTemplate)
async def create_template(template: ChecklistTemplateCreate, user: User = Depends(require_auth)):
    """Создать шаблон чеклиста"""
    template_obj = ChecklistTemplate(**template.model_dump(), user_id=user.id)
    
    enc = get_encryption()
    encrypted_data = enc.encrypt_checklist_template(template_obj.model_dump())
    
    templates = get_templates_collection()
    await templates.insert_one(encrypted_data)
    
    return template_obj


@router.get("/templates", response_model=List[ChecklistTemplate])
async def get_templates(user: User = Depends(require_auth)):
    """Получить все шаблоны чеклистов"""
    templates = get_templates_collection()
    cursor = templates.find({"user_id": user.id})
    templates_list = await cursor.to_list(100)
    
    enc = get_encryption()
    return [ChecklistTemplate(**enc.decrypt_checklist_template(t)) for t in templates_list]


@router.delete("/templates/{template_id}")
async def delete_template(template_id: str, user: User = Depends(require_auth)):
    """Удалить шаблон чеклиста"""
    templates = get_templates_collection()
    result = await templates.delete_one({"id": template_id, "user_id": user.id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Template not found")
    
    return {"message": "Template deleted successfully"}


# ============ DAILY CHECKLISTS ============

@router.post("/checklists", response_model=DailyChecklist)
async def create_or_update_daily_checklist(
    checklist: DailyChecklistCreate,
    user: User = Depends(require_auth)
):
    """Создать или обновить дневной чеклист"""
    checklists = get_checklists_collection()
    enc = get_encryption()
    
    existing = await checklists.find_one({"date": checklist.date, "user_id": user.id})
    
    if existing:
        items_dict = [item.model_dump() for item in checklist.items]
        encrypted_items = enc.encrypt_checklist({"items": items_dict})["items"]
        
        await checklists.update_one(
            {"date": checklist.date, "user_id": user.id},
            {"$set": {"items": encrypted_items}}
        )
        
        updated = await checklists.find_one({"date": checklist.date, "user_id": user.id})
        return DailyChecklist(**enc.decrypt_checklist(updated))
    else:
        checklist_obj = DailyChecklist(**checklist.model_dump(), user_id=user.id)
        checklist_dict = checklist_obj.model_dump()
        checklist_dict["items"] = [item.model_dump() for item in checklist_obj.items]
        
        encrypted_data = enc.encrypt_checklist(checklist_dict)
        await checklists.insert_one(encrypted_data)
        
        return checklist_obj


@router.get("/checklists/{date}", response_model=Optional[DailyChecklist])
async def get_daily_checklist(date: str, user: User = Depends(require_auth)):
    """Получить чеклист на дату"""
    checklists = get_checklists_collection()
    checklist = await checklists.find_one({"date": date, "user_id": user.id})
    
    if not checklist:
        return None
    
    enc = get_encryption()
    return DailyChecklist(**enc.decrypt_checklist(checklist))


@router.put("/checklists/{date}/items/{item_id}")
async def toggle_checklist_item(date: str, item_id: str, user: User = Depends(require_auth)):
    """Переключить статус элемента чеклиста"""
    checklists = get_checklists_collection()
    checklist = await checklists.find_one({"date": date, "user_id": user.id})
    
    if not checklist:
        raise HTTPException(status_code=404, detail="Checklist not found")
    
    items = checklist.get("items", [])
    for item in items:
        if item["id"] == item_id:
            item["completed"] = not item["completed"]
            break
    
    await checklists.update_one(
        {"date": date, "user_id": user.id},
        {"$set": {"items": items}}
    )
    
    return {"message": "Item toggled"}
