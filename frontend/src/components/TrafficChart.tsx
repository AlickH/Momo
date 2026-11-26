import { useEffect, useMemo, useRef } from 'react';
import * as echarts from 'echarts/core';
import { LineChart } from 'echarts/charts';
import { GridComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { EChartsCoreOption } from 'echarts/core';
import { useApp } from '../context/AppContext';
import { formatRate } from '../lib/format';
import type { TrafficPoint } from '../types';

echarts.use([LineChart, GridComponent, TooltipComponent, CanvasRenderer]);

const WINDOW_MS = 60_000;
const Y_FLOOR = 60 * 1024;

function cssColor(name: string, alpha = 1): string {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const parts = raw.split(/\s+/).map(Number);
  if (parts.length !== 3 || parts.some((value) => Number.isNaN(value))) return `rgba(22,119,255,${alpha})`;
  return `rgba(${parts[0]},${parts[1]},${parts[2]},${alpha})`;
}

function tooltipFormatter(params: unknown): string {
  const list = Array.isArray(params) ? params : [];
  if (!list.length) return '';
  const first = list[0] as { axisValue?: number; value?: [number, number] };
  const timestamp = first.axisValue ?? first.value?.[0] ?? Date.now();
  const lines = list.map((item) => {
    const entry = item as { marker?: string; seriesName?: string; value?: [number, number] };
    const value = entry.value?.[1] ?? 0;
    return `${entry.marker ?? ''}${entry.seriesName ?? ''}&nbsp;&nbsp;<span style="font-weight:600">${formatRate(value)}</span>`;
  });
  return `<div style="font-size:11px;line-height:1.7"><div style="opacity:.6;margin-bottom:2px">${new Date(timestamp).toLocaleTimeString('zh-CN', { hour12: false })}</div>${lines.join('<br/>')}</div>`;
}

export function TrafficChart({ history }: { history: TrafficPoint[] }) {
  const { theme } = useApp();
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  const points = useMemo(() => {
    const latest = history.at(-1)?.t ?? Date.now();
    return history.filter((point) => point.t >= latest - WINDOW_MS - 2000);
  }, [history]);

  const option = useMemo<EChartsCoreOption>(() => {
    const latest = points.at(-1)?.t ?? Date.now();
    const upColor = cssColor('--chart-up');
    const downColor = cssColor('--chart-down');
    const textMuted = cssColor('--muted', 0.8);
    const grid = cssColor('--line', 0.08);
    return {
      animation: true,
      animationDuration: 400,
      animationDurationUpdate: 1000,
      animationEasingUpdate: 'linear',
      grid: { left: 48, top: 14, right: 14, bottom: 28 },
      tooltip: {
        trigger: 'axis',
        confine: true,
        backgroundColor: cssColor('--surface', 0.96),
        borderColor: cssColor('--line', 0.12),
        borderWidth: 1,
        padding: [7, 10],
        textStyle: { color: cssColor('--ink'), fontSize: 11 },
        axisPointer: {
          type: 'line',
          lineStyle: { color: cssColor('--line', 0.25), type: 'dashed' },
        },
        formatter: tooltipFormatter,
      },
      xAxis: {
        type: 'time',
        min: latest - WINDOW_MS,
        max: latest,
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: {
          show: true,
          color: textMuted,
          fontSize: 9,
          hideOverlap: true,
          formatter: (value: number) => new Date(value).toLocaleTimeString('zh-CN', { hour12: false, minute: '2-digit', second: '2-digit' }),
        },
      },
      yAxis: {
        type: 'value',
        min: 0,
        max: (value: { max: number }) => Math.max(value.max, Y_FLOOR),
        splitNumber: 3,
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { show: true, lineStyle: { color: grid, type: 'dashed' } },
        axisLabel: {
          color: textMuted,
          fontSize: 9,
          formatter: (value: number) => (value === 0 ? '0' : formatRate(value)),
        },
      },
      series: [
        {
          name: '上传',
          type: 'line',
          smooth: 0.35,
          symbol: 'none',
          showSymbol: false,
          lineStyle: { width: 1.8, color: upColor },
          itemStyle: { color: upColor },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: cssColor('--chart-up', 0.28) },
                { offset: 1, color: cssColor('--chart-up', 0.01) },
              ],
            },
          },
          data: points.map((point) => [point.t, point.up]),
          emphasis: { disabled: true },
        },
        {
          name: '下载',
          type: 'line',
          smooth: 0.35,
          symbol: 'none',
          showSymbol: false,
          lineStyle: { width: 1.8, color: downColor },
          itemStyle: { color: downColor },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: cssColor('--chart-down', 0.22) },
                { offset: 1, color: cssColor('--chart-down', 0.01) },
              ],
            },
          },
          data: points.map((point) => [point.t, point.down]),
          emphasis: { disabled: true },
        },
      ],
    };
  }, [points, theme]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const chart = echarts.init(element, undefined, { renderer: 'canvas' });
    chartRef.current = chart;
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(element);
    return () => {
      observer.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    chartRef.current?.setOption(option, { lazyUpdate: true });
  }, [option]);

  return (
    <div
      ref={containerRef}
      className="h-[220px] w-full sm:h-[260px]"
      role="img"
      aria-label="实时上传下载流量曲线"
    />
  );
}
