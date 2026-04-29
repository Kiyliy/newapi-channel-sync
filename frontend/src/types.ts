export type Role = "admin" | "user";

export type User = {
  id: number;
  username: string;
  role: Role;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
};

export type Instance = {
  id: number;
  name: string;
  base_url: string;
  mcp_server_url: string;
  mcp_transport: "mock" | "mcp-jsonrpc";
  mcp_auth_type: "none" | "bearer" | "x-api-key";
  mcp_secret_configured: boolean;
  mcp_config: Record<string, unknown>;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
};

export type Channel = {
  id: number;
  name: string;
  type: number;
  status: number;
  base_url: string | null;
  models: string[];
  groups: string[];
  priority: number;
  weight: number;
  model_mapping: Record<string, unknown>;
  extra_config: Record<string, unknown>;
  key_configured: boolean;
  key: string | null;
  created_by_id: number | null;
  created_at: string;
  updated_at: string;
};

export type Binding = {
  id: number;
  channel_id: number;
  instance_id: number;
  remote_channel_id: string | null;
  sync_status: "pending" | "success" | "failed" | string;
  last_synced_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

export type SyncResult = {
  binding_id: number;
  channel_id: number;
  instance_id: number;
  action: string;
  status: string;
  remote_channel_id: string | null;
  error_message: string | null;
};

export type SyncLog = {
  id: number;
  channel_id: number;
  instance_id: number;
  binding_id: number | null;
  actor_id: number | null;
  action: string;
  status: string;
  request_summary: Record<string, unknown>;
  response_summary: Record<string, unknown>;
  error_message: string | null;
  created_at: string;
};
