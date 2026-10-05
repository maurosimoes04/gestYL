import { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function PageHeader({ title, subtitle, actions, className }: {
  title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; className?: string;
}) {
  return (
    <div className={cn('flex justify-between items-end mb-6 pb-4 border-b border-line gap-4 flex-wrap', className)}>
      <div>
        <h2 className="text-2xl font-bold text-ink tracking-tight">{title}</h2>
        {subtitle && <p className="text-sm text-ink-soft mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex gap-2 items-center">{actions}</div>}
    </div>
  );
}
