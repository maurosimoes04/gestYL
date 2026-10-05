import { useMemo } from 'react';
import { Select } from './Input';
import { useCatalogos } from '@/hooks/useCatalogos';

interface Props {
  value: number | '';
  onChange: (id: number | null) => void;
  tipo?: 'proveito' | 'gasto' | 'ativo' | 'passivo' | 'capital';
  required?: boolean;
  id?: string;
}

/** Dropdown agrupado por família com contas SNC filtradas por tipo. */
export function SncSelect({ value, onChange, tipo, required, id }: Props) {
  const { contas } = useCatalogos();
  const porFamilia = useMemo(() => {
    const map: Record<string, typeof contas> = {};
    for (const c of contas) {
      if (tipo && c.tipo !== tipo) continue;
      (map[c.familia] ||= []).push(c);
    }
    return map;
  }, [contas, tipo]);

  return (
    <Select id={id} value={value} required={required}
            onChange={e => onChange(e.target.value ? Number(e.target.value) : null)}>
      <option value="">Selecionar…</option>
      {Object.entries(porFamilia).map(([fam, lista]) => (
        <optgroup key={fam} label={fam}>
          {lista.map(c => (
            <option key={c.id} value={c.id} title={c.pergunta || ''}>{c.codigo} — {c.nome}</option>
          ))}
        </optgroup>
      ))}
    </Select>
  );
}

export function SncHint({ contaSncId }: { contaSncId: number | '' | null }) {
  const { contas } = useCatalogos();
  if (!contaSncId) return null;
  const c = contas.find(x => x.id === contaSncId);
  if (!c?.pergunta) return null;
  return <p className="text-xs text-ink-soft italic">{c.pergunta}</p>;
}
