from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.farmer import Farmer
from app.models.all_models import Notification
import uuid


router = APIRouter()


class NotificationResponse(BaseModel):
    id: str
    title: str
    title_bn: str
    message: str
    message_bn: str
    type: str
    severity: str
    is_read: bool
    created_at: str


class NotificationCreateRequest(BaseModel):
    farmer_id: str
    title: str
    title_bn: str
    message: str
    message_bn: str
    notification_type: str
    severity: str = "info"


@router.get("/", response_model=List[NotificationResponse])
async def get_notifications(
    is_read: Optional[bool] = None,
    notification_type: Optional[str] = None,
    limit: int = 20,
    db: AsyncSession = Depends(get_db),
    current_user: Farmer = Depends(get_current_user),
):
    query = select(Notification).where(Notification.farmer_id == current_user.id)
    if is_read is not None:
        query = query.where(Notification.is_read == is_read)
    if notification_type:
        query = query.where(Notification.notification_type == notification_type)
    query = query.order_by(Notification.created_at.desc()).limit(limit)

    result = await db.execute(query)
    notifications = result.scalars().all()

    return [NotificationResponse(
        id=str(n.id),
        title=n.title,
        title_bn=n.title_bn,
        message=n.message,
        message_bn=n.message_bn,
        type=n.notification_type,
        severity=n.severity,
        is_read=n.is_read,
        created_at=str(n.created_at),
    ) for n in notifications]


@router.get("/unread-count")
async def get_unread_count(
    db: AsyncSession = Depends(get_db),
    current_user: Farmer = Depends(get_current_user),
):
    result = await db.execute(
        select(Notification).where(
            Notification.farmer_id == current_user.id,
            Notification.is_read == False,
        )
    )
    count = len(result.scalars().all())
    return {"unread_count": count}


@router.put("/{notification_id}/read")
async def mark_as_read(
    notification_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Farmer = Depends(get_current_user),
):
    result = await db.execute(
        select(Notification).where(
            Notification.id == notification_id,
            Notification.farmer_id == current_user.id,
        )
    )
    notification = result.scalar_one_or_none()
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")

    notification.is_read = True
    await db.commit()
    return {"message": "Notification marked as read"}


@router.put("/read-all")
async def mark_all_as_read(
    db: AsyncSession = Depends(get_db),
    current_user: Farmer = Depends(get_current_user),
):
    await db.execute(
        update(Notification)
        .where(Notification.farmer_id == current_user.id, Notification.is_read == False)
        .values(is_read=True)
    )
    await db.commit()
    return {"message": "All notifications marked as read"}


@router.post("/create")
async def create_notification(
    request: NotificationCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: Farmer = Depends(get_current_user),
):
    notification = Notification(
        id=uuid.uuid4(),
        farmer_id=uuid.UUID(request.farmer_id),
        title=request.title,
        title_bn=request.title_bn,
        message=request.message,
        message_bn=request.message_bn,
        notification_type=request.notification_type,
        severity=request.severity,
    )
    db.add(notification)
    await db.commit()
    return {"message": "Notification created", "id": str(notification.id)}
