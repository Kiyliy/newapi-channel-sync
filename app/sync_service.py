from typing import Any

from sqlalchemy.orm import Session

from app.mcp import McpClientError, build_mcp_client
from app.models import Channel, ChannelBinding, SyncLog, User, utcnow
from app.schemas import SyncResultOut
from app.security import decrypt_secret


def sync_binding(db: Session, binding: ChannelBinding, actor: User) -> SyncResultOut:
    channel = binding.channel
    instance = binding.instance
    action = "update" if binding.remote_channel_id else "create"
    payload = build_channel_payload(channel)
    request_summary = _redact_payload(payload)

    if not instance.is_enabled:
        return _record_failure(db, binding, actor, action, request_summary, "Instance is disabled")

    try:
        client = build_mcp_client(instance)
        if binding.remote_channel_id:
            response = client.update_channel(binding.remote_channel_id, payload)
        else:
            response = client.create_channel(payload)

        binding.remote_channel_id = response.remote_channel_id
        binding.sync_status = "success"
        binding.last_error = None
        binding.last_synced_at = utcnow()
        log = SyncLog(
            channel_id=channel.id,
            instance_id=instance.id,
            binding_id=binding.id,
            actor_id=actor.id,
            action=action,
            status="success",
            request_summary=request_summary,
            response_summary=_trim_response(response.raw),
        )
        db.add(binding)
        db.add(log)
        db.commit()
        db.refresh(binding)
        return SyncResultOut(
            binding_id=binding.id,
            channel_id=channel.id,
            instance_id=instance.id,
            action=action,
            status="success",
            remote_channel_id=binding.remote_channel_id,
        )
    except (McpClientError, ValueError) as exc:
        return _record_failure(db, binding, actor, action, request_summary, str(exc))


def build_channel_payload(channel: Channel) -> dict[str, Any]:
    return {
        "name": channel.name,
        "type": channel.type,
        "status": channel.status,
        "key": decrypt_secret(channel.encrypted_key),
        "base_url": channel.base_url,
        "models": ",".join(channel.models or []),
        "groups": channel.groups or [],
        "priority": channel.priority,
        "weight": channel.weight,
        "model_mapping": channel.model_mapping or {},
        "extra_config": channel.extra_config or {},
    }


def _record_failure(
    db: Session,
    binding: ChannelBinding,
    actor: User,
    action: str,
    request_summary: dict[str, Any],
    error_message: str,
) -> SyncResultOut:
    binding.sync_status = "failed"
    binding.last_error = error_message
    log = SyncLog(
        channel_id=binding.channel_id,
        instance_id=binding.instance_id,
        binding_id=binding.id,
        actor_id=actor.id,
        action=action,
        status="failed",
        request_summary=request_summary,
        response_summary={},
        error_message=error_message,
    )
    db.add(binding)
    db.add(log)
    db.commit()
    db.refresh(binding)
    return SyncResultOut(
        binding_id=binding.id,
        channel_id=binding.channel_id,
        instance_id=binding.instance_id,
        action=action,
        status="failed",
        remote_channel_id=binding.remote_channel_id,
        error_message=error_message,
    )


def _redact_payload(payload: dict[str, Any]) -> dict[str, Any]:
    redacted = dict(payload)
    if redacted.get("key"):
        redacted["key"] = "***"
    return redacted


def _trim_response(response: dict[str, Any]) -> dict[str, Any]:
    if "key" in response:
        response = dict(response)
        response["key"] = "***"
    return response
