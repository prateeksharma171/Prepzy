import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr


class AdminUserOut(BaseModel):
    id: uuid.UUID
    email: EmailStr
    username: str
    first_name: str | None
    last_name: str | None
    role: str
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class AdminFeedbackUserSummary(BaseModel):
    id: uuid.UUID
    email: EmailStr
    username: str

    model_config = {"from_attributes": True}


class AdminFeedbackOut(BaseModel):
    id: uuid.UUID
    message: str
    created_at: datetime
    user: AdminFeedbackUserSummary

    model_config = {"from_attributes": True}


class UpdateUserStatusRequest(BaseModel):
    is_active: bool
