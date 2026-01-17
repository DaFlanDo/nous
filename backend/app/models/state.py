"""
State Models (Neurotransmitters and Cognitive Metrics)
"""
from pydantic import BaseModel, Field
from datetime import datetime
import uuid


class StateMetrics(BaseModel):
    """Psychophysiological state metrics"""
    # Neurotransmitters (0-10)
    dopamine: float = 5.0
    serotonin: float = 5.0
    gaba: float = 5.0
    noradrenaline: float = 5.0
    cortisol: float = 5.0
    testosterone: float = 5.0
    # Cognitive metrics (0-10)
    pfc_activity: float = 5.0  # Prefrontal cortex activity
    focus: float = 5.0
    energy: float = 5.0
    motivation: float = 5.0


class StateRecord(BaseModel):
    """State record model"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    metrics: StateMetrics
    analysis: str = ""  # AI analysis of state
    created_at: datetime = Field(default_factory=datetime.utcnow)
