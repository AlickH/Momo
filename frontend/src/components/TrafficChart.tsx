import { useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { formatRate } from '../lib/format';
import type { TrafficPoint } from '../types';

const WINDOW_MS = 60_000;
const Y_FLOOR = 60 * 1024;
const AXIS_STEP = 32 * 1024;

interface Colors {
  up: string;
  down: string;
  grid: string;
  muted: string;
  surface: string;
  ink: string;
}

function readColors(): Colors {
  const style = getComputedStyle(document.documentElement);
  const color = (name: string) => {
    const raw = style.getPropertyValue(name).trim();
    return raw ? `rgb(${raw.split(/\s+/).join(',')})` : 'rgb(22,119,255)';
  };
  return {
    up: color('--chart-up'),
    down: color('--chart-down'),
    grid: color('--line'),
    muted: color('--muted'),
    surface: color('--surface'),
    ink: color('--ink'),
  };
}

function rgba(color: string, alpha: number): string {
  const match = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  return match ? `rgba(${match[1]},${match[2]},${match[3]},${alpha})` : color;
}

function drawCurve(ctx: CanvasRenderingContext2D, points: { x: number; y: number }[], move = true) {
  if (move) ctx.moveTo(points[0].x, points[0].y);
  for (let index = 1; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    ctx.quadraticCurveTo(current.x, current.y, (current.x + next.x) / 2, (current.y + next.y) / 2);
  }
  const last = points.at(-1)!;
  ctx.lineTo(last.x, last.y);
}

export function TrafficChart({ history }: { history: TrafficPoint[] }) {
  const { theme } = useApp();
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const historyRef = useRef<TrafficPoint[]>(history);
  const anchorRef = useRef({ latest: 0, at: 0 });
  const yMaxRef = useRef(Y_FLOOR);
  const colorsRef = useRef<Colors | null>(null);
  const hoverRef = useRef<{ x: number; y: number } | null>(null);
  const frameRef = useRef(0);

  historyRef.current = history;
  colorsRef.current = null;

  useEffect(() => {
    colorsRef.current = null;
  }, [theme]);

  useEffect(() => {
    const latest = history.at(-1)?.t ?? 0;
    if (latest > anchorRef.current.latest) {
      anchorRef.current = { latest, at: performance.now() };
    }
  }, [history]);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      if (!width || !height) return;
      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      const colors = colorsRef.current ?? readColors();
      colorsRef.current = colors;
      const left = 48;
      const right = 14;
      const top = 14;
      const bottom = height - 12;
      const plotWidth = width - left - right;
      const plotHeight = bottom - top;
      const anchor = anchorRef.current;
      const latest = anchor.latest
        ? anchor.latest + (performance.now() - anchor.at)
        : Date.now();
      const start = latest - WINDOW_MS;
      const visible = historyRef.current.filter((point) => point.t >= start - 2000 && point.t <= latest + 2000);

      let maxValue = 0;
      for (const point of visible) maxValue = Math.max(maxValue, point.up, point.down);
      const padded = Math.max(Y_FLOOR, maxValue * 1.15);
      const nice = Math.max(Y_FLOOR, Math.ceil(padded / AXIS_STEP) * AXIS_STEP);
      if (nice > yMaxRef.current || nice < yMaxRef.current * 0.45) yMaxRef.current = nice;
      const yMax = yMaxRef.current;

      ctx.font = '9px ui-sans-serif, system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (let index = 0; index <= 3; index += 1) {
        const value = (yMax / 3) * index;
        const y = bottom - (value / yMax) * plotHeight;
        ctx.strokeStyle = rgba(colors.grid, 0.28);
        ctx.setLineDash([3, 4]);
        ctx.beginPath();
        ctx.moveTo(left, y);
        ctx.lineTo(width - right, y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = colors.muted;
        ctx.fillText(index === 0 ? '0' : formatRate(value), left - 8, y);
      }

      const toX = (time: number) => left + ((time - start) / WINDOW_MS) * plotWidth;
      const toY = (value: number) => bottom - (Math.min(value, yMax) / yMax) * plotHeight;

      const series = [
        { color: colors.up, points: visible.map((point) => ({ x: toX(point.t), y: toY(point.up) })) },
        { color: colors.down, points: visible.map((point) => ({ x: toX(point.t), y: toY(point.down) })) },
      ];

      ctx.save();
      ctx.beginPath();
      ctx.rect(left, top, plotWidth, plotHeight);
      ctx.clip();
      for (const item of series) {
        if (item.points.length < 2) continue;
        const gradient = ctx.createLinearGradient(0, top, 0, bottom);
        gradient.addColorStop(0, rgba(item.color, 0.22));
        gradient.addColorStop(1, rgba(item.color, 0.01));
        ctx.beginPath();
        ctx.moveTo(item.points[0].x, bottom);
        ctx.lineTo(item.points[0].x, item.points[0].y);
        drawCurve(ctx, item.points, false);
        ctx.lineTo(item.points.at(-1)!.x, bottom);
        ctx.closePath();
        ctx.fillStyle = gradient;
        ctx.fill();

        ctx.beginPath();
        drawCurve(ctx, item.points);
        ctx.strokeStyle = item.color;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      ctx.restore();

      const hover = hoverRef.current;
      if (hover && visible.length) {
        const time = start + ((hover.x - left) / plotWidth) * WINDOW_MS;
        let nearest = visible[0];
        for (const point of visible) {
          if (Math.abs(point.t - time) < Math.abs(nearest.t - time)) nearest = point;
        }
        const x = toX(nearest.t);
        ctx.strokeStyle = rgba(colors.grid, 0.65);
        ctx.setLineDash([3, 4]);
        ctx.beginPath();
        ctx.moveTo(x, top);
        ctx.lineTo(x, bottom);
        ctx.stroke();
        ctx.setLineDash([]);
        const tooltip = tooltipRef.current;
        if (tooltip) {
          tooltip.style.display = 'block';
          tooltip.style.left = `${Math.min(Math.max(x + 10, 8), width - 130)}px`;
          tooltip.style.top = '16px';
          tooltip.innerHTML = `<div style="opacity:.55;margin-bottom:2px">${new Date(nearest.t).toLocaleTimeString('zh-CN', { hour12: false })}</div><div>上传 <b>${formatRate(nearest.up)}</b></div><div>下载 <b>${formatRate(nearest.down)}</b></div>`;
          tooltip.style.background = colors.surface;
          tooltip.style.color = colors.ink;
        }
      } else if (tooltipRef.current) {
        tooltipRef.current.style.display = 'none';
      }
    };

    const tick = () => {
      draw();
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);

    const onPointerMove = (event: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      hoverRef.current = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    };
    const onPointerLeave = () => {
      hoverRef.current = null;
    };
    const onVisible = () => {
      const latest = historyRef.current.at(-1)?.t ?? 0;
      if (latest) anchorRef.current = { latest, at: performance.now() };
    };
    container.addEventListener('pointermove', onPointerMove);
    container.addEventListener('pointerleave', onPointerLeave);
    document.addEventListener('visibilitychange', onVisible);
    const observer = new ResizeObserver(() => draw());
    observer.observe(container);

    return () => {
      cancelAnimationFrame(frameRef.current);
      observer.disconnect();
      container.removeEventListener('pointermove', onPointerMove);
      container.removeEventListener('pointerleave', onPointerLeave);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return (
    <div ref={containerRef} className="relative h-[220px] w-full sm:h-[260px]" role="img" aria-label="实时上传下载流量曲线">
      <canvas ref={canvasRef} className="absolute inset-0" />
      <div
        ref={tooltipRef}
        className="pointer-events-none absolute hidden rounded-lg border border-line/10 px-2.5 py-1.5 text-[10px] leading-relaxed shadow-soft"
      />
    </div>
  );
}
