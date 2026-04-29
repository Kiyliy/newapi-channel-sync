from app.mcp.base import McpClient, McpClientError
from app.mcp.jsonrpc import JsonRpcMcpClient
from app.mcp.mock import MockMcpClient
from app.models import NewApiInstance
from app.security import decrypt_secret


def build_mcp_client(instance: NewApiInstance) -> McpClient:
    if instance.mcp_transport == "mock":
        return MockMcpClient(instance.id)
    if instance.mcp_transport == "mcp-jsonrpc":
        return JsonRpcMcpClient(
            server_url=instance.mcp_server_url,
            auth_type=instance.mcp_auth_type,
            secret=decrypt_secret(instance.encrypted_mcp_secret),
            config=instance.mcp_config or {},
        )
    raise McpClientError(f"Unsupported MCP transport: {instance.mcp_transport}")
