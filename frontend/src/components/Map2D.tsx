import { useRef, useState } from 'react';
import { geoNaturalEarth1, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import world from 'world-atlas/countries-110m.json';
import { Minus, Plus, RotateCcw } from 'lucide-react';
import type { GlobeMarker } from './Globe3D';

const WIDTH = 1000;
const HEIGHT = 500;
const topology = world as unknown as { objects: { countries: unknown } };
const countries = feature(topology as never, topology.objects.countries as never) as unknown as {
  features: Array<{ type: string; properties: { name?: string }; geometry: unknown }>;
};
const projection = geoNaturalEarth1().fitExtent([[12, 12], [WIDTH - 12, HEIGHT - 12]], countries as never);
const path = geoPath(projection);

interface ViewBox { x: number; y: number; width: number; height: number }

const DEFAULT_VIEW: ViewBox = { x: 0, y: 0, width: WIDTH, height: HEIGHT };
const MAX_ZOOM = 8;

function clampView(view: ViewBox): ViewBox {
  const width = Math.min(WIDTH, Math.max(WIDTH / MAX_ZOOM, view.width));
  const height = width * (HEIGHT / WIDTH);
  return {
    width,
    height,
    x: Math.min(WIDTH - width, Math.max(0, view.x)),
    y: Math.min(HEIGHT - height, Math.max(0, view.y)),
  };
}

export function Map2D({ markers, origin, countLabel = '连接' }: { markers: GlobeMarker[]; origin: GlobeMarker | null; countLabel?: string }) {
  const [view, setView] = useState<ViewBox>(DEFAULT_VIEW);
  const [hover, setHover] = useState<{ x: number; y: number; marker: GlobeMarker } | null>(null);
  const dragRef = useRef<{ x: number; y: number; view: ViewBox } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const originPoint = origin ? projection([origin.lon, origin.lat]) : null;

  const zoomAt = (factor: number, px = 0.5, py = 0.5) => {
    setView((current) => {
      const nextWidth = Math.min(WIDTH, Math.max(WIDTH / MAX_ZOOM, current.width * factor));
      const nextHeight = nextWidth * (HEIGHT / WIDTH);
      const anchorX = current.x + current.width * px;
      const anchorY = current.y + current.height * py;
      return clampView({
        x: anchorX - nextWidth * px,
        y: anchorY - nextHeight * py,
        width: nextWidth,
        height: nextHeight,
      });
    });
  };

  const onWheel = (event: React.WheelEvent<SVGSVGElement>) => {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const px = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const py = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
    zoomAt(event.deltaY > 0 ? 1.18 : 1 / 1.18, px, py);
  };

  const onPointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { x: event.clientX, y: event.clientY, view };
  };

  const onPointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const dx = ((event.clientX - drag.x) / rect.width) * drag.view.width;
    const dy = ((event.clientY - drag.y) / rect.height) * drag.view.height;
    setView(clampView({ ...drag.view, x: drag.view.x - dx, y: drag.view.y - dy }));
  };

  const onPointerUp = () => { dragRef.current = null; };

  return (
    <div className="relative w-full overflow-hidden rounded-xl bg-[rgb(var(--surface2))]">
      <svg
        ref={svgRef}
        viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`}
        className="block h-auto w-full cursor-default touch-none select-none active:cursor-grabbing"
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <g>
          {countries.features.map((country, index) => (
            <path
              key={index}
              d={path(country as never) ?? undefined}
              fill="rgb(var(--surface-3))"
              stroke="rgb(var(--line) / 0.22)"
              strokeWidth={0.5 * (view.width / WIDTH)}
            />
          ))}
        </g>
        {originPoint ? (
          <circle cx={originPoint[0]} cy={originPoint[1]} r={5 * (view.width / WIDTH)} fill="rgb(var(--success))" opacity="0.8">
            <title>{`起点 ${origin?.city || origin?.country || ''}`}</title>
          </circle>
        ) : null}
        {markers.map((marker, index) => {
          const point = projection([marker.lon, marker.lat]);
          if (!point) return null;
          const scale = view.width / WIDTH;
          const radius = Math.max(3, Math.min(11, 3 + Math.sqrt(marker.count) * 1.3)) * scale;
          return (
            <g key={`${marker.lat}-${marker.lon}-${index}`}>
              <circle cx={point[0]} cy={point[1]} r={radius + 4 * scale} fill="rgb(var(--accent) / 0.14)" />
              <circle
                cx={point[0]}
                cy={point[1]}
                r={radius}
                fill="rgb(var(--accent))"
                opacity="0.88"
                className="cursor-pointer"
                onPointerEnter={(event) => setHover({ x: event.clientX, y: event.clientY, marker })}
                onPointerMove={(event) => setHover({ x: event.clientX, y: event.clientY, marker })}
                onPointerLeave={() => setHover(null)}
              />
            </g>
          );
        })}
      </svg>
      <div className="pointer-events-none absolute bottom-2 left-3 text-[10px] text-muted/60">
        {markers.length} 个目标 · 滚轮缩放 · 拖动平移
      </div>
      {hover ? (
        <div
          className="pointer-events-none fixed z-[70] rounded-lg border border-line/10 bg-surface/95 px-2.5 py-1.5 text-[10px] text-ink shadow-soft backdrop-blur"
          style={{ left: hover.x + 12, top: hover.y + 12 }}
        >
          <div className="font-medium">{hover.marker.city || hover.marker.country}</div>
          <div className="mt-0.5 text-muted">{hover.marker.countryCode} · {hover.marker.count} {countLabel}</div>
          <div className="text-muted">节点：{hover.marker.node || 'DIRECT'}</div>
          {hover.marker.nodes?.length ? (
            <div className="mt-0.5 max-w-[220px] text-muted/80">
              {hover.marker.nodes.slice(0, 6).join('、')}{hover.marker.nodes.length > 6 ? ` 等 ${hover.marker.nodes.length} 个` : ''}
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="absolute right-2 bottom-2 flex items-center gap-1 rounded-lg border border-line/10 bg-surface/90 p-1 shadow-soft backdrop-blur">
        <button type="button" title="缩小" onClick={() => zoomAt(1.3)} className="flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-surface2 hover:text-ink"><Minus className="h-3.5 w-3.5" /></button>
        <button type="button" title="放大" onClick={() => zoomAt(1 / 1.3)} className="flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-surface2 hover:text-ink"><Plus className="h-3.5 w-3.5" /></button>
        <button type="button" title="重置" onClick={() => setView(DEFAULT_VIEW)} className="flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-surface2 hover:text-ink"><RotateCcw className="h-3.5 w-3.5" /></button>
      </div>
    </div>
  );
}
