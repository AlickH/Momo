import { useEffect, useMemo, useRef } from 'react';
import * as echarts from 'echarts/core';
import { LineChart } from 'echarts/charts';
import { GridComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { EChartsCoreOption } from 'echarts/core';
import { useApp } from '../context/AppContext';
import type { HistoryPoint } from '../types';

echarts.use([LineChart, GridComponent, TooltipComponent, CanvasRenderer]);

const WINDOW_MS = 60_000;

function cssColor(name: string, alpha = 1): string {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const parts = raw.split(/\s+/).map(Number);
  if (parts.length !== 3 || parts.some((value) => Number.isNaN(value))) return `rgba(22,119,255,${alpha})`;
  return `rgba(${parts[0]},${parts[1]},${parts[2]},${alpha})`;
}

export function MiniChart({
  history,
  colorVar,
  floor,
  format,
}: {
  history: HistoryPoint[];
  colorVar: string;
  floor: number;
  format: (value: number) => string;
}) {
  const { theme } = useApp();
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  const option = useMemo<EChartsCoreOption>(() => {
    const points = history.slice(-62);
    const latest = points.at(-1)?.t ?? Date.now();
    const color = cssColor(colorVar);
    return {
      animation: true,
      animationDuration: 300,
      animationDurationUpdate: 1000,
      animationEasingUpdate: 'linear',
      grid: { left: 0, right: 0, top: 4, bottom: 2 },
      tooltip: {
        trigger: 'axis',
        confine: true,
        backgroundColor: cssColor('--surface', 0.96),
        borderColor: cssColor('--line', 0.12),
        borderWidth: 1,
        padding: [5, 8],
        textStyle: { color: cssColor('--ink'), fontSize: 10 },
        formatter: (params: unknown) => {
          const list = Array.isArray(params) ? params : [];
          const first = list[0] as { axisValue?: number; value?: [number, number] };
          const timestamp = first?.axisValue ?? first?.value?.[0] ?? Date.now();
          const value = first?.value?.[1] ?? 0;
          return `${new Date(timestamp).toLocaleTimeString('zh-CN', { hour12: false })}<br/>${format(value)}`;
        },
      },
      xAxis: {
        type: 'time',
        min: latest - WINDOW_MS,
        max: latest - 1000,
        show: false,
      },
      yAxis: {
        type: 'value',
        min: 0,
        max: (value: { max: number }) => Math.max(value.max, floor),
        show: false,
      },
      series: [{
        type: 'line',
        smooth: true,
        symbol: 'none',
        showSymbol: false,
        lineStyle: { width: 1.5, color },
        itemStyle: { color },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: cssColor(colorVar, 0.25) },
              { offset: 1, color: cssColor(colorVar, 0.01) },
            ],
          },
        },
        data: points.map((point) => ({ name: point.t, value: [point.t, point.value] })),
        emphasis: { disabled: true },
      }],
    };
  }, [history, colorVar, floor, format, theme]);

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
    chartRef.current?.setOption(option);
  }, [option]);

  return <div ref={containerRef} className="h-full w-full" />;
}
