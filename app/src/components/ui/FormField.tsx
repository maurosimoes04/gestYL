import { ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface Props {
  label: ReactNode;
  required?: boolean;
  hint?: ReactNode;
  error?: ReactNode;
  className?: string;
  children: ReactNode;
}

export function FormField({ label, required, hint, error, className, children }: Props) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label className="text-sm font-medium text-ink flex items-center gap-1">
        {label}
        {required && <span className="text-bad">*</span>}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-ink-soft">{hint}</p>}
      {error && <p className="text-xs text-bad-ink">{error}</p>}
    </div>
  );
}

export function FormGrid({ children, cols = 2, className }: { children: ReactNode; cols?: 1 | 2 | 3; className?: string }) {
  const map = { 1: 'grid-cols-1', 2: 'grid-cols-1 md:grid-cols-2', 3: 'grid-cols-1 md:grid-cols-3' };
  return <div className={cn('grid gap-3', map[cols], className)}>{children}</div>;
}

export function FormSection({ title, children, className, accent }: { title?: string; children: ReactNode; className?: string; accent?: boolean }) {
  return (
    <div className={cn(
      'rounded-lg border p-4 mb-4 bg-white',
      accent ? 'border-brand/40 ring-1 ring-brand/10' : 'border-line',
      className,
    )}>
      {title && (
        <div className={cn(
          'text-xs font-semibold uppercase tracking-wider mb-3 flex items-center gap-2',
          accent ? 'text-brand' : 'text-ink-soft',
        )}>
          {accent && <span className="w-1.5 h-1.5 rounded-full bg-brand" />}
          {title}
        </div>
      )}
      {children}
    </div>
  );
}
