import { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  interactive?: boolean;
  accent?: 'good' | 'bad' | 'warn' | 'brand' | 'info';
}

const accents = {
  good: 'border-l-4 border-l-good',
  bad:  'border-l-4 border-l-bad',
  warn: 'border-l-4 border-l-warn',
  brand:'border-l-4 border-l-brand',
  info: 'border-l-4 border-l-info',
};

export function Card({ interactive, accent, className, children, ...rest }: CardProps) {
  return (
    <div
      className={cn(
        'bg-white rounded-lg border border-line shadow-soft p-5',
        interactive && 'cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-card hover:border-ink-muted',
        accent && accents[accent],
        className,
      )}
      {...rest}
    >{children}</div>
  );
}

export function KPI({ label, value, delta, deltaColor, accent, mono = true, hint }: {
  label: string; value: ReactNode; delta?: ReactNode; deltaColor?: 'good' | 'bad' | 'warn' | 'neutral';
  accent?: CardProps['accent']; mono?: boolean; hint?: string;
}) {
  return (
    <Card accent={accent} className="p-4">
      <div className="text-xs uppercase tracking-wider text-ink-soft font-semibold">{label}</div>
      <div className={cn('text-2xl font-bold mt-1 tracking-tight', mono && 'tabular')}>{value}</div>
      {delta && <div className={cn('text-xs font-semibold mt-1',
        deltaColor === 'good' && 'text-good', deltaColor === 'bad' && 'text-bad',
        deltaColor === 'warn' && 'text-warn-ink', deltaColor === 'neutral' && 'text-ink-soft',
      )}>{delta}</div>}
      {hint && <div className="text-xs text-ink-soft mt-1">{hint}</div>}
    </Card>
  );
}
