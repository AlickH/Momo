import { Loader2, Zap } from 'lucide-react';
import { delayTone } from '../lib/format';
import { cn } from '../lib/cn';

export function DelayBadge({
  delay,
  pending = false,
  compact = false,
}: {
  delay: number | null | undefined;
  pending?: boolean;
  compact?: boolean;
}) {
  if (pending) {
    return (
      <span className={cn('inline-flex items-center gap-1 rounded-md border border-line/8 bg-surface3 px-1.5 py-0.5 text-[11px] text-muted', compact && 'px-1 py-0')}>
        <Loader2 className="h-2.5 w-2.5 animate-spin" />
      </span>
    );
  }
  const tone = delayTone(delay);
  const label = delay === null || delay === undefined ? '—' : delay < 0 ? '超时' : `${delay}ms`;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium leading-4 tabular',
        tone === 'good' && 'border-success/20 bg-success/8 text-success',
        tone === 'ok' && 'border-warning/20 bg-warning/8 text-warning',
        tone === 'bad' && 'border-danger/20 bg-danger/8 text-danger',
        tone === 'none' && 'border-line/8 bg-surface3 text-muted',
        compact && 'px-1 py-0 text-[10px]',
      )}
      title={delay === null || delay === undefined ? '尚未测速' : delay < 0 ? '测速失败' : `延迟 ${delay} ms`}
    >
      <Zap className="h-2.5 w-2.5" />
      {label}
    </span>
  );
}
