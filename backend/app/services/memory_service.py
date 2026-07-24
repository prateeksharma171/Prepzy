import copy
import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user_memory import DEFAULT_MEMORY, UserMemory

ROLLING_MEMORY_CAP = 10


async def get_user_memory_record(db: AsyncSession, user_id: uuid.UUID) -> UserMemory | None:
    return await db.get(UserMemory, user_id)


def with_default_shape(record: UserMemory | None) -> dict[str, Any]:
    """Backfill a record's data with default keys so callers never have to special-case a
    missing row or one written before a field was added."""
    if record is None:
        return copy.deepcopy(DEFAULT_MEMORY)

    data = record.data or {}
    permanent = {**DEFAULT_MEMORY["permanent_user_details"], **data.get("permanent_user_details", {})}
    return {
        "permanent_user_details": permanent,
        "normal_user_memory": data.get("normal_user_memory", []),
    }


async def get_user_memory(db: AsyncSession, user_id: uuid.UUID) -> dict[str, Any]:
    """The candidate's structured memory, backfilled with default keys (see `with_default_shape`)."""
    record = await get_user_memory_record(db, user_id)
    return with_default_shape(record)


async def upsert_user_memory(db: AsyncSession, user_id: uuid.UUID, data: dict[str, Any]) -> None:
    record = await get_user_memory_record(db, user_id)
    if record is None:
        db.add(UserMemory(user_id=user_id, data=data))
    else:
        record.data = data
    await db.flush()


async def clear_user_memory(db: AsyncSession, user_id: uuid.UUID) -> None:
    record = await get_user_memory_record(db, user_id)
    if record is not None:
        await db.delete(record)


def merge_permanent_details(existing: dict[str, Any], updates: dict[str, Any]) -> dict[str, Any]:
    """Apply only the fields `updates` explicitly provides. Scalar fields are set/replaced;
    list fields (goals/preferences) are merged by appending new items. Anything omitted or
    empty in `updates` is left exactly as it was — permanent details are never auto-cleared."""
    merged = dict(existing)

    for field in ("name", "age", "country", "profession"):
        value = updates.get(field)
        if value:
            merged[field] = value

    for field in ("long_term_goals", "preferences"):
        new_items = [item for item in updates.get(field) or [] if item and item not in merged.get(field, [])]
        if new_items:
            merged[field] = [*merged.get(field, []), *new_items]

    return merged


def append_rolling_memory(existing: list[str], new_item: str | None, cap: int = ROLLING_MEMORY_CAP) -> list[str]:
    """Append `new_item` (if any) to the rolling memory, dropping the oldest entries once past `cap`."""
    if not new_item:
        return existing
    return [*existing, new_item][-cap:]


def format_memory_for_prompt(data: dict[str, Any]) -> str:
    """Render structured memory into the plain-text block injected into the coach's system
    prompt. Returns an empty string when there's nothing to say yet."""
    details = data.get("permanent_user_details", {})
    lines = []

    labels = {"name": "Name", "age": "Age", "country": "Country", "profession": "Profession"}
    for field, label in labels.items():
        if details.get(field):
            lines.append(f"{label}: {details[field]}")
    if details.get("long_term_goals"):
        lines.append(f"Goals: {', '.join(details['long_term_goals'])}")
    if details.get("preferences"):
        lines.append(f"Preferences: {', '.join(details['preferences'])}")

    rolling = data.get("normal_user_memory", [])
    if rolling:
        lines.append("Recent context:")
        lines.extend(f"- {item}" for item in rolling)

    return "\n".join(lines)
