from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_current_user, get_db
from app.models.user import User
from app.schemas.feedback import FeedbackCreate, FeedbackOut
from app.services import feedback_service

router = APIRouter(prefix="/api/v1/feedback", tags=["feedback"])


@router.post("", response_model=FeedbackOut, status_code=status.HTTP_201_CREATED)
async def submit_feedback(
    payload: FeedbackCreate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    feedback = await feedback_service.create_feedback(db, user.id, payload.message)
    await db.commit()
    return feedback
