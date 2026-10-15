# newapi-channel-sync

**English** · [简体中文](README.zh-CN.md)

One place to manage upstream channels for many [New API](https://github.com/QuantumNous/new-api) instances. Create a channel once, bind it to the instances that need it, and push it out with one click.

![python](https://img.shields.io/badge/Python-3.12+-3776AB?logo=python&logoColor=white)
![fastapi](https://img.shields.io/badge/FastAPI-009688?logo=fastapi&logoColor=white)
![react](https://img.shields.io/badge/React_19-61DAFB?logo=react&logoColor=black)
![license](https://img.shields.io/badge/license-MIT-blue)

```text
                ┌──────────────► New API #1
project channel ┼──────────────► New API #2
  (source of    └──────────────► New API #3
     truth)        one-way sync over MCP
```

## Why

Running several New API gateways means adding the same upstream key to each admin panel by hand, and they drift apart. This tool keeps a single project-side list of channels as the source of truth and syncs it one way to every bound instance. Channels that already exist on an instance are left alone.

## Features

- Username / password login with JWT sessions; the first admin is created through `/auth/bootstrap`
- Admins can create regular users
- Register any number of New API instances and their MCP connection details
- Channel keys are encrypted at rest; only admins can see plaintext, everyone else sees `key_configured`
- Bind one channel to one or more instances and trigger a sync manually
- Sync logs with keys masked
- Pluggable MCP clients: `mock` for local dev and tests, `mcp-jsonrpc` for a generic MCP `tools/call` endpoint

## Quick start

```bash
uv sync
npm install --prefix frontend && npm run build --prefix frontend
cp .env.example .env          # set APP_SECRET_KEY to a long random string
uv run uvicorn app.main:app --reload --port 8000
```

- Dashboard: http://127.0.0.1:8000/
- API docs: http://127.0.0.1:8000/docs

Create the first admin (returns `409` once any user exists):

```http
POST /auth/bootstrap
Content-Type: application/json

{ "username": "admin", "password": "your-password" }
```

## MCP transport

When adding an instance, set `mcp_transport` to:

- `mock`: no network call, returns a fake remote channel ID
- `mcp-jsonrpc`: sends JSON-RPC to `mcp_server_url`, calling `newapi.channel.create` and `newapi.channel.update` by default

Override the tool names per instance in `mcp_config`:

```json
{ "create_tool": "actual.create.tool", "update_tool": "actual.update.tool", "timeout_seconds": 30 }
```

Adapting to a different MCP schema only touches [`app/mcp/jsonrpc.py`](app/mcp/jsonrpc.py).

## Project layout

```text
app/        FastAPI backend: auth, instances, channels, sync service, MCP clients
frontend/   React + Vite dashboard
tests/      pytest API tests
docs/       requirements (Chinese)
```

## Tests

```bash
uv run pytest
npm run build --prefix frontend
```

## License

[MIT](LICENSE)
