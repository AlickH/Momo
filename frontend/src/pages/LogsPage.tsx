import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownToLine,
  Pause,
  Play,
  ScrollText,
  SearchX,
  Trash2,
} from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useToast } from '../context/ToastContext';
import { formatClock } from '../lib/format';
import { Badge, Button, Card, ConfirmDialog, EmptyState, SearchInput, Segmented, Switch } from '../components/ui';
import { cn } from '../lib/cn';
import type { LogEntry } from '../types';

type LevelFilter = 'all' | 'debug' | 'info' | 'warning' | 'error';
type SourceFilter = 'all' | 'core' | 'app';

const LEVELS: { value: LevelFilter; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'info', label: '信息' },
  { value: 'warning', label: '警告' },
  { value: 'error', label: '错误' },
  { value: 'debug', label: '调试' },
];

const levelStyle: Record<string, string> = {
  debug: 'text-muted border-line/10 bg-surface3',
  info: 'text-accent border-accent/15 bg-accent/6',
  warning: 'text-warning border-warning/15 bg-warning/6',
  error: 'text-danger border-danger/15 bg-danger/6',
};

const levelLabel: Record<string, string> = { debug: 'DEBUG', info: 'INFO', warning: 'WARN', error: 'ERROR' };
const sourceLabel: Record<string, string> = { core: '内核', app: '应用', http: 'HTTP' };

export function LogsPage() {
  const { toast } = useToast();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [live, setLive] = useState(true);
  const [level, setLevel] = useState<LevelFilter>('all');
  const [source, setSource] = useState<SourceFilter>('all');
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [autoScroll, setAutoScroll] = useState(true);
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  const lastId = useRef(0);
  const scroller = useRef<HTMLDivElement>(null);
  const liveRef = useRef(live);
  liveRef.current = live;

  useEffect(() => {
    let stopped = false;
    const load = async (initial: boolean) => {
      try {
        const result = await api.get<{ logs: LogEntry[]; latestId: number }>(
          `logs?since=${initial ? 0 : lastId.current}&limit=500`,
        );
        if (stopped) return;
        if (result.latestId < lastId.current) {
          lastId.current = 0;
          setLogs([]);
          return;
        }
        if (result.logs.length) {
          lastId.current = Math.max(lastId.current, ...result.logs.map((entry) => entry.id));
          setLogs((previous) => {
            const merged = initial ? result.logs : [...previous, ...result.logs];
            return merged.slice(-1500);
          });
        }
      } catch (error) {
        if (!stopped && initial) toast(error instanceof ApiError ? error.message : '读取日志失败', 'error');
      } finally {
        if (!stopped) setLoading(false);
      }
    };
    void load(true);
    const timer = setInterval(() => {
      if (liveRef.current) void load(false);
    }, 2000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [toast]);

  const filtered = useMemo(() => {
    const needle = deferredQuery.trim().toLowerCase();
    return logs.filter((entry) => {
      if (level !== 'all' && entry.level !== level) return false;
      if (source === 'core' && entry.source !== 'core') return false;
      if (source === 'app' && entry.source === 'core') return false;
      if (needle && !entry.message.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [logs, level, source, deferredQuery]);

  useEffect(() => {
    if (!autoScroll || !live) return;
    const element = scroller.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [filtered, autoScroll, live]);

  const clear = async () => {
    setClearing(true);
    try {
      await api.post('logs/clear');
      setLogs([]);
      lastId.current = 0;
      setConfirmClear(false);
      toast('日志已清空', 'success');
    } catch (error) {
      toast(error instanceof Error ? error.message : '清空失败', 'error');
    } finally {
      setClearing(false);
    }
  };

  const download = () => {
    const text = filtered.map((entry) => `${new Date(entry.time).toISOString()} [${entry.level}] [${entry.source}] ${entry.message}`).join('\n');
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `momo-logs-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.log`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 2000);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <Segmented<LevelFilter> value={level} onChange={setLevel} options={LEVELS} size="sm" />
        <Segmented<SourceFilter>
          value={source}
          onChange={setSource}
          size="sm"
          options={[{ value: 'all', label: '全部来源' }, { value: 'core', label: '内核' }, { value: 'app', label: '应用' }]}
        />
        <SearchInput value={query} onChange={setQuery} placeholder="搜索日志内容" className="w-full sm:ml-auto sm:w-[260px]" />
        <div className="flex items-center gap-1.5">
          <Button
            variant={live ? 'secondary' : 'primary'}
            size="sm"
            icon={live ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            onClick={() => setLive((value) => !value)}
          >{live ? '暂停' : '继续'}</Button>
          <Button variant="ghost" size="sm" icon={<ArrowDownToLine className="h-3.5 w-3.5" />} onClick={download} disabled={!filtered.length}>导出</Button>
          <Button variant="ghost" size="sm" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => setConfirmClear(true)}>清空</Button>
        </div>
      </div>

      <Card padded={false} className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line/8 px-4 py-2.5">
          <div className="flex items-center gap-2 text-[11px] text-muted">
            <ScrollText className="h-3.5 w-3.5" />
            <span>{filtered.length} 条</span>
            <span className="text-muted/30">/</span>
            <span>{logs.length} 条缓存</span>
            {!live ? <Badge tone="warning">已暂停</Badge> : <Badge tone="accent"><span className="h-1 w-1 animate-pulse rounded-full bg-accent" />实时</Badge>}
          </div>
          <label className="flex items-center gap-2 text-[11px] text-muted">
            <span>自动滚动</span>
            <Switch checked={autoScroll} onChange={setAutoScroll} label="自动滚动" />
          </label>
        </div>
        <div
          ref={scroller}
          onScroll={(event) => {
            const element = event.currentTarget;
            const atBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 32;
            setAutoScroll(atBottom);
          }}
          className="scrollbar-thin h-[calc(100vh-300px)] min-h-[360px] overflow-y-auto bg-bg/40 px-3 py-2 sm:px-4"
        >
          {loading ? (
            <div className="space-y-2 py-2">{[1, 2, 3, 4, 5, 6, 7, 8].map((key) => <div key={key} className="shimmer h-4 rounded" />)}</div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={query ? <SearchX className="h-5 w-5" /> : <ScrollText className="h-5 w-5" />}
              title={query || level !== 'all' || source !== 'all' ? '没有匹配的日志' : '暂无日志'}
              description={query ? `没有找到包含 “${query}” 的日志。` : '内核启动后，连接、规则和错误信息会显示在这里。'}
              action={query || level !== 'all' || source !== 'all' ? (
                <Button variant="secondary" size="sm" onClick={() => { setQuery(''); setLevel('all'); setSource('all'); }}>清除筛选</Button>
              ) : undefined}
            />
          ) : (
            <div className="space-y-0.5">
              {filtered.map((entry) => (
                <div key={entry.id} className="log-line rounded px-2 py-1 text-[11.5px] leading-relaxed hover:bg-surface2/40">
                  <span className="mono text-muted/50">{formatClock(entry.time)}</span>
                  <span className={cn('justify-self-start rounded border px-1 py-0.5 text-[8px] font-semibold leading-none mono', levelStyle[entry.level])}>{levelLabel[entry.level] ?? entry.level}</span>
                  <span className="log-source text-[10px] text-muted/50">{sourceLabel[entry.source] ?? entry.source}</span>
                  <span className="min-w-0 whitespace-pre-wrap break-words font-mono text-ink/80">{entry.message}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-[11px] text-muted/50">
        <span>显示最近 1500 条 · 每 2 秒拉取增量</span>
        <span>日志同时写入应用数据目录下的 logs/app.log</span>
      </div>

      <ConfirmDialog
        open={confirmClear}
        title="清空日志"
        message="仅会清空当前内存中的日志，不会删除磁盘上的日志文件。确定继续吗？"
        confirmText="清空"
        danger
        pending={clearing}
        onClose={() => { if (!clearing) setConfirmClear(false); }}
        onConfirm={() => { void clear(); }}
      />
    </div>
  );
}
