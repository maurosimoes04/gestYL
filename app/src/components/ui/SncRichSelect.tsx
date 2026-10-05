import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { useCatalogos } from '@/hooks/useCatalogos';
import { cn } from '@/lib/cn';
import type { ContaSNC } from '@/lib/types';

interface Props {
  value: number | '' | null;
  onChange: (id: number | null) => void;
  tipo?: 'proveito' | 'gasto' | 'ativo' | 'passivo' | 'capital';
  required?: boolean;
}

/**
 * Dropdown rico de ContaSNC — mostra código + nome + pergunta de decisão em cada opção,
 * agrupado por família, pesquisável. Substitui o `<select>` nativo onde a decisão é delicada.
 */
export function SncRichSelect({ value, onChange, tipo }: Props) {
  const { contas } = useCatalogos();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const selecionada = value ? contas.find(c => c.id === value) : null;

  const porFamilia = useMemo(() => {
    const query = q.trim().toLowerCase();
    const base = contas.filter(c => (!tipo || c.tipo === tipo));
    const filtradas = query
      ? base.filter(c => `${c.codigo} ${c.nome} ${c.pergunta || ''}`.toLowerCase().includes(query))
      : base;
    const grp: Record<string, ContaSNC[]> = {};
    for (const c of filtradas) (grp[c.familia] ||= []).push(c);
    return grp;
  }, [contas, tipo, q]);

  return (
    <div ref={ref} className="relative">
      <button type="button"
              onClick={() => setOpen(o => !o)}
              className={cn(
                'w-full flex items-center justify-between gap-2 px-3 py-2 text-sm bg-white border border-line rounded-md',
                'hover:border-ink-muted transition-colors',
                open && 'border-brand ring-2 ring-brand/20',
                !selecionada && 'text-ink-muted',
              )}>
        {selecionada
          ? <span className="truncate text-ink"><span className="font-mono text-xs bg-brand-soft text-brand px-1.5 py-0.5 rounded mr-2">{selecionada.codigo}</span>{selecionada.nome}</span>
          : <span>Selecionar conta SNC…</span>}
        <ChevronDown className={cn('w-4 h-4 text-brand transition-transform shrink-0', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-full bg-white border border-line rounded-md shadow-lg max-h-[26rem] flex flex-col">
          <div className="p-2 border-b border-line-soft">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" />
              <input autoFocus
                     value={q}
                     onChange={e => setQ(e.target.value)}
                     placeholder="Pesquisar código, nome ou pergunta…"
                     className="w-full pl-8 pr-2 py-1.5 text-sm border border-line rounded focus:outline-none focus:border-brand" />
            </div>
          </div>

          <div className="overflow-y-auto">
            {Object.keys(porFamilia).length === 0 && (
              <div className="p-6 text-center text-sm text-ink-soft">Sem resultados.</div>
            )}
            {Object.entries(porFamilia).map(([fam, lista]) => (
              <div key={fam}>
                <div className="sticky top-0 bg-surface-page px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-ink-soft border-b border-line-soft">
                  {fam}
                </div>
                {lista.map(c => (
                  <button type="button"
                          key={c.id}
                          onClick={() => { onChange(c.id); setOpen(false); setQ(''); }}
                          className={cn(
                            'w-full text-left px-3 py-2.5 border-b border-line-soft/50 hover:bg-brand-soft transition-colors',
                            value === c.id && 'bg-brand-soft',
                          )}>
                    <div className="flex items-start gap-2">
                      <span className="font-mono text-xs bg-brand-soft text-brand px-1.5 py-0.5 rounded shrink-0 mt-0.5">{c.codigo}</span>
                      <div className="flex-1 min-w-0">
                        <div className={cn('text-sm font-medium text-ink', value === c.id && 'text-brand')}>{c.nome}</div>
                        {c.pergunta && <div className="text-xs text-ink-soft mt-0.5 leading-relaxed">{c.pergunta}</div>}
                        {c.naturezaInvestimento && (
                          <div className="text-[0.68rem] text-warn-ink uppercase tracking-wider font-bold mt-1">⚠ Natureza de investimento</div>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
