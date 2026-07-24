import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class ConversationCreate(BaseModel):
    title: str | None = Field(default=None, max_length=255)
    mode: Literal[
        "chat",
        "mock_interview",
        "resume_review",
        "project_questions",
        "code_explanation",
        "weakness_detection",
        "github_repo",
    ] = "chat"
    # Required when mode == "github_repo": the "owner/repo" this conversation is about.
    repo_full_name: str | None = Field(default=None, max_length=255)


class ConversationOut(BaseModel):
    id: uuid.UUID
    title: str
    pinned: bool
    mode: str
    repo_full_name: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ConversationUpdate(BaseModel):
    pinned: bool


class MessageOut(BaseModel):
    id: uuid.UUID
    role: str
    content: str
    created_at: datetime

    model_config = {"from_attributes": True}


class ConversationListOut(BaseModel):
    items: list[ConversationOut]
    has_more: bool


class MessagePageOut(BaseModel):
    items: list[MessageOut]
    has_more: bool


class ConversationDetailOut(ConversationOut):
    messages: MessagePageOut


class ChatRequest(BaseModel):
    content: str = Field(min_length=1, max_length=8000)


class PermanentUserDetails(BaseModel):
    name: str | None = None
    age: str | None = None
    country: str | None = None
    profession: str | None = None
    long_term_goals: list[str] = Field(default_factory=list)
    preferences: list[str] = Field(default_factory=list)


class UserMemoryOut(BaseModel):
    permanent_user_details: PermanentUserDetails
    normal_user_memory: list[str]
    updated_at: datetime | None
