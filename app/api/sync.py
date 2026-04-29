from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select

from app.dependencies import CurrentUser, DbSession
from app.models import Channel, ChannelBinding, SyncLog
from app.schemas import SyncChannelRequest, SyncLogOut, SyncResultOut
from app.sync_service import sync_binding

router = APIRouter(prefix="/sync", tags=["sync"])


@router.post("/channels/{channel_id}", response_model=list[SyncResultOut])
def sync_channel(
    channel_id: int,
    payload: SyncChannelRequest,
    user: CurrentUser,
    db: DbSession,
) -> list[SyncResultOut]:
    channel = db.get(Channel, channel_id)
    if channel is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Channel not found")

    query = select(ChannelBinding).where(ChannelBinding.channel_id == channel_id).order_by(ChannelBinding.id)
    if payload.instance_ids:
        query = query.where(ChannelBinding.instance_id.in_(payload.instance_ids))
    bindings = list(db.scalars(query))

    if not bindings:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No bindings found for sync")

    return [sync_binding(db, binding, user) for binding in bindings]


@router.post("/bindings/{binding_id}", response_model=SyncResultOut)
def sync_single_binding(binding_id: int, user: CurrentUser, db: DbSession) -> SyncResultOut:
    binding = db.get(ChannelBinding, binding_id)
    if binding is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Binding not found")
    return sync_binding(db, binding, user)


@router.get("/logs", response_model=list[SyncLogOut])
def list_sync_logs(
    _: CurrentUser,
    db: DbSession,
    channel_id: int | None = None,
    instance_id: int | None = None,
    limit: int = Query(default=100, ge=1, le=500),
) -> list[SyncLog]:
    query = select(SyncLog).order_by(SyncLog.created_at.desc()).limit(limit)
    if channel_id is not None:
        query = query.where(SyncLog.channel_id == channel_id)
    if instance_id is not None:
        query = query.where(SyncLog.instance_id == instance_id)
    return list(db.scalars(query))
