import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

# Structural default for a user with no memory yet — also used to backfill missing keys
# when reading rows written before a field was added (see memory_service.get_user_memory).
DEFAULT_MEMORY: dict[str, Any] = {
    "permanent_user_details": {
        "name": None,
        "age": None,
        "country": None,
        "profession": None,
        "long_term_goals": [],
        "preferences": [],
    },
    "normal_user_memory": [],
}


class UserMemory(Base):
    """Long-term memory: one evolving candidate profile per user, shared across all of their
    conversations. Maintained by an LLM extraction step (see app/agents/memory_agent.py).

    `data` holds two layers: `permanent_user_details` (stable facts, only ever added/updated
    when the candidate explicitly states them) and `normal_user_memory` (a rolling, capped
    list of recent conversational context)."""

    __tablename__ = "user_memory"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    data: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=lambda: DEFAULT_MEMORY)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
