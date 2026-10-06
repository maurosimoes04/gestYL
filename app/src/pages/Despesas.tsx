import { useEffect, useMemo, useState } from 'react';
import { Plus, Paperclip, Pencil, Trash2, Search, Filter, Receipt } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Table, THead, TBody, TH, TR, TD, Empty } from '@/components/ui/Table';
import { Badge, SncBadge, estadoVariant } from '@/components/ui/Badge';
import { LoadingBlock } from '@/components/ui/Spinner';
import { apiDel, apiGet } from '@/lib/api';
import { openProtected } from '@/lib/download';
import { fmtData, fmtEuro } from '@/lib/format';
import { useToast } from '@/contexts/ToastContext';
import { useCatalogos } from '@/hooks/useCatalogos';
import { useAuth } from '@/contexts/AuthContext';
import type { Fatura } from '@/lib/types';
import { FaturaFormModal } from '@/components/forms/FaturaFormModal';

export function DespesasPage() {
  const { toast, promise } = useToast();
  const { role } = useAuth();
  const { departamentos, contas } = useCatalogos();
  const [items, setItems] = useState<Fatura[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [estado, setEstado] = useState('');
  const [departamento, setDepartamento] = useState('');
  const [sncId, setSncId] = useState<string>('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Fatura | null>(null);
  const readonly = role === 'fiscal';

  const contasGasto = useMemo(() => contas.filter(c => c.tipo === 'gasto' || c.tipo === 'ativo'), [contas]);

  async function reload() {
    setLoading(true);
    try { setItems(await apiGet<Fatura[]>('/faturas')); }
    finally { setLoading(false); }
  }
  useEffect(() => { reload(); }, []);

  const filtradas = useMemo(() => {
    const query = q.trim().toLowerCase();
    return items.filter(f => {
      if (estado && f.estado !== estado) return false;
      if (departamento && f.departamento !== departamento) return false;
      if (sncId === '__none__') { if (f.contaSncId) return false; }
      else if (sncId && f.contaSncId !== Number(sncId)) return false;
      if (query) {
        const hay = `${f.titulo} ${f.fornecedor || ''} ${f.numero || ''} ${f.entidade?.nome || ''}`.toLowerCase();
        if (!hay.includes(query)) return false;
      }
      return true;
    });
  }, [items, q, estado, departamento, sncId]);

  const total = useMemo(() => filtradas.reduce((s, f) => s + Number(f.valor), 0), [filtradas]);
  const pendente = useMemo(() => filtradas.filter(f => f.estado === 'Pendente').reduce((s, f) => s + Number(f.valor), 0), [filtradas]);

  async function remover(f: Fatura) {
    if (!confirm(`Eliminar a despesa "${f.titulo}"?`)) return;
    try {
      await apiDel(`/faturas/${f.id}`);
      toast('Despesa eliminada', 'success');
      reload();
    } catch (e: any) { toast(e.message || 'Erro', 'error'); }
  }

  return (
    <>
      <PageHeader
        title="Despesas"
        subtitle={`${filtradas.length} registo(s) · ${fmtEuro(total)} · ${fmtEuro(pendente)} em pendentes`}
        actions={!readonly && <Button icon={<Plus className="w-4 h-4" />} onClick={() => { setEditing(null); setShowForm(true); }}>Nova despesa</Button>}
      />

      <Card className="mb-5 p-4 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-60">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" />
          <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Pesquisar título, fornecedor, nº…" className="pl-9" />
        </div>
        <Select value={estado} onChange={e => setEstado(e.target.value)} className="w-40">
          <option value="">Todos os estados</option>
          <option>Pendente</option>
          <option>Paga</option>
        </Select>
        <Select value={departamento} onChange={e => setDepartamento(e.target.value)} className="w-56">
          <option value="">Todos os departamentos</option>
          {departamentos.map(d => <option key={d} value={d}>{d}</option>)}
        </Select>
        <Select value={sncId} onChange={e => setSncId(e.target.value)} className="w-64">
          <option value="">Todas as contas SNC</option>
          <option value="__none__">— Sem classificação SNC</option>
          {Object.entries(contasGasto.reduce((acc: Record<string, typeof contasGasto>, c) => {
            (acc[c.familia] ||= []).push(c); return acc;
          }, {})).map(([fam, lista]) => (
            <optgroup key={fam} label={fam}>
              {lista.map(c => <option key={c.id} value={c.id}>{c.codigo} — {c.nome}</option>)}
            </optgroup>
          ))}
        </Select>
      </Card>

      {loading ? <LoadingBlock /> : filtradas.length === 0 ? (
        <Card><Empty icon={<Filter className="w-10 h-10" />}>Sem despesas no filtro atual.</Empty></Card>
      ) : (
        <Table>
          <THead>
            <TH>Data</TH>
            <TH>Documento</TH>
            <TH>Entidade</TH>
            <TH>SNC</TH>
            <TH>Depart.</TH>
            <TH>Estado</TH>
            <TH align="right">Valor</TH>
            <TH />
          </THead>
          <TBody>
            {filtradas.map(f => (
              <TR key={f.id}>
                <TD mono>{fmtData(f.data)}</TD>
                <TD>
                  <div className="font-medium text-ink">{f.titulo}</div>
                  {f.numero && <div className="text-xs text-ink-muted">{f.tipo} · {f.numero}</div>}
                </TD>
                <TD>
                  {f.entidade ? (
                    <span>
                      {f.entidade.nome}
                      {f.entidade.nif && <span className="text-xs text-ink-muted ml-2 font-mono">{f.entidade.nif}</span>}
                    </span>
                  ) : (
                    <span className="text-ink-muted italic">{f.fornecedor || '—'}</span>
                  )}
                </TD>
                <TD>{f.contaSnc ? <SncBadge codigo={f.contaSnc.codigo} /> : <span className="text-bad-ink text-xs">por classificar</span>}</TD>
                <TD><span className="text-xs text-ink-soft">{f.departamento}</span></TD>
                <TD><Badge variant={estadoVariant(f.estado)}>{f.estado}</Badge></TD>
                <TD align="right" mono className="font-semibold">{fmtEuro(f.valor)}</TD>
                <TD>
                  <div className="flex gap-1 justify-end">
                    {f.anexo && (
                      <button type="button"
                         onClick={() => promise(openProtected(`/faturas/${f.id}/anexo`), {
                           loading: `A abrir fatura de "${f.titulo}"…`,
                           success: 'Fatura aberta numa nova aba',
                           error: (e) => e?.message || 'Não foi possível abrir',
                         })}
                         className="p-1.5 text-ink-soft hover:text-brand hover:bg-brand-soft rounded" title="Ver fatura">
                        <Paperclip className="w-4 h-4" />
                      </button>
                    )}
                    {f.comprovativo && (
                      <button type="button"
                         onClick={() => promise(openProtected(`/faturas/${f.id}/comprovativo`), {
                           loading: `A abrir comprovativo de "${f.titulo}"…`,
                           success: 'Comprovativo aberto numa nova aba',
                           error: (e) => e?.message || 'Não foi possível abrir',
                         })}
                         className="p-1.5 text-ink-soft hover:text-good hover:bg-good-soft rounded" title="Ver comprovativo de pagamento">
                        <Receipt className="w-4 h-4" />
                      </button>
                    )}
                    {!readonly && (
                      <>
                        <button onClick={() => { setEditing(f); setShowForm(true); }}
                                className="p-1.5 text-ink-soft hover:text-brand hover:bg-brand-soft rounded" title="Editar">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button onClick={() => remover(f)}
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
        <FaturaFormModal
          fatura={editing}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); reload(); }}
        />
      )}
    </>
  );
}
