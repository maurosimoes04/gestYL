import { useEffect, useMemo, useState } from 'react';
import { Plus, Paperclip, Pencil, Trash2, Search, Filter } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Table, THead, TBody, TH, TR, TD, Empty } from '@/components/ui/Table';
import { Badge, SncBadge, estadoVariant } from '@/components/ui/Badge';
import { LoadingBlock } from '@/components/ui/Spinner';
import { apiDel, apiGet } from '@/lib/api';
import { fmtData, fmtEuro } from '@/lib/format';
import { useToast } from '@/contexts/ToastContext';
import { useAuth } from '@/contexts/AuthContext';
import { useCatalogos } from '@/hooks/useCatalogos';
import type { Receita } from '@/lib/types';
import { ReceitaFormModal } from '@/components/forms/ReceitaFormModal';

export function ReceitasPage() {
  const { toast } = useToast();
  const { role } = useAuth();
  const { contas } = useCatalogos();
  const [items, setItems] = useState<Receita[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [estado, setEstado] = useState('');
  const [sncId, setSncId] = useState<string>('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Receita | null>(null);
  const readonly = role === 'fiscal';

  const contasProveito = useMemo(() => contas.filter(c => c.tipo === 'proveito' || c.tipo === 'passivo'), [contas]);

  async function reload() {
    setLoading(true);
    try { setItems(await apiGet<Receita[]>('/receitas')); }
    finally { setLoading(false); }
  }
  useEffect(() => { reload(); }, []);

  const filtradas = useMemo(() => {
    const query = q.trim().toLowerCase();
    return items.filter(r => {
      if (estado && r.estado !== estado) return false;
      if (sncId === '__none__') { if (r.contaSncId) return false; }
      else if (sncId && r.contaSncId !== Number(sncId)) return false;
      if (query) {
        const hay = `${r.titulo} ${r.financiador || ''} ${r.entidade?.nome || ''}`.toLowerCase();
        if (!hay.includes(query)) return false;
      }
      return true;
    });
  }, [items, q, estado, sncId]);

  const total = useMemo(() => filtradas.reduce((s, r) => s + Number(r.valor), 0), [filtradas]);
  const recebido = useMemo(() => filtradas.filter(r => r.estado === 'Recebido').reduce((s, r) => s + Number(r.valor), 0), [filtradas]);

  async function remover(r: Receita) {
    if (!confirm(`Eliminar a receita "${r.titulo}"?`)) return;
    try {
      await apiDel(`/receitas/${r.id}`);
      toast('Receita eliminada', 'success');
      reload();
    } catch (e: any) { toast(e.message || 'Erro', 'error'); }
  }

  return (
    <>
      <PageHeader
        title="Receitas"
        subtitle={`${filtradas.length} registo(s) · ${fmtEuro(total)} total · ${fmtEuro(recebido)} recebido`}
        actions={!readonly && <Button icon={<Plus className="w-4 h-4" />} onClick={() => { setEditing(null); setShowForm(true); }}>Nova receita</Button>}
      />

      <Card className="mb-5 p-4 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-60">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" />
          <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Pesquisar título, financiador…" className="pl-9" />
        </div>
        <Select value={estado} onChange={e => setEstado(e.target.value)} className="w-40">
          <option value="">Todos os estados</option>
          <option>Previsto</option>
          <option>Pendente</option>
          <option>Recebido</option>
        </Select>
        <Select value={sncId} onChange={e => setSncId(e.target.value)} className="w-64">
          <option value="">Todas as contas SNC</option>
          <option value="__none__">— Sem classificação SNC</option>
          {Object.entries(contasProveito.reduce((acc: Record<string, typeof contasProveito>, c) => {
            (acc[c.familia] ||= []).push(c); return acc;
          }, {})).map(([fam, lista]) => (
            <optgroup key={fam} label={fam}>
              {lista.map(c => <option key={c.id} value={c.id}>{c.codigo} — {c.nome}</option>)}
            </optgroup>
          ))}
        </Select>
      </Card>

      {loading ? <LoadingBlock /> : filtradas.length === 0 ? (
        <Card><Empty icon={<Filter className="w-10 h-10" />}>Sem receitas no filtro atual.</Empty></Card>
      ) : (
        <Table>
          <THead>
            <TH>Data</TH>
            <TH>Título</TH>
            <TH>Financiador</TH>
            <TH>SNC</TH>
            <TH>Estado</TH>
            <TH align="right">Valor</TH>
            <TH />
          </THead>
          <TBody>
            {filtradas.map(r => (
              <TR key={r.id}>
                <TD mono>{fmtData(r.data)}</TD>
                <TD><div className="font-medium text-ink">{r.titulo}</div></TD>
                <TD>
                  {r.entidade ? (
                    <span>
                      {r.entidade.nome}
                      {r.entidade.nif && <span className="text-xs text-ink-muted ml-2 font-mono">{r.entidade.nif}</span>}
                    </span>
                  ) : (
                    <span className="text-ink-muted italic">{r.financiador || '—'}</span>
                  )}
                </TD>
                <TD>{r.contaSnc ? <SncBadge codigo={r.contaSnc.codigo} /> : <span className="text-bad-ink text-xs">por classificar</span>}</TD>
                <TD><Badge variant={estadoVariant(r.estado)}>{r.estado}</Badge></TD>
                <TD align="right" mono className="font-semibold text-good">{fmtEuro(r.valor)}</TD>
                <TD>
                  <div className="flex gap-1 justify-end">
                    {r.anexo && (
                      <a href={`/receitas/${r.id}/anexo`} target="_blank" rel="noopener"
                         className="p-1.5 text-ink-soft hover:text-brand hover:bg-brand-soft rounded" title="Ver anexo">
                        <Paperclip className="w-4 h-4" />
                      </a>
                    )}
                    {!readonly && (
                      <>
                        <button onClick={() => { setEditing(r); setShowForm(true); }}
                                className="p-1.5 text-ink-soft hover:text-brand hover:bg-brand-soft rounded" title="Editar">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button onClick={() => remover(r)}
                                className="p-1.5 text-ink-soft hover:text-bad-ink hover:bg-bad-soft rounded" title="Eliminar">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      {showForm && (
        <ReceitaFormModal
          receita={editing}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); reload(); }}
        />
      )}
    </>
  );
}
