import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Conversation(Base):
    __tablename__ = "conversations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False, default="New interview prep session")
    pinned: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # "chat" (general coach) or "mock_interview" (interviewer persona, see mock_interview_agent.py).
    mode: Mapped[str] = mapped_column(String(32), nullable=False, default="chat")
    # Set only when mode == "github_repo" — the "owner/repo" this conversation's agent answers
    # questions about (see app/agents/github_repo_agent.py).
    repo_full_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # Short-term memory: rolling summary of messages older than the recent window (see
    # INTERVIEW_RECENT_MESSAGE_WINDOW), plus how many messages (from the start) it already covers.
    summary: Mapped[str] = mapped_column(Text, nullable=False, default="")
    summarized_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    messages: Mapped[list["Message"]] = relationship(
        back_populates="conversation", cascade="all, delete-orphan", order_by="Message.created_at"
    )
