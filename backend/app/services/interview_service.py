import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.agents.prompts import (
    CODE_EXPLANATION_OPENING_MESSAGE,
    MOCK_INTERVIEW_OPENING_MESSAGE,
    PROJECT_QUESTIONS_OPENING_MESSAGE,
    RESUME_REVIEW_OPENING_MESSAGE,
    WEAKNESS_DETECTION_OPENING_MESSAGE,
)
from app.models.conversation import Conversation
from app.models.message import Message

DEFAULT_TITLE = "New interview prep session"
MOCK_INTERVIEW_DEFAULT_TITLE = "Mock interview session"
RESUME_REVIEW_DEFAULT_TITLE = "Resume review session"
PROJECT_QUESTIONS_DEFAULT_TITLE = "Project Q&A session"
CODE_EXPLANATION_DEFAULT_TITLE = "Code explanation session"
WEAKNESS_DETECTION_DEFAULT_TITLE = "Weakness detection session"
GITHUB_REPO_DEFAULT_TITLE = "GitHub repo chat"
TITLE_PREVIEW_LENGTH = 60

# Per-mode (default title, seeded opening message) — `None` opening message means the thread
# waits for the candidate to speak first (the plain "chat" case).
_MODE_DEFAULTS: dict[str, tuple[str, str | None]] = {
    "chat": (DEFAULT_TITLE, None),
    "mock_interview": (MOCK_INTERVIEW_DEFAULT_TITLE, MOCK_INTERVIEW_OPENING_MESSAGE),
    "resume_review": (RESUME_REVIEW_DEFAULT_TITLE, RESUME_REVIEW_OPENING_MESSAGE),
    "project_questions": (PROJECT_QUESTIONS_DEFAULT_TITLE, PROJECT_QUESTIONS_OPENING_MESSAGE),
    "code_explanation": (CODE_EXPLANATION_DEFAULT_TITLE, CODE_EXPLANATION_OPENING_MESSAGE),
    "weakness_detection": (WEAKNESS_DETECTION_DEFAULT_TITLE, WEAKNESS_DETECTION_OPENING_MESSAGE),
}
_DEFAULT_TITLES = {default_title for default_title, _ in _MODE_DEFAULTS.values()}


async def create_conversation(
    db: AsyncSession, user_id: uuid.UUID, title: str | None, mode: str = "chat", repo_full_name: str | None = None
) -> Conversation:
    if mode == "github_repo":
        # The repo name makes a more useful title than the generic default, and — unlike the
        # other modes' static defaults — it's not in _DEFAULT_TITLES, so add_message won't
        # overwrite it with the candidate's first question.
        default_title = repo_full_name or GITHUB_REPO_DEFAULT_TITLE
        opening_message = (
            f"Connected to **{repo_full_name}**. Ask me anything about this repository — its "
            "structure, a specific file, how a feature works, or where you'd change something."
            if repo_full_name
            else None
        )
    else:
        default_title, opening_message = _MODE_DEFAULTS.get(mode, (DEFAULT_TITLE, None))

    conversation = Conversation(
        user_id=user_id, title=title or default_title, mode=mode, repo_full_name=repo_full_name
    )
    db.add(conversation)
    if opening_message:
        # Seed the opening message so the thread starts with the assistant speaking first,
        # instead of waiting on the candidate. Appending to `.messages` while `conversation` is
        # still transient (not yet flushed) is a pure in-memory operation; add_message's own
        # flush then inserts both rows together. Touching `.messages` AFTER a flush instead would
        # trigger a real lazy-load query, which fails under AsyncSession outside a greenlet context.
        await add_message(db, conversation, "assistant", opening_message)
    else:
        await db.flush()
    await db.refresh(conversation)
    return conversation


async def list_conversations(
    db: AsyncSession, user_id: uuid.UUID, limit: int, offset: int, pinned: bool | None = None
) -> tuple[list[Conversation], bool]:
    stmt = select(Conversation).where(Conversation.user_id == user_id)
    if pinned is not None:
        stmt = stmt.where(Conversation.pinned == pinned)
    # Fetch one extra row to detect "is there a next page" without a separate COUNT query.
    result = await db.execute(stmt.order_by(Conversation.updated_at.desc()).limit(limit + 1).offset(offset))
    rows = list(result.scalars().all())
    has_more = len(rows) > limit
    return rows[:limit], has_more


async def get_conversation(db: AsyncSession, conversation_id: uuid.UUID, user_id: uuid.UUID) -> Conversation | None:
    result = await db.execute(
        select(Conversation)
        .options(selectinload(Conversation.messages))
        .where(Conversation.id == conversation_id, Conversation.user_id == user_id)
    )
    return result.scalar_one_or_none()


async def get_conversation_meta(
    db: AsyncSession, conversation_id: uuid.UUID, user_id: uuid.UUID
) -> Conversation | None:
    """Ownership-checked conversation row without eager-loading `messages` — for the paginated
    detail route, which fetches a page of messages separately via `get_conversation_messages`.
    `get_conversation` (above) stays as-is since it's also used internally where the full,
    ordered message history is needed (LLM context window, summarization)."""
    result = await db.execute(
        select(Conversation).where(Conversation.id == conversation_id, Conversation.user_id == user_id)
    )
    return result.scalar_one_or_none()


async def get_conversation_messages(
    db: AsyncSession, conversation_id: uuid.UUID, limit: int, offset: int
) -> tuple[list[Message], bool]:
    # Newest-first so `offset` walks backward through history page by page (page 0 = most
    # recent messages, matching how a chat should open); reversed back to ascending so each
    # page reads oldest-to-newest, same as the rest of the transcript.
    result = await db.execute(
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .order_by(Message.created_at.desc())
        .limit(limit + 1)
        .offset(offset)
    )
    rows = list(result.scalars().all())
    has_more = len(rows) > limit
    return list(reversed(rows[:limit])), has_more


async def delete_conversation(db: AsyncSession, conversation: Conversation) -> None:
    await db.delete(conversation)


async def set_conversation_pinned(db: AsyncSession, conversation: Conversation, pinned: bool) -> None:
    conversation.pinned = pinned
    await db.flush()
    await db.refresh(conversation)


async def add_message(db: AsyncSession, conversation: Conversation, role: str, content: str) -> Message:
    message = Message(role=role, content=content)
    # Append via the relationship (not `conversation_id=...`) so the in-memory
    # `conversation.messages` collection reflects the new message immediately,
    # without needing a re-query, for building the LLM history right after.
    conversation.messages.append(message)

    if role == "user" and conversation.title in _DEFAULT_TITLES:
        conversation.title = content[:TITLE_PREVIEW_LENGTH].strip() or DEFAULT_TITLE

    conversation.updated_at = datetime.now(timezone.utc)

    await db.flush()
    await db.refresh(message)
    return message


async def update_conversation_summary(
    db: AsyncSession, conversation: Conversation, summary: str, summarized_count: int
) -> None:
    conversation.summary = summary
    conversation.summarized_count = summarized_count
    await db.flush()
