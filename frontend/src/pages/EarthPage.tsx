import { useEffect, useMemo, useRef, useState } from 'react';
import { Globe2, MapPin, RefreshCw } from 'lucide-react';
import { usePolling } from '../hooks/usePolling';
import { api } from '../lib/api';
import { Globe3D, type GlobeMarker } from '../components/Globe3D';
import { Map2D } from '../components/Map2D';
import { Badge, Button, Card, EmptyState, Skeleton } from '../components/ui';
import type { ConnectionsData, GeoLocation, NodeGeo } from '../types';

interface Marker extends GeoLocation {
  count: number;
  download: number;
  upload: number;
  hosts: string[];
  nodeCounts: Record<string, number>;
  node?: string;
}

export function EarthPage() {
  const connections = usePolling<ConnectionsData>(() => api.get('connections'), 3000);
  const [locations, setLocations] = useState<Record<string, GeoLocation>>({});
  const [origin, setOrigin] = useState<GlobeMarker | null>(null);
  const [resolving, setResolving] = useState(false);
  const [viewMode, setViewMode] = useState<'3d' | '2d'>('3d');
  const [dataMode, setDataMode] = useState<'targets' | 'nodes'>('targets');
  const [nodeData, setNodeData] = useState<{ nodes: NodeGeo[]; unresolved: number } | null>(null);
  const nodeRequestRef = useRef(false);

  const grouped = useMemo(() => {
    const map = new Map<string, Marker>();
    for (const item of connections.data?.connections ?? []) {
      const ip = item.destinationIP;
      if (!ip) continue;
      const marker = map.get(ip) ?? {
        ip,
        country: '',
        countryCode: '',
        city: '',
        lat: 0,
        lon: 0,
        count: 0,
        download: 0,
        upload: 0,
        hosts: [],
        nodeCounts: {},
      };
      marker.count += 1;
      marker.download += item.download;
      marker.upload += item.upload;
      if (item.host && !marker.hosts.includes(item.host)) marker.hosts.push(item.host);
      const chain = item.chains?.[0] || 'DIRECT';
      marker.nodeCounts[chain] = (marker.nodeCounts[chain] ?? 0) + 1;
      marker.node = Object.entries(marker.nodeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'DIRECT';
      map.set(ip, marker);
    }
    return [...map.values()].sort((a, b) => b.count - a.count).slice(0, 60);
  }, [connections.data]);

  useEffect(() => {
    const missing = grouped.filter((marker) => !locations[marker.ip]).map((marker) => marker.ip);
    if (!missing.length) return;
    let cancelled = false;
    setResolving(true);
    api.post<{ locations: Record<string, GeoLocation> }>('geo/resolve', { ips: missing }, { timeoutMs: 30000 })
      .then((result) => {
        if (!cancelled) setLocations((previous) => ({ ...previous, ...result.locations }));
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setResolving(false); });
    return () => { cancelled = true; };
  }, [grouped, locations]);

  useEffect(() => {
    let cancelled = false;
    const loadOrigin = async () => {
      try {
        const result = await api.post<{ proxyIp: string }>('ip-check', undefined, { timeoutMs: 30000 });
        if (!result.proxyIp) return;
        const geo = await api.post<{ locations: Record<string, GeoLocation> }>('geo/resolve', { ips: [result.proxyIp] }, { timeoutMs: 15000 });
        const location = geo.locations[result.proxyIp];
        if (!cancelled && location) {
          setOrigin({ lat: location.lat, lon: location.lon, city: location.city, country: location.country, count: 0 });
        }
      } catch {
        // Origin is optional; destinations still render without arcs.
      }
    };
    void loadOrigin();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (dataMode !== 'nodes' || nodeRequestRef.current) return;
    nodeRequestRef.current = true;
    api.get<{ nodes: NodeGeo[]; unresolved: number }>('nodes/geo', { timeoutMs: 60000 })
      .then((result) => setNodeData(result))
      .catch(() => { nodeRequestRef.current = false; })
      .finally(() => { /* request settled */ });
  }, [dataMode]);

  const nodeMarkers = useMemo<GlobeMarker[]>(() => {
    const map = new Map<string, GlobeMarker>();
    for (const node of nodeData?.nodes ?? []) {
      const key = `${node.lat.toFixed(3)},${node.lon.toFixed(3)}`;
      const marker = map.get(key) ?? { lat: node.lat, lon: node.lon, city: node.city, country: node.country, countryCode: node.countryCode, count: 0, node: '', nodes: [] };
      marker.count += 1;
      marker.node = `${marker.count} 节点`;
      marker.nodes?.push(node.name);
      map.set(key, marker);
    }
    return [...map.values()].sort((a, b) => b.count - a.count);
  }, [nodeData]);

  const markers: GlobeMarker[] = grouped
    .map((marker) => ({ ...marker, ...(locations[marker.ip] ?? {}) }))
    .filter((marker) => Number.isFinite(marker.lat) && Number.isFinite(marker.lon) && (marker.lat !== 0 || marker.lon !== 0))
    .map((marker) => ({ lat: marker.lat, lon: marker.lon, city: marker.city, country: marker.country, countryCode: marker.countryCode, count: marker.count, node: marker.node }));

  const total = connections.data?.connections.length ?? 0;
  const displayMarkers = dataMode === 'nodes' ? nodeMarkers : markers;
  const displayOrigin = dataMode === 'nodes' ? null : origin;
  const nodeTotal = nodeData?.nodes.length ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12px] text-muted">{dataMode === 'nodes' ? `节点服务器分布 · ${nodeTotal} 个节点${nodeData?.unresolved ? ` / ${nodeData.unresolved} 个未解析` : ''}` : `${viewMode === '3d' ? '当前连接目标的 3D' : '当前连接目标的 2D'}地理分布，IP 城市定位来自 IP2Location DB5`}</p>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-0.5 rounded-lg border border-line/10 bg-surface2 p-0.5">
            <button type="button" onClick={() => setDataMode('targets')} className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition ${dataMode === 'targets' ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink'}`}>目标分布</button>
            <button type="button" onClick={() => setDataMode('nodes')} className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition ${dataMode === 'nodes' ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink'}`}>节点分布</button>
          </div>
          <div className="flex items-center gap-0.5 rounded-lg border border-line/10 bg-surface2 p-0.5">
            <button type="button" onClick={() => setViewMode('3d')} className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition ${viewMode === '3d' ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink'}`}>3D 地球</button>
            <button type="button" onClick={() => setViewMode('2d')} className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition ${viewMode === '2d' ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink'}`}>2D 地图</button>
          </div>
          <Badge tone="info">{dataMode === 'nodes' ? `${nodeTotal} 节点` : `${total} 活动连接`}</Badge>
          <Button variant="ghost" size="sm" icon={<RefreshCw className="h-3.5 w-3.5" />} loading={connections.refreshing} onClick={() => { void connections.refresh(); }}>刷新</Button>
        </div>
      </div>

      {connections.loading && !connections.data ? (
        <Skeleton className="h-[520px]" />
      ) : (
        <>
          <Card padded={false} className="overflow-hidden">
            {viewMode === '3d' ? <Globe3D markers={displayMarkers} origin={displayOrigin} /> : <Map2D markers={displayMarkers} origin={displayOrigin} countLabel={dataMode === 'nodes' ? '节点' : '连接'} />}
          </Card>

          {displayMarkers.length === 0 ? (
            <Card>
              <EmptyState icon={<Globe2 className="h-5 w-5" />} title="暂无地理位置数据" description="产生到公网 IP 的连接后，这里会显示目标在地球上的位置。" />
            </Card>
          ) : (
            <Card>
              <div className="flex items-center gap-2 border-b border-line/8 pb-2.5">
                <MapPin className="h-4 w-4 text-accent" />
                <h3 className="text-sm font-semibold text-ink">目标分布</h3>
                <span className="ml-auto text-[10px] text-muted/60">{dataMode === 'nodes' ? `${nodeData?.nodes.length ?? 0} 个节点` : origin ? `起点 ${origin.city || origin.country}` : resolving ? '正在定位起点…' : '起点未知'}</span>
              </div>
              {dataMode === 'nodes' ? (
                <div className="mt-2 max-h-[360px] overflow-y-auto">
                  <table className="w-full border-collapse text-left">
                    <thead className="sticky top-0 bg-surface">
                      <tr className="border-b border-line/8 text-[10px] uppercase tracking-[0.12em] text-muted/60">
                        <th className="px-1 py-2 font-medium">节点</th>
                        <th className="px-1 py-2 font-medium">Provider</th>
                        <th className="px-1 py-2 font-medium">城市</th>
                        <th className="px-1 py-2 font-medium">国家</th>
                        <th className="px-1 py-2 text-right font-medium">服务端</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(nodeData?.nodes ?? []).map((node) => (
                        <tr key={`${node.provider}-${node.name}-${node.server}`} className="border-b border-line/5 text-[11px]">
                          <td className="max-w-[280px] truncate px-1 py-1.5 text-ink" title={node.name}>{node.name}</td>
                          <td className="max-w-[90px] truncate px-1 py-1.5 text-muted/70" title={node.provider}>{node.provider}</td>
                          <td className="px-1 py-1.5 text-muted/70">{node.city || '—'}</td>
                          <td className="px-1 py-1.5 text-muted/70">{node.countryCode || '—'}</td>
                          <td className="max-w-[150px] truncate px-1 py-1.5 text-right mono text-muted/60" title={node.server}>{node.ip || node.server}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="mt-2 divide-y divide-line/5">
                  {displayMarkers.slice(0, 12).map((marker, index) => (
                    <div key={`${marker.lat}-${marker.lon}-${index}`} className="flex items-center gap-3 py-2 text-[11px]">
                      <span className="w-10 shrink-0 mono text-muted/60" title={marker.country}>{marker.countryCode || '—'}</span>
                      <span className="min-w-0 flex-1 truncate text-ink" title={marker.city || marker.country}>{marker.city || marker.country}</span>
                      <span className="w-36 shrink-0 truncate text-right text-muted/60" title={marker.node}>{marker.node}</span>
                      <span className="w-14 shrink-0 text-right text-muted/60">{marker.count} 连接</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}
        </>
      )}
    </div>
  );
}
