import { useEffect, useMemo, useState } from 'react';
import {
  Cpu,
  ExternalLink,
  FolderCog,
  Gauge,
  Info,
  Link2,
  MonitorCog,
  Play,
  Power,
  RefreshCw,
  RotateCcw,
  Save,
  ServerCog,
  ShieldCheck,
  Wifi,
  Sun,
  Moon,
  Monitor,
  Download,
  Upload,
  DatabaseBackup,
  Network,
  Zap,
  Server,
  Send,
} from 'lucide-react';
import { useApp, type ThemeMode } from '../context/AppContext';
import { api } from '../lib/api';
import { useToast } from '../context/ToastContext';
import { formatBytes, formatUptime } from '../lib/format';
import { Badge, Button, Card, ConfirmDialog, CopyButton, Segmented, Switch } from '../components/ui';
import { useNow } from '../hooks/useNow';
import type { LogLevel, Mode, Settings } from '../types';

const LOG_LEVELS: { value: LogLevel; label: string }[] = [
  { value: 'debug', label: '调试' },
  { value: 'info', label: '信息' },
  { value: 'warning', label: '警告' },
  { value: 'error', label: '错误' },
  { value: 'silent', label: '静默' },
];

function SettingRow({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line/6 py-3.5 last:border-0 last:pb-0">
      <div className="min-w-0">
        <div className="text-[13px] font-medium text-ink">{title}</div>
        <p className="mt-0.5 text-[11px] leading-relaxed text-muted">{description}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export function SettingsPage() {
  const { status, refreshStatus, traffic, themeMode, setThemeMode } = useApp();
  const { toast } = useToast();
  const now = useNow(1000);
  const saved = status!.settings;
  const [form, setForm] = useState<Settings>(saved);
  const [saving, setSaving] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [confirmRestart, setConfirmRestart] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);
  const [telegramTesting, setTelegramTesting] = useState(false);
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [pendingRestore, setPendingRestore] = useState<Record<string, unknown> | null>(null);

  const savedKey = JSON.stringify(saved);
  const dirty = JSON.stringify(form) !== savedKey;

  useEffect(() => {
    if (!dirty) setForm(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedKey]);

  const portChanged = form.mixedPort !== saved.mixedPort;
  const running = status!.core.state === 'running';

  const save = async () => {
    if (!Number.isInteger(form.mixedPort) || form.mixedPort < 1024 || form.mixedPort > 65535) {
      toast('代理端口必须是 1024 到 65535 之间的整数', 'error');
      return;
    }
    setSaving(true);
    try {
      const result = await api.patch<{ settings: Settings }>('settings', form, { timeoutMs: 90000 });
      setForm(result.settings);
      await refreshStatus();
      toast('设置已保存，内核已重启', 'success');
    } catch (error) {
      toast(error instanceof Error ? error.message : '保存设置失败', 'error');
    } finally {
      setSaving(false);
    }
  };

  const startCore = async () => {
    setStarting(true);
    try {
      await api.post('core/start', undefined, { timeoutMs: 90000 });
      await refreshStatus();
      toast('mihomo 内核已启动', 'success');
    } catch (error) {
      toast(error instanceof Error ? error.message : '启动失败', 'error');
    } finally {
      setStarting(false);
    }
  };

  const stopCore = async () => {
    setStopping(true);
    try {
      await api.post('core/stop', undefined, { timeoutMs: 60000 });
      await refreshStatus();
      setConfirmStop(false);
      toast('mihomo 内核已停止', 'success');
    } catch (error) {
      toast(error instanceof Error ? error.message : '停止失败', 'error');
    } finally {
      setStopping(false);
    }
  };

  const restart = async () => {
    setRestarting(true);
    try {
      await api.post('core/restart', undefined, { timeoutMs: 90000 });
      await refreshStatus();
      setConfirmRestart(false);
      toast('内核已重启', 'success');
    } catch (error) {
      toast(error instanceof Error ? error.message : '重启失败', 'error');
    } finally {
      setRestarting(false);
    }
  };

  const reload = async () => {
    setReloading(true);
    try {
      await api.post('core/reload', undefined, { timeoutMs: 90000 });
      await refreshStatus();
      toast('配置已热重载', 'success');
    } catch (error) {
      toast(error instanceof Error ? error.message : '重载失败', 'error');
    } finally {
      setReloading(false);
    }
  };

  const clientAddress = useMemo(() => `http://${form.allowLan ? window.location.hostname : '127.0.0.1'}:${form.mixedPort}`, [form.allowLan, form.mixedPort]);

  const downloadBackup = async () => {
    setBackupBusy(true);
    try {
      const backup = await api.get<Record<string, unknown>>('backup', { timeoutMs: 60000 });
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json;charset=utf-8' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `momo-backup-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 2000);
      toast('备份已下载', 'success');
    } catch (error) {
      toast(error instanceof Error ? error.message : '备份失败', 'error');
    } finally {
      setBackupBusy(false);
    }
  };

  const chooseRestoreFile = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      if (file.size > 10 * 1024 * 1024) {
        toast('备份文件不能超过 10 MB', 'error');
        return;
      }
      try {
        const parsed = JSON.parse(await file.text()) as Record<string, unknown>;
        if (parsed.format !== 'momo-backup') throw new Error('不是 Momo 备份文件');
        setPendingRestore(parsed);
      } catch (error) {
        toast(error instanceof Error ? error.message : '读取备份失败', 'error');
      }
    };
    input.click();
  };

  const restoreBackup = async () => {
    if (!pendingRestore) return;
    setRestoreBusy(true);
    try {
      await api.post('restore', pendingRestore, { timeoutMs: 180000 });
      setPendingRestore(null);
      const result = await api.get<{ settings: Settings }>('settings');
      setForm(result.settings);
      await refreshStatus();
      toast('备份已恢复，配置已应用', 'success');
    } catch (error) {
      toast(error instanceof Error ? error.message : '恢复失败', 'error');
    } finally {
      setRestoreBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12px] text-muted">修改后保存，mihomo 内核会重启生效。</p>
        <div className="flex items-center gap-2">
          {dirty ? <Badge tone="warning">有未保存的修改</Badge> : null}
          <Button variant="primary" size="sm" icon={<Save className="h-3.5 w-3.5" />} loading={saving} disabled={!dirty} onClick={() => { void save(); }}>保存设置</Button>
        </div>
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,1fr)]">
        <div className="space-y-4">
          <Card>
            <div className="flex items-center gap-2 border-b border-line/8 pb-3">
              <Gauge className="h-4 w-4 text-accent" />
              <h3 className="text-sm font-semibold text-ink">代理入口</h3>
            </div>
            <div className="pt-1">
              <SettingRow title="混合代理端口" description="HTTP 和 SOCKS5 共用端口，局域网客户端填写 NAS IP 与该端口。保存后内核会重启。">
                <input
                  type="number"
                  min={1024}
                  max={65535}
                  value={form.mixedPort}
                  onChange={(event) => setForm((prev) => ({ ...prev, mixedPort: Number(event.target.value) }))}
                  className="focus-ring h-9 w-24 rounded-lg border border-line/10 bg-surface2 px-2.5 text-right text-sm text-ink tabular"
                />
              </SettingRow>
              <SettingRow title="允许局域网连接" description="关闭后只有 NAS 本机可以连接代理端口。">
                <Switch checked={form.allowLan} onChange={(value) => setForm((prev) => ({ ...prev, allowLan: value }))} label="允许局域网连接" />
              </SettingRow>
              <SettingRow title="IPv6" description="允许 mihomo 使用 IPv6 解析和连接。">
                <Switch checked={form.ipv6} onChange={(value) => setForm((prev) => ({ ...prev, ipv6: value }))} label="IPv6" />
              </SettingRow>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-line/8 bg-surface2/45 px-3 py-2 text-[11px] text-muted">
              <Wifi className="h-3.5 w-3.5 text-accent" />
              <span className="truncate">客户端代理地址</span>
              <span className="mono truncate text-ink/80">{clientAddress}</span>
              <CopyButton text={clientAddress} label="复制" />
            </div>
          </Card>

          <Card>
            <div className="flex items-center gap-2 border-b border-line/8 pb-3">
              <Send className="h-4 w-4 text-accent" />
              <h3 className="text-sm font-semibold text-ink">Telegram Bot</h3>
            </div>
            <div className="pt-1">
              <SettingRow title="启用 Bot" description="通过 Telegram 查看状态、启停内核、更新订阅。需要 Bot Token 和 Chat ID。">
                <Switch
                  checked={form.telegramEnabled}
                  onChange={(value) => setForm((prev) => ({ ...prev, telegramEnabled: value }))}
                  label="启用 Telegram Bot"
                />
              </SettingRow>
              <SettingRow title="Bot Token" description="从 @BotFather 获取。">
                <input
                  type="password"
                  value={form.telegramToken}
                  onChange={(event) => setForm((prev) => ({ ...prev, telegramToken: event.target.value }))}
                  placeholder="123456:ABC..."
                  className="focus-ring h-9 w-[280px] max-w-full rounded-lg border border-line/10 bg-surface2 px-2.5 text-xs text-ink placeholder:text-muted/50"
                />
              </SettingRow>
              <SettingRow title="Chat ID" description="只接受这个 Chat ID 发来的命令。">
                <input
                  value={form.telegramChatId}
                  onChange={(event) => setForm((prev) => ({ ...prev, telegramChatId: event.target.value }))}
                  placeholder="例如 123456789"
                  className="focus-ring h-9 w-[220px] max-w-full rounded-lg border border-line/10 bg-surface2 px-2.5 text-xs text-ink placeholder:text-muted/50"
                />
              </SettingRow>
              <SettingRow title="异常通知" description="内核进入异常状态时发送消息。">
                <Switch checked={form.telegramNotify} onChange={(value) => setForm((prev) => ({ ...prev, telegramNotify: value }))} label="异常通知" />
              </SettingRow>
              <div className="mt-2 flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<Send className="h-3.5 w-3.5" />}
                  loading={telegramTesting}
                  onClick={async () => {
                    setTelegramTesting(true);
                    try {
                      await api.post('telegram/test', undefined, { timeoutMs: 30000 });
                      toast('测试消息已发送', 'success');
                    } catch (error) {
                      toast(error instanceof Error ? error.message : '发送测试消息失败', 'error');
                    } finally {
                      setTelegramTesting(false);
                    }
                  }}
                >
                  发送测试消息
                </Button>
                <span className="text-[10px] text-muted/60">保存后 Bot 才会使用新配置</span>
              </div>
            </div>
          </Card>

          <Card>
            <div className="flex items-center gap-2 border-b border-line/8 pb-3">
              <Zap className="h-4 w-4 text-accent" />
              <h3 className="text-sm font-semibold text-ink">测速</h3>
            </div>
            <div className="pt-1">
              <SettingRow title="测速地址" description="返回 204 的地址。部分节点会拦截 Google，可改成 Cloudflare 或自建地址。">
                <input
                  value={form.testUrl}
                  onChange={(event) => setForm((prev) => ({ ...prev, testUrl: event.target.value }))}
                  placeholder="http://www.gstatic.com/generate_204"
                  className="focus-ring h-9 w-[280px] max-w-full rounded-lg border border-line/10 bg-surface2 px-2.5 text-xs text-ink placeholder:text-muted/50"
                />
              </SettingRow>
              <SettingRow title="测速超时" description="单个节点/策略组的测速超时，单位毫秒。">
                <input
                  type="number"
                  min={1000}
                  max={10000}
                  step={500}
                  value={form.testTimeout}
                  onChange={(event) => setForm((prev) => ({ ...prev, testTimeout: Number(event.target.value) }))}
                  className="focus-ring h-9 w-24 rounded-lg border border-line/10 bg-surface2 px-2.5 text-right text-sm text-ink tabular"
                />
              </SettingRow>
            </div>
          </Card>

          <Card>
            <div className="flex items-center gap-2 border-b border-line/8 pb-3">
              <Server className="h-4 w-4 text-accent" />
              <h3 className="text-sm font-semibold text-ink">外部控制器（zashboard）</h3>
            </div>
            <div className="pt-1">
              <SettingRow title="允许局域网连接" description="把 mihomo 控制器绑定到 0.0.0.0，供 zashboard 等外部面板直接连接。开启后会暴露 Clash API 到局域网。">
                <Switch
                  checked={form.externalController}
                  onChange={(value) => setForm((prev) => ({ ...prev, externalController: value }))}
                  label="允许局域网连接"
                />
              </SettingRow>
              <SettingRow title="端口" description="zashboard 使用的控制器端口，修改后内核会重启。">
                <input
                  type="number"
                  min={1024}
                  max={65535}
                  value={form.externalControllerPort}
                  onChange={(event) => setForm((prev) => ({ ...prev, externalControllerPort: Number(event.target.value) }))}
                  className="focus-ring h-9 w-24 rounded-lg border border-line/10 bg-surface2 px-2.5 text-right text-sm text-ink tabular"
                />
              </SettingRow>
              <SettingRow title="密钥" description="zashboard 的 Password 字段。留空保存会自动生成；开启后请只在可信局域网使用。">
                <div className="flex items-center gap-2">
                  <input
                    value={form.externalControllerSecret}
                    onChange={(event) => setForm((prev) => ({ ...prev, externalControllerSecret: event.target.value }))}
                    placeholder="留空自动生成"
                    className="focus-ring h-9 w-[260px] max-w-full rounded-lg border border-line/10 bg-surface2 px-2.5 font-mono text-[10px] text-ink placeholder:font-sans placeholder:text-muted/50"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const bytes = crypto.getRandomValues(new Uint8Array(24));
                      const secret = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
                      setForm((prev) => ({ ...prev, externalControllerSecret: secret }));
                    }}
                  >
                    生成
                  </Button>
                </div>
              </SettingRow>
              {form.externalController ? (
                <p className="mt-2 rounded-lg border border-warning/15 bg-warning/6 px-3 py-2 text-[10px] leading-relaxed text-warning">
                  启用后 Clash 控制器会监听 0.0.0.0:{form.externalControllerPort}，局域网内知道密钥的人都能管理内核。zashboard 填：类型 Clash、协议 HTTP、Host 为 NAS 的局域网 IP、Port {form.externalControllerPort}、Password 为上面的密钥。
                </p>
              ) : null}
            </div>
          </Card>

          <Card>
            <div className="flex items-center gap-2 border-b border-line/8 pb-3">
              <Network className="h-4 w-4 text-accent" />
              <h3 className="text-sm font-semibold text-ink">透明代理</h3>
              {status!.app.transparentActive ? <Badge tone="success">已生效</Badge> : null}
            </div>
            <div className="pt-1">
              <SettingRow title="代理模式" description="TUN 支持 TCP/UDP；Redir 仅接管 TCP 和 DNS，UDP/QUIC 仍直连。切换后内核会重启。">
                <select
                  value={form.proxyMode}
                  onChange={(event) => {
                    const mode = event.target.value as Settings['proxyMode'];
                    setForm((prev) => ({
                      ...prev,
                      proxyMode: mode,
                      ...(mode === 'tun' ? { tunAutoRoute: true, tunDnsHijack: true } : {}),
                    }));
                  }}
                  className="focus-ring h-9 rounded-lg border border-line/10 bg-surface2 px-2.5 text-xs text-ink"
                >
                  <option value="off">关闭</option>
                  <option value="tun" disabled={!status!.app.tunCapable}>TUN</option>
                  <option value="redir" disabled={!status!.app.rootMode}>Redir（TCP）</option>
                </select>
              </SettingRow>
              {form.proxyMode === 'tun' ? (
                <>
                  {!status!.app.tunCapable ? (
                    <p className="mt-2 rounded-lg border border-warning/15 bg-warning/6 px-3 py-2 text-[10px] leading-relaxed text-warning">
                      当前内核缺少 cap_net_admin 能力。请重新安装/升级 FPK，或手动执行 setcap。
                    </p>
                  ) : null}
                  <SettingRow title="TUN 栈" description="gVisor 兼容性最好；System 性能更高；Mixed 由内核选择。">
                    <select
                      value={form.tunStack}
                      onChange={(event) => setForm((prev) => ({ ...prev, tunStack: event.target.value as Settings['tunStack'] }))}
                      className="focus-ring h-9 rounded-lg border border-line/10 bg-surface2 px-2.5 text-xs text-ink"
                    >
                      <option value="gvisor">gVisor</option>
                      <option value="system">System</option>
                      <option value="mixed">Mixed</option>
                    </select>
                  </SettingRow>
                  <SettingRow title="自动接管路由" description="自动设置 TUN 路由和接口检测。开启后可能影响 NAS 自身网络，请确认后再保存。">
                    <Switch checked={form.tunAutoRoute} onChange={(value) => setForm((prev) => ({ ...prev, tunAutoRoute: value }))} label="自动接管路由" />
                  </SettingRow>
                  <SettingRow title="DNS 劫持" description="把发往 53 端口的 DNS 请求交给 mihomo DNS 处理。">
                    <Switch checked={form.tunDnsHijack} onChange={(value) => setForm((prev) => ({ ...prev, tunDnsHijack: value }))} label="DNS 劫持" />
                  </SettingRow>
                  {!form.tunAutoRoute ? (
                    <p className="mt-2 rounded-lg border border-danger/20 bg-danger/6 px-3 py-2 text-[10px] leading-relaxed text-danger">
                      自动接管路由未开启：TUN 网卡已创建，但本机流量不会进入 mihomo，连接页会一直为空。需要透明代理请开启“自动接管路由”。
                    </p>
                  ) : null}
                  <p className="mt-2 rounded-lg border border-warning/15 bg-warning/6 px-3 py-2 text-[10px] leading-relaxed text-warning">
                    TUN 模式会影响整个 NAS 的网络出口；如果开启后 SSH/管理页面断开，可通过应用中心停止 Momo 后重新连接。
                  </p>
                </>
              ) : null}
              {form.proxyMode === 'redir' ? (
                <>
                  {!status!.app.rootMode ? (
                    <p className="mt-2 rounded-lg border border-warning/15 bg-warning/6 px-3 py-2 text-[10px] leading-relaxed text-warning">
                      Redir 需要应用以 root 运行，当前安装包不是 root 模式。
                    </p>
                  ) : null}
                  <SettingRow title="Redir 端口" description="nftables 把本机新建 TCP 连接重定向到该端口；不要与其它透明代理占用同一端口。">
                    <input
                      type="number"
                      min={1024}
                      max={65535}
                      value={form.redirPort}
                      onChange={(event) => setForm((prev) => ({ ...prev, redirPort: Number(event.target.value) }))}
                      className="focus-ring h-9 w-24 rounded-lg border border-line/10 bg-surface2 px-2.5 text-right text-sm text-ink tabular"
                    />
                  </SettingRow>
                  <p className="mt-2 rounded-lg border border-warning/15 bg-warning/6 px-3 py-2 text-[10px] leading-relaxed text-warning">
                    启用后所有本机新建 TCP 连接和 DNS 查询会被接管（mihomo 自身流量除外）。如果和 ShellCrash 同时管理透明代理，规则会冲突；请只保留一个。
                  </p>
                  {status!.app.transparentError ? <p className="mt-2 text-[10px] text-danger">{status!.app.transparentError}</p> : null}
                </>
              ) : null}
            </div>
          </Card>

          <Card>
            <div className="flex items-center gap-2 border-b border-line/8 pb-3">
              <MonitorCog className="h-4 w-4 text-accent" />
              <h3 className="text-sm font-semibold text-ink">运行策略</h3>
            </div>
            <div className="pt-1">
              <SettingRow title="代理模式" description="规则模式按配置文件分流；全局模式所有流量走当前节点；直连模式不经过代理。">
                <Segmented<Mode>
                  value={form.mode}
                  onChange={(mode) => setForm((prev) => ({ ...prev, mode }))}
                  size="sm"
                  options={[{ value: 'rule', label: '规则' }, { value: 'global', label: '全局' }, { value: 'direct', label: '直连' }]}
                />
              </SettingRow>
              <SettingRow title="日志级别" description="调试级别会记录更多信息，可能增加日志量。">
                <select
                  value={form.logLevel}
                  onChange={(event) => setForm((prev) => ({ ...prev, logLevel: event.target.value as LogLevel }))}
                  className="focus-ring h-9 rounded-lg border border-line/10 bg-surface2 px-2.5 text-xs text-ink"
                >
                  {LOG_LEVELS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </SettingRow>
              <SettingRow title="统一延迟" description="使用相同 URL 测速，便于比较不同节点。">
                <Switch checked={form.unifiedDelay} onChange={(value) => setForm((prev) => ({ ...prev, unifiedDelay: value }))} label="统一延迟" />
              </SettingRow>
              <SettingRow title="TCP 并发" description="并发建立 TCP 连接，降低握手等待时间。">
                <Switch checked={form.tcpConcurrent} onChange={(value) => setForm((prev) => ({ ...prev, tcpConcurrent: value }))} label="TCP 并发" />
              </SettingRow>
            </div>
            {portChanged ? <p className="mt-3 rounded-lg border border-warning/15 bg-warning/6 px-3 py-2 text-[11px] leading-relaxed text-warning">端口已修改，保存后内核会重启，当前连接会中断。</p> : null}
          </Card>

          <Card>
            <div className="flex items-center gap-2 border-b border-line/8 pb-3">
              <RefreshCw className="h-4 w-4 text-accent" />
              <h3 className="text-sm font-semibold text-ink">订阅更新</h3>
            </div>
            <div className="pt-1">
              <SettingRow title="自动更新订阅" description="定时更新所有订阅链接的配置；关闭后只能手动更新。">
                <select
                  value={form.subscriptionUpdateHours}
                  onChange={(event) => setForm((prev) => ({ ...prev, subscriptionUpdateHours: Number(event.target.value) }))}
                  className="focus-ring h-9 rounded-lg border border-line/10 bg-surface2 px-2.5 text-xs text-ink"
                >
                  <option value={0}>关闭</option>
                  <option value={6}>每 6 小时</option>
                  <option value={12}>每 12 小时</option>
                  <option value={24}>每天</option>
                  <option value={48}>每 2 天</option>
                  <option value={168}>每周</option>
                </select>
              </SettingRow>
            </div>
          </Card>

          <Card>
            <div className="flex items-center gap-2 border-b border-line/8 pb-3">
              <Gauge className="h-4 w-4 text-accent" />
              <h3 className="text-sm font-semibold text-ink">DNS</h3>
            </div>
            <div className="pt-1">
              <SettingRow title="DNS 监听端口" description="mihomo 内置 DNS 监听端口，使用 1024 以上端口避免权限问题。">
                <input
                  type="number"
                  min={1024}
                  max={65535}
                  value={form.dnsPort}
                  onChange={(event) => setForm((prev) => ({ ...prev, dnsPort: Number(event.target.value) }))}
                  className="focus-ring h-9 w-24 rounded-lg border border-line/10 bg-surface2 px-2.5 text-right text-sm text-ink tabular"
                />
              </SettingRow>
              <SettingRow title="DNS 服务器" description="留空沿用订阅配置；填写后覆盖 dns.nameserver，多个用逗号分隔。">
                <input
                  value={form.dnsNameserver}
                  onChange={(event) => setForm((prev) => ({ ...prev, dnsNameserver: event.target.value }))}
                  placeholder="https://doh.pub/dns-query, 223.5.5.5"
                  className="focus-ring h-9 w-[260px] max-w-full rounded-lg border border-line/10 bg-surface2 px-2.5 text-xs text-ink placeholder:text-muted/50"
                />
              </SettingRow>
            </div>
          </Card>

          <Card>
            <div className="flex items-center gap-2 border-b border-line/8 pb-3">
              <ServerCog className="h-4 w-4 text-accent" />
              <h3 className="text-sm font-semibold text-ink">内核操作</h3>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {running ? (
                <>
                  <Button variant="danger" size="sm" icon={<Power className="h-3.5 w-3.5" />} loading={stopping} onClick={() => setConfirmStop(true)}>停止内核</Button>
                  <Button variant="secondary" size="sm" icon={<RotateCcw className="h-3.5 w-3.5" />} loading={restarting} onClick={() => setConfirmRestart(true)}>重启内核</Button>
                </>
              ) : (
                <Button variant="primary" size="sm" icon={<Play className="h-3.5 w-3.5" />} loading={starting} onClick={() => { void startCore(); }}>启动内核</Button>
              )}
              <Button variant="secondary" size="sm" icon={<RefreshCw className="h-3.5 w-3.5" />} loading={reloading} disabled={!running} onClick={() => { void reload(); }}>热重载配置</Button>
              <span className="text-[11px] text-muted">{running ? '停止会断开所有代理连接；重启会重新加载配置。' : '内核停止时代理端口不监听。'}</span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-4 border-t border-line/8 pt-4 sm:grid-cols-4">
              <div><div className="text-[10px] uppercase tracking-[0.12em] text-muted/60">状态</div><div className="mt-1 text-xs text-ink">{running ? '运行中' : status!.core.state === 'stopped' ? '已停止' : status!.core.state === 'error' ? '异常' : status!.core.state === 'starting' ? '启动中' : status!.core.state === 'stopping' ? '停止中' : '重启中'}</div></div>
              <div><div className="text-[10px] uppercase tracking-[0.12em] text-muted/60">版本</div><div className="mt-1 mono text-xs text-ink">{status!.core.version ?? '—'}</div></div>
              <div><div className="text-[10px] uppercase tracking-[0.12em] text-muted/60">运行时长</div><div className="mt-1 text-xs text-ink">{formatUptime(status!.core.startedAt, now)}</div></div>
              <div><div className="text-[10px] uppercase tracking-[0.12em] text-muted/60">内存</div><div className="mt-1 text-xs text-ink">{formatBytes(traffic?.memory ?? 0)}</div></div>
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <div className="flex items-center gap-2 border-b border-line/8 pb-3">
              <Sun className="h-4 w-4 text-accent" />
              <h3 className="text-sm font-semibold text-ink">外观</h3>
            </div>
            <div className="pt-1">
              <SettingRow title="主题" description="跟随系统时自动使用飞牛 fnOS 当前主题。">
                <Segmented<ThemeMode>
                  value={themeMode}
                  onChange={setThemeMode}
                  size="sm"
                  options={[
                    { value: 'auto', label: '跟随系统', icon: <Monitor className="h-3 w-3" /> },
                    { value: 'light', label: '浅色', icon: <Sun className="h-3 w-3" /> },
                    { value: 'dark', label: '深色', icon: <Moon className="h-3 w-3" /> },
                  ]}
                />
              </SettingRow>
            </div>
          </Card>

          <Card>
            <div className="flex items-center gap-2 border-b border-line/8 pb-3">
              <Info className="h-4 w-4 text-accent" />
              <h3 className="text-sm font-semibold text-ink">应用信息</h3>
            </div>
            <div className="mt-2 divide-y divide-line/6">
              {[
                { label: 'Momo 版本', value: status!.app.version, mono: true },
                { label: 'mihomo 内核', value: status!.core.version ?? '—', mono: true },
                { label: '运行平台', value: status!.app.platform, mono: true },
                { label: '统一网关', value: status!.app.gatewayPrefix, mono: true },
                { label: '数据目录', value: status!.app.dataDir ?? '—', mono: true, breakAll: true },
                { label: '安装形态', value: status!.app.packaged ? 'fnOS 应用包' : '本地开发', mono: false },
              ].map((item) => (
                <div key={item.label} className="flex items-start justify-between gap-3 py-2.5">
                  <span className="shrink-0 text-[11px] text-muted">{item.label}</span>
                  <span className={`text-right text-[11px] text-ink/85 ${item.mono ? 'mono' : ''} ${item.breakAll ? 'break-all' : 'truncate'}`}>{item.value}</span>
                </div>
              ))}
            </div>
            <a
              href={`${import.meta.env.BASE_URL}logs`}
              className="mt-3 flex items-center justify-center gap-1.5 rounded-lg border border-line/8 py-2 text-[11px] text-muted transition hover:border-accent/20 hover:text-accent"
            >
              <Link2 className="h-3 w-3" /> 查看运行日志
            </a>
          </Card>

          <Card>
            <div className="flex items-center gap-2 border-b border-line/8 pb-3">
              <ShieldCheck className="h-4 w-4 text-accent" />
              <h3 className="text-sm font-semibold text-ink">访问与安全</h3>
            </div>
            <ul className="mt-3 space-y-2.5 text-[11px] leading-relaxed text-muted">
              <li className="flex gap-2"><span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-accent/60" />面板通过飞牛 fnOS 统一网关访问，需要管理员登录态。</li>
              <li className="flex gap-2"><span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-accent/60" />mihomo 控制器只监听 <span className="mono text-ink/80">127.0.0.1</span>，不暴露到局域网。</li>
              <li className="flex gap-2"><span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-accent/60" />{form.allowLan ? '代理端口已允许局域网访问，请信任所在网络。' : '代理端口仅本机可用。'}</li>
              <li className="flex gap-2"><span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-accent/60" />订阅信息与配置保存在应用数据目录，不写入共享目录。</li>
            </ul>
          </Card>

          <Card>
            <div className="flex items-center gap-2 border-b border-line/8 pb-3">
              <DatabaseBackup className="h-4 w-4 text-accent" />
              <h3 className="text-sm font-semibold text-ink">备份与恢复</h3>
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-muted">备份包含应用设置和全部订阅内容，不包含内核二进制、日志和节点选择缓存。备份文件含订阅 token，请妥善保存。</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" icon={<Download className="h-3.5 w-3.5" />} loading={backupBusy} onClick={() => { void downloadBackup(); }}>下载备份</Button>
              <Button variant="secondary" size="sm" icon={<Upload className="h-3.5 w-3.5" />} loading={restoreBusy} onClick={chooseRestoreFile}>恢复备份</Button>
            </div>
          </Card>

          <Card>
            <div className="flex items-center gap-2 border-b border-line/8 pb-3">
              <FolderCog className="h-4 w-4 text-accent" />
              <h3 className="text-sm font-semibold text-ink">使用提示</h3>
            </div>
            <div className="mt-3 space-y-2 text-[11px] leading-relaxed text-muted">
              <p>· 局域网设备使用混合代理端口即可同时支持 HTTP 与 SOCKS5。</p>
              <p>· 节点选择会写入 mihomo 缓存，内核重启后保持。</p>
              <p>· 若内核异常，请先在日志页查看 stderr 输出。</p>
            </div>
            <a href="https://wiki.metacubex.one/" target="_blank" rel="noreferrer" className="mt-3 flex items-center gap-1.5 text-[11px] text-accent hover:underline">
              配置文档 <ExternalLink className="h-3 w-3" />
            </a>
          </Card>
        </div>
      </div>

      <div className="flex items-center gap-2 px-1 text-[11px] text-muted/50">
        <Cpu className="h-3 w-3" /> 设置写入数据目录后由内核重启生效，配置校验失败时不会覆盖运行中的配置。
      </div>

      <ConfirmDialog
        open={confirmRestart}
        title="重启内核"
        message="重启会立即中断所有正在使用的代理连接，客户端需要重新建立连接。确定继续吗？"
        confirmText="重启"
        pending={restarting}
        onClose={() => { if (!restarting) setConfirmRestart(false); }}
        onConfirm={() => { void restart(); }}
      />

      <ConfirmDialog
        open={Boolean(pendingRestore)}
        title="恢复备份"
        message="恢复会覆盖当前设置和全部订阅，并立即应用配置。确定继续吗？"
        confirmText="恢复"
        danger
        pending={restoreBusy}
        onClose={() => { if (!restoreBusy) setPendingRestore(null); }}
        onConfirm={() => { void restoreBackup(); }}
      />

      <ConfirmDialog
        open={confirmStop}
        title="停止内核"
        message="停止后代理端口将不再监听，所有客户端会立即断开。配置和订阅不会丢失，可以随时重新启动。确定停止吗？"
        confirmText="停止"
        danger
        pending={stopping}
        onClose={() => { if (!stopping) setConfirmStop(false); }}
        onConfirm={() => { void stopCore(); }}
      />
    </div>
  );
}
