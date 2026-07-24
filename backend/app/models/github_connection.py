import uuid
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, LargeBinary, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class GithubConnection(Base):
    """One row per user: the GitHub account they've linked for repo chat (see
    app/agents/github_repo_agent.py). `encrypted_access_token` is a Fernet-encrypted OAuth
    token (see app/services/github_service.py) — never stored or logged in plaintext.
    """

    __tablename__ = "github_connections"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    github_user_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    github_username: Mapped[str] = mapped_column(String(255), nullable=False)
    encrypted_access_token: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    connected_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
