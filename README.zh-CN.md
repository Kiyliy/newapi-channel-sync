# newapi-channel-sync

[English](README.md) · **简体中文**

NewAPI 渠道同步管理工具。

项目目标是提供一个独立的渠道管理中心，用于登记多个 NewAPI 实例，并将本项目内新建和绑定的渠道单向同步到这些实例中。

## 当前能力

- 账号密码登录，登录后返回 JWT。
- 首次启动后通过 `/auth/bootstrap` 创建第一个管理员。
- 管理员可创建普通用户。
- 管理 NewAPI 实例和用户 MCP 连接信息。
- 管理项目侧渠道，密钥加密保存。
- 管理员可查看渠道 key 明文，普通用户只看到 `key_configured` 状态。
- 将项目侧渠道绑定到一个或多个 NewAPI 实例。
- 手动触发项目侧渠道到 NewAPI 实例的单向同步。
- 同步通过 MCP Client 抽象执行，当前提供：
  - `mock`：本地开发和测试使用。
  - `mcp-jsonrpc`：通用 MCP JSON-RPC `tools/call` 适配器。
- 记录同步日志，并对 key 做脱敏。

## 本地运行

```bash
uv sync
npm install --prefix frontend
npm run build --prefix frontend
cp .env.example .env
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

打开前端：

```text
http://127.0.0.1:8000/
```

打开接口文档：

```text
http://127.0.0.1:8000/docs
```

## 初始化管理员

服务启动后，先调用：

```http
POST /auth/bootstrap
Content-Type: application/json

{
  "username": "admin",
  "password": "your-password"
}
```

系统已有任意用户后，该接口会返回 `409`，避免重复初始化管理员。

## MCP 配置说明

新增 NewAPI 实例时，`mcp_transport` 支持：

- `mock`：不请求远端，直接生成一个 mock 远端渠道 ID。
- `mcp-jsonrpc`：向 `mcp_server_url` 发起 JSON-RPC 请求。

`mcp-jsonrpc` 默认调用工具：

- 创建渠道：`newapi.channel.create`
- 更新渠道：`newapi.channel.update`

如果实际 NewAPI 用户 MCP 工具名不同，可以在实例的 `mcp_config` 中覆盖：

```json
{
  "create_tool": "actual.create.tool",
  "update_tool": "actual.update.tool",
  "timeout_seconds": 30
}
```

真实 NewAPI 用户 MCP 的工具名、入参和返回结构确认后，只需要收敛 `app/mcp/jsonrpc.py` 的适配逻辑。

## 测试

```bash
uv run pytest
npm run build --prefix frontend
```
