import uuid
from collections.abc import AsyncGenerator

import jwt
from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import async_session_factory
from app.models.user import User, UserRole
from app.utils.helper import ACCESS_TOKEN_COOKIE, decode_token


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with async_session_factory() as session:
        yield session


async def get_current_user(request: Request, db: AsyncSession = Depends(get_db)) -> User:
    # AuthMiddleware already authenticated this request for any gated /api/v1/* path and attached
    # the user here — reuse it instead of re-decoding the token and re-querying the database.
    # Falls through to the checks below for any path the middleware doesn't gate.
    cached_user = getattr(request.state, "user", None)
    if cached_user is not None:
        return cached_user

    token = request.cookies.get(ACCESS_TOKEN_COOKIE)
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    try:
        payload = decode_token(token, expected_type="access")
    except jwt.PyJWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired access token")

    user = await db.get(User, uuid.UUID(payload["sub"]))
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive")

    return user


async def get_current_admin_user(user: User = Depends(get_current_user)) -> User:
    if user.role != UserRole.ADMIN.value:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return user
