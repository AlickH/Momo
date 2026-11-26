export function formatBytes(bytes: number, digits = 1): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** index;
  return `${value >= 100 || index === 0 ? value.toFixed(0) : value.toFixed(digits)} ${units[index]}`;
}

export function formatRate(bytesPerSecond: number): string {
  return `${formatBytes(bytesPerSecond)}/s`;
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('zh-CN').format(value || 0);
}

export function formatDuration(input: number): string {
  const seconds = Math.max(0, Math.floor(input));
  if (seconds < 60) return `${seconds} 秒`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} 分 ${seconds % 60} 秒`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 时 ${minutes % 60} 分`;
  const days = Math.floor(hours / 24);
  return `${days} 天 ${hours % 24} 时`;
}

export function shortCoreVersion(version: string | null | undefined): string {
  if (!version) return '—';
  return version.replace(/-[0-9a-f]{7,}$/i, '');
}

export function formatUptime(startedAt: number | null, now = Date.now()): string {
  if (!startedAt) return '—';
  return formatDuration((now - startedAt) / 1000);
}

export function formatDate(timestamp: number | string | null | undefined): string {
  if (!timestamp) return '—';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

export function formatClock(timestamp: number): string {
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(timestamp);
}

export function timeAgo(timestamp: number | string | null | undefined, now = Date.now()): string {
  if (!timestamp) return '—';
  const value = typeof timestamp === 'string' ? new Date(timestamp).getTime() : timestamp;
  if (!Number.isFinite(value)) return '—';
  const diff = Math.max(0, now - value) / 1000;
  if (diff < 60) return '刚刚';
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)} 天前`;
  return formatDate(value);
}

export function formatExpiry(expireSeconds: number): { text: string; expired: boolean; days: number } {
  if (!expireSeconds) return { text: '长期有效', expired: false, days: Number.POSITIVE_INFINITY };
  const expire = expireSeconds * 1000;
  const days = Math.ceil((expire - Date.now()) / 86400000);
  if (days <= 0) return { text: '已过期', expired: true, days: 0 };
  if (days === 1) return { text: '明天到期', expired: false, days };
  return { text: `${days} 天后到期`, expired: false, days };
}

export function delayTone(delay: number | null | undefined): 'good' | 'ok' | 'bad' | 'none' {
  if (delay === null || delay === undefined || delay <= 0) return 'none';
  if (delay <= 200) return 'good';
  if (delay <= 600) return 'ok';
  return 'bad';
}

export function percent(value: number, total: number): number {
  if (!total || total <= 0) return 0;
  return Math.min(100, Math.max(0, (value / total) * 100));
}

export function initialOf(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return 'M';
  return trimmed.slice(0, 1).toUpperCase();
}
