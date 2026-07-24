import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

import bcrypt
import jwt
from fastapi import Response

from app.core.config import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    COOKIE_SAMESITE,
    COOKIE_SECURE,
    JWT_ALGORITHM,
    JWT_SECRET_KEY,
    REFRESH_TOKEN_EXPIRE_DAYS,
)

ACCESS_TOKEN_COOKIE = "access_token"
REFRESH_TOKEN_COOKIE = "refresh_token"
REFRESH_TOKEN_COOKIE_PATH = "/api/v1/auth"


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(password.encode("utf-8"), hashed_password.encode("utf-8"))


# A valid bcrypt hash with no matching password, used to run a dummy verify_password
# call when a login identifier doesn't match any user. Keeps "user not found" and
# "wrong password" responses similarly timed so login can't be used to enumerate accounts.
DUMMY_PASSWORD_HASH = hash_password(uuid.uuid4().hex)


def _create_token(
    subject: str, token_type: str, expires_delta: timedelta, jti: str | None = None, **extra_claims: Any
) -> str:
    now = datetime.now(timezone.utc)
    payload: dict[str, Any] = {"sub": subject, "type": token_type, "iat": now, "exp": now + expires_delta}
    if jti is not None:
        payload["jti"] = jti
    payload.update(extra_claims)
    return jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)


def create_access_token(user_id: uuid.UUID) -> str:
    return _create_token(str(user_id), "access", timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))


def create_refresh_token(user_id: uuid.UUID, jti: uuid.UUID) -> str:
    return _create_token(str(user_id), "refresh", timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS), jti=str(jti))


def create_github_oauth_state(user_id: uuid.UUID, frontend_origin: str) -> str:
    """Short-lived signed token carrying `user_id` and the initiating frontend origin through the
    GitHub OAuth redirect round-trip.

    Stands in for server-side session state: the callback (see routers/github.py) can't rely on
    the request carrying our auth cookie (GitHub, not our frontend, drives that redirect), so the
    signature + short expiry are what prove the callback belongs to a real, recent /connect call.

    `frontend_origin` matters because auth cookies are host-scoped: if multiple FRONTEND_ORIGINS
    are configured (e.g. localhost plus a LAN IP for testing from another device) and the
    callback redirected to a fixed one instead of whichever origin actually started the flow, the
    browser would land on a different origin than the one it's authenticated on, with no session
    cookies at all — every request after that would look logged-out.
    """
    return _create_token(str(user_id), "github_oauth_state", timedelta(minutes=10), origin=frontend_origin)


def decode_token(token: str, expected_type: str) -> dict[str, Any]:
    """Decode and validate a JWT, raising jwt.PyJWTError on any failure.

    Checking the `type` claim stops a refresh token from being replayed as an
    access token (or vice versa) even though both share the same signing secret.
    """
    payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
    if payload.get("type") != expected_type:
        raise jwt.InvalidTokenError(f"Expected a {expected_type} token")
    return payload


def set_auth_cookies(response: Response, access_token: str, refresh_token: str) -> None:
    response.set_cookie(
        key=ACCESS_TOKEN_COOKIE,
        value=access_token,
        max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite=COOKIE_SAMESITE,
        path="/",
    )
    response.set_cookie(
        key=REFRESH_TOKEN_COOKIE,
        value=refresh_token,
        max_age=REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite=COOKIE_SAMESITE,
        path=REFRESH_TOKEN_COOKIE_PATH,
    )


def clear_auth_cookies(response: Response) -> None:
    response.delete_cookie(ACCESS_TOKEN_COOKIE, path="/")
    response.delete_cookie(REFRESH_TOKEN_COOKIE, path=REFRESH_TOKEN_COOKIE_PATH)
