import { useMemo } from 'react';
import { ArrowRight, Network, RefreshCw, Waypoints } from 'lucide-react';
import { usePolling } from '../hooks/usePolling';
import { api } from '../lib/api';
import { formatBytes } from '../lib/format';
import { Badge, Button, Card, EmptyState, Skeleton } from '../components/ui';
import type { ConnectionsData } from '../types';

interface Node {
  key: string;
  count: number;
  upload: number;
  download: number;
}

function aggregate(items: ConnectionsData['connections'], keyOf: (item: ConnectionsData['connections'][number]) => string, limit: number): Node[] {
  const map = new Map<string, Node>();
  for (const item of items) {
    const key = keyOf(item) || '未知';
    const entry = map.get(key) ?? { key, count: 0, upload: 0, download: 0 };
    entry.count += 1;
    entry.upload += item.upload;
    entry.download += item.download;
    map.set(key, entry);
  }
  return [...map.values()].sort((a, b) => b.count - a.count).slice(0, limit);
}

function NodeColumn({ title, icon, nodes, tone }: { title: string; icon: React.ReactNode; nodes: Node[]; tone: 'accent' | 'info' | 'success' }) {
  const colors = {
    accent: 'bg-accent',
    info: 'bg-info',
    success: 'bg-success',
  };
  return (
    <Card className="min-w-0">
      <div className="flex items-center gap-2 border-b border-line/8 pb-2.5">
        <span className="text-accent">{icon}</span>
        <h3 className="text-[12px] font-semibold text-ink">{title}</h3>
        <Badge tone={tone}>{nodes.reduce((total, node) => total + node.count, 0)}</Badge>
      </div>
      <div className="mt-2 space-y-1">
        {nodes.length === 0 ? <p className="py-4 text-center text-[11px] text-muted">暂无</p> : nodes.map((node) => (
          <div key={node.key} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-surface2/45">
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${colors[tone]}`} />
            <span className="min-w-0 flex-1 truncate text-[11px] text-ink/85" title={node.key}>{node.key}</span>
            <span className="shrink-0 text-[10px] text-muted/70">{node.count}</span>
            <span className="hidden shrink-0 text-[10px] text-muted/50 sm:inline">↓{formatBytes(node.download)}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

export function TopologyPage() {
  const connections = usePolling<ConnectionsData>(() => api.get('connections'), 2000);
  const items = connections.data?.connections ?? [];

  const sources = useMemo(() => aggregate(items, (item) => item.process || item.sourceIP, 6), [items]);
  const outbounds = useMemo(() => aggregate(items, (item) => item.chains[0] || item.rule || 'DIRECT', 6), [items]);
  const destinations = useMemo(() => aggregate(items, (item) => item.host || item.destinationIP, 8), [items]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-ink">网络拓扑</h2>
          <p className="mt-0.5 text-[12px] text-muted">当前活动连接按 来源 → 出站 → 目标 聚合，2 秒刷新</p>
        </div>
        <Button variant="ghost" size="sm" icon={<RefreshCw className="h-3.5 w-3.5" />} loading={connections.refreshing} onClick={() => { void connections.refresh(); }}>
          刷新
        </Button>
      </div>

      {connections.loading && !connections.data ? (
        <div className="grid gap-3 lg:grid-cols-3">{[1, 2, 3].map((key) => <Skeleton key={key} className="h-64" />)}</div>
      ) : items.length === 0 ? (
        <Card>
          <EmptyState icon={<Network className="h-5 w-5" />} title="当前没有活动连接" description="产生代理流量后，这里会显示来源、出站和目标的拓扑。" />
        </Card>
      ) : (
        <>
          <div className="grid items-start gap-3 lg:grid-cols-[1fr_auto_1fr_auto_1fr]">
            <NodeColumn title="来源" icon={<Waypoints className="h-3.5 w-3.5" />} nodes={sources} tone="accent" />
            <div className="hidden items-center justify-center pt-10 text-muted/40 lg:flex"><ArrowRight className="h-4 w-4" /></div>
            <NodeColumn title="出站 / 节点" icon={<Network className="h-3.5 w-3.5" />} nodes={outbounds} tone="info" />
            <div className="hidden items-center justify-center pt-10 text-muted/40 lg:flex"><ArrowRight className="h-4 w-4" /></div>
            <NodeColumn title="目标" icon={<ArrowRight className="h-3.5 w-3.5" />} nodes={destinations} tone="success" />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Card className="!p-4"><div className="text-[10px] uppercase tracking-[0.12em] text-muted">活动连接</div><div className="mt-1 text-xl font-semibold text-ink tabular">{items.length}</div></Card>
            <Card className="!p-4"><div className="text-[10px] uppercase tracking-[0.12em] text-muted">来源</div><div className="mt-1 text-xl font-semibold text-ink tabular">{sources.length}</div></Card>
            <Card className="!p-4"><div className="text-[10px] uppercase tracking-[0.12em] text-muted">出站</div><div className="mt-1 text-xl font-semibold text-ink tabular">{outbounds.length}</div></Card>
            <Card className="!p-4"><div className="text-[10px] uppercase tracking-[0.12em] text-muted">目标</div><div className="mt-1 text-xl font-semibold text-ink tabular">{destinations.length}</div></Card>
          </div>
        </>
      )}
    </div>
  );
}
