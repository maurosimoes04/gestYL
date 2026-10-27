import { useEffect, useRef, useCallback } from 'react';

const PREFIX = 'yl-draft:';

export function useFormDraft<T extends Record<string, any>>(key: string, isNew: boolean) {
  const storageKey = PREFIX + key;
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const load = useCallback((): Partial<T> | null => {
    if (!isNew) return null;
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return null;
      const { data, ts } = JSON.parse(raw);
      if (Date.now() - ts > 7 * 24 * 60 * 60 * 1000) {
        localStorage.removeItem(storageKey);
        return null;
      }
      return data as Partial<T>;
    } catch { return null; }
  }, [storageKey, isNew]);

  const save = useCallback((data: T) => {
    if (!isNew) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      try { localStorage.setItem(storageKey, JSON.stringify({ data, ts: Date.now() })); } catch {}
    }, 400);
  }, [storageKey, isNew]);

  const clear = useCallback(() => {
    try { localStorage.removeItem(storageKey); } catch {}
  }, [storageKey]);

  const hasDraft = useCallback((): boolean => {
    if (!isNew) return false;
    try { return localStorage.getItem(storageKey) !== null; } catch { return false; }
  }, [storageKey, isNew]);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  return { load, save, clear, hasDraft };
}
