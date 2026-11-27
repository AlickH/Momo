import { geoNaturalEarth1, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import world from 'world-atlas/countries-110m.json';
import type { GlobeMarker } from './Globe3D';

const WIDTH = 1000;
const HEIGHT = 500;
const topology = world as unknown as { objects: { countries: unknown } };
const countries = feature(topology as never, topology.objects.countries as never) as unknown as {
  features: Array<{ type: string; properties: { name?: string }; geometry: unknown }>;
};
const projection = geoNaturalEarth1().fitExtent([[12, 12], [WIDTH - 12, HEIGHT - 12]], countries as never);
const path = geoPath(projection);

export function Map2D({ markers, origin }: { markers: GlobeMarker[]; origin: GlobeMarker | null }) {
  const originPoint = origin ? projection([origin.lon, origin.lat]) : null;
  return (
    <div className="relative w-full overflow-hidden rounded-xl bg-[rgb(var(--surface2))]">
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
        {originPoint ? (
          <circle cx={originPoint[0]} cy={originPoint[1]} r="5" fill="rgb(var(--success))" opacity="0.8">
            <title>{`起点 ${origin?.city || origin?.country || ''}`}</title>
          </circle>
        ) : null}
        {markers.map((marker, index) => {
          const point = projection([marker.lon, marker.lat]);
          if (!point) return null;
          const radius = Math.max(3, Math.min(11, 3 + Math.sqrt(marker.count) * 1.3));
          return (
            <g key={`${marker.lat}-${marker.lon}-${index}`}>
              <circle cx={point[0]} cy={point[1]} r={radius + 4} fill="rgb(var(--accent) / 0.14)" />
              <circle cx={point[0]} cy={point[1]} r={radius} fill="rgb(var(--accent))" opacity="0.88">
                <title>{`${marker.city || marker.country}\n${marker.count} 连接`}</title>
              </circle>
            </g>
          );
        })}
      </svg>
      <div className="pointer-events-none absolute bottom-2 left-3 text-[10px] text-muted/60">
        {markers.length} 个目标 · GeoIP mihomo/IP2Location
      </div>
    </div>
  );
}
