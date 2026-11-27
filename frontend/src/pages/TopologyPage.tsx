import { useEffect, useMemo, useRef, useState } from 'react';
import * as echarts from 'echarts/core';
import { SankeyChart } from 'echarts/charts';
import { TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { EChartsCoreOption } from 'echarts/core';
import { Maximize2, Minimize2, Network, Pause, Play, RefreshCw } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { usePolling } from '../hooks/usePolling';
import { api } from '../lib/api';
import { buildTopologyData } from '../lib/topology';
import { Badge, Button, Card, EmptyState } from '../components/ui';
import type { ConnectionsData } from '../types';

echarts.use([SankeyChart, TooltipComponent, CanvasRenderer]);

function cssColor(name: string): string {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const parts = raw.split(/\s+/).map(Number);
  return parts.length === 3 ? `rgb(${parts.join(',')})` : '#1677ff';
}

export function TopologyPage() {
  const { theme } = useApp();
  const connections = usePolling<ConnectionsData>(() => api.get('connections'), 2000);
  const [expanded, setExpanded] = useState(false);
  const [paused, setPaused] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  const items = connections.data?.connections ?? [];
  const topology = useMemo(() => buildTopologyData(items.map((item) => ({
    source: item.sourceIP || '未知',
    rule: item.rule || 'Match',
    chains: item.chains,
  }))), [items]);

  const option = useMemo<EChartsCoreOption>(() => ({
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      backgroundColor: cssColor('--surface'),
      borderColor: cssColor('--line'),
      textStyle: { color: cssColor('--ink'), fontSize: 11 },
      formatter: (params: unknown) => {
        const data = params as { dataType?: string; data?: { name?: string; nodeType?: string; originalValue?: number; source?: number; target?: number } };
        if (data.dataType === 'node') return `${data.data?.name ?? ''}<br/>类型：${data.data?.nodeType ?? '未知'}`;
        if (data.dataType === 'edge') {
          const source = topology.nodes.find((node) => node.id === data.data?.source);
          const target = topology.nodes.find((node) => node.id === data.data?.target);
          return `${source?.name ?? ''} → ${target?.name ?? ''}<br/>连接数：${data.data?.originalValue ?? 0}`;
        }
        return '';
      },
    },
    series: [{
      type: 'sankey',
      layout: 'none',
      data: topology.nodes,
      links: topology.links,
      emphasis: { focus: 'trajectory' },
      lineStyle: { color: 'gradient', curveness: 0.5 },
      itemStyle: { borderWidth: 0 },
      label: { color: cssColor('--ink'), fontSize: 11, formatter: (params: { name?: string }) => params.name ?? '' },
      nodeGap: 6,
      nodeWidth: 16,
      nodeAlign: 'left',
      animation: true,
      animationDuration: 700,
      animationEasing: 'cubicOut',
    }],
  }), [topology, theme]);

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
    if (!pausedRef.current) chartRef.current?.setOption(option);
  }, [option]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-ink">网络拓扑</h2>
          <p className="mt-0.5 text-[12px] text-muted">来源 IP → 规则匹配 → 代理链入口 → 代理链出口，2 秒刷新</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone="info">{items.length} 活动连接</Badge>
          <Button variant="ghost" size="sm" icon={paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />} onClick={() => setPaused((value) => !value)}>{paused ? '继续' : '暂停'}</Button>
          <Button variant="ghost" size="sm" icon={expanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />} onClick={() => setExpanded((value) => !value)}>{expanded ? '退出全屏' : '全屏'}</Button>
          <Button variant="ghost" size="sm" icon={<RefreshCw className="h-3.5 w-3.5" />} loading={connections.refreshing} onClick={() => { void connections.refresh(); }}>刷新</Button>
        </div>
      </div>

      <div className={expanded ? 'fixed inset-0 z-[60] flex flex-col bg-bg p-4' : ''}>
        <Card padded={false} className={expanded ? 'flex min-h-0 flex-1 flex-col overflow-hidden' : 'overflow-hidden'}>
          <div ref={containerRef} className={expanded ? 'min-h-0 flex-1' : 'h-[520px] w-full'} />
        </Card>
      </div>
      {items.length === 0 ? (
        <Card>
          <EmptyState icon={<Network className="h-5 w-5" />} title="当前没有活动连接" description="产生代理流量后，这里会显示来源、规则和代理链的流量拓扑。" />
        </Card>
      ) : null}
    </div>
  );
}
