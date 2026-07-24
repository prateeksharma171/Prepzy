import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import REFRESH_TOKEN_EXPIRE_DAYS
from app.models.refresh_token import RefreshToken
from app.utils.helper import create_access_token, create_refresh_token


async def issue_tokens(db: AsyncSession, user_id: uuid.UUID) -> tuple[str, str]:
    jti = uuid.uuid4()
    expires_at = datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    db.add(RefreshToken(jti=jti, user_id=user_id, expires_at=expires_at))
    await db.flush()

    access_token = create_access_token(user_id)
    refresh_token = create_refresh_token(user_id, jti)
    return access_token, refresh_token


async def get_refresh_token_record(db: AsyncSession, jti: uuid.UUID) -> RefreshToken | None:
    return await db.get(RefreshToken, jti)


async def revoke_refresh_token(db: AsyncSession, jti: uuid.UUID) -> None:
    record = await db.get(RefreshToken, jti)
    if record is not None:
        record.revoked = True
        await db.flush()


async def revoke_all_refresh_tokens(db: AsyncSession, user_id: uuid.UUID) -> None:
    await db.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == user_id, RefreshToken.revoked.is_(False))
        .values(revoked=True)
    )
    await db.flush()
