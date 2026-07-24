"""GitHub OAuth connection plus repo/file access for the repo-chat agent (see
app/agents/github_repo_agent.py). Access tokens are encrypted at rest since they grant read
access to the user's GitHub account, including private repos when the `repo` scope is granted.
"""

import base64
import hashlib
import uuid

import httpx
from cryptography.fernet import Fernet
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, GITHUB_OAUTH_REDIRECT_URI, JWT_SECRET_KEY
from app.models.github_connection import GithubConnection

GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize"
GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token"
GITHUB_API_BASE = "https://api.github.com"
OAUTH_SCOPE = "repo read:user"

# Paths filtered out of the repo tree before it's ever shown to the LLM — keeps the file-picker
# prompt small and steers it away from files it couldn't usefully read anyway.
_IGNORED_DIR_SEGMENTS = {
    ".git", "node_modules", "dist", "build", ".next", "__pycache__", ".venv", "venv",
    "vendor", "target", ".idea", ".vscode",
}
_IGNORED_EXTENSIONS = {
    ".lock", ".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico", ".woff", ".woff2", ".ttf",
    ".eot", ".pdf", ".zip", ".gz", ".mp4", ".mp3", ".pyc", ".class", ".exe", ".bin",
}
MAX_TREE_ENTRIES = 400
MAX_SELECTED_FILES = 6
MAX_FILE_CHARS = 8000

# Fernet needs a 32-byte urlsafe-base64 key; derived from the app's existing JWT secret so
# connecting GitHub doesn't require yet another secret to provision and keep in sync.
_fernet = Fernet(base64.urlsafe_b64encode(hashlib.sha256(JWT_SECRET_KEY.encode("utf-8")).digest()))


def encrypt_token(token: str) -> bytes:
    return _fernet.encrypt(token.encode("utf-8"))


def decrypt_token(blob: bytes) -> str:
    return _fernet.decrypt(bytes(blob)).decode("utf-8")


def build_authorize_url(state: str) -> str:
    return (
        f"{GITHUB_AUTHORIZE_URL}?client_id={GITHUB_CLIENT_ID}&redirect_uri={GITHUB_OAUTH_REDIRECT_URI}"
        f"&scope={OAUTH_SCOPE.replace(' ', '%20')}&state={state}"
    )


def _auth_headers(access_token: str) -> dict:
    return {"Authorization": f"Bearer {access_token}", "Accept": "application/vnd.github+json"}


async def exchange_code_for_token(code: str) -> str:
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.post(
            GITHUB_TOKEN_URL,
            headers={"Accept": "application/json"},
            data={
                "client_id": GITHUB_CLIENT_ID,
                "client_secret": GITHUB_CLIENT_SECRET,
                "code": code,
                "redirect_uri": GITHUB_OAUTH_REDIRECT_URI,
            },
        )
        response.raise_for_status()
        payload = response.json()

    if "access_token" not in payload:
        raise ValueError(f"GitHub token exchange failed: {payload.get('error_description', payload)}")
    return payload["access_token"]


async def fetch_github_profile(access_token: str) -> dict:
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(f"{GITHUB_API_BASE}/user", headers=_auth_headers(access_token))
        response.raise_for_status()
        return response.json()


async def get_connection(db: AsyncSession, user_id: uuid.UUID) -> GithubConnection | None:
    return await db.get(GithubConnection, user_id)


async def upsert_connection(
    db: AsyncSession, user_id: uuid.UUID, access_token: str, github_user_id: int, github_username: str
) -> GithubConnection:
    connection = await get_connection(db, user_id)
    encrypted = encrypt_token(access_token)
    if connection is None:
        connection = GithubConnection(
            user_id=user_id,
            github_user_id=github_user_id,
            github_username=github_username,
            encrypted_access_token=encrypted,
        )
        db.add(connection)
    else:
        connection.github_user_id = github_user_id
        connection.github_username = github_username
        connection.encrypted_access_token = encrypted
    await db.flush()
    return connection


async def delete_connection(db: AsyncSession, connection: GithubConnection) -> None:
    await db.delete(connection)


async def list_repos(access_token: str, page: int = 1, per_page: int = 30) -> tuple[list[dict], bool]:
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(
            f"{GITHUB_API_BASE}/user/repos",
            headers=_auth_headers(access_token),
            params={
                "sort": "updated",
                "per_page": per_page,
                "page": page,
                "affiliation": "owner,collaborator,organization_member",
            },
        )
        response.raise_for_status()
        repos = response.json()
    has_more = 'rel="next"' in response.headers.get("Link", "")
    return repos, has_more


async def get_default_branch(access_token: str, owner: str, repo: str) -> str:
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(f"{GITHUB_API_BASE}/repos/{owner}/{repo}", headers=_auth_headers(access_token))
        response.raise_for_status()
        return response.json()["default_branch"]


def _is_relevant_path(path: str) -> bool:
    segments = path.split("/")
    if any(segment in _IGNORED_DIR_SEGMENTS for segment in segments[:-1]):
        return False
    filename = segments[-1]
    ext = f".{filename.rsplit('.', 1)[-1].lower()}" if "." in filename else ""
    return ext not in _IGNORED_EXTENSIONS


async def get_repo_tree(access_token: str, owner: str, repo: str) -> list[str]:
    """Flat, filtered list of file paths in the repo's default branch, capped to
    MAX_TREE_ENTRIES so the file-selection prompt stays small even for large repos."""
    branch = await get_default_branch(access_token, owner, repo)
    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.get(
            f"{GITHUB_API_BASE}/repos/{owner}/{repo}/git/trees/{branch}",
            headers=_auth_headers(access_token),
            params={"recursive": "1"},
        )
        response.raise_for_status()
        tree = response.json().get("tree", [])

    paths = [item["path"] for item in tree if item.get("type") == "blob" and _is_relevant_path(item["path"])]
    return paths[:MAX_TREE_ENTRIES]


async def get_file_content(access_token: str, owner: str, repo: str, path: str) -> str:
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(
            f"{GITHUB_API_BASE}/repos/{owner}/{repo}/contents/{path}", headers=_auth_headers(access_token)
        )
        response.raise_for_status()
        data = response.json()

    if data.get("encoding") != "base64":
        return ""
    content = base64.b64decode(data["content"]).decode("utf-8", errors="replace")
    return content[:MAX_FILE_CHARS]
