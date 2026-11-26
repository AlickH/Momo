import {
  useEffect,
  useId,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { Check, Loader2, Search, X } from 'lucide-react';
import { cn } from '../lib/cn';

export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  icon,
  className,
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  loading?: boolean;
  icon?: ReactNode;
}) {
  const variants = {
    primary: 'bg-accent text-white hover:bg-accent/90',
    secondary: 'bg-surface text-ink border border-line/15 hover:border-accent/45 hover:text-accent',
    ghost: 'text-muted hover:text-ink hover:bg-surface3',
    danger: 'bg-danger/10 text-danger border border-danger/25 hover:bg-danger/15',
    outline: 'border border-line/15 text-ink hover:border-accent/45 hover:text-accent',
  };
  const sizes = {
    sm: 'h-8 px-3 text-xs gap-1.5',
    md: 'h-9 px-3.5 text-sm gap-2',
    lg: 'h-11 px-5 text-sm gap-2',
    icon: 'h-9 w-9 p-0',
  };
  return (
    <button
      className={cn(
        'focus-ring inline-flex shrink-0 items-center justify-center rounded-md font-medium transition-all duration-150 disabled:pointer-events-none disabled:opacity-45',
        variants[variant],
        sizes[size],
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}

export function Card({
  className,
  children,
  padded = true,
}: {
  className?: string;
  children: ReactNode;
  padded?: boolean;
}) {
  return <div className={cn('card', padded && 'p-5', className)}>{children}</div>;
}

const toneClasses = {
  neutral: 'bg-surface3 text-muted border-line/8',
  accent: 'bg-accent/10 text-accent border-accent/20',
  info: 'bg-info/10 text-info border-info/20',
  warning: 'bg-warning/10 text-warning border-warning/20',
  danger: 'bg-danger/10 text-danger border-danger/20',
  success: 'bg-success/10 text-success border-success/20',
} as const;

export function Badge({
  tone = 'neutral',
  className,
  children,
}: {
  tone?: keyof typeof toneClasses;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-medium leading-4', toneClasses[tone], className)}>
      {children}
    </span>
  );
}

export function StatusDot({ tone = 'success', pulse = false }: { tone?: 'accent' | 'success' | 'danger' | 'warning' | 'muted'; pulse?: boolean }) {
  const color = {
    accent: 'bg-accent',
    success: 'bg-success',
    danger: 'bg-danger',
    warning: 'bg-warning',
    muted: 'bg-muted',
  }[tone];
  return (
    <span className="relative flex h-2 w-2">
      {pulse && <span className={cn('absolute inline-flex h-full w-full animate-ping rounded-full opacity-40', color)} />}
      <span className={cn('relative inline-flex h-2 w-2 rounded-full', color)} />
    </span>
  );
}

export function Switch({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'focus-ring relative inline-flex h-5.5 w-10 shrink-0 items-center rounded-full border transition-colors duration-200 disabled:opacity-40',
        checked ? 'border-accent bg-accent' : 'border-line/15 bg-surface3',
      )}
      style={{ height: 22, width: 40 }}
    >
      <span
        className={cn(
          'inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200',
          checked ? 'translate-x-[21px] bg-white' : 'translate-x-[3px] bg-white/85',
        )}
      />
    </button>
  );
}

export function ProgressBar({
  value,
  tone = 'accent',
  className,
}: {
  value: number;
  tone?: 'accent' | 'warning' | 'danger' | 'info';
  className?: string;
}) {
  const colors = { accent: 'bg-accent', warning: 'bg-warning', danger: 'bg-danger', info: 'bg-info' };
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-surface3', className)}>
      <div className={cn('h-full rounded-full transition-all duration-500', colors[tone])} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder = '搜索',
  className,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange'> & {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="focus-ring h-9 w-full rounded-lg border border-line/10 bg-surface2/80 pl-9 pr-8 text-sm text-ink placeholder:text-muted/60"
        {...props}
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted hover:text-ink"
          aria-label="清除搜索"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}) {
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);
  if (!open) return null;
  const widths = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl' };
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby={id}>
      <div className="absolute inset-0 bg-black/45" onClick={onClose} />
      <div className={cn('card-solid relative z-10 w-full animate-fade-up overflow-hidden shadow-2xl', widths[size])}>
        <div className="flex items-start justify-between gap-4 border-b border-line/8 px-5 py-4">
          <div className="min-w-0">
            <h2 id={id} className="text-base font-semibold text-ink">{title}</h2>
            {description ? <p className="mt-1 text-xs leading-relaxed text-muted">{description}</p> : null}
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-muted transition hover:bg-surface3 hover:text-ink" aria-label="关闭">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4 scrollbar-thin">{children}</div>
        {footer ? <div className="flex items-center justify-end gap-2 border-t border-line/8 px-5 py-3.5">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmText = '确认',
  danger = false,
  pending = false,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmText?: string;
  danger?: boolean;
  pending?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={(
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={pending}>取消</Button>
          <Button variant={danger ? 'danger' : 'primary'} size="sm" loading={pending} onClick={onConfirm}>{confirmText}</Button>
        </>
      )}
    >
      <div className="text-sm leading-relaxed text-muted">{message}</div>
    </Modal>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      {icon ? <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-line/10 bg-surface2 text-muted">{icon}</div> : null}
      <h3 className="text-sm font-medium text-ink">{title}</h3>
      {description ? <p className="mt-1.5 max-w-sm text-xs leading-relaxed text-muted">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('shimmer rounded-lg', className)} />;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  disabled,
  size = 'md',
}: {
  options: { value: T; label: string; icon?: ReactNode }[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
  size?: 'sm' | 'md';
}) {
  return (
    <div className={cn('inline-flex items-center gap-0.5 rounded-lg border border-line/10 bg-surface2/80 p-0.5', disabled && 'opacity-50')}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          disabled={disabled}
          onClick={() => onChange(option.value)}
          className={cn(
            'focus-ring inline-flex items-center gap-1 rounded-md font-medium transition-all',
            size === 'sm' ? 'h-7 px-2 text-[12px]' : 'h-8 px-3 text-xs',
            value === option.value
              ? 'bg-surface text-ink shadow-sm'
              : 'text-muted hover:text-ink',
          )}
        >
          {option.icon}
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function CopyButton({ text, label = '复制' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="ghost"
      size="sm"
      icon={copied ? <Check className="h-3.5 w-3.5 text-accent" /> : undefined}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        } catch {
          setCopied(false);
        }
      }}
    >
      {copied ? '已复制' : label}
    </Button>
  );
}
