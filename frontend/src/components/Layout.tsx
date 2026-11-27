import { useEffect, useRef, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { useApp } from '../context/AppContext';
import { Button, Modal } from './ui';
import { cn } from '../lib/cn';

export function Layout() {
  const { status, statusError, refreshStatus } = useApp();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const prefixRef = useRef(false);
  const prefixTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const coreState = status?.core.state ?? 'starting';

  useEffect(() => {
    const isTyping = (target: EventTarget | null) => {
      const element = target as HTMLElement | null;
      if (!element) return false;
      const tag = element.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || element.isContentEditable;
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTyping(event.target)) return;
      if (event.key === '?') {
        event.preventDefault();
        setShortcutsOpen((value) => !value);
        return;
      }
      if (event.key === 'Escape') {
        setShortcutsOpen(false);
        prefixRef.current = false;
        return;
      }
      if (prefixRef.current) {
        const routes: Record<string, string> = {
          o: '/',
          p: '/proxies',
          s: '/profiles',
          c: '/connections',
          r: '/rules',
          l: '/logs',
          e: '/settings',
        };
        if (routes[event.key]) {
          event.preventDefault();
          navigate(routes[event.key]);
        }
        prefixRef.current = false;
        if (prefixTimer.current) clearTimeout(prefixTimer.current);
        return;
      }
      if (event.key === 'g') {
        prefixRef.current = true;
        if (prefixTimer.current) clearTimeout(prefixTimer.current);
        prefixTimer.current = setTimeout(() => { prefixRef.current = false; }, 1000);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      if (prefixTimer.current) clearTimeout(prefixTimer.current);
    };
  }, [navigate]);

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
      <Modal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} title="键盘快捷键" description="按 g 后松开，再按对应字母。">
        <div className="space-y-2 text-[12px]">
          {[
            ['g o', '概览'],
            ['g p', '代理'],
            ['g s', '订阅'],
            ['g c', '连接'],
            ['g r', '规则'],
            ['g l', '日志'],
            ['g e', '设置'],
            ['?', '打开/关闭快捷键'],
            ['Esc', '关闭弹窗'],
          ].map(([key, label]) => (
            <div key={key} className="flex items-center justify-between border-b border-line/6 py-1.5 last:border-0">
              <span className="text-muted">{label}</span>
              <kbd className="rounded border border-line/15 bg-surface2 px-1.5 py-0.5 mono text-[10px] text-ink">{key}</kbd>
            </div>
          ))}
        </div>
      </Modal>
    </div>
  );
}
