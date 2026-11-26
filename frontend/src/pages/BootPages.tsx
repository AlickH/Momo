import { ArrowRight, RefreshCw, ServerCrash, ShieldAlert } from 'lucide-react';
import { Logo } from '../components/Logo';
import { Button } from '../components/ui';

export function BootSplash() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-bg">
      <div className="relative">
        <div className="absolute inset-0 animate-ping rounded-2xl bg-accent/10" />
        <Logo size={64} className="relative animate-pulse-soft" />
      </div>
      <div className="text-center">
        <p className="text-sm font-medium tracking-wide text-ink">正在连接 Momo</p>
        <p className="mt-1 text-[12px] text-muted">加载 mihomo 内核状态…</p>
      </div>
    </div>
  );
}

export function BootError({ message, onRetry, pending }: { message: string; onRetry: () => void; pending?: boolean }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg p-5">
      <div className="card w-full max-w-md p-7 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-danger/15 bg-danger/8 text-danger">
          <ServerCrash className="h-6 w-6" />
        </div>
        <h1 className="mt-4 text-base font-semibold text-ink">服务暂时不可用</h1>
        <p className="mt-2 break-words text-xs leading-relaxed text-muted">{message}</p>
        <Button variant="primary" className="mt-5" icon={<RefreshCw className="h-4 w-4" />} loading={pending} onClick={onRetry}>重新连接</Button>
        <p className="mt-4 text-[11px] leading-relaxed text-muted/60">请确认应用已启动，并通过飞牛 fnOS 统一网关访问。</p>
      </div>
    </div>
  );
}

export function DeniedPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg p-5">
      <div className="card w-full max-w-md p-7 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-warning/15 bg-warning/8 text-warning">
          <ShieldAlert className="h-6 w-6" />
        </div>
        <h1 className="mt-4 text-base font-semibold text-ink">仅限管理员访问</h1>
        <p className="mt-2 text-xs leading-relaxed text-muted">代理配置会影响整个 NAS 的网络出口。请使用飞牛 fnOS 管理员账户打开该应用。</p>
        <a href="/" className="mt-5 inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:underline">
          返回桌面 <ArrowRight className="h-3.5 w-3.5" />
        </a>
      </div>
    </div>
  );
}

export function CoreUnavailable({ message, onRetry, pending }: { message: string; onRetry: () => void; pending?: boolean }) {
  return (
    <div className="card flex flex-col items-center p-5 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-danger/15 bg-danger/8 text-danger">
        <ServerCrash className="h-5 w-5" />
      </div>
      <p className="mt-3 text-sm font-medium text-ink">mihomo 未运行</p>
      <p className="mt-1 max-w-sm break-words text-[12px] leading-relaxed text-muted">{message}</p>
      <Button variant="secondary" size="sm" className="mt-3" icon={<RefreshCw className="h-3.5 w-3.5" />} loading={pending} onClick={onRetry}>重试启动</Button>
    </div>
  );
}
