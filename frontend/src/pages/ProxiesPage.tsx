import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ChevronDown,
  ChevronUp,
  Layers,
  RefreshCw,
  SearchX,
  ServerCog,
  Zap,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { usePolling } from '../hooks/usePolling';
import { api } from '../lib/api';
import { useToast } from '../context/ToastContext';
import { cn } from '../lib/cn';
import { formatDate, timeAgo } from '../lib/format';
import { Badge, Button, Card, EmptyState, SearchInput, Skeleton } from '../components/ui';
import { DelayBadge } from '../components/DelayBadge';
import type { ProxiesData, Provider, ProxyGroup } from '../types';

const DEFAULT_TEST_URL = 'https://www.gstatic.com/generate_204';
const CHUNK_SIZE = 60;
const BUILTIN_PROXIES = new Set(['DIRECT', 'REJECT', 'REJECT-DROP', 'PASS', 'PASS-RULE', 'COMPATIBLE', 'GLOBAL']);

const groupTone = (type: string): 'accent' | 'info' | 'warning' | 'neutral' => {
  if (type === 'Selector') return 'accent';
  if (type === 'URLTest') return 'info';
  if (type === 'Fallback') return 'warning';
  return 'neutral';
};

function GroupCard({
  group,
  data,
  query,
  delays,
  testing,
  onTestGroup,
  onTestNode,
  onSelect,
}: {
  group: ProxyGroup;
  data: ProxiesData;
  query: string;
  delays: Record<string, number>;
  testing: string | null;
  onTestGroup: (group: ProxyGroup) => void;
  onTestNode: (name: string) => void;
  onSelect: (group: ProxyGroup, name: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const normalized = query.trim().toLowerCase();
  const groupMatches = !normalized || group.name.toLowerCase().includes(normalized) || group.now.toLowerCase().includes(normalized);
  const nodes = group.all
    .map((name) => data.nodes[name])
    .filter((node): node is NonNullable<typeof node> => Boolean(node))
    .filter((node) => groupMatches || node.name.toLowerCase().includes(normalized));
  const limited = !expanded && !normalized && nodes.length > 12 ? nodes.slice(0, 12) : nodes;
  const selectable = group.type === 'Selector';
  const currentDelay = delays[group.now] ?? data.nodes[group.now]?.delay ?? null;
  const isTesting = testing === group.name;

  if (!groupMatches && nodes.length === 0) return null;

  return (
    <Card className="overflow-hidden !p-0">
      <div className="border-b border-line/8 px-4 pb-3 pt-4">
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-line/10 bg-surface2 text-[12px] font-semibold text-muted">
            {group.name.slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h3 className="truncate text-[14px] font-semibold text-ink">{group.name}</h3>
              <Badge tone={groupTone(group.type)}>{group.type}</Badge>
              {group.hidden ? <Badge>隐藏</Badge> : null}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted">
              <span className="truncate">当前 · {group.now || '未选择'}</span>
              <DelayBadge delay={currentDelay} pending={isTesting} compact />
              <span className="text-muted/40">·</span>
              <span>{group.all.length} 节点</span>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            title="测试该组全部节点"
            loading={isTesting}
            onClick={() => onTestGroup(group)}
          >
            {!isTesting ? <Zap className="h-3.5 w-3.5" /> : null}
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-1.5 p-2.5 sm:grid-cols-2">
        {limited.map((node) => {
          const selected = group.now === node.name;
          const delay = delays[node.name] ?? node.delay;
          return (
            <div
              key={node.name}
              className={cn(
                'group relative flex min-w-0 items-center gap-2 rounded-lg border px-2.5 py-2 transition-all',
                selected
                  ? 'border-accent/40 bg-accent/8'
                  : 'border-line/6 bg-surface2/35 hover:border-line/15 hover:bg-surface2',
                selectable ? 'cursor-pointer' : 'cursor-default',
              )}
              onClick={() => {
                if (selectable && !selected) onSelect(group, node.name);
              }}
              role={selectable ? 'button' : undefined}
              tabIndex={selectable ? 0 : undefined}
              onKeyDown={(event) => {
                if (selectable && (event.key === 'Enter' || event.key === ' ')) {
                  event.preventDefault();
                  if (!selected) onSelect(group, node.name);
                }
              }}
            >
              <span className={cn('flex h-4 w-4 shrink-0 items-center justify-center rounded-full border', selected ? 'border-accent bg-accent/20' : 'border-line/20')}>
                {selected ? <span className="h-1.5 w-1.5 rounded-full bg-accent" /> : null}
              </span>
              <div className="min-w-0 flex-1">
                <div className={cn('truncate text-[12px]', selected ? 'font-medium text-ink' : 'text-ink/90')}>{node.name}</div>
                <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-muted/80">
                  <span className="truncate">{node.type}</span>
                  {node.udp ? <span className="rounded bg-surface3 px-1 text-[8px] text-muted/70">UDP</span> : null}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <DelayBadge delay={delay} compact />
                <button
                  type="button"
                  title={`测试 ${node.name}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onTestNode(node.name);
                  }}
                  className="flex h-5 w-5 items-center justify-center rounded text-muted/40 opacity-0 transition hover:bg-surface3 hover:text-accent group-hover:opacity-100"
                >
                  <Zap className="h-2.5 w-2.5" />
                </button>
              </div>
            </div>
          );
        })}
        {nodes.length === 0 ? (
          <div className="col-span-full px-3 py-5 text-center text-[12px] text-muted">没有匹配的节点</div>
        ) : null}
      </div>
      {nodes.length > 12 && !normalized ? (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="flex w-full items-center justify-center gap-1 border-t border-line/8 py-2 text-[11px] text-muted transition hover:bg-surface2/50 hover:text-ink"
        >
          {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          {expanded ? '收起' : `展开全部 ${nodes.length} 个节点`}
        </button>
      ) : null}
    </Card>
  );
}

export function ProxiesPage() {
  const { status, refreshStatus } = useApp();
  const { toast } = useToast();
  const proxies = usePolling<ProxiesData>(() => api.get('proxies'), 5000);
  const providers = usePolling<{ providers: Provider[] }>(() => api.get('providers'), 15000);
  const [query, setQuery] = useState('');
  const [delays, setDelays] = useState<Record<string, number>>({});
  const [testing, setTesting] = useState<string | null>(null);
  const [selecting, setSelecting] = useState<string | null>(null);
  const [providerBusy, setProviderBusy] = useState<string | null>(null);
  const [restarting, setRestarting] = useState(false);

  const groups = proxies.data?.groups ?? [];
  const nodes = proxies.data?.nodes ?? {};
  const flat = proxies.data?.flat ?? [];
  const groupNames = new Set(groups.map((group) => group.name));
  const realNodeCount = Object.keys(nodes).filter((name) => !BUILTIN_PROXIES.has(name) && !groupNames.has(name)).length;
  const running = status?.core.state === 'running';

  const filteredGroups = useMemo(() => {
    if (!query.trim()) return groups;
    const normalized = query.trim().toLowerCase();
    return groups.filter((group) => (
      group.name.toLowerCase().includes(normalized)
      || group.now.toLowerCase().includes(normalized)
      || group.all.some((name) => name.toLowerCase().includes(normalized))
    ));
  }, [groups, query]);

  const visibleNodeNames = useMemo(() => {
    const names = new Set<string>();
    const normalized = query.trim().toLowerCase();
    const groupNames = new Set(groups.map((group) => group.name));
    for (const group of filteredGroups) {
      for (const name of group.all) {
        if (BUILTIN_PROXIES.has(name) || groupNames.has(name)) continue;
        if (!normalized || group.name.toLowerCase().includes(normalized) || name.toLowerCase().includes(normalized)) names.add(name);
      }
    }
    if (groups.length === 0) for (const node of flat) names.add(node.name);
    return [...names];
  }, [filteredGroups, flat, groups, query]);

  const testNames = async (names: string[], key: string) => {
    if (!running || names.length === 0) return;
    const unique = [...new Set(names)];
    setTesting(key);
    const merged: Record<string, number> = {};
    try {
      for (let index = 0; index < unique.length; index += CHUNK_SIZE) {
        const chunk = unique.slice(index, index + CHUNK_SIZE);
        const result = await api.post<{ results: Record<string, number> }>('proxies/delay', {
          names: chunk,
          url: DEFAULT_TEST_URL,
          timeout: 5000,
        }, { timeoutMs: 60000 });
        Object.assign(merged, result.results);
        setDelays((prev) => ({ ...prev, ...merged }));
      }
      const ok = Object.values(merged).filter((value) => value >= 0).length;
      toast(`测速完成：${ok}/${unique.length} 个节点可用`, ok > 0 ? 'success' : 'info');
    } catch (error) {
      toast(error instanceof Error ? error.message : '测速失败', 'error');
    } finally {
      setTesting(null);
    }
  };

  const selectNode = async (group: ProxyGroup, name: string) => {
    if (!running) return;
    setSelecting(`${group.name}/${name}`);
    const previous = proxies.data;
    proxies.mutate((current) => current ? {
      ...current,
      groups: current.groups.map((item) => item.name === group.name ? { ...item, now: name } : item),
    } : current);
    try {
      await api.post('proxies/select', { group: group.name, name });
      await proxies.refresh();
    } catch (error) {
      if (previous) proxies.mutate(previous);
      toast(error instanceof Error ? error.message : '切换节点失败', 'error');
    } finally {
      setSelecting(null);
    }
  };

  const updateProvider = async (provider: Provider) => {
    setProviderBusy(`update:${provider.name}`);
    try {
      await api.post('providers/update', { name: provider.name }, { timeoutMs: 60000 });
      await Promise.all([providers.refresh(), proxies.refresh()]);
      toast(`已更新 ${provider.name}`, 'success');
    } catch (error) {
      toast(error instanceof Error ? error.message : '更新失败', 'error');
    } finally {
      setProviderBusy(null);
    }
  };

  const healthcheckProvider = async (provider: Provider) => {
    setProviderBusy(`health:${provider.name}`);
    try {
      await api.post('providers/healthcheck', { name: provider.name }, { timeoutMs: 90000 });
      await Promise.all([providers.refresh(), proxies.refresh()]);
      toast(`已完成 ${provider.name} 健康检查`, 'success');
    } catch (error) {
      toast(error instanceof Error ? error.message : '健康检查失败', 'error');
    } finally {
      setProviderBusy(null);
    }
  };

  const restart = async () => {
    setRestarting(true);
    try {
      await api.post('core/restart', undefined, { timeoutMs: 60000 });
      await refreshStatus();
      toast('内核已重启', 'success');
    } catch (error) {
      toast(error instanceof Error ? error.message : '重启失败', 'error');
    } finally {
      setRestarting(false);
    }
  };

  if (!running && !proxies.data) {
    return (
      <Card className="p-8">
        <EmptyState
          icon={<ServerCog className="h-5 w-5" />}
          title="mihomo 还没有运行"
          description="启动内核后才能读取策略组和节点。"
          action={<Button variant="primary" loading={restarting} onClick={restart}>启动内核</Button>}
        />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <SearchInput value={query} onChange={setQuery} placeholder="搜索策略组或节点" className="w-full sm:w-[300px]" />
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <span className="hidden text-[11px] text-muted md:inline">
            {groups.length} 策略组 · {realNodeCount} 节点
          </span>
          <Button
            variant="secondary"
            size="sm"
            icon={<Zap className="h-3.5 w-3.5" />}
            loading={testing === '__all__'}
            disabled={!running || visibleNodeNames.length === 0}
            onClick={() => { void testNames(visibleNodeNames, '__all__'); }}
          >全部测速</Button>
          <Button
            variant="ghost"
            size="sm"
            icon={<RefreshCw className="h-3.5 w-3.5" />}
            loading={proxies.refreshing}
            onClick={() => { void proxies.refresh(); void providers.refresh(); }}
          >刷新</Button>
        </div>
      </div>

      {!running ? (
        <div className="rounded-xl border border-danger/15 bg-danger/6 px-4 py-3 text-xs text-danger">
          mihomo 当前未运行，代理选择不可用。{status?.core.lastError ? <span className="ml-1 opacity-80">{status.core.lastError}</span> : null}
        </div>
      ) : null}

      {proxies.loading && !proxies.data ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {[1, 2, 3, 4].map((key) => <Skeleton key={key} className="h-[280px]" />)}
        </div>
      ) : groups.length > 0 ? (
        <>
          <div className="grid items-start gap-4 xl:grid-cols-2">
            {filteredGroups.map((group) => (
              <GroupCard
                key={group.name}
                group={group}
                data={proxies.data!}
                query={query}
                delays={delays}
                testing={testing}
                onTestGroup={(target) => { void testNames(target.all, target.name); }}
                onTestNode={(name) => { void testNames([name], name); }}
                onSelect={(target, name) => { void selectNode(target, name); }}
              />
            ))}
          </div>
          {filteredGroups.length === 0 ? (
            <Card><EmptyState icon={<SearchX className="h-5 w-5" />} title="没有匹配的策略组" description={`没有找到包含 “${query}” 的策略组或节点。`} action={<Button size="sm" onClick={() => setQuery('')}>清除搜索</Button>} /></Card>
          ) : null}
        </>
      ) : flat.length > 0 ? (
        <Card>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {flat.map((node) => (
              <div key={node.name} className="flex items-center gap-2 rounded-lg border border-line/6 bg-surface2/35 px-3 py-2.5">
                <Layers className="h-3.5 w-3.5 text-muted" />
                <span className="min-w-0 flex-1 truncate text-[12px] text-ink/90">{node.name}</span>
                <DelayBadge delay={delays[node.name] ?? node.delay} compact />
              </div>
            ))}
          </div>
        </Card>
      ) : (
        <Card>
          <EmptyState
            icon={<Layers className="h-5 w-5" />}
            title="还没有可用的代理"
            description="当前配置中没有策略组或节点。前往订阅页面添加一个配置。"
            action={<Link to="/profiles"><Button variant="primary" size="sm">管理订阅</Button></Link>}
          />
        </Card>
      )}

      {providers.data && providers.data.providers.filter((provider) => provider.vehicleType !== 'Compatible').length > 0 ? (
        <div>
          <div className="mb-2 mt-6 flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">代理提供者</h3>
            <span className="text-[11px] text-muted/80">{providers.data.providers.length} 个</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {providers.data.providers.map((provider) => (
              <div key={provider.name} className="flex items-center gap-3 rounded-xl border border-line/8 bg-surface/55 px-3.5 py-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-line/10 bg-surface2 text-muted"><ServerCog className="h-4 w-4" /></span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12px] font-medium text-ink">{provider.name}</div>
                  <div className="mt-0.5 text-[10px] text-muted">{provider.vehicleType || provider.type} · {provider.count} 节点 · {provider.updatedAt ? timeAgo(provider.updatedAt) : '未知更新'}</div>
                </div>
                <Button
                  variant="ghost" size="sm" className="h-7 px-2 text-[11px]"
                  loading={providerBusy === `update:${provider.name}`}
                  onClick={() => { void updateProvider(provider); }}
                >更新</Button>
                <Button
                  variant="ghost" size="sm" className="h-7 px-2 text-[11px]"
                  loading={providerBusy === `health:${provider.name}`}
                  onClick={() => { void healthcheckProvider(provider); }}
                >测速</Button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-[11px] text-muted/70">
        <span>{selecting ? `正在切换到 ${selecting}…` : '节点选择会立即生效，并写入 mihomo 的缓存。'}</span>
        <span>更新于 {formatDate(proxies.lastUpdated ?? undefined)}</span>
      </div>
    </div>
  );
}
