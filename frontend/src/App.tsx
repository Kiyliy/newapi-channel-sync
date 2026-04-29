import {
  Activity,
  Cable,
  CheckCircle2,
  Database,
  KeyRound,
  Loader2,
  Lock,
  LogOut,
  Plus,
  RefreshCw,
  Save,
  Shield,
  Shuffle,
  UserPlus,
  XCircle
} from "lucide-react";
import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from "react";

import { apiRequest, formatDate, parseCsv, parseJsonObject } from "./api";
import type { Binding, Channel, Instance, SyncLog, SyncResult, User } from "./types";

const TOKEN_KEY = "newapi_channel_sync_token_v1";

type LoginForm = {
  username: string;
  password: string;
};

type InstanceForm = {
  name: string;
  base_url: string;
  mcp_server_url: string;
  mcp_transport: "mock" | "mcp-jsonrpc";
  mcp_auth_type: "none" | "bearer" | "x-api-key";
  mcp_secret: string;
  mcp_config: string;
};

type ChannelForm = {
  name: string;
  type: string;
  status: string;
  base_url: string;
  models: string;
  groups: string;
  priority: string;
  weight: string;
  key: string;
  model_mapping: string;
  extra_config: string;
};

type UserForm = {
  username: string;
  password: string;
  role: "admin" | "user";
};

const defaultLogin: LoginForm = { username: "", password: "" };
const defaultInstance: InstanceForm = {
  name: "",
  base_url: "",
  mcp_server_url: "mock://newapi",
  mcp_transport: "mock",
  mcp_auth_type: "none",
  mcp_secret: "",
  mcp_config: "{}"
};
const defaultChannel: ChannelForm = {
  name: "",
  type: "1",
  status: "1",
  base_url: "",
  models: "",
  groups: "default",
  priority: "0",
  weight: "100",
  key: "",
  model_mapping: "{}",
  extra_config: "{}"
};
const defaultUser: UserForm = { username: "", password: "", role: "user" };

export function App() {
  const [token, setToken] = useState<string | null>(() => window.localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState<User | null>(null);
  const [instances, setInstances] = useState<Instance[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [bindingsByChannel, setBindingsByChannel] = useState<Record<number, Binding[]>>({});
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState<number | null>(null);
  const [loginMode, setLoginMode] = useState<"login" | "bootstrap">("login");
  const [loginForm, setLoginForm] = useState<LoginForm>(defaultLogin);
  const [instanceForm, setInstanceForm] = useState<InstanceForm>(defaultInstance);
  const [channelForm, setChannelForm] = useState<ChannelForm>(defaultChannel);
  const [userForm, setUserForm] = useState<UserForm>(defaultUser);
  const [bindInstanceId, setBindInstanceId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const selectedChannel = useMemo(
    () => channels.find((channel) => channel.id === selectedChannelId) ?? null,
    [channels, selectedChannelId]
  );
  const selectedBindings = selectedChannelId ? bindingsByChannel[selectedChannelId] ?? [] : [];
  const syncedCount = useMemo(
    () => Object.values(bindingsByChannel).flat().filter((binding) => binding.sync_status === "success").length,
    [bindingsByChannel]
  );
  const failedCount = useMemo(
    () => Object.values(bindingsByChannel).flat().filter((binding) => binding.sync_status === "failed").length,
    [bindingsByChannel]
  );

  const saveToken = useCallback((nextToken: string | null) => {
    setToken(nextToken);
    if (nextToken) {
      window.localStorage.setItem(TOKEN_KEY, nextToken);
    } else {
      window.localStorage.removeItem(TOKEN_KEY);
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!token) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const [me, instanceList, channelList, logList] = await Promise.all([
        apiRequest<User>("/auth/me", { token }),
        apiRequest<Instance[]>("/instances", { token }),
        apiRequest<Channel[]>("/channels", { token }),
        apiRequest<SyncLog[]>("/sync/logs?limit=60", { token })
      ]);
      const bindingPairs = await Promise.all(
        channelList.map(async (channel) => {
          const channelBindings = await apiRequest<Binding[]>(`/channels/${channel.id}/bindings`, { token });
          return [channel.id, channelBindings] as const;
        })
      );
      const nextBindings = Object.fromEntries(bindingPairs);
      setUser(me);
      setInstances(instanceList);
      setChannels(channelList);
      setBindingsByChannel(nextBindings);
      setLogs(logList);
      setSelectedChannelId((current) => {
        if (current && channelList.some((channel) => channel.id === current)) {
          return current;
        }
        return channelList[0]?.id ?? null;
      });
      if (!bindInstanceId && instanceList.length > 0) {
        setBindInstanceId(String(instanceList[0].id));
      }
    } catch (refreshError) {
      saveToken(null);
      setUser(null);
      setError(refreshError instanceof Error ? refreshError.message : "刷新失败");
    } finally {
      setBusy(false);
    }
  }, [bindInstanceId, saveToken, token]);

  useEffect(() => {
    if (token) {
      void refresh();
    }
  }, [refresh, token]);

  async function submitAuth(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await apiRequest<{ access_token: string }>(
        loginMode === "login" ? "/auth/login" : "/auth/bootstrap",
        {
          method: "POST",
          body: JSON.stringify(loginForm)
        }
      );
      saveToken(response.access_token);
      setLoginForm(defaultLogin);
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : "认证失败");
    } finally {
      setBusy(false);
    }
  }

  async function createInstance(event: FormEvent) {
    event.preventDefault();
    if (!token) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiRequest<Instance>("/instances", {
        token,
        method: "POST",
        body: JSON.stringify({
          ...instanceForm,
          mcp_secret: instanceForm.mcp_secret || null,
          mcp_config: parseJsonObject(instanceForm.mcp_config)
        })
      });
      setInstanceForm(defaultInstance);
      setNotice("实例已创建");
      await refresh();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "创建实例失败");
    } finally {
      setBusy(false);
    }
  }

  async function createChannel(event: FormEvent) {
    event.preventDefault();
    if (!token) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const channel = await apiRequest<Channel>("/channels", {
        token,
        method: "POST",
        body: JSON.stringify({
          name: channelForm.name,
          type: Number(channelForm.type),
          status: Number(channelForm.status),
          base_url: channelForm.base_url || null,
          models: parseCsv(channelForm.models),
          groups: parseCsv(channelForm.groups),
          priority: Number(channelForm.priority),
          weight: Number(channelForm.weight),
          key: channelForm.key || null,
          model_mapping: parseJsonObject(channelForm.model_mapping),
          extra_config: parseJsonObject(channelForm.extra_config)
        })
      });
      setChannelForm(defaultChannel);
      setSelectedChannelId(channel.id);
      setNotice("渠道已创建");
      await refresh();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "创建渠道失败");
    } finally {
      setBusy(false);
    }
  }

  async function createUser(event: FormEvent) {
    event.preventDefault();
    if (!token) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiRequest<User>("/users", {
        token,
        method: "POST",
        body: JSON.stringify(userForm)
      });
      setUserForm(defaultUser);
      setNotice("用户已创建");
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "创建用户失败");
    } finally {
      setBusy(false);
    }
  }

  async function bindSelectedChannel(event: FormEvent) {
    event.preventDefault();
    if (!token || !selectedChannelId || !bindInstanceId) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiRequest<Binding[]>(`/channels/${selectedChannelId}/bindings`, {
        token,
        method: "POST",
        body: JSON.stringify({ instance_ids: [Number(bindInstanceId)] })
      });
      setNotice("绑定已更新");
      await refresh();
    } catch (bindError) {
      setError(bindError instanceof Error ? bindError.message : "绑定失败");
    } finally {
      setBusy(false);
    }
  }

  async function syncChannel() {
    if (!token || !selectedChannelId) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const results = await apiRequest<SyncResult[]>(`/sync/channels/${selectedChannelId}`, {
        token,
        method: "POST",
        body: JSON.stringify({})
      });
      const failed = results.filter((result) => result.status !== "success").length;
      setNotice(failed ? `同步完成，失败 ${failed} 个` : "同步完成");
      await refresh();
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : "同步失败");
    } finally {
      setBusy(false);
    }
  }

  async function syncBinding(bindingId: number) {
    if (!token) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await apiRequest<SyncResult>(`/sync/bindings/${bindingId}`, {
        token,
        method: "POST"
      });
      setNotice(result.status === "success" ? "同步完成" : result.error_message ?? "同步失败");
      await refresh();
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : "同步失败");
    } finally {
      setBusy(false);
    }
  }

  function logout() {
    saveToken(null);
    setUser(null);
    setInstances([]);
    setChannels([]);
    setBindingsByChannel({});
    setLogs([]);
  }

  if (!token || !user) {
    return (
      <main className="auth-page">
        <section className="auth-panel">
          <div className="brand-row">
            <div className="brand-mark">
              <Shuffle size={22} />
            </div>
            <div>
              <h1>NewAPI Channel Sync</h1>
              <p>项目渠道管理中心</p>
            </div>
          </div>

          <div className="segmented" role="tablist" aria-label="认证模式">
            <button className={loginMode === "login" ? "active" : ""} onClick={() => setLoginMode("login")}>
              <Lock size={16} />
              登录
            </button>
            <button
              className={loginMode === "bootstrap" ? "active" : ""}
              onClick={() => setLoginMode("bootstrap")}
            >
              <Shield size={16} />
              初始化
            </button>
          </div>

          <form className="stack-form" onSubmit={submitAuth}>
            <label>
              账号
              <input
                value={loginForm.username}
                onChange={(event) => setLoginForm({ ...loginForm, username: event.target.value })}
                autoComplete="username"
              />
            </label>
            <label>
              密码
              <input
                value={loginForm.password}
                onChange={(event) => setLoginForm({ ...loginForm, password: event.target.value })}
                type="password"
                autoComplete={loginMode === "login" ? "current-password" : "new-password"}
              />
            </label>
            {error ? <div className="alert danger">{error}</div> : null}
            <button className="primary" disabled={busy}>
              {busy ? <Loader2 className="spin" size={17} /> : <KeyRound size={17} />}
              {loginMode === "login" ? "登录" : "创建管理员"}
            </button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-row compact">
          <div className="brand-mark">
            <Shuffle size={20} />
          </div>
          <div>
            <h1>NewAPI Channel Sync</h1>
            <p>{user.username} · {user.role}</p>
          </div>
        </div>
        <div className="top-actions">
          <a className="ghost-link" href="/docs" target="_blank" rel="noreferrer">
            API Docs
          </a>
          <button className="icon-text" onClick={refresh} disabled={busy} title="刷新">
            <RefreshCw className={busy ? "spin" : ""} size={17} />
            刷新
          </button>
          <button className="icon-only" onClick={logout} title="退出登录" aria-label="退出登录">
            <LogOut size={18} />
          </button>
        </div>
      </header>

      <section className="metrics">
        <Metric icon={<Database size={18} />} label="实例" value={instances.length} />
        <Metric icon={<Cable size={18} />} label="渠道" value={channels.length} />
        <Metric icon={<CheckCircle2 size={18} />} label="成功绑定" value={syncedCount} />
        <Metric icon={<XCircle size={18} />} label="失败绑定" value={failedCount} tone={failedCount ? "danger" : "normal"} />
      </section>

      {error ? <div className="alert danger">{error}</div> : null}
      {notice ? <div className="alert success" onAnimationEnd={() => setNotice(null)}>{notice}</div> : null}

      <section className="workspace">
        <aside className="side-pane">
          <PanelTitle title="新建实例" icon={<Database size={18} />} />
          <form className="stack-form compact-form" onSubmit={createInstance}>
            <label>
              名称
              <input value={instanceForm.name} onChange={(event) => setInstanceForm({ ...instanceForm, name: event.target.value })} />
            </label>
            <label>
              Base URL
              <input
                value={instanceForm.base_url}
                onChange={(event) => setInstanceForm({ ...instanceForm, base_url: event.target.value })}
                placeholder="https://newapi.example.com"
              />
            </label>
            <label>
              MCP URL
              <input
                value={instanceForm.mcp_server_url}
                onChange={(event) => setInstanceForm({ ...instanceForm, mcp_server_url: event.target.value })}
              />
            </label>
            <div className="field-grid">
              <label>
                Transport
                <select
                  value={instanceForm.mcp_transport}
                  onChange={(event) =>
                    setInstanceForm({ ...instanceForm, mcp_transport: event.target.value as InstanceForm["mcp_transport"] })
                  }
                >
                  <option value="mock">mock</option>
                  <option value="mcp-jsonrpc">mcp-jsonrpc</option>
                </select>
              </label>
              <label>
                Auth
                <select
                  value={instanceForm.mcp_auth_type}
                  onChange={(event) =>
                    setInstanceForm({ ...instanceForm, mcp_auth_type: event.target.value as InstanceForm["mcp_auth_type"] })
                  }
                >
                  <option value="none">none</option>
                  <option value="bearer">bearer</option>
                  <option value="x-api-key">x-api-key</option>
                </select>
              </label>
            </div>
            <label>
              MCP Secret
              <input
                value={instanceForm.mcp_secret}
                onChange={(event) => setInstanceForm({ ...instanceForm, mcp_secret: event.target.value })}
                type="password"
              />
            </label>
            <label>
              MCP Config
              <textarea
                value={instanceForm.mcp_config}
                onChange={(event) => setInstanceForm({ ...instanceForm, mcp_config: event.target.value })}
                rows={4}
              />
            </label>
            <button className="primary" disabled={busy}>
              <Plus size={17} />
              新建实例
            </button>
          </form>

          {user.role === "admin" ? (
            <>
              <div className="divider" />
              <PanelTitle title="新建用户" icon={<UserPlus size={18} />} />
              <form className="stack-form compact-form" onSubmit={createUser}>
                <label>
                  账号
                  <input
                    value={userForm.username}
                    onChange={(event) => setUserForm({ ...userForm, username: event.target.value })}
                  />
                </label>
                <label>
                  密码
                  <input
                    value={userForm.password}
                    onChange={(event) => setUserForm({ ...userForm, password: event.target.value })}
                    type="password"
                  />
                </label>
                <label>
                  角色
                  <select
                    value={userForm.role}
                    onChange={(event) => setUserForm({ ...userForm, role: event.target.value as UserForm["role"] })}
                  >
                    <option value="user">user</option>
                    <option value="admin">admin</option>
                  </select>
                </label>
                <button className="secondary" disabled={busy}>
                  <Save size={17} />
                  创建用户
                </button>
              </form>
            </>
          ) : null}
        </aside>

        <section className="main-pane">
          <div className="pane-grid">
            <section className="panel">
              <PanelTitle title="实例" icon={<Database size={18} />} />
              <div className="list">
                {instances.map((instance) => (
                  <article className="row-card" key={instance.id}>
                    <div>
                      <strong>{instance.name}</strong>
                      <span>{instance.mcp_transport} · {instance.mcp_auth_type}</span>
                    </div>
                    <StatusPill ok={instance.is_enabled} text={instance.is_enabled ? "enabled" : "disabled"} />
                  </article>
                ))}
                {instances.length === 0 ? <EmptyState text="暂无实例" /> : null}
              </div>
            </section>

            <section className="panel">
              <PanelTitle title="新建渠道" icon={<Cable size={18} />} />
              <form className="channel-form" onSubmit={createChannel}>
                <label>
                  名称
                  <input value={channelForm.name} onChange={(event) => setChannelForm({ ...channelForm, name: event.target.value })} />
                </label>
                <label>
                  Type
                  <input value={channelForm.type} onChange={(event) => setChannelForm({ ...channelForm, type: event.target.value })} />
                </label>
                <label>
                  Status
                  <input
                    value={channelForm.status}
                    onChange={(event) => setChannelForm({ ...channelForm, status: event.target.value })}
                  />
                </label>
                <label>
                  Base URL
                  <input
                    value={channelForm.base_url}
                    onChange={(event) => setChannelForm({ ...channelForm, base_url: event.target.value })}
                  />
                </label>
                <label>
                  Models
                  <input
                    value={channelForm.models}
                    onChange={(event) => setChannelForm({ ...channelForm, models: event.target.value })}
                  />
                </label>
                <label>
                  Groups
                  <input
                    value={channelForm.groups}
                    onChange={(event) => setChannelForm({ ...channelForm, groups: event.target.value })}
                  />
                </label>
                <label>
                  Priority
                  <input
                    value={channelForm.priority}
                    onChange={(event) => setChannelForm({ ...channelForm, priority: event.target.value })}
                  />
                </label>
                <label>
                  Weight
                  <input
                    value={channelForm.weight}
                    onChange={(event) => setChannelForm({ ...channelForm, weight: event.target.value })}
                  />
                </label>
                <label className="wide">
                  Key
                  <input
                    value={channelForm.key}
                    onChange={(event) => setChannelForm({ ...channelForm, key: event.target.value })}
                    type="password"
                  />
                </label>
                <label>
                  Model Mapping
                  <textarea
                    value={channelForm.model_mapping}
                    onChange={(event) => setChannelForm({ ...channelForm, model_mapping: event.target.value })}
                    rows={3}
                  />
                </label>
                <label>
                  Extra Config
                  <textarea
                    value={channelForm.extra_config}
                    onChange={(event) => setChannelForm({ ...channelForm, extra_config: event.target.value })}
                    rows={3}
                  />
                </label>
                <button className="primary wide" disabled={busy}>
                  <Plus size={17} />
                  新建渠道
                </button>
              </form>
            </section>
          </div>

          <section className="panel channel-panel">
            <div className="panel-header">
              <PanelTitle title="渠道" icon={<Cable size={18} />} />
              <button className="icon-text" disabled={!selectedChannel || busy} onClick={syncChannel}>
                <Activity size={17} />
                同步选中渠道
              </button>
            </div>

            <div className="channel-layout">
              <div className="channel-list">
                {channels.map((channel) => (
                  <button
                    className={channel.id === selectedChannelId ? "channel-item active" : "channel-item"}
                    key={channel.id}
                    onClick={() => setSelectedChannelId(channel.id)}
                  >
                    <span>
                      <strong>{channel.name}</strong>
                      <small>{channel.models.join(", ") || "no models"}</small>
                    </span>
                    <StatusPill ok={channel.key_configured} text={channel.key_configured ? "key" : "no key"} />
                  </button>
                ))}
                {channels.length === 0 ? <EmptyState text="暂无渠道" /> : null}
              </div>

              <div className="detail-pane">
                {selectedChannel ? (
                  <>
                    <div className="detail-head">
                      <div>
                        <h2>{selectedChannel.name}</h2>
                        <p>type {selectedChannel.type} · status {selectedChannel.status}</p>
                      </div>
                      <StatusPill ok={selectedChannel.key_configured} text={selectedChannel.key_configured ? "key configured" : "no key"} />
                    </div>

                    <dl className="detail-grid">
                      <div>
                        <dt>Base URL</dt>
                        <dd>{selectedChannel.base_url ?? "-"}</dd>
                      </div>
                      <div>
                        <dt>Groups</dt>
                        <dd>{selectedChannel.groups.join(", ") || "-"}</dd>
                      </div>
                      <div>
                        <dt>Priority</dt>
                        <dd>{selectedChannel.priority}</dd>
                      </div>
                      <div>
                        <dt>Weight</dt>
                        <dd>{selectedChannel.weight}</dd>
                      </div>
                      {selectedChannel.key ? (
                        <div className="wide">
                          <dt>Key</dt>
                          <dd className="mono">{selectedChannel.key}</dd>
                        </div>
                      ) : null}
                    </dl>

                    <form className="bind-row" onSubmit={bindSelectedChannel}>
                      <select value={bindInstanceId} onChange={(event) => setBindInstanceId(event.target.value)}>
                        {instances.map((instance) => (
                          <option value={instance.id} key={instance.id}>
                            {instance.name}
                          </option>
                        ))}
                      </select>
                      <button className="secondary" disabled={busy || instances.length === 0}>
                        <Cable size={17} />
                        绑定
                      </button>
                    </form>

                    <div className="binding-list">
                      {selectedBindings.map((binding) => {
                        const instance = instances.find((item) => item.id === binding.instance_id);
                        return (
                          <article className="binding-row" key={binding.id}>
                            <div>
                              <strong>{instance?.name ?? `instance ${binding.instance_id}`}</strong>
                              <span>{binding.remote_channel_id ?? "pending remote id"}</span>
                              {binding.last_error ? <small className="error-text">{binding.last_error}</small> : null}
                            </div>
                            <StatusPill ok={binding.sync_status === "success"} text={binding.sync_status} />
                            <button className="icon-only" onClick={() => void syncBinding(binding.id)} title="同步绑定" aria-label="同步绑定">
                              <RefreshCw size={17} />
                            </button>
                          </article>
                        );
                      })}
                      {selectedBindings.length === 0 ? <EmptyState text="暂无绑定" /> : null}
                    </div>
                  </>
                ) : (
                  <EmptyState text="请选择渠道" />
                )}
              </div>
            </div>
          </section>

          <section className="panel">
            <PanelTitle title="同步日志" icon={<Activity size={18} />} />
            <div className="log-table">
              <div className="log-head">
                <span>时间</span>
                <span>渠道</span>
                <span>实例</span>
                <span>动作</span>
                <span>状态</span>
              </div>
              {logs.map((log) => (
                <div className="log-row" key={log.id}>
                  <span>{formatDate(log.created_at)}</span>
                  <span>#{log.channel_id}</span>
                  <span>#{log.instance_id}</span>
                  <span>{log.action}</span>
                  <StatusPill ok={log.status === "success"} text={log.status} />
                </div>
              ))}
              {logs.length === 0 ? <EmptyState text="暂无日志" /> : null}
            </div>
          </section>
        </section>
      </section>
    </main>
  );
}

function Metric({
  icon,
  label,
  value,
  tone = "normal"
}: {
  icon: ReactNode;
  label: string;
  value: number;
  tone?: "normal" | "danger";
}) {
  return (
    <article className={tone === "danger" ? "metric danger" : "metric"}>
      <div>{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function PanelTitle({ title, icon }: { title: string; icon: ReactNode }) {
  return (
    <div className="panel-title">
      {icon}
      <h2>{title}</h2>
    </div>
  );
}

function StatusPill({ ok, text }: { ok: boolean; text: string }) {
  return <span className={ok ? "status ok" : "status warn"}>{text}</span>;
}

function EmptyState({ text }: { text: string }) {
  return <div className="empty-state">{text}</div>;
}
