import uuid
from datetime import datetime, timezone

import jwt
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_current_user, get_db
from app.models.user import User
from app.schemas.auth import GoogleLoginRequest, LoginRequest, SignupRequest, UserOut
from app.services import auth_service, google_auth_service, user_service
from app.utils.helper import (
    DUMMY_PASSWORD_HASH,
    REFRESH_TOKEN_COOKIE,
    clear_auth_cookies,
    decode_token,
    set_auth_cookies,
    verify_password,
)

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


@router.post("/signup", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def signup(payload: SignupRequest, response: Response, db: AsyncSession = Depends(get_db)):
    if await user_service.get_user_by_email(db, payload.email) is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email is already registered")

    if await user_service.get_user_by_username(db, payload.username) is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username is already taken")

    user = await user_service.create_user(
        db, payload.email, payload.username, payload.password, payload.first_name, payload.last_name
    )
    access_token, refresh_token = await auth_service.issue_tokens(db, user.id)
    await db.commit()

    set_auth_cookies(response, access_token, refresh_token)
    return user


@router.post("/login", response_model=UserOut)
async def login(payload: LoginRequest, response: Response, db: AsyncSession = Depends(get_db)):
    user = await user_service.get_user_by_email(db, payload.identifier)
    if user is None:
        user = await user_service.get_user_by_username(db, payload.identifier)

    # Always run a bcrypt comparison, even when no user was found (or the user is a Google-only
    # account with no password set), so the response time doesn't leak whether the identifier
    # exists or how it authenticates.
    has_password = user is not None and user.hashed_password is not None
    password_valid = verify_password(
        payload.password, user.hashed_password if has_password else DUMMY_PASSWORD_HASH
    )

    if user is None or not has_password or not password_valid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email/username or password"
        )

    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Account is inactive")

    access_token, refresh_token = await auth_service.issue_tokens(db, user.id)
    await db.commit()

    set_auth_cookies(response, access_token, refresh_token)
    return user


@router.post("/google", response_model=UserOut)
async def google_login(payload: GoogleLoginRequest, response: Response, db: AsyncSession = Depends(get_db)):
    try:
        claims = google_auth_service.verify_id_token(payload.credential)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid Google credential")

    if not claims.get("email_verified"):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Google email is not verified")

    google_sub = claims["sub"]
    email = claims["email"]

    user = await user_service.get_user_by_google_sub(db, google_sub)
    if user is None:
        # Not linked yet: fall back to matching by email so someone who originally signed up
        # with a password can also sign in with Google on the same account, rather than ending
        # up with two separate accounts for one email address.
        user = await user_service.get_user_by_email(db, email)
        if user is not None:
            user = await user_service.link_google_account(db, user, google_sub)
        else:
            user = await user_service.create_google_user(
                db, email, google_sub, claims.get("given_name"), claims.get("family_name")
            )

    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Account is inactive")

    access_token, refresh_token = await auth_service.issue_tokens(db, user.id)
    await db.commit()

    set_auth_cookies(response, access_token, refresh_token)
    return user


@router.post("/refresh", response_model=UserOut)
async def refresh(request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    token = request.cookies.get(REFRESH_TOKEN_COOKIE)
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing refresh token")

    try:
        payload = decode_token(token, expected_type="refresh")
    except jwt.PyJWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired refresh token")

    jti = uuid.UUID(payload["jti"])
    user_id = uuid.UUID(payload["sub"])

    record = await auth_service.get_refresh_token_record(db, jti)
    if record is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    if record.revoked or record.expires_at < datetime.now(timezone.utc):
        # Reuse of an already-rotated (or expired) refresh token: treat it as a
        # possible theft and kill every session for this user, not just this one.
        await auth_service.revoke_all_refresh_tokens(db, user_id)
        await db.commit()
        clear_auth_cookies(response)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token reuse detected, all sessions revoked",
        )

    user = await user_service.get_user_by_id(db, user_id)
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive")

    # Rotate: retire the used refresh token and issue a brand new pair.
    await auth_service.revoke_refresh_token(db, jti)
    access_token, new_refresh_token = await auth_service.issue_tokens(db, user.id)
    await db.commit()

    set_auth_cookies(response, access_token, new_refresh_token)
    return user


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    token = request.cookies.get(REFRESH_TOKEN_COOKIE)
    if token:
        try:
            payload = decode_token(token, expected_type="refresh")
            await auth_service.revoke_refresh_token(db, uuid.UUID(payload["jti"]))
            await db.commit()
        except jwt.PyJWTError:
            pass
    clear_auth_cookies(response)


@router.get("/me", response_model=UserOut)
async def me(user: User = Depends(get_current_user)):
    return user
