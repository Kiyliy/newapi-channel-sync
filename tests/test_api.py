import os
from pathlib import Path

from fastapi.testclient import TestClient

TEST_DB = Path("data/test.db")
TEST_DB.parent.mkdir(parents=True, exist_ok=True)
if TEST_DB.exists():
    TEST_DB.unlink()

os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DB}"
os.environ["APP_SECRET_KEY"] = "test-secret-key"

from app.main import app  # noqa: E402


def bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_channel_sync_mvp_flow() -> None:
    with TestClient(app) as client:
        bootstrap = client.post("/auth/bootstrap", json={"username": "admin", "password": "admin-password"})
        assert bootstrap.status_code == 201
        admin_token = bootstrap.json()["access_token"]

        user_response = client.post(
            "/users",
            headers=bearer(admin_token),
            json={"username": "operator", "password": "operator-password", "role": "user"},
        )
        assert user_response.status_code == 201

        login = client.post("/auth/login", json={"username": "operator", "password": "operator-password"})
        assert login.status_code == 200
        user_token = login.json()["access_token"]

        instance = client.post(
            "/instances",
            headers=bearer(admin_token),
            json={
                "name": "newapi-1",
                "base_url": "https://newapi-1.example.com",
                "mcp_server_url": "mock://newapi-1",
                "mcp_transport": "mock",
                "mcp_auth_type": "none",
            },
        )
        assert instance.status_code == 201
        instance_id = instance.json()["id"]

        channel_payload = {
            "name": "OpenAI upstream",
            "type": 1,
            "base_url": "https://api.openai.com/v1",
            "models": ["gpt-4.1", "gpt-4.1-mini"],
            "groups": ["default"],
            "priority": 10,
            "weight": 100,
            "key": "sk-secret-value",
        }
        channel = client.post("/channels", headers=bearer(admin_token), json=channel_payload)
        assert channel.status_code == 201
        channel_body = channel.json()
        channel_id = channel_body["id"]
        assert channel_body["key"] == "sk-secret-value"
        assert channel_body["key_configured"] is True

        ordinary_view = client.get(f"/channels/{channel_id}", headers=bearer(user_token))
        assert ordinary_view.status_code == 200
        assert ordinary_view.json()["key"] is None
        assert ordinary_view.json()["key_configured"] is True

        ordinary_update = client.patch(
            f"/channels/{channel_id}",
            headers=bearer(user_token),
            json={"key": "sk-rotated-by-operator", "priority": 11},
        )
        assert ordinary_update.status_code == 200
        assert ordinary_update.json()["key"] is None
        assert ordinary_update.json()["key_configured"] is True
        assert ordinary_update.json()["priority"] == 11

        admin_view_after_update = client.get(f"/channels/{channel_id}", headers=bearer(admin_token))
        assert admin_view_after_update.status_code == 200
        assert admin_view_after_update.json()["key"] == "sk-rotated-by-operator"

        bindings = client.post(
            f"/channels/{channel_id}/bindings",
            headers=bearer(admin_token),
            json={"instance_ids": [instance_id]},
        )
        assert bindings.status_code == 201
        binding_id = bindings.json()[0]["id"]

        sync = client.post(f"/sync/channels/{channel_id}", headers=bearer(admin_token), json={})
        assert sync.status_code == 200
        sync_result = sync.json()[0]
        assert sync_result["binding_id"] == binding_id
        assert sync_result["status"] == "success"
        assert sync_result["remote_channel_id"].startswith("mock-")

        updated_bindings = client.get(f"/channels/{channel_id}/bindings", headers=bearer(admin_token))
        assert updated_bindings.status_code == 200
        assert updated_bindings.json()[0]["sync_status"] == "success"
        assert updated_bindings.json()[0]["remote_channel_id"] == sync_result["remote_channel_id"]

        logs = client.get("/sync/logs", headers=bearer(admin_token))
        assert logs.status_code == 200
        assert logs.json()[0]["request_summary"]["key"] == "***"
