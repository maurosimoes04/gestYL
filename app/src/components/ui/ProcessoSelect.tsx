import { useMemo } from 'react';
import { Select } from '@/components/ui/Input';
import { useCatalogos } from '@/hooks/useCatalogos';

interface Props {
  value: number | null;
  onChange: (v: number | null) => void;
  /** Se definido, só mostra processos destes tipos. */
  tipos?: Array<'Evento' | 'Projeto Anual' | 'Investimento' | 'Subsídio'>;
  /** Esconder processos concluídos/cancelados por omissão (ativos primeiro). */
  incluirFechados?: boolean;
  required?: boolean;
  placeholder?: string;
}

/**
 * Select de Processo (ex-Evento) agrupado por tipo e com estado sinalizado.
 * Reutilizado em despesas, receitas e qualquer outro form que ligue um registo
 * a um processo da organização.
 */
export function ProcessoSelect({ value, onChange, tipos, incluirFechados, required, placeholder = '— sem processo —' }: Props) {
  const { processos } = useCatalogos();

  const grupos = useMemo(() => {
    const filtrados = processos.filter(p =>
      (!tipos || tipos.includes(p.tipo)) &&
      (incluirFechados || p.estado === 'Em curso'),
    );
    const porTipo: Record<string, typeof filtrados> = {};
    for (const p of filtrados) {
      (porTipo[p.tipo] ||= []).push(p);
    }
    for (const k of Object.keys(porTipo)) {
      porTipo[k].sort((a, b) => a.nome.localeCompare(b.nome, 'pt'));
    }
    // Ordem fixa dos tipos
    const ordem = ['Evento', 'Projeto Anual', 'Investimento', 'Subsídio'];
    return ordem.filter(t => porTipo[t]?.length).map(t => ({ tipo: t, items: porTipo[t] }));
  }, [processos, tipos, incluirFechados]);

  return (
    <Select
      value={value ?? ''}
      onChange={e => onChange(e.target.value ? Number(e.target.value) : null)}
      required={required}
    >
      {!required && <option value="">{placeholder}</option>}
      {required && !value && <option value="" disabled>Selecionar…</option>}
      {grupos.map(g => (
        <optgroup key={g.tipo} label={g.tipo}>
          {g.items.map(p => (
            <option key={p.id} value={p.id}>
              {p.nome}{p.estado !== 'Em curso' ? ` (${p.estado})` : ''}
            </option>
          ))}
        </optgroup>
      ))}
    </Select>
  );
}
