import { useMemo, useRef, useState } from 'react';
import { formatRate } from '../lib/format';
import type { TrafficPoint } from '../types';

const WIDTH = 1000;
const HEIGHT = 260;
const PAD_X = 8;
const PAD_TOP = 18;
const PAD_BOTTOM = 26;

function buildPath(values: number[], max: number): string {
  const usableHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;
  return values.map((value, index) => {
    const x = PAD_X + (index / Math.max(values.length - 1, 1)) * (WIDTH - PAD_X * 2);
    const y = PAD_TOP + usableHeight - (value / max) * usableHeight;
    return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
}

export function TrafficChart({ history }: { history: TrafficPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const points = history.length ? history : Array.from({ length: 60 }, (_, index) => ({ t: Date.now() - (59 - index) * 1000, up: 0, down: 0 }));
  const max = Math.max(...points.map((point) => Math.max(point.up, point.down)), 1024) * 1.25;
  const upPath = useMemo(() => buildPath(points.map((point) => point.up), max), [points, max]);
  const downPath = useMemo(() => buildPath(points.map((point) => point.down), max), [points, max]);
  const upAreaPath = `${upPath} L${WIDTH - PAD_X},${HEIGHT - PAD_BOTTOM} L${PAD_X},${HEIGHT - PAD_BOTTOM} Z`;
  const downAreaPath = `${downPath} L${WIDTH - PAD_X},${HEIGHT - PAD_BOTTOM} L${PAD_X},${HEIGHT - PAD_BOTTOM} Z`;
  const hovered = hover === null ? null : points[Math.min(points.length - 1, Math.max(0, hover))];
  const usableHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;
  const hoverX = hover === null ? 0 : PAD_X + (hover / Math.max(points.length - 1, 1)) * (WIDTH - PAD_X * 2);
  const hoverY = hovered ? PAD_TOP + usableHeight - (hovered.up / max) * usableHeight : 0;

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-[220px] w-full sm:h-[260px]"
        preserveAspectRatio="none"
        onPointerLeave={() => setHover(null)}
        onPointerMove={(event) => {
          const rect = svgRef.current?.getBoundingClientRect();
          if (!rect) return;
          const relative = (event.clientX - rect.left) / rect.width;
          setHover(Math.round(relative * (points.length - 1)));
        }}
      >
        <defs>
          <linearGradient id="traffic-up" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(var(--chart-up))" stopOpacity="0.28" />
            <stop offset="100%" stopColor="rgb(var(--chart-up))" stopOpacity="0.015" />
          </linearGradient>
          <linearGradient id="traffic-down" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(var(--chart-down))" stopOpacity="0.16" />
            <stop offset="100%" stopColor="rgb(var(--chart-down))" stopOpacity="0.01" />
          </linearGradient>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const y = PAD_TOP + usableHeight * ratio;
          return <line key={ratio} x1={PAD_X} x2={WIDTH - PAD_X} y1={y} y2={y} stroke="rgb(var(--line))" strokeOpacity="0.075" strokeDasharray="3 6" vectorEffect="non-scaling-stroke" />;
        })}
        <path d={downAreaPath} fill="url(#traffic-down)" />
        <path d={upAreaPath} fill="url(#traffic-up)" />
        <path d={downPath} fill="none" stroke="rgb(var(--chart-down))" strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        <path d={upPath} fill="none" stroke="rgb(var(--chart-up))" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {hover !== null && hovered ? (
          <g>
            <line x1={hoverX} x2={hoverX} y1={PAD_TOP} y2={HEIGHT - PAD_BOTTOM} stroke="rgb(var(--line))" strokeOpacity="0.22" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
            <circle cx={hoverX} cy={hoverY} r="4" fill="rgb(var(--chart-up))" stroke="rgb(var(--bg))" strokeWidth="2" vectorEffect="non-scaling-stroke" />
          </g>
        ) : null}
      </svg>
      {hovered ? (
        <div className="pointer-events-none absolute top-3 rounded-lg border border-line/10 bg-surface/95 px-3 py-2 text-[12px] shadow-lg" style={{ left: `${Math.min(72, Math.max(2, (hover! / Math.max(points.length - 1, 1)) * 100))}%` }}>
          <div className="mb-1 text-muted">{new Date(hovered.t).toLocaleTimeString('zh-CN', { hour12: false })}</div>
          <div className="flex items-center gap-3 text-ink"><span className="h-1.5 w-1.5 rounded-full bg-[rgb(var(--chart-up))]" />↑ {formatRate(hovered.up)}</div>
          <div className="mt-0.5 flex items-center gap-3 text-ink"><span className="h-1.5 w-1.5 rounded-full bg-[rgb(var(--chart-down))]" />↓ {formatRate(hovered.down)}</div>
        </div>
      ) : null}
      <div className="pointer-events-none absolute bottom-0 left-1 right-1 flex justify-between text-[11px] text-muted/70">
        <span>{points.length > 60 ? '2 分钟前' : '60 秒前'}</span>
        <span>{Math.round(points.length / 2)} 秒前</span>
        <span>现在</span>
      </div>
    </div>
  );
}
