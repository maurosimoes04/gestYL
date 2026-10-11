import { useEffect, useMemo, useState } from 'react';
import { Plus, Paperclip, Pencil, Trash2, AlertTriangle, ChevronDown, ChevronRight, User, FileText, Briefcase, Search, FolderPlus } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge, estadoVariant } from '@/components/ui/Badge';
import { Empty } from '@/components/ui/Table';
import { LoadingBlock } from '@/components/ui/Spinner';
import { apiDel, apiGet, apiPost } from '@/lib/api';
import { fmtData, fmtDias, fmtEuro } from '@/lib/format';
import { useToast } from '@/contexts/ToastContext';
import { openProtected } from '@/lib/download';
import { useAuth } from '@/contexts/AuthContext';
import { useCatalogos } from '@/hooks/useCatalogos';
import type { Documento, Entidade, Processo } from '@/lib/types';
import { DocumentoFormModal } from '@/components/forms/DocumentoFormModal';
import { cn } from '@/lib/cn';

interface PessoaResumo {
  pessoa: Entidade;
  docs: Documento[];
  subsidios: Processo[];
  alertasCriticos: number;
  alertasTotal: number;
}

export function RHPage() {
  const { toast, promise } = useToast();
  const { role } = useAuth();
  const { entidades, processos } = useCatalogos();
  const [docs, setDocs] = useState<Documento[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Documento | null>(null);
  const [prefilledEntidade, setPrefilledEntidade] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [q, setQ] = useState('');
  const readonly = role === 'fiscal';

  async function reload() {
    setLoading(true);
    try { setDocs(await apiGet<Documento[]>('/documentos')); }
    finally { setLoading(false); }
  }
  useEffect(() => { reload(); }, []);

  const pessoasInternas = useMemo(() => entidades.filter(e => (e.tipos || []).includes('pessoa-interna')), [entidades]);
  const subsidios = useMemo(() => processos.filter(p => p.tipo === 'Subsídio'), [processos]);

  const pessoasResumo = useMemo<PessoaResumo[]>(() => {
    const query = q.trim().toLowerCase();
    return pessoasInternas
      .map(pessoa => {
        const pessoaDocs = docs.filter(d => d.entidadeId === pessoa.id);
        const pessoaSubsidios = subsidios.filter(s => {
          return pessoaDocs.some(d => d.processoId === s.id);
        });
        const alertas = pessoaDocs.filter(d => d.estado !== 'Enviado');
        const criticos = alertas.filter(d => d._severidade === 'vencido' || d._severidade === 'critico').length;
        return {
          pessoa,
          docs: pessoaDocs,
          subsidios: pessoaSubsidios,
          alertasCriticos: criticos,
          alertasTotal: alertas.length,
        };
      })
      .filter(pr => {
        if (!query) return true;
        const hay = `${pr.pessoa.nome} ${pr.pessoa.funcao || ''} ${pr.pessoa.tipoVinculo || ''} ${pr.subsidios.map(s => s.nome).join(' ')}`.toLowerCase();
        return hay.includes(query);
      })
      .sort((a, b) => b.alertasCriticos - a.alertasCriticos || a.pessoa.nome.localeCompare(b.pessoa.nome));
  }, [pessoasInternas, docs, subsidios, q]);

  const totalAlertas = useMemo(() => docs.filter(d => d.estado !== 'Enviado' && (d._severidade === 'vencido' || d._severidade === 'critico')).length, [docs]);
  const docsOrfaos = useMemo(() => docs.filter(d => !d.entidadeId || !pessoasInternas.find(p => p.id === d.entidadeId)), [docs, pessoasInternas]);

  async function removerDoc(d: Documento) {
    if (!confirm('Eliminar este documento?')) return;
    try { await apiDel(`/documentos/${d.id}`); toast('Eliminado', 'success'); reload(); }
    catch (e: any) { toast(e.message || 'Erro', 'error'); }
  }

  async function criarDossieBase(pessoaId: number, processoId: number, processoNome: string) {
    const template = processoNome.toUpperCase().includes('IEFP') || processoNome.toUpperCase().includes('IDA') || processoNome.toUpperCase().includes('ESTÁGIO')
      ? 'IEFP'
      : processoNome.toUpperCase().includes('IPDJ')
        ? 'IPDJ'
        : 'Outro';
    try {
      const r = await apiPost<{ criados: number; tipos?: string[]; mensagem?: string }>('/documentos/dossie-base', {
        entidadeId: pessoaId, processoId, template,
      });
      if (r.criados > 0) {
        toast(`${r.criados} documento(s) base criado(s): ${r.tipos!.join(', ')}`, 'success');
        reload();
      } else {
        toast(r.mensagem || 'Dossiê base já completo', 'info');
      }
    } catch (e: any) { toast(e.message || 'Erro', 'error'); }
  }

  function novoDocPessoa(pessoaId: number) {
    setEditing(null);
    setPrefilledEntidade(pessoaId);
    setShowForm(true);
  }

  function sevBorder(sev: string | undefined) {
    return sev === 'vencido' ? '#dc2626' : sev === 'critico' ? '#ea580c' : sev === 'aviso' ? '#d97706' : '#16a34a';
  }

  return (
    <>
      <PageHeader
        title="RH / Dossiês"
        subtitle={`${pessoasInternas.length} pessoas · ${subsidios.length} subsídios · ${totalAlertas} alertas críticos`}
        actions={!readonly && <Button icon={<Plus className="w-4 h-4" />} onClick={() => { setEditing(null); setPrefilledEntidade(null); setShowForm(true); }}>Novo documento</Button>}
      />

      <Card className="mb-5 p-4 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-60">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" />
          <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Pesquisar por pessoa, função, apoio…" className="pl-9" />
        </div>
        <span className="text-sm text-ink-soft">{pessoasResumo.length} pessoa(s)</span>
      </Card>

      {loading ? <LoadingBlock /> : pessoasResumo.length === 0 ? (
        <Card>
          <Empty icon={<User className="w-10 h-10" />}>
            Sem pessoas internas. Vai a <a href="/app/entidades" className="text-brand hover:underline">Entidades</a> e cria uma com tipo "pessoa interna".
          </Empty>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {pessoasResumo.map(({ pessoa, docs: pessoaDocs, subsidios: pessoaSubsidios, alertasCriticos, alertasTotal }) => {
            const isExpanded = expandedId === pessoa.id;
            const sevOrder = { vencido: 0, critico: 1, aviso: 2, ok: 3 } as any;
            const docsOrd = [...pessoaDocs].sort((a, b) => (sevOrder[a._severidade || 'ok'] - sevOrder[b._severidade || 'ok']));

            return (
              <div key={pessoa.id} className="bg-white border border-line rounded-lg shadow-soft overflow-hidden">
                {/* Cabeçalho da pessoa — clicável para expandir */}
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : pessoa.id)}
                  className="w-full flex items-center gap-4 px-5 py-4 hover:bg-surface-page transition-colors text-left"
                >
                  <div className="w-10 h-10 rounded-full bg-brand-soft flex items-center justify-center shrink-0">
                    <User className="w-5 h-5 text-brand" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-ink text-sm">{pessoa.nome}</div>
                    <div className="text-xs text-ink-soft flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                      {pessoa.funcao && <span>{pessoa.funcao}</span>}
                      {pessoa.tipoVinculo && <span className="text-brand">{pessoa.tipoVinculo}</span>}
                      {pessoa.bolsaBase != null && <span className="font-mono">Bolsa: {fmtEuro(pessoa.bolsaBase)}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {pessoaSubsidios.length > 0 && (
                      <div className="flex gap-1">
                        {pessoaSubsidios.map(s => (
                          <Badge key={s.id} variant="subsidio">{s.nome.length > 20 ? s.nome.slice(0, 18) + '…' : s.nome}</Badge>
                        ))}
                      </div>
                    )}
                    {alertasCriticos > 0 && (
                      <Badge variant="bad">{alertasCriticos} alerta(s)</Badge>
                    )}
                    {alertasCriticos === 0 && alertasTotal > 0 && (
                      <Badge variant="warn">{alertasTotal} pendente(s)</Badge>
                    )}
                    {alertasTotal === 0 && pessoaDocs.length > 0 && (
                      <Badge variant="good">{pessoaDocs.length} doc(s)</Badge>
                    )}
                    {pessoaDocs.length === 0 && (
                      <span className="text-xs text-ink-soft italic">sem docs</span>
                    )}
                    {isExpanded ? <ChevronDown className="w-4 h-4 text-ink-soft" /> : <ChevronRight className="w-4 h-4 text-ink-soft" />}
                  </div>
                </button>

                {/* Corpo expandido */}
                {isExpanded && (
                  <div className="border-t border-line-soft px-5 py-4 bg-surface-page/50">
                    {/* Info pessoal */}
                    <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-ink-soft mb-4">
                      {pessoa.nif && <span>NIF: <span className="font-mono text-ink">{pessoa.nif}</span></span>}
                      {pessoa.niss && <span>NISS: <span className="font-mono text-ink">{pessoa.niss}</span></span>}
                      {pessoa.dataNascimento && <span>Nascimento: <span className="text-ink">{fmtData(pessoa.dataNascimento)}</span></span>}
                      {pessoa.email && <span>Email: <span className="text-ink">{pessoa.email}</span></span>}
                      {pessoa.telefone && <span>Tel: <span className="text-ink">{pessoa.telefone}</span></span>}
                    </div>

                    {/* Subsídios/Apoios */}
                    {pessoaSubsidios.length > 0 && (
                      <div className="mb-4">
                        <h4 className="text-xs font-semibold text-ink-soft uppercase tracking-wider mb-2 flex items-center gap-1.5">
                          <Briefcase className="w-3.5 h-3.5" /> Apoios / Subsídios
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {pessoaSubsidios.map(s => (
                            <div key={s.id} className="bg-white border border-line rounded-md px-3 py-2">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-medium text-sm text-ink">{s.nome}</span>
                                <Badge variant={s.estado === 'Concluído' ? 'good' : s.estado === 'Cancelado' ? 'bad' : 'neutral'}>{s.estado}</Badge>
                              </div>
                              {s.numeroProcesso && <div className="text-xs text-ink-soft mt-1">Processo nº <span className="font-mono">{s.numeroProcesso}</span></div>}
                              {s.valorAprovado != null && <div className="text-xs font-mono font-semibold mt-1">{fmtEuro(s.valorAprovado)} aprovados</div>}
                              <div className="text-xs text-ink-soft mt-1">
                                {fmtData(s.data_inicio)} → {fmtData(s.data_fim) || '—'}
                              </div>
                              {!readonly && (
                                <button type="button"
                                        onClick={() => criarDossieBase(pessoa.id, s.id, s.nome)}
                                        className="mt-2 flex items-center gap-1 text-[0.7rem] text-brand hover:text-brand-strong transition-colors font-medium">
                                  <FolderPlus className="w-3 h-3" /> Criar dossiê base
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Documentos */}
                    <div className="mb-3">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-xs font-semibold text-ink-soft uppercase tracking-wider flex items-center gap-1.5">
                          <FileText className="w-3.5 h-3.5" /> Documentos ({pessoaDocs.length})
                        </h4>
                        {!readonly && (
                          <Button size="sm" variant="subtle" icon={<Plus className="w-3 h-3" />} onClick={() => novoDocPessoa(pessoa.id)}>
                            Adicionar
                          </Button>
                        )}
                      </div>

                      {pessoaDocs.length === 0 ? (
                        <p className="text-xs text-ink-soft italic py-2">Sem documentos. Clica em "Adicionar" para começar.</p>
                      ) : (
                        <div className="flex flex-col gap-1.5">
                          {docsOrd.map(d => (
                            <div key={d.id}
                                 className="bg-white border border-line rounded-md px-3 py-2 flex items-center gap-3"
                                 style={{ borderLeftWidth: 3, borderLeftColor: sevBorder(d._severidade) }}>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-ink">
                                  {d.tipo}
                                  {d.descricao && <span className="text-ink-soft font-normal"> — {d.descricao}</span>}
                                </div>
                                <div className="text-xs text-ink-soft flex gap-3 mt-0.5">
                                  {d.processo && <span>Processo: {d.processo.nome}</span>}
                                  {d.dataLimite && <span>Prazo: {fmtData(d.dataLimite)} ({fmtDias(d._dias ?? null)})</span>}
                                </div>
                              </div>
                              <Badge variant={estadoVariant(d.estado)}>{d.estado}</Badge>
                              {d.anexo && (
                                <button type="button"
                                   onClick={() => promise(openProtected(`/documentos/${d.id}/anexo`), { loading: 'A abrir…', success: 'Aberto', error: (e) => e?.message || 'Erro' })}
                                   className="p-1 text-ink-soft hover:text-brand rounded">
                                  <Paperclip className="w-4 h-4" />
                                </button>
                              )}
                              {!readonly && (
                                <>
                                  <button onClick={() => { setEditing(d); setPrefilledEntidade(null); setShowForm(true); }}
                                          className="p-1 text-ink-soft hover:text-brand rounded"><Pencil className="w-3.5 h-3.5" /></button>
                                  <button onClick={() => removerDoc(d)}
                                          className="p-1 text-ink-soft hover:text-bad-ink rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                                </>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* Docs órfãos — sem pessoa associada */}
          {docsOrfaos.length > 0 && (
            <Card className="p-4 mt-2">
              <h4 className="text-xs font-semibold text-ink-soft uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-warn-ink" /> Documentos sem pessoa associada ({docsOrfaos.length})
              </h4>
              <div className="flex flex-col gap-1.5">
                {docsOrfaos.map(d => (
                  <div key={d.id} className="bg-white border border-line rounded-md px-3 py-2 flex items-center gap-3"
                       style={{ borderLeftWidth: 3, borderLeftColor: sevBorder(d._severidade) }}>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-ink">{d.tipo}{d.descricao && ` — ${d.descricao}`}</div>
                      <div className="text-xs text-ink-soft">
                        {d.processo && <>Processo: {d.processo.nome}</>}
                        {d.dataLimite && <> · Prazo: {fmtData(d.dataLimite)}</>}
                      </div>
                    </div>
                    <Badge variant={estadoVariant(d.estado)}>{d.estado}</Badge>
                    {!readonly && (
                      <button onClick={() => { setEditing(d); setPrefilledEntidade(null); setShowForm(true); }}
                              className="p-1 text-ink-soft hover:text-brand rounded"><Pencil className="w-3.5 h-3.5" /></button>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}

      {showForm && (
        <DocumentoFormModal
          documento={editing}
          prefilledEntidadeId={prefilledEntidade}
          onClose={() => { setShowForm(false); setPrefilledEntidade(null); }}
          onSaved={() => { setShowForm(false); setPrefilledEntidade(null); reload(); }}
        />
      )}
    </>
  );
}
