from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


Role = Literal["admin", "user"]
McpTransport = Literal["mock", "mcp-jsonrpc"]
McpAuthType = Literal["none", "bearer", "x-api-key"]


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=80)
    password: str = Field(min_length=1)


class BootstrapAdminRequest(LoginRequest):
    pass


class UserCreate(BaseModel):
    username: str = Field(min_length=1, max_length=80)
    password: str = Field(min_length=8)
    role: Role = "user"
    is_active: bool = True


class UserOut(BaseModel):
    id: int
    username: str
    role: str
    is_active: bool
    last_login_at: datetime | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class InstanceCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    base_url: str = Field(min_length=1, max_length=500)
    mcp_server_url: str = Field(min_length=1, max_length=500)
    mcp_transport: McpTransport = "mock"
    mcp_auth_type: McpAuthType = "bearer"
    mcp_secret: str | None = None
    mcp_config: dict[str, Any] = Field(default_factory=dict)
    is_enabled: bool = True


class InstanceUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    base_url: str | None = Field(default=None, min_length=1, max_length=500)
    mcp_server_url: str | None = Field(default=None, min_length=1, max_length=500)
    mcp_transport: McpTransport | None = None
    mcp_auth_type: McpAuthType | None = None
    mcp_secret: str | None = None
    mcp_config: dict[str, Any] | None = None
    is_enabled: bool | None = None


class InstanceOut(BaseModel):
    id: int
    name: str
    base_url: str
    mcp_server_url: str
    mcp_transport: str
    mcp_auth_type: str
    mcp_secret_configured: bool
    mcp_config: dict[str, Any]
    is_enabled: bool
    created_at: datetime
    updated_at: datetime


class ChannelCreate(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    type: int
    status: int = 1
    base_url: str | None = Field(default=None, max_length=500)
    models: list[str] = Field(default_factory=list)
    groups: list[str] = Field(default_factory=list)
    priority: int = 0
    weight: int = 100
    model_mapping: dict[str, Any] = Field(default_factory=dict)
    extra_config: dict[str, Any] = Field(default_factory=dict)
    key: str | None = None


class ChannelUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=160)
    type: int | None = None
    status: int | None = None
    base_url: str | None = Field(default=None, max_length=500)
    models: list[str] | None = None
    groups: list[str] | None = None
    priority: int | None = None
    weight: int | None = None
    model_mapping: dict[str, Any] | None = None
    extra_config: dict[str, Any] | None = None
    key: str | None = None


class ChannelOut(BaseModel):
    id: int
    name: str
    type: int
    status: int
    base_url: str | None
    models: list[str]
    groups: list[str]
    priority: int
    weight: int
    model_mapping: dict[str, Any]
    extra_config: dict[str, Any]
    key_configured: bool
    key: str | None = None
    created_by_id: int | None
    created_at: datetime
    updated_at: datetime


class BindInstancesRequest(BaseModel):
    instance_ids: list[int] = Field(min_length=1)


class BindingOut(BaseModel):
    id: int
    channel_id: int
    instance_id: int
    remote_channel_id: str | None
    sync_status: str
    last_synced_at: datetime | None
    last_error: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class SyncChannelRequest(BaseModel):
    instance_ids: list[int] | None = None


class SyncResultOut(BaseModel):
    binding_id: int
    channel_id: int
    instance_id: int
    action: str
    status: str
    remote_channel_id: str | None = None
    error_message: str | None = None


class SyncLogOut(BaseModel):
    id: int
    channel_id: int
    instance_id: int
    binding_id: int | None
    actor_id: int | None
    action: str
    status: str
    request_summary: dict[str, Any]
    response_summary: dict[str, Any]
    error_message: str | None
    created_at: datetime

    model_config = {"from_attributes": True}
