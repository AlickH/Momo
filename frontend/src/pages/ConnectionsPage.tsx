import { useDeferredValue, useMemo, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, Cable, RefreshCw, SearchX, Timer, X, XCircle } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { usePolling } from '../hooks/usePolling';
import { useNow } from '../hooks/useNow';
import { api } from '../lib/api';
import { useToast } from '../context/ToastContext';
import { formatBytes, formatDuration } from '../lib/format';
import { Badge, Button, Card, ConfirmDialog, EmptyState, SearchInput, Skeleton } from '../components/ui';
import { cn } from '../lib/cn';
import type { Connection, ConnectionsData } from '../types';

function durationOf(start: string, now: number): number {
  const value = new Date(start).getTime();
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, (now - value) / 1000);
}

function networkTone(network: string): 'info' | 'accent' | 'neutral' {
  if (network === 'tcp') return 'info';
  if (network === 'udp') return 'accent';
  return 'neutral';
}

export function ConnectionsPage() {
  const { status, refreshStatus } = useApp();
  const { toast } = useToast();
  const connections = usePolling<ConnectionsData>(() => api.get('connections'), 1500);
  const now = useNow(1000);
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const [limit, setLimit] = useState(200);

  const filtered = useMemo(() => {
    const items = connections.data?.connections ?? [];
    const needle = deferredQuery.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((item) => (
      item.host.toLowerCase().includes(needle)
      || item.destinationIP.includes(needle)
      || item.rule.toLowerCase().includes(needle)
      || item.chains.join(' ').toLowerCase().includes(needle)
      || item.process.toLowerCase().includes(needle)
    ));
  }, [connections.data, deferredQuery]);

  const visible = filtered.slice(0, limit);

  const closeOne = async (connection: Connection) => {
    setBusy(connection.id);
    try {
      await api.delete(`connections/${encodeURIComponent(connection.id)}`);
      await connections.refresh();
    } catch (error) {
      toast(error instanceof Error ? error.message : '关闭连接失败', 'error');
    } finally {
      setBusy(null);
    }
  };

  const closeAll = async () => {
    setBusy('__all__');
    try {
      await api.delete('connections');
      await connections.refresh();
      setConfirmAll(false);
      toast('已关闭全部连接', 'success');
    } catch (error) {
      toast(error instanceof Error ? error.message : '操作失败', 'error');
    } finally {
      setBusy(null);
    }
  };

  const running = status?.core.state === 'running';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <SearchInput value={query} onChange={setQuery} placeholder="搜索域名、IP、规则或代理链" className="w-full sm:w-[340px]" />
        <div className="ml-auto flex items-center gap-2">
          <span className="hidden items-center gap-1.5 text-[11px] text-muted md:flex">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
            实时刷新 · 1.5s
          </span>
          <Button variant="ghost" size="sm" icon={<RefreshCw className="h-3.5 w-3.5" />} loading={connections.refreshing} onClick={() => { void connections.refresh(); }}>刷新</Button>
          <Button variant="danger" size="sm" icon={<XCircle className="h-3.5 w-3.5" />} disabled={!filtered.length || busy !== null} onClick={() => setConfirmAll(true)}>全部关闭</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="!p-4"><div className="text-[11px] uppercase tracking-[0.14em] text-muted">活动连接</div><div className="mt-1.5 text-xl font-semibold text-ink tabular">{connections.data?.connections.length ?? 0}</div></Card>
        <Card className="!p-4"><div className="text-[11px] uppercase tracking-[0.14em] text-muted">下载总量</div><div className="mt-1.5 text-xl font-semibold text-ink tabular">{formatBytes(connections.data?.downloadTotal ?? 0)}</div></Card>
        <Card className="!p-4"><div className="text-[11px] uppercase tracking-[0.14em] text-muted">上传总量</div><div className="mt-1.5 text-xl font-semibold text-ink tabular">{formatBytes(connections.data?.uploadTotal ?? 0)}</div></Card>
        <Card className="!p-4"><div className="text-[11px] uppercase tracking-[0.14em] text-muted">筛选结果</div><div className="mt-1.5 text-xl font-semibold text-ink tabular">{filtered.length}</div></Card>
      </div>

      {!running ? (
        <div className="rounded-xl border border-danger/15 bg-danger/6 px-4 py-3 text-xs text-danger">mihomo 当前未运行，无法读取连接。{status?.core.lastError ? <span className="ml-1 opacity-80">{status.core.lastError}</span> : null}<button type="button" onClick={() => { void refreshStatus(); }} className="ml-2 underline">刷新状态</button></div>
      ) : null}

      <Card padded={false} className="overflow-hidden">
        {connections.loading && !connections.data ? (
          <div className="space-y-2 p-4">{[1, 2, 3, 4, 5].map((key) => <Skeleton key={key} className="h-11" />)}</div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={query ? <SearchX className="h-5 w-5" /> : <Cable className="h-5 w-5" />}
            title={query ? '没有匹配的连接' : '当前没有活动连接'}
            description={query ? `没有找到包含 “${query}” 的连接。` : '浏览网页或使用代理后，连接会实时出现在这里。'}
            action={query ? <Button variant="secondary" size="sm" onClick={() => setQuery('')}>清除搜索</Button> : undefined}
          />
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[900px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-line/8 text-[10px] uppercase tracking-[0.14em] text-muted/70">
                    <th className="px-4 py-2.5 font-medium">目标</th>
                    <th className="px-3 py-2.5 font-medium">网络 / 进程</th>
                    <th className="px-3 py-2.5 font-medium">代理链</th>
                    <th className="px-3 py-2.5 font-medium">规则</th>
                    <th className="px-3 py-2.5 text-right font-medium">流量</th>
                    <th className="px-3 py-2.5 text-right font-medium">时长</th>
                    <th className="w-10 px-2 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {visible.map((connection) => (
                    <tr key={connection.id} className="group border-b border-line/5 transition hover:bg-surface2/40">
                      <td className="max-w-[260px] px-4 py-2.5">
                        <div className="truncate text-[12px] font-medium text-ink">{connection.host || '—'}</div>
                        <div className="mono mt-0.5 truncate text-[10px] text-muted/60">{connection.destinationIP}:{connection.destinationPort}</div>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <Badge tone={networkTone(connection.network)}>{connection.network || connection.type || '—'}</Badge>
                        </div>
                        {connection.process ? <div className="mt-1 max-w-[150px] truncate text-[10px] text-muted/60" title={connection.process}>{connection.process}</div> : null}
                      </td>
                      <td className="max-w-[220px] px-3 py-2.5">
                        <div className="flex flex-wrap items-center gap-1">
                          {connection.chains.length ? connection.chains.map((chain, index) => (
                            <span key={`${chain}-${index}`} className="flex items-center gap-1">
                              {index > 0 ? <span className="text-[8px] text-muted/40">→</span> : null}
                              <span className={cn('max-w-[100px] truncate rounded border px-1 py-0.5 text-[10px]', index === connection.chains.length - 1 ? 'border-accent/15 bg-accent/6 text-accent/90' : 'border-line/8 bg-surface3 text-muted')}>{chain}</span>
                            </span>
                          )) : <span className="text-[10px] text-muted/50">—</span>}
                        </div>
                      </td>
                      <td className="max-w-[190px] px-3 py-2.5">
                        <div className="truncate text-[11px] text-ink/80">{connection.rule || '—'}</div>
                        {connection.rulePayload ? <div className="mt-0.5 truncate text-[10px] text-muted/60">{connection.rulePayload}</div> : null}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1 text-[10px] text-accent"><ArrowUpRight className="h-2.5 w-2.5" />{formatBytes(connection.upload)}</div>
                        <div className="mt-0.5 flex items-center justify-end gap-1 text-[10px] text-info"><ArrowDownLeft className="h-2.5 w-2.5" />{formatBytes(connection.download)}</div>
                      </td>
                      <td className="px-3 py-2.5 text-right text-[11px] text-muted tabular">{formatDuration(durationOf(connection.start, now))}</td>
                      <td className="px-2 py-2.5">
                        <button
                          type="button"
                          onClick={() => { void closeOne(connection); }}
                          disabled={busy !== null}
                          className="flex h-6 w-6 items-center justify-center rounded text-muted/40 opacity-0 transition hover:bg-danger/10 hover:text-danger disabled:opacity-20 group-hover:opacity-100"
                          title="关闭连接"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-line/5 md:hidden">
              {visible.map((connection) => (
                <div key={connection.id} className="p-3.5">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium text-ink">{connection.host || '—'}</div>
                      <div className="mono mt-0.5 truncate text-[10px] text-muted/60">{connection.destinationIP}:{connection.destinationPort}</div>
                    </div>
                    <Badge tone={networkTone(connection.network)}>{connection.network || '—'}</Badge>
                    <button type="button" onClick={() => { void closeOne(connection); }} disabled={busy !== null} className="p-1 text-muted/50 hover:text-danger" aria-label="关闭连接"><X className="h-3.5 w-3.5" /></button>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1">
                    {connection.chains.map((chain, index) => <span key={`${chain}-${index}`} className="rounded border border-line/8 bg-surface3 px-1 py-0.5 text-[10px] text-muted">{chain}</span>)}
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[10px] text-muted">
                    <span className="truncate">{connection.rule}{connection.rulePayload ? ` · ${connection.rulePayload}` : ''}</span>
                    <span className="shrink-0 tabular"><Timer className="mr-1 inline h-2.5 w-2.5" />{formatDuration(durationOf(connection.start, now))}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-[10px]">
                    <span className="text-accent">↑ {formatBytes(connection.upload)}</span>
                    <span className="text-info">↓ {formatBytes(connection.download)}</span>
                  </div>
                </div>
              ))}
            </div>
            {filtered.length > visible.length ? (
              <div className="border-t border-line/8 p-3 text-center">
                <Button variant="secondary" size="sm" onClick={() => setLimit((value) => value + 200)}>显示更多（剩余 {filtered.length - visible.length}）</Button>
              </div>
            ) : null}
          </>
        )}
      </Card>

      <ConfirmDialog
        open={confirmAll}
        title="关闭全部连接"
        message="这会断开当前所有活动连接，正在进行的下载或上传可能中断。确定继续吗？"
        confirmText="全部关闭"
        danger
        pending={busy === '__all__'}
        onClose={() => { if (busy !== '__all__') setConfirmAll(false); }}
        onConfirm={() => { void closeAll(); }}
      />
    </div>
  );
}
