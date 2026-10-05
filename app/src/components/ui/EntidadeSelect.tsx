import { useMemo, useRef, useState, useEffect } from 'react';
import { Input } from './Input';
import { useCatalogos } from '@/hooks/useCatalogos';
import { cn } from '@/lib/cn';

interface Props {
  value: number | null;
  onChange: (id: number | null) => void;
  tipo?: 'fornecedor' | 'financiador' | 'pessoa-interna' | 'socio' | 'cliente';
  placeholder?: string;
  id?: string;
  required?: boolean;
}

/** Autocomplete pesquisável sobre a lista de entidades. */
export function EntidadeSelect({ value, onChange, tipo, placeholder, id, required }: Props) {
  const { entidades } = useCatalogos();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const filtradas = useMemo(() => {
    const base = tipo ? entidades.filter(e => (e.tipos || []).includes(tipo)) : entidades;
    const query = q.trim().toLowerCase();
    if (!query) return base.slice(0, 100);
    return base.filter(e => (e.nome.toLowerCase().includes(query) || (e.nif || '').toLowerCase().includes(query))).slice(0, 50);
  }, [entidades, tipo, q]);

  const selecionada = value ? entidades.find(e => e.id === value) : null;

  // Mostrar label da entidade selecionada quando fechado; pesquisa quando aberto.
  const display = open ? q : (selecionada ? (selecionada.nif ? `${selecionada.nome} [${selecionada.nif}]` : selecionada.nome) : '');

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <Input
        id={id}
        value={display}
        required={required}
        placeholder={placeholder || 'Nome ou NIF…'}
        autoComplete="off"
        onFocus={() => { setOpen(true); setQ(''); }}
        onChange={e => { setQ(e.target.value); setOpen(true); }}
      />
      {open && (
        <div className="absolute z-20 mt-1 w-full max-h-80 overflow-y-auto bg-white border border-line rounded-md shadow-card">
          {filtradas.length === 0 && (
            <div className="px-3 py-3 text-sm text-ink-soft">Sem resultados.</div>
          )}
          {filtradas.map(e => (
            <button
              type="button"
              key={e.id}
              onClick={() => { onChange(e.id); setOpen(false); setQ(''); }}
              className={cn(
                'w-full text-left px-3 py-2 text-sm hover:bg-brand-soft hover:text-brand flex justify-between items-center gap-2',
                value === e.id && 'bg-brand-soft text-brand',
              )}>
              <span className="font-medium truncate">{e.nome}</span>
              {e.nif && <span className="font-mono text-xs text-ink-muted shrink-0">{e.nif}</span>}
            </button>
          ))}
          {value && (
            <button type="button" onClick={() => { onChange(null); setOpen(false); setQ(''); }}
                    className="w-full px-3 py-2 text-xs text-bad-ink hover:bg-bad-soft border-t border-line">
              Limpar seleção
            </button>
          )}
        </div>
      )}
    </div>
  );
}
