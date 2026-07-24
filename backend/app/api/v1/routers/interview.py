import asyncio
import json
import logging
import re
import uuid
from collections.abc import AsyncIterator

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from groq import RateLimitError
from langchain_core.messages import AIMessage, HumanMessage
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.code_explanation_agent import stream_code_explanation_reply
from app.agents.github_repo_agent import stream_github_repo_reply
from app.agents.interview_agent import stream_interview_reply
from app.agents.memory_agent import extract_user_memory, summarize_conversation
from app.agents.mock_interview_agent import stream_mock_interview_reply
from app.agents.project_questions_agent import stream_project_questions_reply
from app.agents.prompts import REFUSAL_MESSAGE
from app.agents.resume_agent import stream_resume_review_reply
from app.agents.weakness_detection_agent import stream_weakness_detection_reply
from app.core.config import INTERVIEW_RECENT_MESSAGE_WINDOW, INTERVIEW_SUMMARIZE_TRIGGER
from app.core.database import async_session_factory
from app.deps import get_current_user, get_db
from app.models.conversation import Conversation
from app.models.user import User
from app.schemas.interview import (
    ChatRequest,
    ConversationCreate,
    ConversationDetailOut,
    ConversationListOut,
    ConversationOut,
    ConversationUpdate,
    MessagePageOut,
    UserMemoryOut,
)
from app.services import github_service, interview_service, memory_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/interview", tags=["interview"])

DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 100

# Per-mode reply generator — everything except plain "chat" (which falls back to
# stream_interview_reply below) is a dedicated persona agent from app/agents/.
_MODE_STREAM_FN = {
    "mock_interview": stream_mock_interview_reply,
    "resume_review": stream_resume_review_reply,
    "project_questions": stream_project_questions_reply,
    "code_explanation": stream_code_explanation_reply,
    "weakness_detection": stream_weakness_detection_reply,
}

# Groq's rate-limit error message embeds a human-readable wait time, e.g. "...Please try
# again in 24m8.064s. Need more tokens?..." — best-effort extraction to surface that same
# hint to the user; falls back to a generic message if the format ever changes.
_RETRY_HINT_RE = re.compile(r"try again in ([\d.]+[a-z]+(?:[\d.]+[a-z]+)*)", re.IGNORECASE)


def _rate_limit_message(exc: Exception) -> str:
    match = _RETRY_HINT_RE.search(str(exc))
    if match:
        return f"The interview coach has hit its usage limit for today and needs about {match.group(1)} to reset. Please try again shortly."
    return "The interview coach has hit its usage limit for today. Please try again in a little while."

# Fire-and-forget background tasks (long-term memory extraction, conversation summarization) need a
# strong reference kept somewhere, or asyncio may garbage-collect them mid-flight.
_background_tasks: set[asyncio.Task] = set()


def _spawn_background(coro) -> None:
    task = asyncio.create_task(coro)
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)


async def _update_user_memory(user_id: uuid.UUID, user_message: str, assistant_reply: str) -> None:
    try:
        async with async_session_factory() as db:
            existing = await memory_service.get_user_memory(db, user_id)
            extraction = await extract_user_memory(existing, user_message, assistant_reply)

            updated_permanent = memory_service.merge_permanent_details(
                existing["permanent_user_details"], extraction.permanent_updates.model_dump()
            )
            updated_rolling = memory_service.append_rolling_memory(
                existing["normal_user_memory"], extraction.new_summary_item
            )
            updated = {"permanent_user_details": updated_permanent, "normal_user_memory": updated_rolling}

            if updated != existing:
                await memory_service.upsert_user_memory(db, user_id, updated)
                await db.commit()
    except Exception:
        logger.exception("Failed to update memory for user %s", user_id)


async def _maybe_summarize_conversation(conversation_id: uuid.UUID, user_id: uuid.UUID) -> None:
    try:
        async with async_session_factory() as db:
            conversation = await interview_service.get_conversation(db, conversation_id, user_id)
            if conversation is None:
                return

            messages = conversation.messages
            if len(messages) <= INTERVIEW_SUMMARIZE_TRIGGER:
                return

            fold_upto = len(messages) - INTERVIEW_RECENT_MESSAGE_WINDOW
            if fold_upto <= conversation.summarized_count:
                return

            to_fold = messages[conversation.summarized_count : fold_upto]
            fold_messages = [
                HumanMessage(content=m.content) if m.role == "user" else AIMessage(content=m.content)
                for m in to_fold
            ]
            updated_summary = await summarize_conversation(conversation.summary, fold_messages)
            await interview_service.update_conversation_summary(db, conversation, updated_summary, fold_upto)
            await db.commit()
    except Exception:
        logger.exception("Failed to summarize conversation %s", conversation_id)


async def _get_owned_conversation(db: AsyncSession, conversation_id: uuid.UUID, user: User) -> Conversation:
    conversation = await interview_service.get_conversation(db, conversation_id, user.id)
    if conversation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")
    return conversation


@router.post("/conversations", response_model=ConversationOut, status_code=status.HTTP_201_CREATED)
async def create_conversation(
    payload: ConversationCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if payload.mode == "github_repo":
        if not payload.repo_full_name:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="repo_full_name is required")
        if await github_service.get_connection(db, user.id) is None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="GitHub is not connected")

    conversation = await interview_service.create_conversation(
        db, user.id, payload.title, payload.mode, payload.repo_full_name
    )
    await db.commit()
    return conversation


@router.get("/conversations", response_model=ConversationListOut)
async def list_conversations(
    limit: int = Query(DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
    offset: int = Query(0, ge=0),
    pinned: bool | None = Query(None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    items, has_more = await interview_service.list_conversations(db, user.id, limit, offset, pinned)
    return ConversationListOut(items=items, has_more=has_more)


@router.patch("/conversations/{conversation_id}", response_model=ConversationOut)
async def update_conversation(
    conversation_id: uuid.UUID,
    payload: ConversationUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    conversation = await _get_owned_conversation(db, conversation_id, user)
    await interview_service.set_conversation_pinned(db, conversation, payload.pinned)
    await db.commit()
    return conversation


@router.get("/conversations/{conversation_id}", response_model=ConversationDetailOut)
async def get_conversation(
    conversation_id: uuid.UUID,
    limit: int = Query(DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
    offset: int = Query(0, ge=0),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    conversation = await interview_service.get_conversation_meta(db, conversation_id, user.id)
    if conversation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")
    messages, has_more = await interview_service.get_conversation_messages(db, conversation_id, limit, offset)
    return ConversationDetailOut(
        **ConversationOut.model_validate(conversation).model_dump(),
        messages=MessagePageOut(items=messages, has_more=has_more),
    )


@router.delete("/conversations/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_conversation(
    conversation_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    conversation = await _get_owned_conversation(db, conversation_id, user)
    await interview_service.delete_conversation(db, conversation)
    await db.commit()


@router.post("/conversations/{conversation_id}/messages")
async def send_message(
    conversation_id: uuid.UUID,
    payload: ChatRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Post a user message and stream the coach's reply back as Server-Sent Events.

    Each SSE `data:` line is a JSON object: {"type": "token", "content": "..."} while
    the reply streams in, followed by a final {"type": "done", "message_id": "..."} or
    {"type": "error", "content": "..."} if the model call failed.
    """
    conversation = await _get_owned_conversation(db, conversation_id, user)

    await interview_service.add_message(db, conversation, "user", payload.content)
    await db.commit()

    # Short-term memory: only the recent window goes to the LLM verbatim; anything older is
    # already folded into `conversation.summary` by a background task from a previous turn.
    recent_messages = conversation.messages[-INTERVIEW_RECENT_MESSAGE_WINDOW:]
    history = [
        HumanMessage(content=m.content) if m.role == "user" else AIMessage(content=m.content)
        for m in recent_messages
    ]
    conversation_summary = conversation.summary

    # Long-term memory: the candidate's cross-conversation profile.
    existing_memory = await memory_service.get_user_memory(db, user.id)
    memory_context = memory_service.format_memory_for_prompt(existing_memory)

    if conversation.mode == "github_repo":
        # Needs the candidate's decrypted GitHub token + the linked repo, unlike every other
        # mode above, so it can't go through the plain history/memory/summary dispatch table.
        connection = await github_service.get_connection(db, user.id)
        if connection is None or not conversation.repo_full_name:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="GitHub is not connected")
        access_token = github_service.decrypt_token(connection.encrypted_access_token)
        reply_stream = stream_github_repo_reply(
            history,
            memory=memory_context,
            summary=conversation_summary,
            repo_full_name=conversation.repo_full_name,
            access_token=access_token,
        )
    else:
        stream_fn = _MODE_STREAM_FN.get(conversation.mode, stream_interview_reply)
        reply_stream = stream_fn(history, memory=memory_context, summary=conversation_summary)

    async def event_stream() -> AsyncIterator[str]:
        reply_parts: list[str] = []
        try:
            async for chunk in reply_stream:
                reply_parts.append(chunk)
                yield f"data: {json.dumps({'type': 'token', 'content': chunk})}\n\n"
        except RateLimitError as exc:
            logger.warning("Groq rate limit hit for conversation %s: %s", conversation_id, exc)
            yield "data: " + json.dumps({"type": "error", "content": _rate_limit_message(exc)}) + "\n\n"
            return
        except Exception:
            logger.exception("Coach reply failed for conversation %s", conversation_id)
            yield (
                "data: "
                + json.dumps(
                    {
                        "type": "error",
                        "content": "The interview coach is temporarily unavailable. Please try again.",
                    }
                )
                + "\n\n"
            )
            return

        full_reply = "".join(reply_parts).strip()
        message_id = None
        if full_reply:
            # Use a fresh session here: the request-scoped `db` dependency may already
            # be torn down by the time this generator runs, since it executes after
            # the StreamingResponse is returned from the endpoint.
            async with async_session_factory() as save_db:
                saved_conversation = await interview_service.get_conversation(save_db, conversation_id, user.id)
                if saved_conversation is not None:
                    saved_message = await interview_service.add_message(
                        save_db, saved_conversation, "assistant", full_reply
                    )
                    await save_db.commit()
                    message_id = str(saved_message.id)

            # Best-effort, non-blocking: update memory after the reply is already on its way
            # to the client, so neither adds latency to the response.
            if full_reply != REFUSAL_MESSAGE:
                _spawn_background(_update_user_memory(user.id, payload.content, full_reply))
            _spawn_background(_maybe_summarize_conversation(conversation_id, user.id))

        yield f"data: {json.dumps({'type': 'done', 'message_id': message_id})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/memory", response_model=UserMemoryOut)
async def get_memory(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """The candidate's long-term memory profile, shared across all of their conversations."""
    record = await memory_service.get_user_memory_record(db, user.id)
    data = memory_service.with_default_shape(record)
    return UserMemoryOut(
        permanent_user_details=data["permanent_user_details"],
        normal_user_memory=data["normal_user_memory"],
        updated_at=record.updated_at if record is not None else None,
    )


@router.delete("/memory", status_code=status.HTTP_204_NO_CONTENT)
async def delete_memory(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await memory_service.clear_user_memory(db, user.id)
    await db.commit()
