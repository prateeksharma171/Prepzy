import re
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.utils.helper import hash_password

_USERNAME_CHARS = re.compile(r"[^a-zA-Z0-9_]")
# Leaves room for a numeric disambiguation suffix without exceeding the column's 50-char cap.
_USERNAME_BASE_MAX_LEN = 44


async def get_user_by_email(db: AsyncSession, email: str) -> User | None:
    result = await db.execute(select(User).where(User.email == email))
    return result.scalar_one_or_none()


async def get_user_by_username(db: AsyncSession, username: str) -> User | None:
    result = await db.execute(select(User).where(User.username == username))
    return result.scalar_one_or_none()


async def get_user_by_id(db: AsyncSession, user_id: uuid.UUID) -> User | None:
    return await db.get(User, user_id)


async def get_user_by_google_sub(db: AsyncSession, google_sub: str) -> User | None:
    result = await db.execute(select(User).where(User.google_sub == google_sub))
    return result.scalar_one_or_none()


async def _generate_unique_username(db: AsyncSession, email: str) -> str:
    """Derives a username candidate from the email's local part (Google sign-in never asks the
    user to pick one), then disambiguates with a numeric suffix if it's already taken."""
    base = _USERNAME_CHARS.sub("", email.split("@", 1)[0])[:_USERNAME_BASE_MAX_LEN] or "user"

    candidate = base
    suffix = 0
    while await get_user_by_username(db, candidate) is not None:
        suffix += 1
        candidate = f"{base}{suffix}"
    return candidate


async def create_user(
    db: AsyncSession,
    email: str,
    username: str,
    password: str,
    first_name: str | None,
    last_name: str | None,
) -> User:
    user = User(
        email=email,
        username=username,
        hashed_password=hash_password(password),
        first_name=first_name,
        last_name=last_name,
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)
    return user


async def create_google_user(
    db: AsyncSession, email: str, google_sub: str, first_name: str | None, last_name: str | None
) -> User:
    user = User(
        email=email,
        username=await _generate_unique_username(db, email),
        hashed_password=None,
        google_sub=google_sub,
        first_name=first_name,
        last_name=last_name,
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)
    return user


async def link_google_account(db: AsyncSession, user: User, google_sub: str) -> User:
    user.google_sub = google_sub
    await db.flush()
    return user


async def list_users(db: AsyncSession) -> list[User]:
    result = await db.execute(select(User).order_by(User.created_at.desc()))
    return list(result.scalars().all())


async def set_user_active(db: AsyncSession, user_id: uuid.UUID, is_active: bool) -> User | None:
    user = await get_user_by_id(db, user_id)
    if user is None:
        return None
    user.is_active = is_active
    await db.flush()
    return user
