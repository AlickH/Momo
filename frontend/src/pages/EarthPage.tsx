import { useEffect, useMemo, useState } from 'react';
import { Globe2, MapPin, RefreshCw } from 'lucide-react';
import { usePolling } from '../hooks/usePolling';
import { api } from '../lib/api';
import { Globe3D, type GlobeMarker } from '../components/Globe3D';
import { Map2D } from '../components/Map2D';
import { Badge, Button, Card, EmptyState, Skeleton } from '../components/ui';
import type { ConnectionsData, GeoLocation } from '../types';

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

  const markers: GlobeMarker[] = grouped
    .map((marker) => ({ ...marker, ...(locations[marker.ip] ?? {}) }))
    .filter((marker) => Number.isFinite(marker.lat) && Number.isFinite(marker.lon) && (marker.lat !== 0 || marker.lon !== 0))
    .map((marker) => ({ lat: marker.lat, lon: marker.lon, city: marker.city, country: marker.country, count: marker.count, node: marker.node }));

  const total = connections.data?.connections.length ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12px] text-muted">{viewMode === '3d' ? '当前连接目标的 3D 地理分布' : '当前连接目标的 2D 地理分布'}，IP 城市定位来自 IP2Location DB5</p>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-0.5 rounded-lg border border-line/10 bg-surface2 p-0.5">
            <button type="button" onClick={() => setViewMode('3d')} className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition ${viewMode === '3d' ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink'}`}>3D 地球</button>
            <button type="button" onClick={() => setViewMode('2d')} className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition ${viewMode === '2d' ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink'}`}>2D 地图</button>
          </div>
          <Badge tone="info">{total} 活动连接</Badge>
          <Button variant="ghost" size="sm" icon={<RefreshCw className="h-3.5 w-3.5" />} loading={connections.refreshing} onClick={() => { void connections.refresh(); }}>刷新</Button>
        </div>
      </div>

      {connections.loading && !connections.data ? (
        <Skeleton className="h-[520px]" />
      ) : (
        <>
          <Card padded={false} className="overflow-hidden">
            {viewMode === '3d' ? <Globe3D markers={markers} origin={origin} /> : <Map2D markers={markers} origin={origin} />}
          </Card>

          {markers.length === 0 ? (
            <Card>
              <EmptyState icon={<Globe2 className="h-5 w-5" />} title="暂无地理位置数据" description="产生到公网 IP 的连接后，这里会显示目标在地球上的位置。" />
            </Card>
          ) : (
            <Card>
              <div className="flex items-center gap-2 border-b border-line/8 pb-2.5">
                <MapPin className="h-4 w-4 text-accent" />
                <h3 className="text-sm font-semibold text-ink">目标分布</h3>
                <span className="ml-auto text-[10px] text-muted/60">{origin ? `起点 ${origin.city || origin.country}` : resolving ? '正在定位起点…' : '起点未知'}</span>
              </div>
              <div className="mt-2 divide-y divide-line/5">
                {markers.slice(0, 12).map((marker, index) => (
                  <div key={`${marker.lat}-${marker.lon}-${index}`} className="flex items-center gap-3 py-2 text-[11px]">
                    <span className="w-14 shrink-0 mono text-muted/60">{marker.country}</span>
                    <span className="min-w-0 flex-1 truncate text-ink">{marker.city || marker.country}</span>
                    <span className="max-w-[140px] shrink-0 truncate text-muted/60">{marker.node}</span>
                    <span className="shrink-0 text-muted/60">{marker.count} 连接</span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
