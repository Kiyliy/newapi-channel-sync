from itertools import count
from typing import Any

import httpx

from app.mcp.base import McpClientError, McpSyncResponse


_request_ids = count(1)


class JsonRpcMcpClient:
    def __init__(
        self,
        server_url: str,
        auth_type: str,
        secret: str | None,
        config: dict[str, Any] | None = None,
    ) -> None:
        self.server_url = server_url
        self.auth_type = auth_type
        self.secret = secret
        self.config = config or {}

    def create_channel(self, payload: dict[str, Any]) -> McpSyncResponse:
        tool_name = self.config.get("create_tool", "newapi.channel.create")
        result = self._call_tool(tool_name, {"channel": payload})
        remote_id = _extract_remote_channel_id(result)
        if remote_id is None:
            raise McpClientError("MCP create result did not include remote channel id")
        return McpSyncResponse(remote_channel_id=remote_id, raw=result)

    def update_channel(self, remote_channel_id: str, payload: dict[str, Any]) -> McpSyncResponse:
        tool_name = self.config.get("update_tool", "newapi.channel.update")
        result = self._call_tool(tool_name, {"id": remote_channel_id, "channel": payload})
        return McpSyncResponse(remote_channel_id=remote_channel_id, raw=result)

    def _call_tool(self, tool_name: str, arguments: dict[str, Any]) -> dict[str, Any]:
        headers = {"Content-Type": "application/json"}
        if self.secret and self.auth_type == "bearer":
            headers["Authorization"] = f"Bearer {self.secret}"
        elif self.secret and self.auth_type == "x-api-key":
            headers["X-API-Key"] = self.secret

        request_body = {
            "jsonrpc": "2.0",
            "id": next(_request_ids),
            "method": "tools/call",
            "params": {"name": tool_name, "arguments": arguments},
        }

        try:
            response = httpx.post(
                self.server_url,
                json=request_body,
                headers=headers,
                timeout=float(self.config.get("timeout_seconds", 30)),
            )
            response.raise_for_status()
            body = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise McpClientError(f"MCP request failed: {exc}") from exc

        if "error" in body:
            message = body["error"].get("message", body["error"]) if isinstance(body["error"], dict) else body["error"]
            raise McpClientError(f"MCP tool failed: {message}")
        result = body.get("result")
        if not isinstance(result, dict):
            raise McpClientError("MCP response result must be an object")
        return result


def _extract_remote_channel_id(result: dict[str, Any]) -> str | None:
    candidates = [
        result.get("remote_channel_id"),
        result.get("channel_id"),
        result.get("id"),
        (result.get("data") or {}).get("remote_channel_id") if isinstance(result.get("data"), dict) else None,
        (result.get("data") or {}).get("channel_id") if isinstance(result.get("data"), dict) else None,
        (result.get("data") or {}).get("id") if isinstance(result.get("data"), dict) else None,
    ]
    for candidate in candidates:
        if candidate is not None:
            return str(candidate)
    return None
