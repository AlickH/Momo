import { useEffect, useMemo, useState } from 'react';
import { Globe2, MapPin, RefreshCw } from 'lucide-react';
import { geoNaturalEarth1, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import world from 'world-atlas/countries-110m.json';
import { usePolling } from '../hooks/usePolling';
import { api } from '../lib/api';
import { formatBytes } from '../lib/format';
import { Badge, Button, Card, EmptyState, Skeleton } from '../components/ui';
import type { ConnectionsData, GeoLocation } from '../types';

const WIDTH = 1000;
const HEIGHT = 500;

const topology = world as unknown as { objects: { countries: unknown } };
const countries = feature(topology as never, topology.objects.countries as never) as unknown as {
  features: Array<{ type: string; properties: { name?: string }; geometry: unknown }>;
};
const projection = geoNaturalEarth1().fitExtent([[12, 12], [WIDTH - 12, HEIGHT - 12]], countries as never);
const path = geoPath(projection);

interface Marker extends GeoLocation {
  count: number;
  download: number;
  upload: number;
  hosts: string[];
}

export function EarthPage() {
  const connections = usePolling<ConnectionsData>(() => api.get('connections'), 3000);
  const [locations, setLocations] = useState<Record<string, GeoLocation>>({});
  const [resolving, setResolving] = useState(false);

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
      };
      marker.count += 1;
      marker.download += item.download;
      marker.upload += item.upload;
      if (item.host && !marker.hosts.includes(item.host)) marker.hosts.push(item.host);
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

  const markers = grouped
    .map((marker) => ({ ...marker, ...(locations[marker.ip] ?? {}) }))
    .filter((marker) => Number.isFinite(marker.lat) && Number.isFinite(marker.lon) && (marker.lat !== 0 || marker.lon !== 0));

  const total = connections.data?.connections.length ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-ink">地图</h2>
          <p className="mt-0.5 text-[12px] text-muted">当前连接目标的地理分布，IP 定位缓存 6 小时</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone="info">{total} 活动连接</Badge>
          <Button variant="ghost" size="sm" icon={<RefreshCw className="h-3.5 w-3.5" />} loading={connections.refreshing} onClick={() => { void connections.refresh(); }}>刷新</Button>
        </div>
      </div>

      {connections.loading && !connections.data ? (
        <Skeleton className="h-[420px]" />
      ) : markers.length === 0 ? (
        <Card>
          <EmptyState icon={<Globe2 className="h-5 w-5" />} title="暂无地理位置数据" description="产生到公网 IP 的连接后，这里会显示目标在地图上的位置。" />
        </Card>
      ) : (
        <>
          <Card padded={false} className="overflow-hidden">
            <div className="relative bg-[rgb(var(--surface2))]">
              <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="block h-auto w-full">
                <g>
                  {countries.features.map((country, index) => (
                    <path
                      key={index}
                      d={path(country as never) ?? undefined}
                      fill="rgb(var(--surface-3))"
                      stroke="rgb(var(--line) / 0.22)"
                      strokeWidth="0.5"
                    />
                  ))}
                </g>
                <g>
                  {markers.map((marker) => {
                    const point = projection([marker.lon, marker.lat]);
                    if (!point) return null;
                    const radius = Math.max(3, Math.min(11, 3 + Math.sqrt(marker.count) * 1.3));
                    return (
                      <g key={marker.ip}>
                        <circle cx={point[0]} cy={point[1]} r={radius + 5} fill="rgb(var(--accent) / 0.14)" />
                        <circle cx={point[0]} cy={point[1]} r={radius} fill="rgb(var(--accent))" opacity="0.88">
                          <title>{`${marker.city || marker.country || marker.ip}\n${marker.count} 连接 · ↓${formatBytes(marker.download)}`}</title>
                        </circle>
                      </g>
                    );
                  })}
                </g>
              </svg>
              <div className="pointer-events-none absolute bottom-2 left-3 text-[10px] text-muted/60">
                {resolving ? '正在定位…' : `${markers.length} 个目标位置`} · GeoIP: mihomo geoip.metadb
              </div>
            </div>
          </Card>

          <Card>
            <div className="flex items-center gap-2 border-b border-line/8 pb-2.5">
              <MapPin className="h-4 w-4 text-accent" />
              <h3 className="text-sm font-semibold text-ink">目标分布</h3>
            </div>
            <div className="mt-2 divide-y divide-line/5">
              {markers.slice(0, 12).map((marker) => (
                <div key={marker.ip} className="flex items-center gap-3 py-2 text-[11px]">
                  <span className="w-14 shrink-0 mono text-muted/60">{marker.countryCode || '—'}</span>
                  <span className="min-w-0 flex-1 truncate text-ink">{marker.hosts[0] || marker.ip}</span>
                  <span className="shrink-0 text-muted/60">{marker.city || marker.country}</span>
                  <span className="shrink-0 text-muted/60">{marker.count} 连接</span>
                  <span className="shrink-0 text-muted/60">↓{formatBytes(marker.download)}</span>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
