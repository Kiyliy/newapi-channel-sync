from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.dependencies import CurrentUser, DbSession
from app.models import Channel, ChannelBinding, NewApiInstance, User
from app.schemas import BindingOut, BindInstancesRequest, ChannelCreate, ChannelOut, ChannelUpdate
from app.security import decrypt_secret, encrypt_secret

router = APIRouter(prefix="/channels", tags=["channels"])


def get_channel_or_404(db: DbSession, channel_id: int) -> Channel:
    channel = db.get(Channel, channel_id)
    if channel is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Channel not found")
    return channel


def serialize_channel(channel: Channel, viewer: User) -> ChannelOut:
    key = decrypt_secret(channel.encrypted_key) if viewer.role == "admin" else None
    return ChannelOut(
        id=channel.id,
        name=channel.name,
        type=channel.type,
        status=channel.status,
        base_url=channel.base_url,
        models=channel.models or [],
        groups=channel.groups or [],
        priority=channel.priority,
        weight=channel.weight,
        model_mapping=channel.model_mapping or {},
        extra_config=channel.extra_config or {},
        key_configured=channel.encrypted_key is not None,
        key=key,
        created_by_id=channel.created_by_id,
        created_at=channel.created_at,
        updated_at=channel.updated_at,
    )


@router.get("", response_model=list[ChannelOut])
def list_channels(user: CurrentUser, db: DbSession) -> list[ChannelOut]:
    channels = db.scalars(select(Channel).order_by(Channel.id)).all()
    return [serialize_channel(channel, user) for channel in channels]


@router.post("", response_model=ChannelOut, status_code=status.HTTP_201_CREATED)
def create_channel(payload: ChannelCreate, user: CurrentUser, db: DbSession) -> ChannelOut:
    channel = Channel(
        name=payload.name,
        type=payload.type,
        status=payload.status,
        base_url=payload.base_url,
        models=payload.models,
        groups=payload.groups,
        priority=payload.priority,
        weight=payload.weight,
        model_mapping=payload.model_mapping,
        extra_config=payload.extra_config,
        encrypted_key=encrypt_secret(payload.key),
        created_by_id=user.id,
    )
    db.add(channel)
    db.commit()
    db.refresh(channel)
    return serialize_channel(channel, user)


@router.get("/{channel_id}", response_model=ChannelOut)
def get_channel(channel_id: int, user: CurrentUser, db: DbSession) -> ChannelOut:
    return serialize_channel(get_channel_or_404(db, channel_id), user)


@router.patch("/{channel_id}", response_model=ChannelOut)
def update_channel(channel_id: int, payload: ChannelUpdate, user: CurrentUser, db: DbSession) -> ChannelOut:
    channel = get_channel_or_404(db, channel_id)
    for field in [
        "name",
        "type",
        "status",
        "base_url",
        "models",
        "groups",
        "priority",
        "weight",
        "model_mapping",
        "extra_config",
    ]:
        if field in payload.model_fields_set:
            setattr(channel, field, getattr(payload, field))
    if "key" in payload.model_fields_set:
        channel.encrypted_key = encrypt_secret(payload.key)

    db.add(channel)
    db.commit()
    db.refresh(channel)
    return serialize_channel(channel, user)


@router.delete("/{channel_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_channel(channel_id: int, _: CurrentUser, db: DbSession) -> None:
    channel = get_channel_or_404(db, channel_id)
    db.delete(channel)
    db.commit()


@router.get("/{channel_id}/bindings", response_model=list[BindingOut])
def list_bindings(channel_id: int, _: CurrentUser, db: DbSession) -> list[ChannelBinding]:
    get_channel_or_404(db, channel_id)
    return list(db.scalars(select(ChannelBinding).where(ChannelBinding.channel_id == channel_id).order_by(ChannelBinding.id)))


@router.post("/{channel_id}/bindings", response_model=list[BindingOut], status_code=status.HTTP_201_CREATED)
def bind_instances(
    channel_id: int,
    payload: BindInstancesRequest,
    _: CurrentUser,
    db: DbSession,
) -> list[ChannelBinding]:
    get_channel_or_404(db, channel_id)
    instances = db.scalars(select(NewApiInstance).where(NewApiInstance.id.in_(payload.instance_ids))).all()
    found_ids = {instance.id for instance in instances}
    missing_ids = sorted(set(payload.instance_ids) - found_ids)
    if missing_ids:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Instances not found: {missing_ids}")

    bindings: list[ChannelBinding] = []
    for instance_id in payload.instance_ids:
        binding = db.scalar(
            select(ChannelBinding).where(
                ChannelBinding.channel_id == channel_id,
                ChannelBinding.instance_id == instance_id,
            )
        )
        if binding is None:
            binding = ChannelBinding(channel_id=channel_id, instance_id=instance_id)
            db.add(binding)
        bindings.append(binding)

    db.commit()
    for binding in bindings:
        db.refresh(binding)
    return bindings


@router.delete("/{channel_id}/bindings/{instance_id}", status_code=status.HTTP_204_NO_CONTENT)
def unbind_instance(channel_id: int, instance_id: int, _: CurrentUser, db: DbSession) -> None:
    binding = db.scalar(
        select(ChannelBinding).where(
            ChannelBinding.channel_id == channel_id,
            ChannelBinding.instance_id == instance_id,
        )
    )
    if binding is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Binding not found")
    db.delete(binding)
    db.commit()
