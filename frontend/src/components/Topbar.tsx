import { useLocation } from 'react-router-dom';
import { ArrowDownLeft, ArrowUpRight, Globe2, ListFilter, Menu, MinusCircle } from 'lucide-react';
import { pageMeta } from '../lib/nav';
import { useApp } from '../context/AppContext';
import { formatRate, initialOf } from '../lib/format';
import { Mode } from '../types';
import { Segmented, StatusDot } from './ui';
import { cn } from '../lib/cn';

const coreLabel: Record<string, string> = {
  running: '运行中',
  starting: '启动中',
  restarting: '重启中',
  stopping: '停止中',
  stopped: '已停止',
  error: '异常',
};

export function Topbar({ onOpenMobile }: { onOpenMobile: () => void }) {
  const location = useLocation();
  const meta = pageMeta(location.pathname);
  const { status, traffic, me, setMode, modePending, statusError } = useApp();
  const coreState = status?.core.state ?? 'starting';
  const running = coreState === 'running';
  const tone = coreState === 'running' ? 'success' : coreState === 'error' ? 'danger' : 'warning';

  return (
    <header className="flex h-[56px] shrink-0 items-center gap-3 border-b border-line/8 bg-surface px-4 sm:px-5">
      <button
        type="button"
        onClick={onOpenMobile}
        className="-ml-1 flex h-8 w-8 items-center justify-center rounded-md text-muted transition hover:bg-surface2 hover:text-ink lg:hidden"
        aria-label="打开菜单"
      >
        <Menu className="h-4.5 w-4.5" />
      </button>

      <h1 className="min-w-0 truncate text-[17px] font-semibold tracking-tight text-ink">{meta.label}</h1>

      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        <div className="hidden items-center gap-3 text-[12px] text-muted md:flex">
          <span className="flex items-center gap-1">
            <ArrowUpRight className="h-3 w-3 text-accent" />
            <span className="tabular text-ink/80">{formatRate(traffic?.up ?? 0)}</span>
          </span>
          <span className="flex items-center gap-1">
            <ArrowDownLeft className="h-3 w-3 text-[rgb(var(--chart-down))]" />
            <span className="tabular text-ink/80">{formatRate(traffic?.down ?? 0)}</span>
          </span>
        </div>

        <Segmented<Mode>
          size="sm"
          value={status?.settings.mode ?? 'rule'}
          disabled={!running || Boolean(modePending)}
          onChange={(mode) => { void setMode(mode); }}
          options={[
            { value: 'rule', label: '规则', icon: <ListFilter className="h-3 w-3" /> },
            { value: 'global', label: '全局', icon: <Globe2 className="h-3 w-3" /> },
            { value: 'direct', label: '直连', icon: <MinusCircle className="h-3 w-3" /> },
          ]}
        />

        <div
          className={cn(
            'flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px]',
            coreState === 'running' && 'text-muted',
            coreState === 'error' && 'text-danger',
            !['running', 'error'].includes(coreState) && 'text-warning',
          )}
          title={status?.core.lastError ?? undefined}
        >
          <StatusDot tone={tone} pulse={coreState === 'running' || coreState === 'starting' || coreState === 'restarting'} />
          <span className="hidden sm:inline">{modePending ? '切换中' : coreLabel[coreState] ?? coreState}</span>
          {statusError ? <span className="hidden sm:inline text-warning">· 离线</span> : null}
        </div>

        <div className="flex items-center gap-2 pl-1" title={me?.local ? '本地开发模式' : me?.username}>
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-surface3 text-[12px] font-medium text-ink/80">
            {initialOf(me?.username || 'M')}
          </span>
          <span className="hidden max-w-[110px] truncate text-[12px] text-muted sm:block">
            {me?.local ? '本地模式' : me?.username || 'admin'}
          </span>
        </div>
      </div>
    </header>
  );
}
