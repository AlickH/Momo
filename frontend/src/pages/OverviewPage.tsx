import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpFromLine,
  Cable,
  Cpu,
  Layers,
  ListFilter,
  Power,
  Radio,
  ServerCog,
  Play,
  RotateCcw,
  ShieldCheck,
  Timer,
  Waypoints,
  Activity,
  Globe2,
  RefreshCw,
  ScrollText,
  Sparkles,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { usePolling } from '../hooks/usePolling';
import { useNow } from '../hooks/useNow';
import { api } from '../lib/api';
import { useToast } from '../context/ToastContext';
import { formatBytes, formatDate, formatExpiry, formatNumber, formatRate, formatUptime, percent, shortCoreVersion, timeAgo } from '../lib/format';
import { TrafficChart } from '../components/TrafficChart';
import { MiniChart } from '../components/MiniChart';
import { Badge, Button, Card, ConfirmDialog, Modal, ProgressBar, Skeleton, StatusDot } from '../components/ui';
import { cn } from '../lib/cn';
import type { LogEntry, ProxiesData, SmartWeight } from '../types';

const OVERVIEW_CARDS = [
  { key: 'traffic', label: '实时流量' },
  { key: 'stats', label: '统计卡片' },
  { key: 'trends', label: '运行趋势' },
  { key: 'groups', label: '策略组' },
  { key: 'core', label: '内核状态' },
  { key: 'profile', label: '当前配置' },
  { key: 'ip', label: 'IP 检测' },
  { key: 'smart', label: 'Smart 权重' },
  { key: 'logs', label: '最近日志' },
] as const;

type OverviewCardKey = typeof OVERVIEW_CARDS[number]['key'];

const stateLabel: Record<string, string> = {
  running: '运行中',
  starting: '启动中',
  restarting: '重启中',
  stopping: '停止中',
  stopped: '已停止',
  error: '异常',
};

function StatCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-[0.15em] text-muted">{label}</span>
        <span className="text-muted/70">{icon}</span>
      </div>
      <div className="mt-2 text-[22px] font-semibold leading-none tracking-tight text-ink tabular">{value}</div>
      {sub ? <div className="mt-1.5 text-[11px] text-muted/70">{sub}</div> : null}
    </div>
  );
}

function CoreRing({ state, version }: { state: string; version: string | null }) {
  const active = state === 'running';
  const tone = active ? 'rgb(var(--success))' : state === 'error' ? 'rgb(var(--danger))' : 'rgb(var(--warning))';
  return (
    <div className="relative mx-auto h-[132px] w-[132px]">
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
        <circle cx="60" cy="60" r="52" fill="none" stroke="rgb(var(--line))" strokeOpacity="0.08" strokeWidth="6" />
        <circle
          cx="60"
          cy="60"
          r="52"
          fill="none"
          stroke={tone}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray="326.7"
          strokeDashoffset={active ? 0 : 70}
          className="transition-all duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <StatusDot tone={active ? 'success' : state === 'error' ? 'danger' : 'warning'} pulse={active || state === 'starting'} />
        <span className="mt-1.5 text-sm font-semibold text-ink">{stateLabel[state] ?? state}</span>
        <span className="mt-0.5 max-w-[96px] truncate mono text-[10px] text-muted" title={version ?? ''}>{version ? shortCoreVersion(version) : 'mihomo'}</span>
      </div>
    </div>
  );
}

export function OverviewPage() {
  const { status, traffic, refreshStatus } = useApp();
  const { toast } = useToast();
  const now = useNow(1000);
  const [coreBusy, setCoreBusy] = useState(false);
  const [ipBusy, setIpBusy] = useState(false);
  const [ipResult, setIpResult] = useState<{ proxyIp: string; directIp: string; same: boolean; checkedAt: string } | null>(null);
  const [cardsOpen, setCardsOpen] = useState(false);

  useEffect(() => {
    const openCards = () => setCardsOpen(true);
    window.addEventListener('momo:overview-cards', openCards);
    return () => window.removeEventListener('momo:overview-cards', openCards);
  }, []);
  const [visibleCards, setVisibleCards] = useState<Record<OverviewCardKey, boolean>>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('momo-overview-cards') || '{}');
      return Object.fromEntries(OVERVIEW_CARDS.map((card) => [card.key, stored[card.key] !== false])) as Record<OverviewCardKey, boolean>;
    } catch {
      return Object.fromEntries(OVERVIEW_CARDS.map((card) => [card.key, true])) as Record<OverviewCardKey, boolean>;
    }
  });

  const toggleCard = (key: OverviewCardKey, value: boolean) => {
    setVisibleCards((previous) => {
      const next = { ...previous, [key]: value };
      localStorage.setItem('momo-overview-cards', JSON.stringify(next));
      return next;
    });
  };
  const cardClass = (key: OverviewCardKey, base?: string) => cn(base, !visibleCards[key] && 'hidden');
  const [confirmStop, setConfirmStop] = useState(false);
  const proxies = usePolling<ProxiesData>(() => api.get('proxies'), 5000);
  const logs = usePolling<{ logs: LogEntry[] }>(() => api.get('logs?since=0&limit=6'), 8000);
  const smart = usePolling<{ weights: Record<string, SmartWeight[]> }>(() => api.get('smart/weights'), 10000);
  const core = status!.core;
  const settings = status!.settings;
  const profile = status!.activeProfile;

  const subscription = useMemo(() => {
    if (!profile?.subscription) return null;
    const used = profile.subscription.upload + profile.subscription.download;
    const total = profile.subscription.total;
    const pct = percent(used, total);
    const expiry = formatExpiry(profile.subscription.expire);
    return { used, total, pct, expiry };
  }, [profile]);

  const groups = proxies.data?.groups ?? [];
  const recentLogs = (logs.data?.logs ?? []).filter((entry) => entry.source === 'core').slice(-6);

  const startCore = async () => {
    setCoreBusy(true);
    try {
      await api.post('core/start', undefined, { timeoutMs: 90000 });
      await refreshStatus();
      toast('mihomo 内核已启动', 'success');
    } catch (error) {
      toast(error instanceof Error ? error.message : '启动失败', 'error');
    } finally {
      setCoreBusy(false);
    }
  };

  const stopCore = async () => {
    setCoreBusy(true);
    try {
      await api.post('core/stop', undefined, { timeoutMs: 60000 });
      await refreshStatus();
      setConfirmStop(false);
      toast('mihomo 内核已停止', 'success');
    } catch (error) {
      toast(error instanceof Error ? error.message : '停止失败', 'error');
    } finally {
      setCoreBusy(false);
    }
  };

  const restartCore = async () => {
    setCoreBusy(true);
    try {
      await api.post('core/restart', undefined, { timeoutMs: 90000 });
      await refreshStatus();
      toast('mihomo 内核已重启', 'success');
    } catch (error) {
      toast(error instanceof Error ? error.message : '重启失败', 'error');
    } finally {
      setCoreBusy(false);
    }
  };
  const activeState = core.state;
  const running = activeState === 'running';

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.62fr)_minmax(320px,1fr)]">
        <div className="space-y-4">
          <Card className={cardClass('traffic', 'overflow-hidden !p-0')}>
            <div className="flex flex-wrap items-start justify-between gap-4 px-5 pt-5">
              <div>
                <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
                  <Radio className="h-4 w-4 text-accent" />
                  实时流量
                </h3>
                <div className="mt-3 flex flex-wrap items-end gap-x-8 gap-y-3">
                  <div>
                    <div className="flex items-center gap-1.5 text-[11px] text-muted">
                      <span className="h-1.5 w-1.5 rounded-full bg-[rgb(var(--chart-up))]" />
                      上传速度
                    </div>
                    <div className="mt-1 text-[28px] font-semibold leading-none tracking-tight text-ink tabular">{formatRate(traffic?.up ?? 0)}</div>
                    <div className="mt-1.5 text-[11px] text-muted/70">累计 {formatBytes(traffic?.upTotal ?? 0)}</div>
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5 text-[11px] text-muted">
                      <span className="h-1.5 w-1.5 rounded-full bg-[rgb(var(--chart-down))]" />
                      下载速度
                    </div>
                    <div className="mt-1 text-[28px] font-semibold leading-none tracking-tight text-ink tabular">{formatRate(traffic?.down ?? 0)}</div>
                    <div className="mt-1.5 text-[11px] text-muted/70">累计 {formatBytes(traffic?.downTotal ?? 0)}</div>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3 text-[11px] text-muted">
                <span className="flex items-center gap-1.5"><span className="h-1.5 w-5 rounded-full bg-[rgb(var(--chart-up))]" />上传</span>
                <span className="flex items-center gap-1.5"><span className="h-1.5 w-5 rounded-full bg-[rgb(var(--chart-down))]" />下载</span>
              </div>
            </div>
            <div className="mt-2 px-2 pb-3">
              <TrafficChart history={traffic?.history ?? []} />
            </div>
          </Card>

          <div className={cardClass('stats', 'grid grid-cols-2 gap-3 sm:grid-cols-4')}>
            <StatCard icon={<ArrowDownToLine className="h-4 w-4" />} label="下载总量" value={formatBytes(traffic?.downTotal ?? 0)} sub="本次内核运行" />
            <StatCard icon={<ArrowUpFromLine className="h-4 w-4" />} label="上传总量" value={formatBytes(traffic?.upTotal ?? 0)} sub="本次内核运行" />
            <StatCard icon={<Cable className="h-4 w-4" />} label="活动连接" value={formatNumber(status!.connections)} sub={running ? '实时连接数' : '内核未运行'} />
            <StatCard icon={<Cpu className="h-4 w-4" />} label="内存占用" value={formatBytes(traffic?.memory ?? 0)} sub="mihomo 进程" />
          </div>

          <Card className={cardClass('trends')}>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="flex items-center gap-2 text-sm font-semibold text-ink"><Activity className="h-4 w-4 text-accent" />运行趋势</h3>
                <p className="mt-0.5 text-[12px] text-muted">最近 60 个采样</p>
              </div>
            </div>
            <div className="mt-4 grid gap-5 sm:grid-cols-2">
              <div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-muted">内存占用</span>
                  <span className="text-ink">{formatBytes(traffic?.memory ?? 0)}</span>
                </div>
                <div className="mt-2 h-[52px]">
                  <MiniChart history={traffic?.memoryHistory ?? []} colorVar="--chart-down" floor={64 * 1024 * 1024} format={formatBytes} />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-muted">活动连接</span>
                  <span className="text-ink">{formatNumber(status!.connections)}</span>
                </div>
                <div className="mt-2 h-[52px]">
                  <MiniChart history={traffic?.connectionsHistory ?? []} colorVar="--accent" floor={10} format={formatNumber} />
                </div>
              </div>
            </div>
          </Card>

          <Card className={cardClass('groups')}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="flex items-center gap-2 text-sm font-semibold text-ink"><Waypoints className="h-4 w-4 text-accent" />策略组</h3>
                <p className="mt-0.5 text-[12px] text-muted">当前节点选择与自动策略</p>
              </div>
              <Link to="/proxies" className="flex items-center gap-1 text-[12px] font-medium text-accent hover:underline">
                全部代理 <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
              {proxies.loading && groups.length === 0 ? (
                <><Skeleton className="h-[86px]" /><Skeleton className="h-[86px]" /></>
              ) : groups.length === 0 ? (
                <div className="col-span-full rounded-xl border border-dashed border-line/10 px-4 py-6 text-center text-[12px] text-muted">
                  当前配置没有策略组，添加订阅后这里会显示节点分组。
                </div>
              ) : groups.slice(0, 4).map((group) => (
                <Link key={group.name} to="/proxies" className="group rounded-xl border border-line/8 bg-surface2/45 px-3.5 py-3 transition hover:border-accent/20 hover:bg-surface2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-2">
                      <Waypoints className="h-3.5 w-3.5 shrink-0 text-muted" />
                      <span className="truncate text-xs font-medium text-ink">{group.name}</span>
                    </span>
                    <Badge tone={group.type === 'Selector' ? 'accent' : group.type === 'URLTest' ? 'info' : 'neutral'}>{group.type}</Badge>
                  </div>
                  <div className="mt-2.5 flex items-center justify-between gap-2">
                    <span className="truncate text-[12px] text-muted">{group.now || '未选择'}</span>
                    <span className="shrink-0 text-[11px] text-muted/60">{group.all.length} 节点</span>
                  </div>
                </Link>
              ))}
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className={cardClass('core')}>
            <div className="flex items-start justify-between">
              <div>
                <h3 className="flex items-center gap-2 text-sm font-semibold text-ink"><Cpu className="h-4 w-4 text-accent" />内核状态</h3>
                <p className="mt-0.5 text-[12px] text-muted">mihomo 内核</p>
              </div>
              <Link to="/settings" className="rounded-lg p-1.5 text-muted transition hover:bg-surface2 hover:text-ink" aria-label="内核设置">
                <ServerCog className="h-4 w-4" />
              </Link>
            </div>
            <div className="mt-4"><CoreRing state={activeState} version={core.version} /></div>
            {core.lastError ? (
              <div className="mt-3 rounded-lg border border-danger/15 bg-danger/6 px-3 py-2 text-[11px] leading-relaxed text-danger/90">
                <p className="line-clamp-3 break-all">{core.lastError}</p>
                <button type="button" onClick={() => { void refreshStatus(); }} className="mt-1.5 font-medium text-danger hover:underline">刷新状态</button>
              </div>
            ) : null}
            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-line/8 pt-3">
              <div>
                <div className="text-[10px] uppercase tracking-[0.12em] text-muted/60">运行时长</div>
                <div className="mt-1 text-xs text-ink">{formatUptime(core.startedAt, now)}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-[0.12em] text-muted/60">代理端口</div>
                <div className="mt-1 text-xs text-ink tabular">{settings.mixedPort}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-[0.12em] text-muted/60">PID</div>
                <div className="mt-1 text-xs text-ink tabular">{core.pid ?? '—'}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-[0.12em] text-muted/60">局域网</div>
                <div className="mt-1 text-xs text-ink">{settings.allowLan ? '已允许' : '已关闭'}</div>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line/8 pt-3">
              {running ? (
                <>
                  <Button variant="danger" size="sm" icon={<Power className="h-3.5 w-3.5" />} loading={coreBusy} onClick={() => setConfirmStop(true)}>停止内核</Button>
                  <Button variant="secondary" size="sm" icon={<RotateCcw className="h-3.5 w-3.5" />} disabled={coreBusy} onClick={() => { void restartCore(); }}>重启</Button>
                </>
              ) : (
                <Button variant="primary" size="sm" icon={<Play className="h-3.5 w-3.5" />} loading={coreBusy} disabled={activeState === 'starting' || activeState === 'restarting'} onClick={() => { void startCore(); }}>启动内核</Button>
              )}
              <span className="ml-auto flex items-center gap-1 text-[11px] text-muted"><ListFilter className="h-3 w-3" /> {settings.mode === 'rule' ? '规则模式' : settings.mode === 'global' ? '全局模式' : '直连模式'}</span>
            </div>
            <div className="mt-2 flex items-center gap-1 text-[11px] text-muted/60"><ShieldCheck className="h-3 w-3" /> 仅管理员可管理</div>
          </Card>

          <Card className={cardClass('profile')}>
            <div className="flex items-start justify-between">
              <div>
                <h3 className="flex items-center gap-2 text-sm font-semibold text-ink"><Layers className="h-4 w-4 text-accent" />当前配置</h3>
                <p className="mt-0.5 text-[12px] text-muted">当前使用</p>
              </div>
              <Link to="/profiles" className="flex items-center gap-1 text-[12px] text-accent hover:underline">管理 <ArrowRight className="h-3 w-3" /></Link>
            </div>
            {profile ? (
              <div className="mt-4">
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-accent/15 bg-accent/8 text-accent"><Layers className="h-4 w-4" /></span>
                  <div className="min-w-0">
                    <div className="truncate text-[14px] font-medium text-ink">{profile.name}</div>
                    <div className="text-[11px] text-muted">{profile.source === 'url' ? '订阅链接' : '本地配置'} · {timeAgo(profile.updatedAt)}更新</div>
                  </div>
                </div>
                {subscription ? (
                  <div className="mt-4">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-muted">流量使用</span>
                      <span className="text-ink/90">{formatBytes(subscription.used)} / {formatBytes(subscription.total)}</span>
                    </div>
                    <ProgressBar value={subscription.pct} tone={subscription.pct > 90 ? 'danger' : subscription.pct > 70 ? 'warning' : 'accent'} className="mt-1.5" />
                    <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted/70">
                      <span>{subscription.pct.toFixed(1)}%</span>
                      <span className={subscription.expiry.expired ? 'text-danger' : ''}>{subscription.expiry.text}</span>
                    </div>
                  </div>
                ) : null}
                <div className="mt-4 flex items-center gap-4 border-t border-line/8 pt-3 text-[11px] text-muted">
                  <span className="flex items-center gap-1"><Waypoints className="h-3 w-3" /> {profile.proxyCount} 代理</span>
                  <span className="flex items-center gap-1"><ListFilter className="h-3 w-3" /> {proxies.data?.groups.length ?? 0} 策略组</span>
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-dashed border-line/12 px-4 py-6 text-center">
                <p className="text-xs text-muted">还没有启用任何配置</p>
                <Link to="/profiles" className="mt-3 inline-flex"><Button variant="primary" size="sm">添加订阅</Button></Link>
              </div>
            )}
          </Card>

          <Card className={cardClass('ip')}>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="flex items-center gap-2 text-sm font-semibold text-ink"><Globe2 className="h-4 w-4 text-accent" />IP 检测</h3>
                <p className="mt-0.5 text-[12px] text-muted">对比代理出口与直连出口</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                icon={<RefreshCw className="h-3.5 w-3.5" />}
                loading={ipBusy}
                onClick={async () => {
                  setIpBusy(true);
                  try {
                    setIpResult(await api.post('ip-check', undefined, { timeoutMs: 30000 }));
                  } catch (error) {
                    toast(error instanceof Error ? error.message : 'IP 检测失败', 'error');
                  } finally {
                    setIpBusy(false);
                  }
                }}
              >
                检测
              </Button>
            </div>
            <div className="mt-3 space-y-2">
              {ipResult ? (
                <>
                  <div className="flex items-center justify-between text-[11px]"><span className="text-muted">代理出口</span><span className="mono text-ink">{ipResult.proxyIp || '—'}</span></div>
                  <div className="flex items-center justify-between text-[11px]"><span className="text-muted">直连出口</span><span className="mono text-ink">{ipResult.directIp || '—'}</span></div>
                  <div className="flex items-center justify-between text-[11px]"><span className="text-muted">状态</span><span className={ipResult.same ? 'text-warning' : 'text-success'}>{ipResult.same ? '与直连相同' : '已走代理'}</span></div>
                </>
              ) : <p className="py-2 text-center text-[11px] text-muted">点击检测获取当前出口 IP</p>}
            </div>
          </Card>

          {Object.keys(smart.data?.weights ?? {}).length > 0 ? (
            <Card className={cardClass('smart')}>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-ink"><Sparkles className="h-4 w-4 text-accent" />Smart 权重</h3>
                  <p className="mt-0.5 text-[12px] text-muted">smart 内核的节点评分</p>
                </div>
                <Badge tone="info">Smart</Badge>
              </div>
              <div className="mt-3 space-y-3">
                {Object.entries(smart.data!.weights).slice(0, 3).map(([group, weights]) => (
                  <div key={group}>
                    <div className="truncate text-[11px] font-medium text-ink">{group}</div>
                    <div className="mt-1 space-y-1">
                      {(weights ?? []).slice(0, 3).map((weight) => (
                        <div key={weight.Name} className="flex items-center justify-between gap-2 text-[10px]">
                          <span className="truncate text-muted">{weight.Name}</span>
                          <span className="shrink-0 mono text-muted/60">{weight.Rank} · {Number(weight.Weight).toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ) : null}

          <Card className={cardClass('logs')}>
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-ink"><ScrollText className="h-4 w-4 text-accent" />最近日志</h3>
              <Link to="/logs" className="text-[12px] text-accent hover:underline">查看全部</Link>
            </div>
            <div className="mt-3 space-y-2">
              {recentLogs.length === 0 ? (
                <p className="py-4 text-center text-[12px] text-muted">暂无日志</p>
              ) : recentLogs.slice(-6).map((entry) => (
                <div key={entry.id} className="flex items-start gap-2 text-[11px]">
                  <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${entry.level === 'error' ? 'bg-danger' : entry.level === 'warning' ? 'bg-warning' : 'bg-accent/60'}`} />
                  <span className="mono shrink-0 text-muted/60">{new Date(entry.time).toLocaleTimeString('zh-CN', { hour12: false })}</span>
                  <span className="line-clamp-1 min-w-0 text-muted">{entry.message}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-[11px] text-muted/50">
        <span className="flex items-center gap-1.5"><Timer className="h-3 w-3" /> 实时推送 · 内核 {core.version ?? '—'}</span>
        <span>最近更新 {formatDate(proxies.lastUpdated ?? Date.now())}</span>
      </div>

      <Modal open={cardsOpen} onClose={() => setCardsOpen(false)} title="概览卡片" description="选择要显示的卡片，设置保存在浏览器本地。">
        <div className="space-y-1">
          {OVERVIEW_CARDS.map((card) => (
            <label key={card.key} className="flex cursor-pointer items-center justify-between rounded-lg px-2 py-2 text-[12px] text-ink hover:bg-surface2/50">
              <span>{card.label}</span>
              <input
                type="checkbox"
                checked={visibleCards[card.key]}
                onChange={(event) => toggleCard(card.key, event.target.checked)}
                className="h-4 w-4 accent-[rgb(var(--accent))]"
              />
            </label>
          ))}
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmStop}
        title="停止内核"
        message="停止后代理端口将不再监听，所有客户端会立即断开。配置和订阅不会丢失，可以随时重新启动。确定停止吗？"
        confirmText="停止"
        danger
        pending={coreBusy}
        onClose={() => { if (!coreBusy) setConfirmStop(false); }}
        onConfirm={() => { void stopCore(); }}
      />
    </div>
  );
}
