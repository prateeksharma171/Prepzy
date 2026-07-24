import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.feedback import Feedback


async def create_feedback(db: AsyncSession, user_id: uuid.UUID, message: str) -> Feedback:
    feedback = Feedback(user_id=user_id, message=message)
    db.add(feedback)
    await db.flush()
    await db.refresh(feedback)
    return feedback


async def list_feedback(db: AsyncSession) -> list[Feedback]:
    result = await db.execute(
        select(Feedback).options(selectinload(Feedback.user)).order_by(Feedback.created_at.desc())
    )
    return list(result.scalars().all())
