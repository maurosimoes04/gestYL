import { createContext, useCallback, useContext, useState, ReactNode } from 'react';
import { cn } from '@/lib/cn';

type ToastType = 'success' | 'error' | 'info';
interface Toast { id: number; type: ToastType; message: string; }

const ToastCtx = createContext<{ toast: (msg: string, type?: ToastType) => void }>({ toast: () => {} });
export const useToast = () => useContext(ToastCtx);

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toast = useCallback((message: string, type: ToastType = 'success') => {
    const id = nextId++;
    setToasts(ts => [...ts, { id, type, message }]);
    setTimeout(() => setToasts(ts => ts.filter(t => t.id !== id)), 4500);
  }, []);
  return (
    <ToastCtx.Provider value={{ toast }}>
      {children}
      <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 max-w-sm">
        {toasts.map(t => (
          <div key={t.id} className={cn(
            'rounded-lg shadow-card border px-4 py-3 text-sm font-medium flex items-start gap-2',
            t.type === 'success' && 'bg-good-soft text-good-ink border-good/30',
            t.type === 'error'   && 'bg-bad-soft text-bad-ink border-bad/30',
            t.type === 'info'    && 'bg-info-soft text-info-ink border-info/30',
          )}>
            <span className="flex-1">{t.message}</span>
            <button onClick={() => setToasts(ts => ts.filter(x => x.id !== t.id))} className="opacity-60 hover:opacity-100">×</button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
