from __future__ import annotations
from datetime import datetime
from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    username: str = Field(min_length=2, max_length=80)
    password: str = Field(min_length=1, max_length=200)


class TaskCreate(BaseModel):
    hotspot_id: int
    assigned_worker_id: int | None = None
    due_at: datetime
    notes: str = Field(default="", max_length=1500)
    stream: str = "MIXED_UNKNOWN"


class TaskUpdate(BaseModel):
    assigned_worker_id: int | None = None
    due_at: datetime | None = None
    stream: str | None = None
    notes: str | None = Field(default=None, max_length=1500)


class FollowUpCreate(BaseModel):
    window_days: int = Field(ge=1, le=90)
    observed_state: str
    notes: str = Field(default="", max_length=1500)
    intervention_id: int | None = None


class InterventionCreate(BaseModel):
    hypothesis_code: str = Field(min_length=2, max_length=48)
    rationale: str = Field(min_length=8, max_length=2000)
    action_type: str = Field(min_length=2, max_length=80)
    owner: str = Field(min_length=2, max_length=120)
    due_at: datetime
    follow_up_dates: list[int] = Field(default_factory=lambda: [7, 30])


class InterventionUpdate(BaseModel):
    status: str | None = None
    outcome_notes: str | None = Field(default=None, max_length=2000)


class HandoffCreate(BaseModel):
    task_id: int
    stream: str
    receiver_name: str = Field(min_length=2, max_length=160)
    quantity: float | None = Field(default=None, ge=0)
    unit: str = Field(default="kg", max_length=24)
    status: str = "PENDING"
    notes: str = Field(default="", max_length=1500)


class HandoffUpdate(BaseModel):
    status: str
    notes: str | None = Field(default=None, max_length=1500)


class RecurrenceConfirm(BaseModel):
    report_id: int
    notes: str = Field(min_length=5, max_length=1500)


class AssociateReport(BaseModel):
    hotspot_id: int


class PilotConfigUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    radius_km: float | None = Field(default=None, gt=0, le=200)
    default_ward: str | None = Field(default=None, min_length=1, max_length=80)
