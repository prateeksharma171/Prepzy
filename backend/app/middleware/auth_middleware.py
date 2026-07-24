"""Deny-by-default authentication gate for the API.

Every request under /api/v1/* must carry a valid access-token cookie unless its exact path is
listed in PUBLIC_PATHS. This runs before routing/dependency resolution, so a new route added under
/api/v1/ is protected automatically without anyone needing to remember to add a dependency for it.

On success, the authenticated user is attached to `request.state.user` so `app.deps.get_current_user`
can reuse it instead of re-decoding the token and re-querying the database per route.

Implemented as a raw ASGI middleware (not BaseHTTPMiddleware) so it never buffers or otherwise
interferes with the SSE StreamingResponse used by the interview chat endpoint — for an authenticated
request it does nothing but call through to `app` with the original scope/receive/send.
"""

import uuid

import jwt
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send

from app.core.database import async_session_factory
from app.models.user import User
from app.utils.helper import ACCESS_TOKEN_COOKIE, decode_token

PUBLIC_PATHS = frozenset(
    {
        "/",
        "/health/db",
        "/docs",
        "/redoc",
        "/openapi.json",
        "/docs/oauth2-redirect",
        "/api/v1/auth/signup",
        "/api/v1/auth/login",
        "/api/v1/auth/google",
        "/api/v1/auth/refresh",
        "/api/v1/auth/logout",
        # GitHub redirects the browser here directly (no cookie context guaranteed) — it
        # authenticates itself via the signed `state` param instead, see routers/github.py.
        "/api/v1/github/callback",
    }
)

GATED_PREFIX = "/api/v1/"


async def _authenticate(token: str) -> User | None:
    try:
        payload = decode_token(token, expected_type="access")
    except jwt.PyJWTError:
        return None

    async with async_session_factory() as db:
        user = await db.get(User, uuid.UUID(payload["sub"]))

    if user is None or not user.is_active:
        return None
    return user


class AuthMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        request = Request(scope, receive=receive)

        # CORS preflight carries no cookies by design; let it through unconditionally so the
        # browser's actual (credentialed) request always gets a valid preflight response.
        if request.method == "OPTIONS" or request.url.path in PUBLIC_PATHS:
            await self.app(scope, receive, send)
            return

        if not request.url.path.startswith(GATED_PREFIX):
            await self.app(scope, receive, send)
            return

        token = request.cookies.get(ACCESS_TOKEN_COOKIE)
        user = await _authenticate(token) if token else None

        if user is None:
            response = JSONResponse({"detail": "Not authenticated"}, status_code=401)
            await response(scope, receive, send)
            return

        scope.setdefault("state", {})["user"] = user
        await self.app(scope, receive, send)
