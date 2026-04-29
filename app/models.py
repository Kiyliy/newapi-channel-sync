from datetime import UTC, datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


def utcnow() -> datetime:
    return datetime.now(UTC)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(20), default="user", index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class NewApiInstance(Base):
    __tablename__ = "newapi_instances"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    base_url: Mapped[str] = mapped_column(String(500))
    mcp_server_url: Mapped[str] = mapped_column(String(500))
    mcp_transport: Mapped[str] = mapped_column(String(40), default="mock")
    mcp_auth_type: Mapped[str] = mapped_column(String(40), default="bearer")
    encrypted_mcp_secret: Mapped[str | None] = mapped_column(Text, nullable=True)
    mcp_config: Mapped[dict] = mapped_column(JSON, default=dict)
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    bindings: Mapped[list["ChannelBinding"]] = relationship(
        back_populates="instance",
        cascade="all, delete-orphan",
    )


class Channel(Base):
    __tablename__ = "channels"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(160), index=True)
    type: Mapped[int] = mapped_column(Integer)
    status: Mapped[int] = mapped_column(Integer, default=1)
    base_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    models: Mapped[list[str]] = mapped_column(JSON, default=list)
    groups: Mapped[list[str]] = mapped_column(JSON, default=list)
    priority: Mapped[int] = mapped_column(Integer, default=0)
    weight: Mapped[int] = mapped_column(Integer, default=100)
    model_mapping: Mapped[dict] = mapped_column(JSON, default=dict)
    extra_config: Mapped[dict] = mapped_column(JSON, default=dict)
    encrypted_key: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    bindings: Mapped[list["ChannelBinding"]] = relationship(
        back_populates="channel",
        cascade="all, delete-orphan",
    )


class ChannelBinding(Base):
    __tablename__ = "channel_bindings"
    __table_args__ = (UniqueConstraint("channel_id", "instance_id", name="uq_channel_instance"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    channel_id: Mapped[int] = mapped_column(ForeignKey("channels.id"), index=True)
    instance_id: Mapped[int] = mapped_column(ForeignKey("newapi_instances.id"), index=True)
    remote_channel_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    sync_status: Mapped[str] = mapped_column(String(30), default="pending", index=True)
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    channel: Mapped[Channel] = relationship(back_populates="bindings")
    instance: Mapped[NewApiInstance] = relationship(back_populates="bindings")


class SyncLog(Base):
    __tablename__ = "sync_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    channel_id: Mapped[int] = mapped_column(ForeignKey("channels.id"), index=True)
    instance_id: Mapped[int] = mapped_column(ForeignKey("newapi_instances.id"), index=True)
    binding_id: Mapped[int | None] = mapped_column(ForeignKey("channel_bindings.id"), nullable=True)
    actor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    action: Mapped[str] = mapped_column(String(30))
    status: Mapped[str] = mapped_column(String(30), index=True)
    request_summary: Mapped[dict] = mapped_column(JSON, default=dict)
    response_summary: Mapped[dict] = mapped_column(JSON, default=dict)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
