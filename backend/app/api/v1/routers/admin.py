import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_current_admin_user, get_db
from app.models.user import User
from app.schemas.admin import AdminFeedbackOut, AdminUserOut, UpdateUserStatusRequest
from app.services import feedback_service, user_service

router = APIRouter(prefix="/api/v1/admin", tags=["admin"])


@router.get("/users", response_model=list[AdminUserOut])
async def list_users(admin: User = Depends(get_current_admin_user), db: AsyncSession = Depends(get_db)):
    return await user_service.list_users(db)


@router.get("/users/{user_id}", response_model=AdminUserOut)
async def get_user(
    user_id: uuid.UUID, admin: User = Depends(get_current_admin_user), db: AsyncSession = Depends(get_db)
):
    user = await user_service.get_user_by_id(db, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user


@router.patch("/users/{user_id}/status", response_model=AdminUserOut)
async def update_user_status(
    user_id: uuid.UUID,
    payload: UpdateUserStatusRequest,
    admin: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    if user_id == admin.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot change your own account status"
        )

    user = await user_service.set_user_active(db, user_id, payload.is_active)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    await db.commit()
    return user


@router.get("/feedback", response_model=list[AdminFeedbackOut])
async def list_feedback(admin: User = Depends(get_current_admin_user), db: AsyncSession = Depends(get_db)):
    return await feedback_service.list_feedback(db)
