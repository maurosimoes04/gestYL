import { useEffect, useState } from 'react';
import { apiGet } from '@/lib/api';
import type { ContaSNC, Entidade, Processo } from '@/lib/types';

interface Store {
  contas: ContaSNC[];
  entidades: Entidade[];
  processos: Processo[];
  departamentos: string[];
  loaded: boolean;
  reload: () => Promise<void>;
}

let state: Store = { contas: [], entidades: [], processos: [], departamentos: [], loaded: false, reload: async () => {} };
const subs = new Set<() => void>();

async function fetchAll() {
  const [contas, entidades, processos, deps] = await Promise.all([
    apiGet<ContaSNC[]>('/contas-snc'),
    apiGet<Entidade[]>('/entidades', { ativo: 'true', limit: 1000 }),
    apiGet<Processo[]>('/eventos'),
    apiGet<Array<{ nome: string; ativo: boolean }>>('/departamentos'),
  ]);
  state = { ...state, contas, entidades, processos, departamentos: deps.filter(d => d.ativo).map(d => d.nome), loaded: true };
  subs.forEach(fn => fn());
}

state.reload = fetchAll;

export function useCatalogos(): Store {
  const [, force] = useState(0);
  useEffect(() => {
    const fn = () => force(x => x + 1);
    subs.add(fn);
    if (!state.loaded) fetchAll().catch(e => console.error('Catálogos:', e));
    return () => { subs.delete(fn); };
  }, []);
  return state;
}
