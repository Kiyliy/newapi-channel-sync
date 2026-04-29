import hashlib
from typing import Any

from app.mcp.base import McpSyncResponse


class MockMcpClient:
    def __init__(self, instance_id: int) -> None:
        self.instance_id = instance_id

    def create_channel(self, payload: dict[str, Any]) -> McpSyncResponse:
        digest = hashlib.sha256(f"{self.instance_id}:{payload['name']}".encode("utf-8")).hexdigest()[:12]
        remote_id = f"mock-{self.instance_id}-{digest}"
        return McpSyncResponse(remote_channel_id=remote_id, raw={"mock": True, "id": remote_id})

    def update_channel(self, remote_channel_id: str, payload: dict[str, Any]) -> McpSyncResponse:
        return McpSyncResponse(remote_channel_id=remote_channel_id, raw={"mock": True, "id": remote_channel_id})
