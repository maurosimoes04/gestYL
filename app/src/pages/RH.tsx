import { useEffect, useMemo, useState } from 'react';
import { Plus, Paperclip, Pencil, Trash2, AlertTriangle } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge, estadoVariant } from '@/components/ui/Badge';
import { Table, THead, TBody, TH, TR, TD, Empty } from '@/components/ui/Table';
import { LoadingBlock } from '@/components/ui/Spinner';
import { apiDel, apiGet } from '@/lib/api';
import { fmtData, fmtDias, fmtEuro } from '@/lib/format';
import { useToast } from '@/contexts/ToastContext';
import { openProtected } from '@/lib/download';
import { useAuth } from '@/contexts/AuthContext';
import { useCatalogos } from '@/hooks/useCatalogos';
import type { Documento } from '@/lib/types';
import { DocumentoFormModal } from '@/components/forms/DocumentoFormModal';
import { cn } from '@/lib/cn';

type Tab = 'alertas' | 'pessoas' | 'subsidios' | 'documentos';

export function RHPage() {
  const { toast, promise } = useToast();
  const { role } = useAuth();
  const { entidades, processos } = useCatalogos();
  const [tab, setTab] = useState<Tab>('alertas');
  const [docs, setDocs] = useState<Documento[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Documento | null>(null);
  const readonly = role === 'fiscal';

  const pessoasInternas = useMemo(() => entidades.filter(e => (e.tipos || []).includes('pessoa-interna')), [entidades]);
  const subsidios = useMemo(() => processos.filter(p => p.tipo === 'Subsídio'), [processos]);

  async function reload() {
    setLoading(true);
    try { setDocs(await apiGet<Documento[]>('/documentos')); }
    finally { setLoading(false); }
  }
  useEffect(() => { reload(); }, []);

  const alertas = useMemo(() => docs.filter(d => d.estado !== 'Enviado'), [docs]);
  const sevOrder = { vencido: 0, critico: 1, aviso: 2, ok: 3 } as any;
  const alertasOrd = [...alertas].sort((a, b) => (sevOrder[a._severidade || 'ok'] - sevOrder[b._severidade || 'ok']));
  const criticos = alertas.filter(d => d._severidade === 'vencido' || d._severidade === 'critico').length;

  async function remover(d: Documento) {
    if (!confirm('Eliminar este documento?')) return;
    try { await apiDel(`/documentos/${d.id}`); toast('Eliminado', 'success'); reload(); }
    catch (e: any) { toast(e.message || 'Erro', 'error'); }
  }

  return (
    <>
      <PageHeader
        title="RH / Dossiês"
        subtitle={`${pessoasInternas.length} pessoas · ${subsidios.length} subsídios ativos · ${criticos} alertas críticos`}
        actions={!readonly && <Button icon={<Plus className="w-4 h-4" />} onClick={() => { setEditing(null); setShowForm(true); }}>Novo documento</Button>}
      />

      <div className="flex gap-1 mb-5 border-b border-line">
        {([
          ['alertas', `Alertas (${alertas.length})`],
          ['pessoas', `Pessoas (${pessoasInternas.length})`],
          ['subsidios', `Subsídios (${subsidios.length})`],
          ['documentos', `Todos (${docs.length})`],
        ] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={cn(
            'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
            tab === k ? 'text-brand border-brand' : 'text-ink-soft border-transparent hover:text-ink',
          )}>{l}</button>
        ))}
      </div>

      {tab === 'alertas' && (
        <>
          <div className="flex gap-2 flex-wrap mb-4">
            <Badge variant="bad">Vencido</Badge>
            <Badge variant="warn">≤ 5 dias</Badge>
            <Badge variant="info">≤ 15 dias</Badge>
            <Badge variant="good">OK</Badge>
          </div>
          {loading ? <LoadingBlock /> : alertasOrd.length === 0 ? (
            <Card><Empty>Sem alertas pendentes. ✓</Empty></Card>
          ) : (
            <div className="flex flex-col gap-2">
              {alertasOrd.map(d => {
                const sevColor = d._severidade === 'vencido' ? 'bg-bad' : d._severidade === 'critico' ? 'bg-warn' : d._severidade === 'aviso' ? 'bg-info' : 'bg-good';
                return (
                  <div key={d.id} className={cn('bg-white border border-line rounded-lg px-4 py-3 flex items-center gap-4', `border-l-4`)}
                       style={{ borderLeftColor: d._severidade === 'vencido' ? '#dc2626' : d._severidade === 'critico' ? '#ea580c' : d._severidade === 'aviso' ? '#d97706' : '#16a34a' }}>
                    <Badge variant={d._severidade === 'vencido' ? 'bad' : d._severidade === 'critico' ? 'warn' : d._severidade === 'aviso' ? 'info' : 'good'}>{d._severidade?.toUpperCase()}</Badge>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-ink text-sm">{d.tipo}{d.descricao && ` — ${d.descricao}`}</div>
                      <div className="text-xs text-ink-soft">
                        {d.processo && <>Processo: {d.processo.nome}</>}
                        {d.entidade && <>{d.processo && ' · '}Pessoa: {d.entidade.nome}</>}
                      </div>
                    </div>
                    <div className="text-right text-sm">
                      <div className="font-mono">{fmtData(d.dataLimite)}</div>
                      <div className="text-xs text-ink-soft">{fmtDias(d._dias ?? null)}</div>
                    </div>
                    <Badge variant={estadoVariant(d.estado)}>{d.estado}</Badge>
                    {!readonly && (
                      <button onClick={() => { setEditing(d); setShowForm(true); }}
                              className="p-1.5 text-ink-soft hover:text-brand rounded"><Pencil className="w-4 h-4" /></button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {tab === 'pessoas' && (
        <>
          <p className="text-sm text-ink-soft mb-4">
            Entidades do tipo "pessoa interna". Para criar/editar, vai a <a href="/app/entidades" className="text-brand hover:underline">Entidades</a>.
          </p>
          {pessoasInternas.length === 0 ? (
            <Card><Empty>Sem pessoas internas.</Empty></Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {pessoasInternas.map(p => (
                <Card key={p.id} className="p-4">
                  <h3 className="font-semibold text-ink text-sm">{p.nome}</h3>
                  {p.funcao && <div className="text-xs text-ink-soft mt-1">{p.funcao}</div>}
                  <div className="flex gap-1 mt-2 flex-wrap">
                    {p.tipoVinculo && <Badge variant="pessoa">{p.tipoVinculo}</Badge>}
                  </div>
                  {p.bolsaBase && <div className="font-mono text-xs text-ink mt-2">Bolsa base: {fmtEuro(p.bolsaBase)}</div>}
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'subsidios' && (
        <>
          <p className="text-sm text-ink-soft mb-4">
            Processos tipo <strong>Subsídio</strong>. Para criar, vai a <a href="/app/processos" className="text-brand hover:underline">Processos → Novo</a>.
          </p>
          {subsidios.length === 0 ? (
            <Card><Empty>Sem processos de subsídio.</Empty></Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {subsidios.map(s => (
                <Card key={s.id}>
                  <Badge variant="subsidio">Subsídio</Badge>
                  <h3 className="font-semibold text-ink mt-2">{s.nome}</h3>
                  {s.numeroProcesso && <div className="text-xs text-ink-soft mt-1">Processo nº <span className="font-mono text-ink">{s.numeroProcesso}</span></div>}
                  {s.valorAprovado != null && <div className="font-mono text-sm mt-2 font-semibold">{fmtEuro(s.valorAprovado)} aprovados</div>}
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'documentos' && (
        loading ? <LoadingBlock /> : docs.length === 0 ? (
          <Card><Empty>Sem documentos. Clica em "Novo documento" para começar.</Empty></Card>
        ) : (
          <Table>
            <THead>
              <TH>Tipo</TH><TH>Processo</TH><TH>Pessoa</TH><TH>Estado</TH><TH>Prazo</TH><TH>Anexo</TH><TH />
            </THead>
            <TBody>
              {docs.map(d => (
                <TR key={d.id}>
                  <TD>
                    <div className="font-medium">{d.tipo}</div>
                    {d.descricao && <div className="text-xs text-ink-soft">{d.descricao}</div>}
                  </TD>
                  <TD>{d.processo?.nome || '—'}</TD>
                  <TD>{d.entidade?.nome || '—'}</TD>
                  <TD><Badge variant={estadoVariant(d.estado)}>{d.estado}</Badge></TD>
                  <TD mono>{fmtData(d.dataLimite)}</TD>
                  <TD>{d.anexo ? (<button type="button" onClick={() => promise(openProtected(`/documentos/${d.id}/anexo`), { loading: 'A abrir documento…', success: 'Documento aberto numa nova aba', error: (e) => e?.message || 'Não foi possível abrir' })} className="text-brand hover:underline"><Paperclip className="w-4 h-4 inline" /></button>) : '—'}</TD>
                  <TD>
                    {!readonly && (
                      <div className="flex gap-1 justify-end">
                        <button onClick={() => { setEditing(d); setShowForm(true); }} className="p-1.5 text-ink-soft hover:text-brand hover:bg-brand-soft rounded"><Pencil className="w-4 h-4" /></button>
                        <button onClick={() => remover(d)} className="p-1.5 text-ink-soft hover:text-bad-ink hover:bg-bad-soft rounded"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )
      )}

      {showForm && (
        <DocumentoFormModal documento={editing} onClose={() => setShowForm(false)}
                            onSaved={() => { setShowForm(false); reload(); }} />
      )}
    </>
  );
}
