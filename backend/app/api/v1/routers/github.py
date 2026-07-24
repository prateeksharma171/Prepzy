import logging
import uuid

import httpx
import jwt
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import FRONTEND_ORIGINS
from app.deps import get_current_user, get_db
from app.models.user import User
from app.schemas.github import GithubConnectionOut, GithubRepoListOut, GithubRepoOut
from app.services import github_service
from app.utils.helper import create_github_oauth_state, decode_token

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/github", tags=["github"])


async def _require_access_token(db: AsyncSession, user: User) -> str:
    connection = await github_service.get_connection(db, user.id)
    if connection is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="GitHub is not connected")
    return github_service.decrypt_token(connection.encrypted_access_token)


def _resolve_frontend_origin(candidate: str | None) -> str:
    # Auth cookies are host-scoped, so the callback must redirect back to whichever origin
    # actually started the flow — not a fixed default — or the browser lands authenticated on
    # one origin while holding session cookies for another. Validated against FRONTEND_ORIGINS
    # (an allowlist, same one CORS uses) so this can't be abused as an open redirect.
    if candidate and candidate in FRONTEND_ORIGINS:
        return candidate
    return FRONTEND_ORIGINS[0]


@router.get("/connect")
async def connect(origin: str | None = None, user: User = Depends(get_current_user)):
    """Kick off the OAuth dance: redirect the browser to GitHub's consent screen.

    `origin` is the frontend's own `window.location.origin` (see githubApi.ts) — carried through
    `state` so /callback below can send the browser back to the same origin it started from.
    """
    state = create_github_oauth_state(user.id, _resolve_frontend_origin(origin))
    return RedirectResponse(github_service.build_authorize_url(state))


@router.get("/callback")
async def callback(
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    """GitHub redirects here after the user approves/denies access. Public route (see
    PUBLIC_PATHS in auth_middleware.py) — identity comes from the signed `state` param, not a
    cookie, since this request is driven by GitHub, not our frontend.
    """
    # No `state` at all means we can't recover the origin to bounce back to — the only case
    # where falling back to a fixed default is unavoidable.
    if not state:
        return RedirectResponse(f"{FRONTEND_ORIGINS[0]}/?github=error")

    try:
        payload = decode_token(state, expected_type="github_oauth_state")
        user_id = uuid.UUID(payload["sub"])
        origin = _resolve_frontend_origin(payload.get("origin"))
    except (jwt.PyJWTError, ValueError):
        return RedirectResponse(f"{FRONTEND_ORIGINS[0]}/?github=error")

    if error or not code:
        return RedirectResponse(f"{origin}/?github=error")

    try:
        access_token = await github_service.exchange_code_for_token(code)
        profile = await github_service.fetch_github_profile(access_token)
        await github_service.upsert_connection(db, user_id, access_token, profile["id"], profile["login"])
        await db.commit()
    except Exception:
        logger.exception("GitHub OAuth callback failed for user %s", user_id)
        return RedirectResponse(f"{origin}/?github=error")

    return RedirectResponse(f"{origin}/?github=connected")


@router.get("/connection", response_model=GithubConnectionOut)
async def get_connection(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    connection = await github_service.get_connection(db, user.id)
    if connection is None:
        return GithubConnectionOut(connected=False)
    return GithubConnectionOut(
        connected=True, github_username=connection.github_username, connected_at=connection.connected_at
    )


@router.delete("/connection", status_code=status.HTTP_204_NO_CONTENT)
async def disconnect(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    connection = await github_service.get_connection(db, user.id)
    if connection is not None:
        await github_service.delete_connection(db, connection)
        await db.commit()


@router.get("/repos", response_model=GithubRepoListOut)
async def list_repos(
    page: int = Query(1, ge=1),
    per_page: int = Query(30, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    access_token = await _require_access_token(db, user)
    try:
        repos, has_more = await github_service.list_repos(access_token, page, per_page)
    except httpx.HTTPStatusError as exc:
        logger.warning("GitHub repo listing failed for user %s: %s", user.id, exc)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Could not reach GitHub")

    items = [
        GithubRepoOut(
            id=r["id"],
            full_name=r["full_name"],
            name=r["name"],
            private=r["private"],
            description=r.get("description"),
            default_branch=r["default_branch"],
            updated_at=r["updated_at"],
        )
        for r in repos
    ]
    return GithubRepoListOut(items=items, has_more=has_more)
