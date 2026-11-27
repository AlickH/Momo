import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Loader2, Monitor, Moon, Play, RotateCw, Square, Sun, X } from 'lucide-react';
import { NAV_ITEMS } from '../lib/nav';
import { cn } from '../lib/cn';
import { useApp } from '../context/AppContext';
import { ConfirmDialog, StatusDot } from './ui';
import { api } from '../lib/api';
import { useToast } from '../context/ToastContext';
import { shortCoreVersion } from '../lib/format';

const stateLabel: Record<string, string> = {
  running: '运行中',
  starting: '启动中',
  restarting: '重启中',
  stopping: '停止中',
  stopped: '已停止',
  error: '异常',
};

export function Sidebar({ mobileOpen, onCloseMobile }: { mobileOpen: boolean; onCloseMobile: () => void }) {
  const { status, theme, themeMode, toggleTheme, setThemeMode, refreshStatus } = useApp();
  const { toast } = useToast();
  const [coreBusy, setCoreBusy] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);
  const coreState = status?.core.state ?? 'starting';
  const tone = coreState === 'running' ? 'success' : coreState === 'error' ? 'danger' : 'warning';
  const ThemeIcon = themeMode === 'auto' ? Monitor : theme === 'dark' ? Moon : Sun;

  const runCoreAction = async (action: 'start' | 'stop' | 'restart') => {
    setCoreBusy(true);
    try {
      await api.post(`core/${action}`, undefined, { timeoutMs: 90000 });
      await refreshStatus();
      setConfirmStop(false);
      toast(action === 'start' ? 'mihomo 内核已启动' : action === 'stop' ? 'mihomo 内核已停止' : 'mihomo 内核已重启', 'success');
    } catch (error) {
      toast(error instanceof Error ? error.message : '操作失败', 'error');
    } finally {
      setCoreBusy(false);
    }
  };

  const cycleTheme = () => {
    if (themeMode === 'auto') {
      toggleTheme();
    } else if (themeMode === 'dark' && theme === 'dark') {
      setThemeMode('light');
    } else if (themeMode === 'light' && theme === 'light') {
      setThemeMode('auto');
    } else {
      toggleTheme();
    }
  };

  return (
    <>
      {mobileOpen ? (
        <button type="button" aria-label="关闭菜单" className="fixed inset-0 z-40 bg-black/45 lg:hidden" onClick={onCloseMobile} />
      ) : null}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-[250px] flex-col bg-bg transition-transform duration-200 ease-out lg:z-30 lg:w-[200px] lg:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-10 shrink-0 items-center justify-end px-2 pt-2 lg:hidden">
          <button type="button" onClick={onCloseMobile} className="rounded p-1.5 text-muted hover:bg-surface2 hover:text-ink" aria-label="关闭菜单">
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 pt-2 no-scrollbar">
          <div className="space-y-0.5">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.path === '/'}
                  onClick={onCloseMobile}
                  className={({ isActive }) => cn('nav-item', isActive && 'nav-item-active')}
                >
                  <Icon className="h-4 w-4 shrink-0" strokeWidth={1.8} />
                  <span className="truncate">{item.label}</span>
                </NavLink>
              );
            })}
          </div>
        </nav>

        <div className="shrink-0 px-2 pb-3 pt-2">
          <div className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[12px] text-muted">
            <StatusDot tone={tone} pulse={coreState === 'running'} />
            <span className="truncate">{stateLabel[coreState] ?? coreState}</span>
            <span className="ml-auto max-w-[90px] truncate font-mono text-[10px] text-muted/70" title={status?.core.version ?? ''}>{shortCoreVersion(status?.core.version)}</span>
          </div>
          <div className="mt-1 flex items-center gap-1 px-1">
            {coreState === 'running' ? (
              <>
                <button type="button" disabled={coreBusy} onClick={() => setConfirmStop(true)} className="flex h-7 flex-1 items-center justify-center gap-1 rounded-md border border-line/10 text-[10px] text-muted transition hover:border-danger/20 hover:bg-danger/5 hover:text-danger disabled:opacity-40" title="停止内核">
                  {coreBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Square className="h-3 w-3" />}停止
                </button>
                <button type="button" disabled={coreBusy} onClick={() => { void runCoreAction('restart'); }} className="flex h-7 flex-1 items-center justify-center gap-1 rounded-md border border-line/10 text-[10px] text-muted transition hover:border-accent/20 hover:bg-accent/5 hover:text-accent disabled:opacity-40" title="重启内核">
                  <RotateCw className={cn('h-3 w-3', coreBusy && 'animate-spin')} />重启
                </button>
              </>
            ) : (
              <button type="button" disabled={coreBusy || ['starting', 'stopping', 'restarting'].includes(coreState)} onClick={() => { void runCoreAction('start'); }} className="flex h-7 w-full items-center justify-center gap-1 rounded-md border border-line/10 text-[10px] text-muted transition hover:border-success/20 hover:bg-success/5 hover:text-success disabled:opacity-40" title="启动内核">
                {coreBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}启动
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={cycleTheme}
            className="mt-0.5 flex h-8 w-full items-center gap-2 rounded-lg px-2 text-[12px] text-muted transition hover:bg-surface2 hover:text-ink"
            title={themeMode === 'auto' ? '主题：跟随系统' : themeMode === 'dark' ? '主题：深色' : '主题：浅色'}
          >
            <ThemeIcon className="h-3.5 w-3.5" />
            <span>{themeMode === 'auto' ? '跟随系统' : theme === 'dark' ? '深色模式' : '浅色模式'}</span>
          </button>
          <div className="px-2 pt-1 text-[10px] text-muted/50">Momo v{status?.app.version ?? '1.0.0'}</div>
        </div>
      </aside>
      <ConfirmDialog
        open={confirmStop}
        title="停止内核"
        message="停止后代理端口将不再监听，所有客户端会立即断开。配置和订阅不会丢失，可以随时重新启动。确定停止吗？"
        confirmText="停止"
        danger
        pending={coreBusy}
        onClose={() => { if (!coreBusy) setConfirmStop(false); }}
        onConfirm={() => { void runCoreAction('stop'); }}
      />
    </>
  );
}
