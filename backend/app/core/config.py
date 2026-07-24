import os

from dotenv import load_dotenv

load_dotenv()

DATABASE_CONNECTION_STRING = os.getenv("DATABASE_CONNECTION_STRING")

if not DATABASE_CONNECTION_STRING:
    raise RuntimeError("DATABASE_CONNECTION_STRING is not set in the environment")

# Rewritten to use the psycopg (v3) driver for the async engine: Neon's pooled
# endpoint connection string carries libpq-style params (sslmode, channel_binding)
# that asyncpg can't parse, and asyncpg's prepared-statement caching conflicts
# with Neon's pgbouncer pooler.
DATABASE_URL = (
    DATABASE_CONNECTION_STRING.replace("postgresql://", "postgresql+psycopg://", 1)
    if DATABASE_CONNECTION_STRING.startswith("postgresql://")
    else DATABASE_CONNECTION_STRING
)

JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY")

if not JWT_SECRET_KEY:
    raise RuntimeError("JWT_SECRET_KEY is not set in the environment")

JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "15"))
REFRESH_TOKEN_EXPIRE_DAYS = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", "30"))

ENVIRONMENT = os.getenv("ENVIRONMENT", "development")
IS_PRODUCTION = ENVIRONMENT == "production"

# Cross-origin cookies need SameSite=None, which browsers only honor over HTTPS
# (Secure=True). In local/dev (plain HTTP) we fall back to Lax + non-Secure so
# cookies still work on http://localhost.
COOKIE_SECURE = IS_PRODUCTION
COOKIE_SAMESITE = "none" if IS_PRODUCTION else "lax"

# Comma-separated so the same backend can serve the frontend from multiple origins at once
# (e.g. localhost for local dev plus a LAN IP so other machines on the network can reach it).
FRONTEND_ORIGINS = [
    origin.strip()
    for origin in os.getenv("FRONTEND_ORIGINS", "http://localhost:3000").split(",")
    if origin.strip()
]

GROQ_API_KEY = os.getenv("GROQ_API_KEY")

if not GROQ_API_KEY:
    raise RuntimeError("GROQ_API_KEY is not set in the environment")

# Main interview-coaching model: strong reasoning/quality for detailed, guided answers.
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
# Model used to classify whether a message is in-scope (interview prep or not). Defaults to the
# same strong model as the coach: smaller/faster Groq models were tested and proved unreliable at
# this judgment call (e.g. wrongly refusing plain DSA questions like "reverse a linked list").
GROQ_GUARD_MODEL = os.getenv("GROQ_GUARD_MODEL", GROQ_MODEL)

# Short-term memory: how many of the most recent messages are sent to the LLM verbatim. Once a
# conversation grows past INTERVIEW_SUMMARIZE_TRIGGER messages, everything older than the recent
# window gets folded into a rolling summary instead of being sent raw.
INTERVIEW_RECENT_MESSAGE_WINDOW = int(os.getenv("INTERVIEW_RECENT_MESSAGE_WINDOW", "12"))
INTERVIEW_SUMMARIZE_TRIGGER = int(os.getenv("INTERVIEW_SUMMARIZE_TRIGGER", "20"))

GITHUB_CLIENT_ID = os.getenv("GITHUB_CLIENT_ID")
GITHUB_CLIENT_SECRET = os.getenv("GITHUB_CLIENT_SECRET")
GITHUB_OAUTH_REDIRECT_URI = os.getenv("GITHUB_OAUTH_REDIRECT_URI")

if not (GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET and GITHUB_OAUTH_REDIRECT_URI):
    raise RuntimeError(
        "GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET and GITHUB_OAUTH_REDIRECT_URI must all be set in the environment"
    )

# Audience the Google Identity Services ID token (credential) must be issued for — see
# app/services/google_auth_service.py. Same value the frontend passes as
# NEXT_PUBLIC_GOOGLE_CLIENT_ID when initializing the Google Sign-In button.
GOOGLE_WEB_CLIENT_ID = os.getenv("GOOGLE_WEB_CLIENT_ID")

if not GOOGLE_WEB_CLIENT_ID:
    raise RuntimeError("GOOGLE_WEB_CLIENT_ID is not set in the environment")

