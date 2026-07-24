from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.routers.admin import router as admin_router
from app.api.v1.routers.auth import router as auth_router
from app.api.v1.routers.feedback import router as feedback_router
from app.api.v1.routers.github import router as github_router
from app.api.v1.routers.interview import router as interview_router
from app.core.config import FRONTEND_ORIGINS
from app.core.database import Base, engine
from app.deps import get_db
from app.middleware.auth_middleware import AuthMiddleware
from app.models import conversation as _conversation_model  # noqa: F401 registers table on Base.metadata
from app.models import feedback as _feedback_model  # noqa: F401 registers table on Base.metadata
from app.models import github_connection as _github_connection_model  # noqa: F401 registers table on Base.metadata
from app.models import message as _message_model  # noqa: F401 registers table on Base.metadata
from app.models import refresh_token as _refresh_token_model  # noqa: F401 registers table on Base.metadata
from app.models import user as _user_model  # noqa: F401 registers table on Base.metadata
from app.models import user_memory as _user_memory_model  # noqa: F401 registers table on Base.metadata


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Poor-man's migration for columns added to a table that already existed before them:
        # create_all only creates missing tables, so new columns on `conversations` need this.
        await conn.execute(text("ALTER TABLE conversations ADD COLUMN IF NOT EXISTS summary TEXT NOT NULL DEFAULT ''"))
        await conn.execute(
            text("ALTER TABLE conversations ADD COLUMN IF NOT EXISTS summarized_count INTEGER NOT NULL DEFAULT 0")
        )
        await conn.execute(
            text("ALTER TABLE conversations ADD COLUMN IF NOT EXISTS pinned BOOLEAN NOT NULL DEFAULT FALSE")
        )
        await conn.execute(
            text("ALTER TABLE conversations ADD COLUMN IF NOT EXISTS mode VARCHAR(32) NOT NULL DEFAULT 'chat'")
        )
        await conn.execute(
            text("ALTER TABLE conversations ADD COLUMN IF NOT EXISTS repo_full_name VARCHAR(255)")
        )
        # user_memory moved from a free-text `content` column to a structured `data` JSONB
        # column (permanent_user_details + normal_user_memory) — old prose profiles aren't
        # reusable in the new shape, so the column is dropped rather than migrated.
        await conn.execute(text("ALTER TABLE user_memory DROP COLUMN IF EXISTS content"))
        await conn.execute(
            text("ALTER TABLE user_memory ADD COLUMN IF NOT EXISTS data JSONB NOT NULL DEFAULT '{}'::jsonb")
        )
        # Google sign-in (see app/services/google_auth_service.py): accounts created via Google
        # never set a password, and need a column to store Google's per-account "sub" claim.
        await conn.execute(text("ALTER TABLE users ALTER COLUMN hashed_password DROP NOT NULL"))
        await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS google_sub VARCHAR(255)"))
        await conn.execute(
            text("CREATE UNIQUE INDEX IF NOT EXISTS ix_users_google_sub ON users (google_sub)")
        )
        # Roles (see app/models/user.py UserRole): everyone defaults to USER; promoting to ADMIN
        # is done manually in the DB, there's no in-app promotion flow.
        await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'USER'"))
    yield


app = FastAPI(title="RAG Agent", lifespan=lifespan)

# Starlette's add_middleware prepends, and the stack wraps in reverse — so whichever is added
# LAST ends up OUTERMOST. CORS must be outermost so it can attach CORS headers even to
# AuthMiddleware's own 401 short-circuit responses; added inside it, those 401s would never
# reach CORSMiddleware and the browser would surface a CORS error instead of a readable 401.
app.add_middleware(AuthMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=FRONTEND_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(github_router)
app.include_router(interview_router)
app.include_router(feedback_router)
app.include_router(admin_router)


@app.get("/")
async def root():
    return {"status": "ok"}


@app.get("/health/db")
async def health_db(db: AsyncSession = Depends(get_db)):
    await db.execute(text("SELECT 1"))
    return {"database": "connected"}
