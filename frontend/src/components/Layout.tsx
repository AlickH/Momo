import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { useApp } from '../context/AppContext';
import { Button } from './ui';
import { cn } from '../lib/cn';

export function Layout() {
  const { status, statusError, refreshStatus } = useApp();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const location = useLocation();
  const coreState = status?.core.state ?? 'starting';

  const retry = async () => {
    setRetrying(true);
    try {
      await refreshStatus();
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-bg">
      <Sidebar mobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)} />
      <div className="native-window relative flex min-w-0 flex-1 flex-col overflow-hidden max-lg:rounded-none max-lg:border-0 lg:mb-2 lg:ml-[208px] lg:mr-2 lg:h-[calc(100vh-8px)]">
        <Topbar onOpenMobile={() => setMobileOpen(true)} />
        {coreState !== 'running' || statusError ? (
          <div className={cn(
            'flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-1.5 text-[12px] sm:px-5',
            coreState === 'error' || statusError ? 'border-danger/10 bg-danger/6 text-danger/90' : 'border-warning/10 bg-warning/6 text-warning/90',
          )}>
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0 flex-1 truncate">
              {statusError
                ? `无法获取运行状态：${statusError.message}`
                : coreState === 'error'
                  ? `mihomo 未能运行：${status?.core.lastError || '请查看日志'}`
                  : coreState === 'restarting'
                    ? 'mihomo 正在重启，稍后自动恢复'
                    : coreState === 'stopped'
                      ? 'mihomo 已停止，可在概览或设置中重新启动'
                      : 'mihomo 正在启动'}
            </span>
            <Button variant="ghost" size="sm" icon={<RefreshCw className="h-3 w-3" />} loading={retrying} onClick={retry} className="h-6 px-2 text-[11px]">刷新</Button>
          </div>
        ) : null}
        <main className="scrollbar-thin flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1480px] px-4 py-5 sm:px-5">
            <div key={location.pathname}>
              <Outlet />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
