import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';

type ToastTone = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}

interface ToastContextValue {
  toast: (message: string, tone?: ToastTone) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const toast = useCallback((message: string, tone: ToastTone = 'info') => {
    const id = nextId.current++;
    setItems((prev) => [...prev.slice(-3), { id, message, tone }]);
    window.setTimeout(() => dismiss(id), 4200);
  }, [dismiss]);

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed left-1/2 top-4 z-[80] flex w-[min(420px,calc(100vw-2rem))] -translate-x-1/2 flex-col gap-2">
        {items.map((item) => {
          const Icon = item.tone === 'success' ? CheckCircle2 : item.tone === 'error' ? AlertTriangle : Info;
          const color = item.tone === 'success' ? 'text-accent' : item.tone === 'error' ? 'text-danger' : 'text-info';
          return (
            <div
              key={item.id}
              className="pointer-events-auto flex items-start gap-2.5 rounded-lg border border-line/10 bg-surface px-3.5 py-2.5 text-[14px] shadow-lg animate-fade-up"
            >
              <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${color}`} />
              <p className="min-w-0 flex-1 leading-relaxed text-ink/90">{item.message}</p>
              <button
                type="button"
                onClick={() => dismiss(item.id)}
                className="rounded p-0.5 text-muted transition hover:text-ink"
                aria-label="关闭提示"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within ToastProvider');
  return context;
}
