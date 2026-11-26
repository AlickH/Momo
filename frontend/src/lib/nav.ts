import {
  Cable,
  Gauge,
  Layers,
  Route,
  ScrollText,
  Settings2,
  Waypoints,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  path: string;
  label: string;
  description: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { path: '/', label: '概览', description: '实时流量与运行状态', icon: Gauge },
  { path: '/proxies', label: '代理', description: '策略组与节点选择', icon: Waypoints },
  { path: '/profiles', label: '订阅', description: '配置来源与订阅更新', icon: Layers },
  { path: '/connections', label: '连接', description: '当前活动连接', icon: Cable },
  { path: '/rules', label: '规则', description: '分流规则与命中情况', icon: Route },
  { path: '/logs', label: '日志', description: '内核与运行日志', icon: ScrollText },
  { path: '/settings', label: '设置', description: '内核参数与系统信息', icon: Settings2 },
];

export function pageMeta(pathname: string): NavItem {
  const normalized = pathname.replace(/\/+$/, '') || '/';
  return NAV_ITEMS.find((item) => item.path === normalized) ?? NAV_ITEMS[0];
}
