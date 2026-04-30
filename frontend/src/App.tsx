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
  Search,
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
const optionalColumns = [
  { key: "models", label: "模型" },
  { key: "key", label: "密钥" },
  { key: "binding", label: "绑定状态" },
  { key: "remote", label: "远端 ID" },
  { key: "priority", label: "优先级" },
  { key: "weight", label: "权重" }
] as const;
type OptionalColumnKey = (typeof optionalColumns)[number]["key"];
const defaultVisibleColumns: Record<OptionalColumnKey, boolean> = {
  binding: true,
  key: true,
  models: true,
  priority: true,
  remote: true,
  weight: true
};

function channelToForm(channel: Channel): ChannelForm {
  return {
    name: channel.name,
    type: String(channel.type),
    status: String(channel.status),
    base_url: channel.base_url ?? "",
    models: channel.models.join(", "),
    groups: channel.groups.join(", "),
    priority: String(channel.priority),
    weight: String(channel.weight),
    key: "",
    model_mapping: JSON.stringify(channel.model_mapping, null, 2),
    extra_config: JSON.stringify(channel.extra_config, null, 2)
  };
}

function syncStatusText(status: string): string {
  const statusMap: Record<string, string> = {
    pending: "待同步",
    success: "成功",
    failed: "失败"
  };
  return statusMap[status] ?? status;
}

function enabledText(enabled: boolean): string {
  return enabled ? "启用" : "停用";
}

function keyStatusText(configured: boolean): string {
  return configured ? "已配置密钥" : "未配置密钥";
}

function channelStatusText(status: number): string {
  const statusMap: Record<number, string> = {
    1: "已启用",
    2: "已禁用",
    3: "自动禁用"
  };
  return statusMap[status] ?? `状态 ${status}`;
}

function channelTypeText(type: number): string {
  const typeMap: Record<number, string> = {
    1: "OpenAI",
    3: "Azure OpenAI",
    4: "Ollama",
    8: "自定义",
    14: "Anthropic",
    17: "通义千问",
    20: "OpenRouter",
    24: "Gemini",
    26: "智谱 GLM",
    43: "DeepSeek"
  };
  return typeMap[type] ?? `类型 ${type}`;
}

function roleText(role: string): string {
  const roleMap: Record<string, string> = {
    admin: "管理员",
    user: "普通用户"
  };
  return roleMap[role] ?? role;
}

function syncActionText(action: string): string {
  const actionMap: Record<string, string> = {
    create: "创建",
    update: "更新"
  };
  return actionMap[action] ?? action;
}

function transportText(transport: string): string {
  const transportMap: Record<string, string> = {
    mock: "模拟",
    "mcp-jsonrpc": "MCP JSON-RPC"
  };
  return transportMap[transport] ?? transport;
}

function authTypeText(authType: string): string {
  const authMap: Record<string, string> = {
    none: "无鉴权",
    bearer: "Bearer 令牌",
    "x-api-key": "API Key"
  };
  return authMap[authType] ?? authType;
}

function messageText(message: string): string {
  if (message.includes("MCP request failed") && message.includes("Connection refused")) {
    return "MCP 请求失败：连接被拒绝";
  }
  if (message.includes("Admin privileges required")) {
    return "需要管理员权限";
  }
  if (message.includes("Invalid username or password")) {
    return "账号或密码错误";
  }
  if (message.includes("No bindings found for sync")) {
    return "没有可同步的绑定";
  }
  return message;
}

function compactList(items: string[], empty = "-"): string {
  return items.length > 0 ? items.join(", ") : empty;
}

function bindingStatusSummary(bindings: Binding[]): { ok: boolean; text: string; tone?: "ok" | "warn" | "danger" | "neutral" } {
  if (bindings.length === 0) {
    return { ok: false, text: "未绑定", tone: "neutral" };
  }
  const failed = bindings.filter((binding) => binding.sync_status === "failed").length;
  if (failed > 0) {
    return { ok: false, text: `失败 ${failed}`, tone: "danger" };
  }
  const pending = bindings.filter((binding) => binding.sync_status === "pending").length;
  if (pending > 0) {
    return { ok: false, text: `待同步 ${pending}`, tone: "warn" };
  }
  const success = bindings.filter((binding) => binding.sync_status === "success").length;
  return { ok: success > 0, text: success > 0 ? `已同步 ${success}` : "已绑定", tone: success > 0 ? "ok" : "warn" };
}

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
  const [editChannelForm, setEditChannelForm] = useState<ChannelForm>(defaultChannel);
  const [userForm, setUserForm] = useState<UserForm>(defaultUser);
  const [bindInstanceId, setBindInstanceId] = useState("");
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [showEditChannel, setShowEditChannel] = useState(false);
  const [showColumnSettings, setShowColumnSettings] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<Record<OptionalColumnKey, boolean>>(defaultVisibleColumns);
  const [channelSearch, setChannelSearch] = useState("");
  const [modelSearch, setModelSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "enabled" | "disabled">("all");
  const [compactMode, setCompactMode] = useState(false);
  const [enableBatchMode, setEnableBatchMode] = useState(false);
  const [selectedBatchChannelIds, setSelectedBatchChannelIds] = useState<number[]>([]);
  const [idSort, setIdSort] = useState(false);
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
  const groupOptions = useMemo(() => {
    const groups = new Set<string>();
    channels.forEach((channel) => {
      channel.groups.forEach((group) => {
        if (group) {
          groups.add(group);
        }
      });
    });
    return Array.from(groups).sort((a, b) => {
      if (a === "default") {
        return -1;
      }
      if (b === "default") {
        return 1;
      }
      return a.localeCompare(b);
    });
  }, [channels]);
  const visibleChannels = useMemo(() => {
    const keyword = channelSearch.trim().toLowerCase();
    const modelKeyword = modelSearch.trim().toLowerCase();
    const filtered = channels.filter((channel) => {
      const bindings = bindingsByChannel[channel.id] ?? [];
      const bindingTargets = bindings
        .map((binding) => {
          const instance = instances.find((item) => item.id === binding.instance_id);
          return `${binding.remote_channel_id ?? ""} ${instance?.name ?? ""}`;
        })
        .join(" ")
        .toLowerCase();
      const keywordText = [
        String(channel.id),
        channel.name,
        channel.base_url ?? "",
        channel.key_configured ? "key" : "",
        bindingTargets
      ]
        .join(" ")
        .toLowerCase();
      const modelText = channel.models.join(" ").toLowerCase();
      const statusMatched =
        statusFilter === "all" ||
        (statusFilter === "enabled" && channel.status === 1) ||
        (statusFilter === "disabled" && channel.status !== 1);
      return (
        statusMatched &&
        (!keyword || keywordText.includes(keyword)) &&
        (!modelKeyword || modelText.includes(modelKeyword)) &&
        (!groupFilter || channel.groups.includes(groupFilter))
      );
    });
    return [...filtered].sort((left, right) => {
      if (idSort) {
        return left.id - right.id;
      }
      return right.updated_at.localeCompare(left.updated_at);
    });
  }, [bindingsByChannel, channelSearch, channels, groupFilter, idSort, instances, modelSearch, statusFilter]);
  const selectedBatchCount = selectedBatchChannelIds.length;

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
      setError(refreshError instanceof Error ? messageText(refreshError.message) : "刷新失败");
    } finally {
      setBusy(false);
    }
  }, [bindInstanceId, saveToken, token]);

  useEffect(() => {
    if (token) {
      void refresh();
    }
  }, [refresh, token]);

  useEffect(() => {
    if (selectedChannel) {
      setEditChannelForm(channelToForm(selectedChannel));
    }
  }, [selectedChannel?.id]);

  useEffect(() => {
    setSelectedBatchChannelIds((current) => current.filter((id) => channels.some((channel) => channel.id === id)));
  }, [channels]);

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
      setError(authError instanceof Error ? messageText(authError.message) : "认证失败");
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
      setError(createError instanceof Error ? messageText(createError.message) : "创建实例失败");
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
      setShowCreateChannel(false);
      setNotice("渠道已创建");
      await refresh();
    } catch (createError) {
      setError(createError instanceof Error ? messageText(createError.message) : "创建渠道失败");
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
      setError(createError instanceof Error ? messageText(createError.message) : "创建用户失败");
    } finally {
      setBusy(false);
    }
  }

  async function updateSelectedChannel(event: FormEvent) {
    event.preventDefault();
    if (!token || !selectedChannelId) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        name: editChannelForm.name,
        type: Number(editChannelForm.type),
        status: Number(editChannelForm.status),
        base_url: editChannelForm.base_url || null,
        models: parseCsv(editChannelForm.models),
        groups: parseCsv(editChannelForm.groups),
        priority: Number(editChannelForm.priority),
        weight: Number(editChannelForm.weight),
        model_mapping: parseJsonObject(editChannelForm.model_mapping),
        extra_config: parseJsonObject(editChannelForm.extra_config)
      };
      if (editChannelForm.key) {
        payload.key = editChannelForm.key;
      }
      const updated = await apiRequest<Channel>(`/channels/${selectedChannelId}`, {
        token,
        method: "PATCH",
        body: JSON.stringify(payload)
      });
      setEditChannelForm(channelToForm(updated));
      setShowEditChannel(false);
      setNotice("渠道已更新");
      await refresh();
    } catch (updateError) {
      setError(updateError instanceof Error ? messageText(updateError.message) : "更新渠道失败");
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
      setError(bindError instanceof Error ? messageText(bindError.message) : "绑定失败");
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
      setError(syncError instanceof Error ? messageText(syncError.message) : "同步失败");
    } finally {
      setBusy(false);
    }
  }

  async function syncSelectedChannels() {
    if (!token || selectedBatchChannelIds.length === 0) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      let failed = 0;
      for (const channelId of selectedBatchChannelIds) {
        const results = await apiRequest<SyncResult[]>(`/sync/channels/${channelId}`, {
          token,
          method: "POST",
          body: JSON.stringify({})
        });
        failed += results.filter((result) => result.status !== "success").length;
      }
      setNotice(failed ? `批量同步完成，失败 ${failed} 个绑定` : "批量同步完成");
      await refresh();
    } catch (syncError) {
      setError(syncError instanceof Error ? messageText(syncError.message) : "批量同步失败");
    } finally {
      setBusy(false);
    }
  }

  async function syncSingleChannel(channelId: number) {
    if (!token) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const results = await apiRequest<SyncResult[]>(`/sync/channels/${channelId}`, {
        token,
        method: "POST",
        body: JSON.stringify({})
      });
      const failed = results.filter((result) => result.status !== "success").length;
      setNotice(failed ? `同步完成，失败 ${failed} 个` : "同步完成");
      await refresh();
    } catch (syncError) {
      setError(syncError instanceof Error ? messageText(syncError.message) : "同步失败");
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
      setNotice(result.status === "success" ? "同步完成" : messageText(result.error_message ?? "同步失败"));
      await refresh();
    } catch (syncError) {
      setError(syncError instanceof Error ? messageText(syncError.message) : "同步失败");
    } finally {
      setBusy(false);
    }
  }

  async function deleteChannel(channelId: number) {
    if (!token || !window.confirm("确定是否要删除此渠道？此修改将不可逆。")) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiRequest<void>(`/channels/${channelId}`, {
        token,
        method: "DELETE"
      });
      setNotice("渠道已删除");
      setSelectedBatchChannelIds((current) => current.filter((id) => id !== channelId));
      await refresh();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? messageText(deleteError.message) : "删除渠道失败");
    } finally {
      setBusy(false);
    }
  }

  async function deleteSelectedChannels() {
    if (!token || selectedBatchChannelIds.length === 0 || !window.confirm("确定是否要删除所选渠道？此修改将不可逆。")) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await Promise.all(
        selectedBatchChannelIds.map((channelId) =>
          apiRequest<void>(`/channels/${channelId}`, {
            token,
            method: "DELETE"
          })
        )
      );
      setSelectedBatchChannelIds([]);
      setNotice("所选渠道已删除");
      await refresh();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? messageText(deleteError.message) : "批量删除失败");
    } finally {
      setBusy(false);
    }
  }

  async function updateChannelNumber(channel: Channel, field: "priority" | "weight", value: string) {
    if (!token || value === "" || Number(value) === channel[field]) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiRequest<Channel>(`/channels/${channel.id}`, {
        token,
        method: "PATCH",
        body: JSON.stringify({ [field]: Number(value) })
      });
      setNotice(field === "priority" ? "优先级已更新" : "权重已更新");
      await refresh();
    } catch (updateError) {
      setError(updateError instanceof Error ? messageText(updateError.message) : "更新渠道失败");
    } finally {
      setBusy(false);
    }
  }

  async function updateChannelStatus(channel: Channel, status: number) {
    if (!token || status === channel.status) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiRequest<Channel>(`/channels/${channel.id}`, {
        token,
        method: "PATCH",
        body: JSON.stringify({ status })
      });
      setNotice(status === 1 ? "渠道已启用" : "渠道已禁用");
      await refresh();
    } catch (updateError) {
      setError(updateError instanceof Error ? messageText(updateError.message) : "更新渠道失败");
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
              <h1>NewAPI 渠道同步</h1>
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
            <h1>NewAPI 渠道同步</h1>
            <p>{user.username} · {roleText(user.role)}</p>
          </div>
        </div>
        <div className="top-actions">
          <a className="ghost-link" href="/docs" target="_blank" rel="noreferrer">
            接口文档
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
              基础地址
              <input
                value={instanceForm.base_url}
                onChange={(event) => setInstanceForm({ ...instanceForm, base_url: event.target.value })}
                placeholder="https://newapi.example.com"
              />
            </label>
            <label>
              MCP 地址
              <input
                value={instanceForm.mcp_server_url}
                onChange={(event) => setInstanceForm({ ...instanceForm, mcp_server_url: event.target.value })}
              />
            </label>
            <div className="field-grid">
              <label>
                传输方式
                <select
                  value={instanceForm.mcp_transport}
                  onChange={(event) =>
                    setInstanceForm({ ...instanceForm, mcp_transport: event.target.value as InstanceForm["mcp_transport"] })
                  }
                >
                  <option value="mock">模拟</option>
                  <option value="mcp-jsonrpc">MCP JSON-RPC</option>
                </select>
              </label>
              <label>
                鉴权方式
                <select
                  value={instanceForm.mcp_auth_type}
                  onChange={(event) =>
                    setInstanceForm({ ...instanceForm, mcp_auth_type: event.target.value as InstanceForm["mcp_auth_type"] })
                  }
                >
                  <option value="none">无鉴权</option>
                  <option value="bearer">Bearer 令牌</option>
                  <option value="x-api-key">API Key</option>
                </select>
              </label>
            </div>
            <label>
              MCP 密钥
              <input
                value={instanceForm.mcp_secret}
                onChange={(event) => setInstanceForm({ ...instanceForm, mcp_secret: event.target.value })}
                type="password"
              />
            </label>
            <label>
              MCP 配置
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
                    <option value="user">普通用户</option>
                    <option value="admin">管理员</option>
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
          <section className="panel instance-strip">
            <div className="panel-header">
              <PanelTitle title="实例" icon={<Database size={18} />} />
              <span className="table-count">{instances.length} 个实例</span>
            </div>
            <div className="instance-inline-list">
              {instances.map((instance) => (
                <article className="instance-chip" key={instance.id}>
                  <div>
                    <strong>{instance.name}</strong>
                    <span>{transportText(instance.mcp_transport)} · {authTypeText(instance.mcp_auth_type)}</span>
                  </div>
                  <StatusPill ok={instance.is_enabled} text={enabledText(instance.is_enabled)} />
                </article>
              ))}
              {instances.length === 0 ? <EmptyState text="暂无实例" /> : null}
            </div>
          </section>

          <section className="newapi-card">
            <div className="newapi-tabs">
              <button className={statusFilter === "all" ? "active" : ""} onClick={() => setStatusFilter("all")}>
                全部渠道
              </button>
              <button className={statusFilter === "enabled" ? "active" : ""} onClick={() => setStatusFilter("enabled")}>
                已启用
              </button>
              <button className={statusFilter === "disabled" ? "active" : ""} onClick={() => setStatusFilter("disabled")}>
                已禁用
              </button>
            </div>

            <div className="newapi-actions">
              <div className="action-cluster">
                <button className="semi-danger" disabled={!enableBatchMode || selectedBatchCount === 0 || busy} onClick={deleteSelectedChannels}>
                  删除所选渠道
                </button>
                <button className="semi-button" disabled={!enableBatchMode || selectedBatchCount === 0 || busy} onClick={syncSelectedChannels}>
                  同步所选渠道
                </button>
                <button className="semi-button">批量操作</button>
                <button className="semi-button" onClick={() => setCompactMode((current) => !current)}>
                  {compactMode ? "标准模式" : "紧凑模式"}
                </button>
              </div>

              <div className="switch-cluster">
                <SwitchControl checked={idSort} label="使用ID排序" onChange={setIdSort} />
                <SwitchControl checked={enableBatchMode} label="开启批量操作" onChange={setEnableBatchMode} />
                <label className="status-select">
                  状态筛选
                  <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "all" | "enabled" | "disabled")}>
                    <option value="all">全部</option>
                    <option value="enabled">已启用</option>
                    <option value="disabled">已禁用</option>
                  </select>
                </label>
              </div>
            </div>

            <div className="newapi-search">
              <div className="action-cluster">
                <button className="semi-primary" onClick={() => setShowCreateChannel(true)}>
                  添加渠道
                </button>
                <button className="semi-button" onClick={refresh} disabled={busy}>
                  刷新
                </button>
                <button className="semi-button" onClick={() => setShowColumnSettings(true)}>
                  列设置
                </button>
                <button className="semi-button" disabled={!selectedChannel || busy} onClick={syncChannel}>
                  同步当前渠道
                </button>
              </div>

              <div className="filter-cluster">
                <div className="semi-input">
                  <Search size={15} />
                  <input
                    aria-label="渠道ID，名称，密钥，API地址"
                    value={channelSearch}
                    onChange={(event) => setChannelSearch(event.target.value)}
                    placeholder="渠道ID，名称，密钥，API地址"
                  />
                </div>
                <div className="semi-input compact">
                  <Search size={15} />
                  <input
                    aria-label="模型关键字"
                    value={modelSearch}
                    onChange={(event) => setModelSearch(event.target.value)}
                    placeholder="模型关键字"
                  />
                </div>
                <select className="semi-select" value={groupFilter} onChange={(event) => setGroupFilter(event.target.value)}>
                  <option value="">选择分组</option>
                  {groupOptions.map((group) => (
                    <option value={group} key={group}>
                      {group}
                    </option>
                  ))}
                </select>
                <button className="semi-button">查询</button>
                <button
                  className="semi-button"
                  onClick={() => {
                    setChannelSearch("");
                    setModelSearch("");
                    setGroupFilter("");
                    setStatusFilter("all");
                  }}
                >
                  重置
                </button>
              </div>
            </div>

            <div className="channel-management-grid">
              <div className="channel-table-wrap">
                <table className={compactMode ? "channels-table compact" : "channels-table"}>
                  <thead>
                    <tr>
                      {enableBatchMode ? (
                        <th className="batch-col">
                          <input
                            aria-label="选择全部渠道"
                            checked={visibleChannels.length > 0 && visibleChannels.every((channel) => selectedBatchChannelIds.includes(channel.id))}
                            type="checkbox"
                            onChange={(event) => {
                              const visibleIds = visibleChannels.map((channel) => channel.id);
                              setSelectedBatchChannelIds((current) =>
                                event.target.checked
                                  ? Array.from(new Set([...current, ...visibleIds]))
                                  : current.filter((id) => !visibleIds.includes(id))
                              );
                            }}
                          />
                        </th>
                      ) : null}
                      <th>ID</th>
                      <th>名称</th>
                      <th>分组</th>
                      <th>类型</th>
                      <th>状态</th>
                      {visibleColumns.models ? <th>模型</th> : null}
                      {visibleColumns.key ? <th>密钥</th> : null}
                      {visibleColumns.binding ? <th>绑定状态</th> : null}
                      {visibleColumns.remote ? <th>远端 ID</th> : null}
                      {visibleColumns.priority ? <th>优先级</th> : null}
                      {visibleColumns.weight ? <th>权重</th> : null}
                      <th className="operate-col">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleChannels.map((channel) => {
                      const bindings = bindingsByChannel[channel.id] ?? [];
                      const bindingSummary = bindingStatusSummary(bindings);
                      const firstRemoteId = bindings.find((binding) => binding.remote_channel_id)?.remote_channel_id;
                      const selected = channel.id === selectedChannelId;
                      return (
                        <tr className={selected ? "selected" : ""} key={channel.id} onClick={() => setSelectedChannelId(channel.id)}>
                          {enableBatchMode ? (
                            <td className="batch-col">
                              <input
                                aria-label={`选择渠道 ${channel.name}`}
                                checked={selectedBatchChannelIds.includes(channel.id)}
                                type="checkbox"
                                onClick={(event) => event.stopPropagation()}
                                onChange={(event) => {
                                  setSelectedBatchChannelIds((current) =>
                                    event.target.checked
                                      ? [...current, channel.id]
                                      : current.filter((id) => id !== channel.id)
                                  );
                                }}
                              />
                            </td>
                          ) : null}
                          <td className="id-cell">#{channel.id}</td>
                          <td className="name-cell">
                            <strong>{channel.name}</strong>
                            <span>{channel.base_url ?? "未配置 API 地址"}</span>
                          </td>
                          <td>
                            <div className="tag-list">
                              {channel.groups.length > 0 ? channel.groups.map((group) => <TagPill text={group} tone="blue" key={group} />) : "-"}
                            </div>
                          </td>
                          <td><TagPill text={channelTypeText(channel.type)} tone="purple" /></td>
                          <td><TagPill text={channelStatusText(channel.status)} tone={channel.status === 1 ? "green" : "red"} /></td>
                          {visibleColumns.models ? <td className="models-cell">{compactList(channel.models, "未配置模型")}</td> : null}
                          {visibleColumns.key ? (
                            <td><TagPill text={channel.key_configured ? "已配置" : "未配置"} tone={channel.key_configured ? "green" : "gray"} /></td>
                          ) : null}
                          {visibleColumns.binding ? (
                            <td><TagPill text={bindingSummary.text} tone={bindingSummary.tone ?? (bindingSummary.ok ? "green" : "yellow")} /></td>
                          ) : null}
                          {visibleColumns.remote ? <td className="mono remote-cell">{firstRemoteId ?? "等待同步"}</td> : null}
                          {visibleColumns.priority ? (
                            <td>
                              <input
                                className="mini-number"
                                defaultValue={channel.priority}
                                type="number"
                                onClick={(event) => event.stopPropagation()}
                                onBlur={(event) => void updateChannelNumber(channel, "priority", event.target.value)}
                              />
                            </td>
                          ) : null}
                          {visibleColumns.weight ? (
                            <td>
                              <input
                                className="mini-number"
                                defaultValue={channel.weight}
                                min={0}
                                type="number"
                                onClick={(event) => event.stopPropagation()}
                                onBlur={(event) => void updateChannelNumber(channel, "weight", event.target.value)}
                              />
                            </td>
                          ) : null}
                          <td className="operate-cell">
                            <div className="row-actions">
                              <button
                                className="semi-button mini"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void syncSingleChannel(channel.id);
                                }}
                              >
                                测试
                              </button>
                              <button
                                className={channel.status === 1 ? "semi-danger mini" : "semi-button mini"}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void updateChannelStatus(channel, channel.status === 1 ? 2 : 1);
                                }}
                              >
                                {channel.status === 1 ? "禁用" : "启用"}
                              </button>
                              <button
                                className="semi-button mini"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setSelectedChannelId(channel.id);
                                  setShowEditChannel(true);
                                }}
                              >
                                编辑
                              </button>
                              <button
                                className="semi-button icon-mini"
                                title="删除"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void deleteChannel(channel.id);
                                }}
                              >
                                ···
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {visibleChannels.length === 0 ? <EmptyState text="搜索无结果" /> : null}
                <div className="table-footer">
                  <span>显示第 {visibleChannels.length ? 1 : 0} 条 - 第 {visibleChannels.length} 条，共 {visibleChannels.length} 条</span>
                  <span>每页 10 / 20 / 50 / 100</span>
                </div>
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
                  <span>{syncActionText(log.action)}</span>
                  <StatusPill ok={log.status === "success"} text={syncStatusText(log.status)} />
                </div>
              ))}
              {logs.length === 0 ? <EmptyState text="暂无日志" /> : null}
            </div>
          </section>
        </section>
      </section>

      {showCreateChannel ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setShowCreateChannel(false)}>
          <section
            aria-labelledby="create-channel-title"
            className="modal-panel"
            role="dialog"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="modal-head">
              <div>
                <h2 id="create-channel-title">添加渠道</h2>
                <p>字段结构按 NewAPI 渠道编辑弹窗组织，保存后再绑定实例并同步。</p>
              </div>
              <button className="icon-only" onClick={() => setShowCreateChannel(false)} title="关闭" aria-label="关闭">
                <XCircle size={18} />
              </button>
            </div>
            <form className="channel-form modal-channel-form" onSubmit={createChannel}>
              <ChannelFormFields form={channelForm} keyLabel="密钥" onChange={setChannelForm} />
              <div className="modal-actions">
                <button className="semi-button" type="button" onClick={() => setShowCreateChannel(false)}>
                  取消
                </button>
                <button className="semi-primary" disabled={busy}>
                  <Plus size={16} />
                  提交
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {showColumnSettings ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setShowColumnSettings(false)}>
          <section
            aria-labelledby="column-settings-title"
            className="modal-panel column-modal"
            role="dialog"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="modal-head">
              <div>
                <h2 id="column-settings-title">列设置</h2>
                <p>控制渠道表格里的可选列显示。</p>
              </div>
              <button className="icon-only" onClick={() => setShowColumnSettings(false)} title="关闭" aria-label="关闭">
                <XCircle size={18} />
              </button>
            </div>
            <div className="column-options">
              {optionalColumns.map((column) => (
                <label className="column-option" key={column.key}>
                  <input
                    checked={visibleColumns[column.key]}
                    type="checkbox"
                    onChange={(event) =>
                      setVisibleColumns((current) => ({
                        ...current,
                        [column.key]: event.target.checked
                      }))
                    }
                  />
                  {column.label}
                </label>
              ))}
            </div>
            <div className="modal-actions column-actions">
              <button className="semi-button" type="button" onClick={() => setVisibleColumns(defaultVisibleColumns)}>
                恢复默认
              </button>
              <button className="semi-primary" type="button" onClick={() => setShowColumnSettings(false)}>
                完成
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {showEditChannel && selectedChannel ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setShowEditChannel(false)}>
          <section
            aria-labelledby="edit-channel-title"
            className="modal-panel edit-modal"
            role="dialog"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="modal-head">
              <div>
                <h2 id="edit-channel-title">编辑渠道</h2>
                <p>{selectedChannel.name} · {channelTypeText(selectedChannel.type)} · {channelStatusText(selectedChannel.status)}</p>
              </div>
              <button className="icon-only" onClick={() => setShowEditChannel(false)} title="关闭" aria-label="关闭">
                <XCircle size={18} />
              </button>
            </div>

            <div className="edit-modal-body">
              <dl className="detail-grid">
                <div>
                  <dt>基础地址</dt>
                  <dd>{selectedChannel.base_url ?? "-"}</dd>
                </div>
                <div>
                  <dt>分组</dt>
                  <dd>{compactList(selectedChannel.groups)}</dd>
                </div>
                <div>
                  <dt>优先级</dt>
                  <dd>{selectedChannel.priority}</dd>
                </div>
                <div>
                  <dt>权重</dt>
                  <dd>{selectedChannel.weight}</dd>
                </div>
                {selectedChannel.key ? (
                  <div className="wide">
                    <dt>密钥</dt>
                    <dd className="mono">{selectedChannel.key}</dd>
                  </div>
                ) : null}
              </dl>

              <form className="edit-channel-form" onSubmit={updateSelectedChannel}>
                <ChannelFormFields
                  form={editChannelForm}
                  keyLabel="新密钥"
                  keyPlaceholder="留空则保持当前密钥"
                  onChange={setEditChannelForm}
                />
                <div className="modal-actions">
                  <button className="semi-button" type="button" onClick={() => setShowEditChannel(false)}>
                    取消
                  </button>
                  <button className="semi-primary" disabled={busy}>
                    <Save size={16} />
                    保存
                  </button>
                </div>
              </form>

              <div className="modal-bind-panel">
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
                          <strong>{instance?.name ?? `实例 ${binding.instance_id}`}</strong>
                          <span>{binding.remote_channel_id ?? "等待远端 ID"}</span>
                          {binding.last_error ? <small className="error-text">{messageText(binding.last_error)}</small> : null}
                        </div>
                        <StatusPill ok={binding.sync_status === "success"} text={syncStatusText(binding.sync_status)} />
                        <button className="icon-only" onClick={() => void syncBinding(binding.id)} title="同步绑定" aria-label="同步绑定">
                          <RefreshCw size={17} />
                        </button>
                      </article>
                    );
                  })}
                  {selectedBindings.length === 0 ? <EmptyState text="暂无绑定" /> : null}
                </div>
              </div>
            </div>
          </section>
        </div>
      ) : null}
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

function SwitchControl({
  checked,
  label,
  onChange
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="switch-control">
      <span>{label}</span>
      <input checked={checked} type="checkbox" onChange={(event) => onChange(event.target.checked)} />
      <i />
    </label>
  );
}

function TagPill({
  text,
  tone = "gray"
}: {
  text: string;
  tone?: "blue" | "green" | "gray" | "purple" | "red" | "yellow" | "ok" | "warn" | "danger" | "neutral";
}) {
  const normalizedTone: Record<string, string> = {
    danger: "red",
    neutral: "gray",
    ok: "green",
    warn: "yellow"
  };
  return <span className={`tag-pill ${normalizedTone[tone] ?? tone}`}>{text}</span>;
}

function ChannelFormFields({
  form,
  keyLabel,
  keyPlaceholder,
  onChange
}: {
  form: ChannelForm;
  keyLabel: string;
  keyPlaceholder?: string;
  onChange: (form: ChannelForm) => void;
}) {
  return (
    <>
      <label>
        名称
        <input value={form.name} onChange={(event) => onChange({ ...form, name: event.target.value })} />
      </label>
      <label>
        类型
        <input value={form.type} onChange={(event) => onChange({ ...form, type: event.target.value })} />
      </label>
      <label>
        状态
        <input value={form.status} onChange={(event) => onChange({ ...form, status: event.target.value })} />
      </label>
      <label>
        基础地址
        <input value={form.base_url} onChange={(event) => onChange({ ...form, base_url: event.target.value })} />
      </label>
      <label>
        模型
        <input value={form.models} onChange={(event) => onChange({ ...form, models: event.target.value })} />
      </label>
      <label>
        分组
        <input value={form.groups} onChange={(event) => onChange({ ...form, groups: event.target.value })} />
      </label>
      <label>
        优先级
        <input value={form.priority} onChange={(event) => onChange({ ...form, priority: event.target.value })} />
      </label>
      <label>
        权重
        <input value={form.weight} onChange={(event) => onChange({ ...form, weight: event.target.value })} />
      </label>
      <label className="wide">
        {keyLabel}
        <input
          value={form.key}
          onChange={(event) => onChange({ ...form, key: event.target.value })}
          placeholder={keyPlaceholder}
          type="password"
        />
      </label>
      <label>
        模型映射
        <textarea value={form.model_mapping} onChange={(event) => onChange({ ...form, model_mapping: event.target.value })} rows={3} />
      </label>
      <label>
        扩展配置
        <textarea value={form.extra_config} onChange={(event) => onChange({ ...form, extra_config: event.target.value })} rows={3} />
      </label>
    </>
  );
}
