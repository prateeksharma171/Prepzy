import uuid
from datetime import datetime
from enum import Enum

from sqlalchemy import Boolean, DateTime, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class UserRole(str, Enum):
    ADMIN = "ADMIN"
    USER = "USER"


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    username: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    # Nullable because Google-only accounts (see google_sub) never set a password.
    hashed_password: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # Google's stable per-account "sub" claim, set once a Google sign-in is linked to this
    # user (see app/services/google_auth_service.py). Nullable/unique: most users won't have
    # one, but no two users may share the same Google account.
    google_sub: Mapped[str | None] = mapped_column(String(255), unique=True, index=True, nullable=True)
    first_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    last_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    # Plain string column (not a DB-native enum) to match the rest of this codebase's style of
    # app-level-constrained VARCHAR columns (e.g. Conversation.mode) rather than Postgres enums,
    # which don't support the idempotent `ADD COLUMN IF NOT EXISTS` migration style used here.
    role: Mapped[str] = mapped_column(String(20), nullable=False, default=UserRole.USER.value)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
