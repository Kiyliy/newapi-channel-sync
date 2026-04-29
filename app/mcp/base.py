from dataclasses import dataclass
from typing import Any, Protocol


class McpClientError(RuntimeError):
    pass


@dataclass
class McpSyncResponse:
    remote_channel_id: str
    raw: dict[str, Any]


class McpClient(Protocol):
    def create_channel(self, payload: dict[str, Any]) -> McpSyncResponse:
        ...

    def update_channel(self, remote_channel_id: str, payload: dict[str, Any]) -> McpSyncResponse:
        ...
