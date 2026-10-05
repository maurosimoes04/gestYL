import { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className="rounded-lg border border-line bg-white overflow-hidden">
      <div className="overflow-x-auto">
        <table className={cn('w-full text-sm', className)}>{children}</table>
      </div>
    </div>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return (
    <thead className="bg-surface-alt">
      <tr>{children}</tr>
    </thead>
  );
}

export function TH({ children, className, align = 'left' }: { children?: ReactNode; className?: string; align?: 'left' | 'right' | 'center' }) {
  return (
    <th className={cn(
      'px-4 py-2.5 text-ink-soft font-semibold uppercase tracking-wider text-[0.7rem]',
      align === 'right' && 'text-right', align === 'center' && 'text-center', align === 'left' && 'text-left',
      className,
    )}>{children}</th>
  );
}

export function TBody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-line-soft">{children}</tbody>;
}

export function TR({ children, onClick, className }: { children: ReactNode; onClick?: () => void; className?: string }) {
  return (
    <tr onClick={onClick} className={cn(onClick && 'cursor-pointer hover:bg-surface-page', className)}>
      {children}
    </tr>
  );
}

export function TD({ children, className, align = 'left', mono = false }: { children?: ReactNode; className?: string; align?: 'left' | 'right' | 'center'; mono?: boolean }) {
  return (
    <td className={cn(
      'px-4 py-3 text-ink',
      align === 'right' && 'text-right', align === 'center' && 'text-center',
      mono && 'tabular font-mono text-xs',
      className,
    )}>{children}</td>
  );
}

export function Empty({ children, icon }: { children: ReactNode; icon?: ReactNode }) {
  return (
    <div className="py-16 text-center text-ink-soft">
      {icon && <div className="flex justify-center mb-3 opacity-60">{icon}</div>}
      <p className="text-sm">{children}</p>
    </div>
  );
}
