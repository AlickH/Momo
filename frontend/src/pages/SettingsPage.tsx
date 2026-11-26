import { useEffect, useMemo, useState } from 'react';
import {
  Cpu,
  ExternalLink,
  FolderCog,
  Gauge,
  Info,
  Link2,
  MonitorCog,
  RefreshCw,
  RotateCcw,
  Save,
  ServerCog,
  ShieldCheck,
  Wifi,
  Sun,
  Moon,
  Monitor,
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
  const [reloading, setReloading] = useState(false);
  const [confirmRestart, setConfirmRestart] = useState(false);

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
              <ServerCog className="h-4 w-4 text-accent" />
              <h3 className="text-sm font-semibold text-ink">内核操作</h3>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button variant="secondary" size="sm" icon={<RotateCcw className="h-3.5 w-3.5" />} loading={restarting} onClick={() => setConfirmRestart(true)}>{running ? '重启内核' : '启动内核'}</Button>
              <Button variant="secondary" size="sm" icon={<RefreshCw className="h-3.5 w-3.5" />} loading={reloading} disabled={!running} onClick={() => { void reload(); }}>热重载配置</Button>
              <span className="text-[11px] text-muted">重启会中断当前所有代理连接；热重载尽量保留连接。</span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-4 border-t border-line/8 pt-4 sm:grid-cols-4">
              <div><div className="text-[10px] uppercase tracking-[0.12em] text-muted/60">状态</div><div className="mt-1 text-xs text-ink">{running ? '运行中' : status!.core.state}</div></div>
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
        title={running ? '重启内核' : '启动内核'}
        message="重启会立即中断所有正在使用的代理连接，客户端需要重新建立连接。确定继续吗？"
        confirmText="重启"
        pending={restarting}
        onClose={() => { if (!restarting) setConfirmRestart(false); }}
        onConfirm={() => { void restart(); }}
      />
    </div>
  );
}
