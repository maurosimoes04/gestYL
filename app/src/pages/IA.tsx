import { useEffect, useMemo, useState } from 'react';
import { Sparkles, CheckCircle2, AlertTriangle, Clock, Paperclip, Shield, ShieldOff, RefreshCw, Zap, PlayCircle } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, KPI } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge, SncBadge } from '@/components/ui/Badge';
import { LoadingBlock, Spinner } from '@/components/ui/Spinner';
import { Empty } from '@/components/ui/Table';
import { apiGet, apiPost } from '@/lib/api';
import { fmtData, fmtEuro } from '@/lib/format';
import { useToast } from '@/contexts/ToastContext';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/cn';
import { Select } from '@/components/ui/Input';

type Tipo = 'fatura' | 'receita';
type Filtro = 'todas' | 'validadas' | 'alertas' | 'ok';

interface AnaliseIA {
  extraido?: Record<string, any>;
  divergencias?: string[];
  analisadoEm?: string;
  validacaoManual?: { validada: boolean; porQuem?: string; em?: string };
}

interface ItemIA {
  tipo: Tipo;
  id: number;
  titulo: string;
  valor: number | string;
  data: string;
  analiseIA?: AnaliseIA | null;
  analiseTentativas?: number;
  anexo?: any;
  contaSnc?: { codigo: string } | null;
  entidade?: { nome: string } | null;
  fornecedor?: string | null;
  financiador?: string | null;
}

interface AuditResult {
  tipo: 'fatura' | 'receita';
  id: number;
  titulo: string;
  valor: number;
  data: string;
  entidade: string | null;
  atual: { codigo: string; nome: string } | null;
  sugerida: { codigo: string; id: number; motivo: string; confianca: number } | null;
  diverge: boolean;
  semClass: boolean;
  avisos: string[];
}

export function IAPage() {
  const { toast } = useToast();
  const { role } = useAuth();
  const [faturas, setFaturas] = useState<ItemIA[]>([]);
  const [receitas, setReceitas] = useState<ItemIA[]>([]);
  const [loading, setLoading] = useState(true);
  const [tipo, setTipo] = useState<'todas' | Tipo>('todas');
  const [filtro, setFiltro] = useState<Filtro>('alertas');
  const [reanalisando, setReanalisando] = useState<string | null>(null);
  const [tab, setTab] = useState<'docs' | 'auditSnc'>('docs');
  const [auditLimit, setAuditLimit] = useState(20);
  const [auditSoSem, setAuditSoSem] = useState(true);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditResults, setAuditResults] = useState<AuditResult[]>([]);
  const [aplicando, setAplicando] = useState<string | null>(null);
  const readonly = role === 'fiscal';

  async function reload() {
    setLoading(true);
    try {
      const [f, r] = await Promise.all([
        apiGet<any[]>('/faturas'),
        apiGet<any[]>('/receitas'),
      ]);
      setFaturas(f.map(x => ({ ...x, tipo: 'fatura' })));
      setReceitas(r.map(x => ({ ...x, tipo: 'receita' })));
    } finally { setLoading(false); }
  }
  useEffect(() => { reload(); }, []);

  const todos = useMemo(() => {
    let list: ItemIA[] = [];
    if (tipo === 'todas') list = [...faturas, ...receitas];
    else list = tipo === 'fatura' ? faturas : receitas;
    return list.filter(i => i.analiseIA);
  }, [faturas, receitas, tipo]);

  const kpis = useMemo(() => {
    const total = todos.length;
    const validadas = todos.filter(i => i.analiseIA?.validacaoManual?.validada === true).length;
    const alertas = todos.filter(i => (i.analiseIA?.divergencias?.length || 0) > 0 && !i.analiseIA?.validacaoManual?.validada).length;
    const ok = total - validadas - alertas;
    return { total, validadas, alertas, ok };
  }, [todos]);

  const lista = useMemo(() => {
    return todos.filter(i => {
      const divs = i.analiseIA?.divergencias?.length || 0;
      const validada = i.analiseIA?.validacaoManual?.validada === true;
      if (filtro === 'validadas') return validada;
      if (filtro === 'alertas') return divs > 0 && !validada;
      if (filtro === 'ok') return divs === 0 && !validada;
      return true;
    }).sort((a, b) => (new Date(b.analiseIA?.analisadoEm || b.data).getTime() - new Date(a.analiseIA?.analisadoEm || a.data).getTime()));
  }, [todos, filtro]);

  async function validar(item: ItemIA, validada: boolean) {
    try {
      await apiPost(`/${item.tipo === 'fatura' ? 'faturas' : 'receitas'}/${item.id}/validar-ia`, { validada });
      toast(validada ? 'Marcada como validada' : 'Validação removida', 'success');
      reload();
    } catch (e: any) { toast(e.message || 'Erro', 'error'); }
  }

  async function reanalisar(item: ItemIA) {
    const key = `${item.tipo}-${item.id}`;
    setReanalisando(key);
    try {
      await apiPost(`/${item.tipo === 'fatura' ? 'faturas' : 'receitas'}/${item.id}/analisar`);
      toast('Reanálise iniciada', 'success');
      setTimeout(reload, 1500);
    } catch (e: any) { toast(e.message || 'Erro', 'error'); } finally { setReanalisando(null); }
  }

  async function backfillAntigas() {
    if (!confirm('Analisar todas as faturas antigas sem IA? Pode demorar e consume quota.')) return;
    try {
      await apiPost('/faturas/backfill-antigas');
      toast('Backfill iniciado em background', 'info');
    } catch (e: any) { toast(e.message || 'Erro', 'error'); }
  }

  async function correrAuditoria() {
    setAuditLoading(true);
    try {
      const r = await apiGet<{ resultados: AuditResult[] }>('/ia-snc/auditoria', { limit: auditLimit, soSemClass: auditSoSem ? 'true' : 'false' });
      setAuditResults(r.resultados);
      toast(`${r.resultados.length} registo(s) analisados`, 'success');
    } catch (e: any) { toast(e.message || 'Erro', 'error'); }
    finally { setAuditLoading(false); }
  }

  async function aplicarSugestao(item: AuditResult) {
    if (!item.sugerida) return;
    const key = `${item.tipo}-${item.id}`;
    setAplicando(key);
    try {
      await apiPost(`/ia-snc/aplicar/${item.tipo}/${item.id}`, { contaSncId: item.sugerida.id });
      toast(`${item.tipo} #${item.id} → ${item.sugerida.codigo}`, 'success');
      setAuditResults(rs => rs.map(r => r.tipo === item.tipo && r.id === item.id
        ? { ...r, atual: { codigo: item.sugerida!.codigo, nome: '' }, diverge: false, semClass: false }
        : r));
    } catch (e: any) { toast(e.message || 'Erro', 'error'); }
    finally { setAplicando(null); }
  }

  return (
    <>
      <PageHeader
        title="Verificação IA"
        subtitle="Análise automática de faturas e receitas (Gemini)"
        actions={!readonly && (
          <Button variant="ghost" icon={<RefreshCw className="w-4 h-4" />} onClick={backfillAntigas}>
            Analisar antigas
          </Button>
        )}
      />

      <div className="flex gap-1 mb-5 border-b border-line">
        <button onClick={() => setTab('docs')} className={cn(
          'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
          tab === 'docs' ? 'text-brand border-brand' : 'text-ink-soft border-transparent hover:text-ink',
        )}>Documentos (extração)</button>
        <button onClick={() => setTab('auditSnc')} className={cn(
          'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
          tab === 'auditSnc' ? 'text-brand border-brand' : 'text-ink-soft border-transparent hover:text-ink',
        )}>Auditoria SNC (batch)</button>
      </div>

      {tab === 'auditSnc' && (
        <AuditoriaSncTab
          limit={auditLimit} setLimit={setAuditLimit}
          soSem={auditSoSem} setSoSem={setAuditSoSem}
          loading={auditLoading} onRun={correrAuditoria}
          results={auditResults} aplicando={aplicando} onAplicar={aplicarSugestao}
          readonly={readonly}
        />
      )}

      {tab === 'docs' && <>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <KPI label="Analisadas" value={kpis.total} delta={<><Sparkles className="w-3 h-3 inline mr-1" />Com IA</>} deltaColor="neutral" mono={false} />
        <KPI label="Sem divergências" value={kpis.ok} accent="good" delta="OK IA" deltaColor="good" mono={false} />
        <KPI label="Alertas" value={kpis.alertas} accent={kpis.alertas > 0 ? 'bad' : undefined} delta="A rever" deltaColor="bad" mono={false} />
        <KPI label="Validadas manualmente" value={kpis.validadas} accent="brand" delta="Confirmadas" deltaColor="neutral" mono={false} />
      </div>

      <Card className="mb-5 p-4 flex flex-wrap gap-3 items-center">
        <div className="flex gap-1 bg-surface-alt rounded-md p-1">
          {([['todas', 'Todas'], ['fatura', 'Despesas'], ['receita', 'Receitas']] as const).map(([v, l]) => (
            <button key={v} onClick={() => setTipo(v)} className={cn(
              'px-3 py-1.5 text-xs rounded font-medium transition-colors',
              tipo === v ? 'bg-white text-ink shadow-soft' : 'text-ink-soft hover:text-ink',
            )}>{l}</button>
          ))}
        </div>
        <div className="flex gap-1 bg-surface-alt rounded-md p-1 ml-auto">
          {([['alertas', 'Alertas'], ['ok', 'OK IA'], ['validadas', 'Validadas'], ['todas', 'Todas']] as const).map(([v, l]) => (
            <button key={v} onClick={() => setFiltro(v)} className={cn(
              'px-3 py-1.5 text-xs rounded font-medium transition-colors',
              filtro === v ? 'bg-white text-ink shadow-soft' : 'text-ink-soft hover:text-ink',
            )}>{l}</button>
          ))}
        </div>
      </Card>

      {loading ? <LoadingBlock /> : lista.length === 0 ? (
        <Card><Empty icon={<Sparkles className="w-10 h-10" />}>Nenhum registo no filtro atual.</Empty></Card>
      ) : (
        <div className="flex flex-col gap-3">
          {lista.map(item => {
            const key = `${item.tipo}-${item.id}`;
            const ia = item.analiseIA!;
            const divs = ia.divergencias || [];
            const validada = ia.validacaoManual?.validada === true;
            const alerta = divs.length > 0 && !validada;
            return (
              <Card key={key} className={cn('p-4', validada && 'border-l-4 border-l-brand', alerta && 'border-l-4 border-l-bad')}>
                <div className="flex items-start gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <Badge variant={item.tipo === 'fatura' ? 'bad' : 'good'}>{item.tipo === 'fatura' ? 'Despesa' : 'Receita'}</Badge>
                      {item.contaSnc && <SncBadge codigo={item.contaSnc.codigo} />}
                      {validada && <Badge variant="brand"><Shield className="w-3 h-3 inline mr-1" />Validada</Badge>}
                      {!validada && divs.length === 0 && <Badge variant="good"><CheckCircle2 className="w-3 h-3 inline mr-1" />OK</Badge>}
                      {alerta && <Badge variant="bad"><AlertTriangle className="w-3 h-3 inline mr-1" />{divs.length} divergência(s)</Badge>}
                    </div>
                    <h3 className="font-semibold text-ink text-sm">#{item.id} · {item.titulo}</h3>
                    <div className="text-xs text-ink-soft mt-1">
                      {fmtData(item.data)} · {item.entidade?.nome || item.fornecedor || item.financiador || '—'}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono tabular font-bold text-ink">{fmtEuro(item.valor)}</div>
                    {ia.analisadoEm && (
                      <div className="text-xs text-ink-soft inline-flex items-center gap-1 mt-1">
                        <Clock className="w-3 h-3" />
                        {fmtData(ia.analisadoEm)}
                      </div>
                    )}
                  </div>
                </div>

                {alerta && (
                  <div className="mt-3 bg-bad-soft rounded-md p-3 text-sm text-bad-ink space-y-1">
                    {divs.map((d, i) => (
                      <div key={i} className="flex gap-2">
                        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                        <span>{d}</span>
                      </div>
                    ))}
                  </div>
                )}

                {ia.extraido && Object.keys(ia.extraido).length > 0 && (
                  <details className="mt-3 text-xs">
                    <summary className="cursor-pointer text-ink-soft hover:text-ink">Ver dados extraídos pela IA</summary>
                    <div className="mt-2 bg-surface-alt rounded p-2 font-mono grid grid-cols-2 gap-x-4 gap-y-1">
                      {Object.entries(ia.extraido).map(([k, v]) => (
                        <div key={k}><span className="text-ink-muted">{k}:</span> <span className="text-ink">{String(v) || '—'}</span></div>
                      ))}
                    </div>
                  </details>
                )}

                <div className="flex gap-2 mt-3 pt-3 border-t border-line-soft">
                  {item.anexo && (
                    <a href={`/${item.tipo === 'fatura' ? 'faturas' : 'receitas'}/${item.id}/anexo`}
                       target="_blank" rel="noopener"
                       className="inline-flex items-center gap-1 text-xs text-brand hover:underline">
                      <Paperclip className="w-3 h-3" />Ver anexo
                    </a>
                  )}
                  <div className="ml-auto flex gap-2">
                    {!readonly && (
                      <>
                        {validada ? (
                          <Button size="sm" variant="ghost" icon={<ShieldOff className="w-4 h-4" />} onClick={() => validar(item, false)}>Remover validação</Button>
                        ) : (
                          <Button size="sm" variant={alerta ? 'primary' : 'ghost'} icon={<Shield className="w-4 h-4" />} onClick={() => validar(item, true)}>
                            Validar manualmente
                          </Button>
                        )}
                        {item.anexo && (
                          <Button size="sm" variant="ghost" loading={reanalisando === key} icon={<RefreshCw className="w-4 h-4" />} onClick={() => reanalisar(item)}>
                            Reanalisar
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
      </>}
    </>
  );
}

interface AuditTabProps {
  limit: number; setLimit: (n: number) => void;
  soSem: boolean; setSoSem: (b: boolean) => void;
  loading: boolean; onRun: () => void;
  results: AuditResult[];
  aplicando: string | null; onAplicar: (r: AuditResult) => void;
  readonly: boolean;
}

function AuditoriaSncTab({ limit, setLimit, soSem, setSoSem, loading, onRun, results, aplicando, onAplicar, readonly }: AuditTabProps) {
  const divergentes = useMemo(() => results.filter(r => r.diverge || r.semClass), [results]);
  const concordam = useMemo(() => results.filter(r => !r.diverge && !r.semClass), [results]);

  return (
    <>
      <Card className="mb-5 p-4 flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-2 text-sm text-ink">
          <span className="text-ink-soft">Analisar</span>
          <Select value={limit} onChange={e => setLimit(Number(e.target.value))} className="w-24">
            <option value={10}>10</option><option value={20}>20</option><option value={50}>50</option><option value={100}>100</option>
          </Select>
          <span className="text-ink-soft">registos</span>
        </div>
        <label className="inline-flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" checked={soSem} onChange={e => setSoSem(e.target.checked)} />
          Só sem classificação SNC
        </label>
        <Button icon={<PlayCircle className="w-4 h-4" />} loading={loading} onClick={onRun} className="ml-auto">
          {results.length ? 'Correr novamente' : 'Correr auditoria'}
        </Button>
      </Card>

      {loading && (
        <Card className="text-center py-12">
          <Spinner className="mx-auto mb-2" />
          <p className="text-sm text-ink-soft">A pedir à IA para analisar cada registo…</p>
          <p className="text-xs text-ink-muted mt-1">Pode demorar ~{limit * 2}s</p>
        </Card>
      )}

      {!loading && results.length === 0 && (
        <Card><Empty icon={<Sparkles className="w-10 h-10" />}>Carrega "Correr auditoria" para pedir à IA que analise.</Empty></Card>
      )}

      {!loading && results.length > 0 && (
        <>
          <div className="grid grid-cols-3 gap-3 mb-5">
            <KPI label="Analisados" value={results.length} mono={false} />
            <KPI label="Divergências / em falta" value={divergentes.length} accent={divergentes.length > 0 ? 'bad' : undefined} mono={false} />
            <KPI label="IA concorda" value={concordam.length} accent="good" mono={false} />
          </div>

          {divergentes.length > 0 && (
            <>
              <h3 className="text-sm font-semibold text-bad mb-2">A rever ({divergentes.length})</h3>
              <div className="space-y-2 mb-6">
                {divergentes.map(r => <AuditRow key={`${r.tipo}-${r.id}`} r={r} aplicando={aplicando} onAplicar={onAplicar} readonly={readonly} />)}
              </div>
            </>
          )}

          {concordam.length > 0 && (
            <details>
              <summary className="cursor-pointer text-sm font-semibold text-good mb-2">
                <CheckCircle2 className="w-4 h-4 inline mr-1" />IA concorda com a classificação atual ({concordam.length})
              </summary>
              <div className="space-y-2 mt-2">
                {concordam.map(r => <AuditRow key={`${r.tipo}-${r.id}`} r={r} aplicando={aplicando} onAplicar={onAplicar} readonly={readonly} />)}
              </div>
            </details>
          )}
        </>
      )}
    </>
  );
}

function AuditRow({ r, aplicando, onAplicar, readonly }: { r: AuditResult; aplicando: string | null; onAplicar: (r: AuditResult) => void; readonly: boolean }) {
  const key = `${r.tipo}-${r.id}`;
  const conf = r.sugerida ? Math.round(r.sugerida.confianca * 100) : 0;
  const confColor = conf >= 80 ? 'text-good' : conf >= 50 ? 'text-warn-ink' : 'text-bad-ink';
  return (
    <Card className={cn('p-3', (r.diverge || r.semClass) && 'border-l-4 border-l-bad')}>
      <div className="flex items-start gap-3 flex-wrap">
        <Badge variant={r.tipo === 'fatura' ? 'bad' : 'good'}>{r.tipo === 'fatura' ? 'Despesa' : 'Receita'}</Badge>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-ink text-sm">#{r.id} · {r.titulo}</div>
          <div className="text-xs text-ink-soft">{fmtData(r.data)} · {r.entidade || '—'} · <span className="font-mono">{fmtEuro(r.valor)}</span></div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
        <div className="bg-surface-page rounded p-2">
          <div className="text-[0.65rem] uppercase tracking-wider text-ink-muted font-semibold mb-1">Atual</div>
          {r.atual ? <div className="flex items-center gap-2"><SncBadge codigo={r.atual.codigo} /><span className="text-sm text-ink">{r.atual.nome}</span></div>
                   : <span className="text-xs text-bad-ink italic">Sem classificação</span>}
        </div>
        <div className={cn('rounded p-2', r.diverge ? 'bg-warn-soft' : r.semClass ? 'bg-brand-soft' : 'bg-good-soft')}>
          <div className="text-[0.65rem] uppercase tracking-wider text-ink-muted font-semibold mb-1 flex justify-between">
            <span>Sugestão IA</span>
            {r.sugerida && <span className={confColor}>Confiança {conf}%</span>}
          </div>
          {r.sugerida ? (
            <div className="flex items-center gap-2">
              <SncBadge codigo={r.sugerida.codigo} />
              <span className="text-sm text-ink flex-1">{r.sugerida.motivo}</span>
              {!readonly && (r.diverge || r.semClass) && (
                <Button size="sm" loading={aplicando === key} onClick={() => onAplicar(r)}>Aplicar</Button>
              )}
            </div>
          ) : <span className="text-xs text-ink-soft italic">IA não sugeriu</span>}
        </div>
      </div>

      {r.avisos.length > 0 && (
        <div className="mt-2 text-xs text-warn-ink flex items-start gap-1">
          <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
          <span>{r.avisos.join('; ')}</span>
        </div>
      )}
    </Card>
  );
}
