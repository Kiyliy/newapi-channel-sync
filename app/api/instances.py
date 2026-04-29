from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.dependencies import AdminUser, CurrentUser, DbSession
from app.models import NewApiInstance
from app.schemas import InstanceCreate, InstanceOut, InstanceUpdate
from app.security import encrypt_secret

router = APIRouter(prefix="/instances", tags=["instances"])


def serialize_instance(instance: NewApiInstance) -> InstanceOut:
    return InstanceOut(
        id=instance.id,
        name=instance.name,
        base_url=instance.base_url,
        mcp_server_url=instance.mcp_server_url,
        mcp_transport=instance.mcp_transport,
        mcp_auth_type=instance.mcp_auth_type,
        mcp_secret_configured=instance.encrypted_mcp_secret is not None,
        mcp_config=instance.mcp_config or {},
        is_enabled=instance.is_enabled,
        created_at=instance.created_at,
        updated_at=instance.updated_at,
    )


def get_instance_or_404(db: DbSession, instance_id: int) -> NewApiInstance:
    instance = db.get(NewApiInstance, instance_id)
    if instance is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Instance not found")
    return instance


@router.get("", response_model=list[InstanceOut])
def list_instances(_: CurrentUser, db: DbSession) -> list[InstanceOut]:
    instances = db.scalars(select(NewApiInstance).order_by(NewApiInstance.id)).all()
    return [serialize_instance(instance) for instance in instances]


@router.post("", response_model=InstanceOut, status_code=status.HTTP_201_CREATED)
def create_instance(payload: InstanceCreate, _: AdminUser, db: DbSession) -> InstanceOut:
    existing = db.scalar(select(NewApiInstance).where(NewApiInstance.name == payload.name))
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Instance name already exists")

    instance = NewApiInstance(
        name=payload.name,
        base_url=payload.base_url,
        mcp_server_url=payload.mcp_server_url,
        mcp_transport=payload.mcp_transport,
        mcp_auth_type=payload.mcp_auth_type,
        encrypted_mcp_secret=encrypt_secret(payload.mcp_secret),
        mcp_config=payload.mcp_config,
        is_enabled=payload.is_enabled,
    )
    db.add(instance)
    db.commit()
    db.refresh(instance)
    return serialize_instance(instance)


@router.get("/{instance_id}", response_model=InstanceOut)
def get_instance(instance_id: int, _: CurrentUser, db: DbSession) -> InstanceOut:
    return serialize_instance(get_instance_or_404(db, instance_id))


@router.patch("/{instance_id}", response_model=InstanceOut)
def update_instance(instance_id: int, payload: InstanceUpdate, _: AdminUser, db: DbSession) -> InstanceOut:
    instance = get_instance_or_404(db, instance_id)

    for field in ["name", "base_url", "mcp_server_url", "mcp_transport", "mcp_auth_type", "mcp_config", "is_enabled"]:
        if field in payload.model_fields_set:
            setattr(instance, field, getattr(payload, field))
    if "mcp_secret" in payload.model_fields_set:
        instance.encrypted_mcp_secret = encrypt_secret(payload.mcp_secret)

    db.add(instance)
    db.commit()
    db.refresh(instance)
    return serialize_instance(instance)


@router.delete("/{instance_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_instance(instance_id: int, _: AdminUser, db: DbSession) -> None:
    instance = get_instance_or_404(db, instance_id)
    db.delete(instance)
    db.commit()
