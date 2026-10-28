import { useEffect, useMemo, useState } from 'react';
import { Plus, Paperclip, Pencil, Trash2, AlertTriangle, ChevronDown, ChevronRight, User, FileText, Briefcase, Search, FolderPlus, LinkIcon, UserPlus, Download, Clock } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Badge, estadoVariant } from '@/components/ui/Badge';
import { Empty } from '@/components/ui/Table';
import { LoadingBlock } from '@/components/ui/Spinner';
import { Modal } from '@/components/ui/Modal';
import { apiDel, apiGet, apiPost, apiPut } from '@/lib/api';
import { fmtData, fmtDias, fmtEuro } from '@/lib/format';
import { useToast } from '@/contexts/ToastContext';
import { openProtected } from '@/lib/download';
import { useAuth } from '@/contexts/AuthContext';
import { useCatalogos } from '@/hooks/useCatalogos';
import type { Documento, Entidade, Processo } from '@/lib/types';
import { DocumentoFormModal } from '@/components/forms/DocumentoFormModal';
import { cn } from '@/lib/cn';
import { RecibosBolsaSection } from '@/components/rh/RecibosBolsaSection';

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
  const [showDossieModal, setShowDossieModal] = useState(false);
  const [editing, setEditing] = useState<Documento | null>(null);
  const [prefilledEntidade, setPrefilledEntidade] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [subsidioResumos, setSubsidioResumos] = useState<Record<number, { totalDespesas: number; totalReceitas: number; saldo: number } | null>>({});
  const [assiduidade, setAssiduidade] = useState<Record<number, any[] | null>>({});
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

  const subsidiosPendentes = useMemo(() => subsidios.filter(s => !s.pessoaId), [subsidios]);
  const pessoasSemDossie = useMemo(() => {
    const comDocs = new Set(docs.map(d => d.entidadeId).filter(Boolean));
    const comSub = new Set(subsidios.map(s => s.pessoaId).filter(Boolean));
    return pessoasInternas.filter(p => !comDocs.has(p.id) && !comSub.has(p.id));
  }, [pessoasInternas, docs, subsidios]);

  const pessoasResumo = useMemo<PessoaResumo[]>(() => {
    const query = q.trim().toLowerCase();
    return pessoasInternas
      .map(pessoa => {
        const pessoaDocs = docs.filter(d => d.entidadeId === pessoa.id);
        const pessoaSubsidios = subsidios.filter(s => s.pessoaId === pessoa.id);
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

  async function expandPessoa(pessoaId: number, pessoaSubsidios: Processo[]) {
    if (expandedId === pessoaId) { setExpandedId(null); return; }
    setExpandedId(pessoaId);
    for (const s of pessoaSubsidios) {
      if (subsidioResumos[s.id] !== undefined) continue;
      try {
        const det = await apiGet<{ resumo: { totalDespesas: number; totalReceitas: number; saldo: number } }>(`/eventos/${s.id}/details`);
        setSubsidioResumos(prev => ({ ...prev, [s.id]: det.resumo }));
      } catch { setSubsidioResumos(prev => ({ ...prev, [s.id]: null })); }
    }
    if (assiduidade[pessoaId] === undefined) {
      const now = new Date();
      const mes = now.getMonth() + 1;
      const ano = now.getFullYear();
      try {
        const registos = await apiGet<any[]>(`/ponto/registos?entidadeId=${pessoaId}&mes=${mes}&ano=${ano}`);
        setAssiduidade(prev => ({ ...prev, [pessoaId]: registos }));
      } catch { setAssiduidade(prev => ({ ...prev, [pessoaId]: null })); }
    }
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
        actions={!readonly && (
          <div className="flex gap-2">
            <Button variant="subtle" icon={<Plus className="w-4 h-4" />} onClick={() => { setEditing(null); setPrefilledEntidade(null); setShowForm(true); }}>Novo documento</Button>
            <Button icon={<FolderPlus className="w-4 h-4" />} onClick={() => setShowDossieModal(true)}>
              Novo dossiê
              {(subsidiosPendentes.length > 0 || pessoasSemDossie.length > 0) && (
                <span className="ml-1.5 bg-white/25 text-[0.65rem] rounded-full px-1.5 py-0.5 font-bold">{subsidiosPendentes.length + pessoasSemDossie.length}</span>
              )}
            </Button>
          </div>
        )}
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
                  onClick={() => expandPessoa(pessoa.id, pessoaSubsidios)}
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
                      {pessoa.bolsaBase != null && <span className="font-mono" title="Valor líquido mensal">Bolsa líq.: {fmtEuro(pessoa.bolsaBase)}</span>}
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
                    {/* Info pessoal + ações */}
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-ink-soft">
                        {pessoa.nif && <span>NIF: <span className="font-mono text-ink">{pessoa.nif}</span></span>}
                        {pessoa.niss && <span>NISS: <span className="font-mono text-ink">{pessoa.niss}</span></span>}
                        {pessoa.dataNascimento && <span>Nascimento: <span className="text-ink">{fmtData(pessoa.dataNascimento)}</span></span>}
                        {pessoa.email && <span>Email: <span className="text-ink">{pessoa.email}</span></span>}
                        {pessoa.telefone && <span>Tel: <span className="text-ink">{pessoa.telefone}</span></span>}
                      </div>
                      <Button size="sm" variant="ghost" icon={<Download className="w-3.5 h-3.5" />}
                        onClick={() => promise(openProtected(`/relatorios/rh/pdf?pessoaId=${pessoa.id}`), { loading: 'A gerar dossiê…', success: 'PDF aberto', error: (e) => e?.message || 'Erro' })}>
                        PDF
                      </Button>
                    </div>

                    {/* Subsídios/Apoios */}
                    {pessoaSubsidios.length > 0 && (
                      <div className="mb-4">
                        <h4 className="text-xs font-semibold text-ink-soft uppercase tracking-wider mb-2 flex items-center gap-1.5">
                          <Briefcase className="w-3.5 h-3.5" /> Apoios / Subsídios
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {pessoaSubsidios.map(s => {
                            const resumo = subsidioResumos[s.id];
                            return (
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
                                {resumo && (
                                  <div className="mt-2 flex gap-3 text-[0.7rem] font-mono border-t border-line-soft pt-1.5">
                                    <span className="text-green-700" title="Receitas recebidas">▲ {fmtEuro(resumo.totalReceitas)}</span>
                                    <span className="text-red-600" title="Despesas associadas">▼ {fmtEuro(resumo.totalDespesas)}</span>
                                    <span className={resumo.saldo >= 0 ? 'text-green-700' : 'text-red-600'} title="Saldo">
                                      Saldo: {fmtEuro(resumo.saldo)}
                                    </span>
                                  </div>
                                )}
                                {!readonly && (
                                  <button type="button"
                                          onClick={() => criarDossieBase(pessoa.id, s.id, s.nome)}
                                          className="mt-2 flex items-center gap-1 text-[0.7rem] text-brand hover:text-brand-strong transition-colors font-medium">
                                    <FolderPlus className="w-3 h-3" /> Criar dossiê base
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Documentos */}
                    <div className="mb-4">
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

                    {/* Recibos de bolsa */}
                    {pessoaSubsidios.length > 0 && (
                      <RecibosBolsaSection
                        entidadeId={pessoa.id}
                        subsidioRefeicaoDia={pessoa.subsidioRefeicaoDia}
                        processos={pessoaSubsidios}
                        readonly={readonly}
                      />
                    )}

                    {/* Assiduidade */}
                    <div className="mb-3">
                      <h4 className="text-xs font-semibold text-ink-soft uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5" /> Assiduidade — {new Date().toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' })}
                      </h4>
                      {(() => {
                        const registos = assiduidade[pessoa.id];
                        if (registos === undefined) return <p className="text-xs text-ink-soft italic py-1">A carregar...</p>;
                        if (!registos || !Array.isArray(registos) || registos.length === 0) return <p className="text-xs text-ink-soft italic py-1">Sem registos este mês.</p>;
                        const totalMin = registos.reduce((acc, r) => {
                          if (r.horaEntrada && r.horaSaida) return acc + Math.round((new Date(r.horaSaida).getTime() - new Date(r.horaEntrada).getTime()) / 60000);
                          return acc;
                        }, 0);
                        return (
                          <div className="space-y-1">
                            <div className="grid grid-cols-[auto_1fr_1fr_auto] gap-x-4 gap-y-1 text-xs">
                              <span className="font-semibold text-ink-soft">Dia</span>
                              <span className="font-semibold text-ink-soft">Entrada</span>
                              <span className="font-semibold text-ink-soft">Saída</span>
                              <span className="font-semibold text-ink-soft">Horas</span>
                              {registos.map((r: any) => {
                                const d = new Date(r.data);
                                const ent = r.horaEntrada ? new Date(r.horaEntrada).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' }) : '--:--';
                                const sai = r.horaSaida ? new Date(r.horaSaida).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' }) : '--:--';
                                const mins = r.horaEntrada && r.horaSaida ? Math.round((new Date(r.horaSaida).getTime() - new Date(r.horaEntrada).getTime()) / 60000) : 0;
                                const horas = mins > 0 ? `${Math.floor(mins / 60)}h${String(mins % 60).padStart(2, '0')}` : '';
                                return [
                                  <span key={`d${r.id}`} className="text-ink font-medium">{d.toLocaleDateString('pt-PT', { weekday: 'short', day: '2-digit', month: '2-digit' })}</span>,
                                  <span key={`e${r.id}`} className="text-ink font-mono">{ent}</span>,
                                  <span key={`s${r.id}`} className="text-ink font-mono">{sai}</span>,
                                  <span key={`h${r.id}`} className="text-ink font-mono">{horas}</span>,
                                ];
                              })}
                            </div>
                            <div className="flex gap-4 text-xs font-semibold border-t border-line-soft pt-1.5 mt-1.5">
                              <span className="text-ink">{registos.length} dia(s)</span>
                              <span className="text-brand font-mono">{Math.floor(totalMin / 60)}h{String(totalMin % 60).padStart(2, '0')}</span>
                            </div>
                          </div>
                        );
                      })()}
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

      {showDossieModal && (
        <NovoDossieModal
          subsidiosPendentes={subsidiosPendentes}
          pessoasSemDossie={pessoasSemDossie}
          pessoasInternas={pessoasInternas}
          onClose={() => setShowDossieModal(false)}
          onChanged={() => { setShowDossieModal(false); reload(); }}
        />
      )}
    </>
  );
}

/* ─── Modal "Novo dossiê" ─── */

function NovoDossieModal({ subsidiosPendentes, pessoasSemDossie, pessoasInternas, onClose, onChanged }: {
  subsidiosPendentes: Processo[];
  pessoasSemDossie: Entidade[];
  pessoasInternas: Entidade[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const { reload: reloadCat } = useCatalogos();
  const [associando, setAssociando] = useState<Record<number, number | null>>({});
  const [saving, setSaving] = useState(false);

  async function associarECriarDossie(processoId: number, pessoaId: number, processoNome: string) {
    setSaving(true);
    try {
      await apiPut(`/eventos/${processoId}`, { pessoaId });
      const template = processoNome.toUpperCase().includes('IEFP') || processoNome.toUpperCase().includes('IDA') || processoNome.toUpperCase().includes('ESTÁGIO')
        ? 'IEFP'
        : processoNome.toUpperCase().includes('IPDJ')
          ? 'IPDJ'
          : 'Outro';
      const r = await apiPost<{ criados: number; tipos?: string[]; mensagem?: string }>('/documentos/dossie-base', {
        entidadeId: pessoaId, processoId, template,
      });
      await reloadCat();
      if (r.criados > 0) toast(`Associado + ${r.criados} doc(s) base criado(s)`, 'success');
      else toast('Associado com sucesso', 'success');
      onChanged();
    } catch (e: any) {
      toast(e.message || 'Erro', 'error');
    } finally { setSaving(false); }
  }

  const hasPendentes = subsidiosPendentes.length > 0;
  const hasSemDossie = pessoasSemDossie.length > 0;

  return (
    <Modal open onClose={onClose} size="lg" title="Novo dossiê">
      <div className="space-y-6">
        {/* Subsídios sem pessoa associada */}
        <div>
          <h3 className="text-sm font-semibold text-ink flex items-center gap-2 mb-3">
            <LinkIcon className="w-4 h-4 text-brand" />
            Subsídios pendentes de associar
            {hasPendentes && <Badge variant="warn">{subsidiosPendentes.length}</Badge>}
          </h3>
          {!hasPendentes ? (
            <p className="text-xs text-ink-soft italic">Todos os subsídios já estão associados a uma pessoa.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {subsidiosPendentes.map(s => (
                <div key={s.id} className="bg-surface-page border border-line rounded-md px-4 py-3">
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <div>
                      <span className="font-medium text-sm text-ink">{s.nome}</span>
                      {s.numeroProcesso && <span className="text-xs text-ink-soft ml-2">nº {s.numeroProcesso}</span>}
                    </div>
                    <Badge variant={s.estado === 'Em curso' ? 'neutral' : s.estado === 'Concluído' ? 'good' : 'bad'}>{s.estado}</Badge>
                  </div>
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <label className="text-xs text-ink-soft mb-1 block">Associar a pessoa:</label>
                      <Select
                        value={associando[s.id] ?? ''}
                        onChange={e => setAssociando(prev => ({ ...prev, [s.id]: e.target.value ? Number(e.target.value) : null }))}
                      >
                        <option value="">— Selecionar pessoa —</option>
                        {pessoasInternas.map(p => (
                          <option key={p.id} value={p.id}>{p.nome}{p.funcao ? ` (${p.funcao})` : ''}</option>
                        ))}
                      </Select>
                    </div>
                    <Button
                      size="sm"
                      disabled={!associando[s.id] || saving}
                      loading={saving}
                      onClick={() => associando[s.id] && associarECriarDossie(s.id, associando[s.id]!, s.nome)}
                    >
                      Associar + criar dossiê
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pessoas sem dossiê */}
        <div>
          <h3 className="text-sm font-semibold text-ink flex items-center gap-2 mb-3">
            <UserPlus className="w-4 h-4 text-brand" />
            Pessoas internas sem dossiê
            {hasSemDossie && <Badge variant="warn">{pessoasSemDossie.length}</Badge>}
          </h3>
          {!hasSemDossie ? (
            <p className="text-xs text-ink-soft italic">Todas as pessoas internas já têm documentos ou subsídios associados.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {pessoasSemDossie.map(p => (
                <div key={p.id} className="bg-surface-page border border-line rounded-md px-4 py-2 flex items-center gap-3">
                  <User className="w-4 h-4 text-ink-soft shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-ink">{p.nome}</span>
                    {p.funcao && <span className="text-xs text-ink-soft ml-2">{p.funcao}</span>}
                  </div>
                  <span className="text-xs text-ink-soft">Cria um subsídio com esta pessoa para gerar o dossiê.</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <p className="text-xs text-ink-soft border-t border-line-soft pt-3">
          <strong>Como funciona:</strong> Cada despesa (fatura) é ligada ao processo/subsídio específico (IEFP ou IPDJ).
          Se uma pessoa tem dois apoios, cada fatura pertence ao processo correto — não há duplicação.
        </p>
      </div>
    </Modal>
  );
}
