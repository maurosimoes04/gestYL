import { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

type Variant =
  | 'brand' | 'good' | 'bad' | 'warn' | 'info' | 'neutral'
  | 'fornecedor' | 'financiador' | 'pessoa' | 'socio' | 'cliente'
  | 'subsidio' | 'investimento' | 'projeto';

const styles: Record<Variant, string> = {
  brand:        'bg-brand-soft text-brand',
  good:         'bg-good-soft text-good-ink',
  bad:          'bg-bad-soft text-bad-ink',
  warn:         'bg-warn-soft text-warn-ink',
  info:         'bg-info-soft text-info-ink',
  neutral:      'bg-surface-alt text-ink-soft',
  fornecedor:   'bg-warn-soft text-warn-ink',
  financiador:  'bg-info-soft text-info-ink',
  pessoa:       'bg-brand-soft text-brand',
  socio:        'bg-good-soft text-good-ink',
  cliente:      'bg-pink-100 text-pink-700',
  subsidio:     'bg-brand-soft text-brand',
  investimento: 'bg-warn-soft text-warn-ink',
  projeto:      'bg-info-soft text-info-ink',
};

interface Props extends HTMLAttributes<HTMLSpanElement> {
  variant?: Variant;
  dot?: boolean;
  children: ReactNode;
}

export function Badge({ variant = 'neutral', dot, className, children, ...rest }: Props) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[0.68rem] font-semibold uppercase tracking-wider',
      styles[variant], className,
    )} {...rest}>
      {dot && <span className="w-1.5 h-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

/** Badge monoespaçado para códigos SNC — ex: `75`, `6262` */
export function SncBadge({ codigo, className }: { codigo: string; className?: string }) {
  return <span className={cn('font-mono text-[0.72rem] px-1.5 py-0.5 rounded bg-brand-soft text-brand', className)}>{codigo}</span>;
}

/** Mapeia um estado textual à variante semântica correta */
export function estadoVariant(estado?: string | null): Variant {
  const s = (estado || '').toLowerCase();
  if (['pago', 'paga', 'recebido', 'enviado', 'concluído', 'concluido', 'ativo'].includes(s)) return 'good';
  if (['pendente', 'previsto', 'em curso'].includes(s)) return 'neutral';
  if (['anexado', 'pedido submetido'].includes(s)) return 'info';
  if (['em atraso', 'atraso', 'cancelado', 'vencido'].includes(s)) return 'bad';
  return 'neutral';
}
