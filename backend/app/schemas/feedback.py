import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class FeedbackCreate(BaseModel):
    message: str = Field(min_length=1, max_length=2000)


class FeedbackOut(BaseModel):
    id: uuid.UUID
    message: str
    created_at: datetime

    model_config = {"from_attributes": True}
