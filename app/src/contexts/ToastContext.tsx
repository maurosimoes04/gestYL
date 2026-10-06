import { createContext, useCallback, useContext, useRef, useState, ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Loader2, CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info' | 'loading';
interface Toast { id: number; type: ToastType; message: string; sticky?: boolean }

interface ToastApi {
  toast: (msg: string, type?: ToastType) => number;
  loading: (msg: string) => number;
  success: (msg: string, id?: number) => number;
  error: (msg: string, id?: number) => number;
  info: (msg: string, id?: number) => number;
  dismiss: (id: number) => void;
  /** Encadeia um toast loading → success/error em torno de uma Promise. */
  promise: <T>(p: Promise<T>, msgs: { loading: string; success?: string | ((v: T) => string); error?: string | ((e: any) => string) }) => Promise<T>;
}

const ToastCtx = createContext<ToastApi>({} as any);
export const useToast = () => useContext(ToastCtx);

let nextId = 1;
const AUTO_DISMISS_MS = 4500;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: number) => {
    setToasts((ts) => ts.filter((t) => t.id !== id));
    const t = timers.current.get(id);
    if (t) { clearTimeout(t); timers.current.delete(id); }
  }, []);

  const schedule = useCallback((id: number) => {
    const t = setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
    timers.current.set(id, t);
  }, [dismiss]);

  const push = useCallback((message: string, type: ToastType = 'success', opts?: { sticky?: boolean; id?: number }) => {
    // Se um id foi fornecido, atualiza em vez de criar
    if (opts?.id != null) {
      const existingId = opts.id;
      setToasts((ts) => ts.map((t) => (t.id === existingId ? { ...t, message, type, sticky: !!opts.sticky } : t)));
      // Limpa timer anterior
      const prev = timers.current.get(existingId);
      if (prev) { clearTimeout(prev); timers.current.delete(existingId); }
      if (!opts.sticky) schedule(existingId);
      return existingId;
    }
    const id = nextId++;
    setToasts((ts) => [...ts, { id, type, message, sticky: !!opts?.sticky }]);
    if (!opts?.sticky) schedule(id);
    return id;
  }, [schedule]);

  const toast = useCallback((msg: string, type: ToastType = 'success') => push(msg, type), [push]);
  const loading = useCallback((msg: string) => push(msg, 'loading', { sticky: true }), [push]);
  const success = useCallback((msg: string, id?: number) => push(msg, 'success', { id }), [push]);
  const error   = useCallback((msg: string, id?: number) => push(msg, 'error',   { id }), [push]);
  const info    = useCallback((msg: string, id?: number) => push(msg, 'info',    { id }), [push]);

  const promise = useCallback(async <T,>(
    p: Promise<T>,
    msgs: { loading: string; success?: string | ((v: T) => string); error?: string | ((e: any) => string) },
  ): Promise<T> => {
    const id = push(msgs.loading, 'loading', { sticky: true });
    try {
      const v = await p;
      const okMsg = typeof msgs.success === 'function' ? msgs.success(v) : (msgs.success ?? 'Pronto');
      push(okMsg, 'success', { id });
      return v;
    } catch (e: any) {
      const errMsg = typeof msgs.error === 'function' ? msgs.error(e) : (msgs.error ?? (e?.message || 'Ocorreu um erro'));
      push(errMsg, 'error', { id });
      throw e;
    }
  }, [push]);

  return (
    <ToastCtx.Provider value={{ toast, loading, success, error, info, dismiss, promise }}>
      {children}
      <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 w-full max-w-sm px-4 sm:px-0 pointer-events-none">
        {toasts.map((t) => <ToastItem key={t.id} t={t} onClose={() => dismiss(t.id)} />)}
      </div>
    </ToastCtx.Provider>
  );
}

function ToastItem({ t, onClose }: { t: Toast; onClose: () => void }) {
  const Icon = t.type === 'loading' ? Loader2
             : t.type === 'success' ? CheckCircle2
             : t.type === 'error'   ? AlertTriangle
             : Info;
  return (
    <div className={cn(
      'rounded-lg shadow-card border px-4 py-3 text-sm font-medium flex items-start gap-2 pointer-events-auto transition-all',
      t.type === 'success' && 'bg-good-soft text-good-ink border-good/30',
      t.type === 'error'   && 'bg-bad-soft text-bad-ink border-bad/30',
      t.type === 'info'    && 'bg-info-soft text-info-ink border-info/30',
      t.type === 'loading' && 'bg-brand-soft text-brand border-brand/30',
    )}>
      <Icon className={cn('w-4 h-4 shrink-0 mt-0.5', t.type === 'loading' && 'animate-spin')} />
      <span className="flex-1 leading-snug">{t.message}</span>
      {!t.sticky && (
        <button onClick={onClose} className="opacity-60 hover:opacity-100 -mr-1 -mt-0.5">
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
