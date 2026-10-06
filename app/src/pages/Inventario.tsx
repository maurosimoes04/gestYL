import { useEffect, useMemo, useState } from 'react';
import { Package, FileText, Boxes, Plus, QrCode, Download, Search } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge, estadoVariant, SncBadge } from '@/components/ui/Badge';
import { Table, THead, TBody, TH, TR, TD, Empty } from '@/components/ui/Table';
import { LoadingBlock } from '@/components/ui/Spinner';
import { Modal } from '@/components/ui/Modal';
import { Select, Input } from '@/components/ui/Input';
import { apiGet, apiPost } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import { fmtData, fmtEuro } from '@/lib/format';
import { cn } from '@/lib/cn';
import { openProtected } from '@/lib/download';
import { InventarioFormModal } from '@/components/forms/InventarioFormModal';
import { StockMovimentoModal } from '@/components/forms/StockMovimentoModal';
import { Minus, Plus as PlusIcon, Pencil, AlertTriangle, Clock } from 'lucide-react';

interface InventarioItem {
  id: number; tipo: string; nome: string; codigoPatrimonio?: string | null;
  categoria?: string | null; localizacao?: string | null; estado?: string | null;
  quantidade: number; unidade?: string | null; quantidadeMinima?: number | null;
  custoUnitario?: number | null; dataAquisicao?: string | null; dataValidade?: string | null;
  contaSncId?: number | null; anosDepreciacao?: number | null;
  contaSnc?: { codigo: string; nome: string } | null;
  notas?: string | null;
}

function diasAteValidade(dataValidade?: string | null): number | null {
  if (!dataValidade) return null;
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const dv = new Date(dataValidade); dv.setHours(0, 0, 0, 0);
  return Math.round((dv.getTime() - hoje.getTime()) / 86400000);
}

interface Candidato { id: number; titulo: string; valor: number; data: string; contaSnc?: { codigo: string; nome: string } | null; entidade?: { nome: string } | null; }

interface DepreciacoesData {
  ano: number;
  itens: Array<{ id: number; nome: string; codigo?: string | null; contaSnc?: { codigo: string } | null;
                 dataAquisicao: string; custo: number; anos: number;
                 depreciacaoAcumulada: number; depreciacaoAno: number; valorLiquido: number }>;
  totais: { custo: number; acumulado: number; ano: number; liquido: number };
}

export function InventarioPage() {
  const { toast, promise } = useToast();
  const [tab, setTab] = useState<'consumivel' | 'fixo'>('fixo');
  const [items, setItems] = useState<InventarioItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCap, setShowCap] = useState(false);
  const [showDep, setShowDep] = useState(false);
  const [showNovo, setShowNovo] = useState(false);
  const [editItem, setEditItem] = useState<InventarioItem | null>(null);
  const [movItem, setMovItem] = useState<{ item: InventarioItem; defaultTipo: 'consumo' | 'entrada' } | null>(null);
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set());
  const [acaoPdf, setAcaoPdf] = useState<'etiquetas' | 'export' | null>(null);
  const [candidatos, setCandidatos] = useState<Candidato[]>([]);
  const [badgeN, setBadgeN] = useState<number>(0);

  function toggleSel(id: number) {
    setSelecionados(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  async function abrirEtiquetas() {
    const ids = tab === 'fixo'
      ? (selecionados.size ? [...selecionados] : fixos.filter(i => i.codigoPatrimonio).map(i => i.id))
      : [];
    if (!ids.length) { toast('Seleciona pelo menos um ativo fixo com código de património', 'error'); return; }
    setAcaoPdf('etiquetas');
    try {
      await promise(openProtected(`/inventario/etiquetas/pdf?ids=${ids.join(',')}`), {
        loading: `A gerar ${ids.length} ${ids.length === 1 ? 'etiqueta' : 'etiquetas'}…`,
        success: 'Etiquetas abertas numa nova aba',
        error: (e) => e?.message || 'Erro ao gerar etiquetas',
      });
    } catch { /* promise já notificou */ }
    finally { setAcaoPdf(null); }
  }

  async function abrirExportPdf() {
    setAcaoPdf('export');
    try {
      await promise(openProtected('/inventario/export/pdf'), {
        loading: 'A gerar inventário completo em PDF…',
        success: 'Inventário aberto numa nova aba',
        error: (e) => e?.message || 'Erro ao exportar',
      });
    } catch { /* promise já notificou */ }
    finally { setAcaoPdf(null); }
  }

  async function reload() {
    setLoading(true);
    try { setItems(await apiGet<InventarioItem[]>('/inventario')); }
    finally { setLoading(false); }
    try { const c = await apiGet<Candidato[]>('/inventario/candidatos-ativo'); setBadgeN(c.length); } catch {}
  }
  useEffect(() => { reload(); }, []);

  const [q, setQ] = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [filtroValidade, setFiltroValidade] = useState<'' | 'vencido' | 'proximo' | 'baixo'>('');

  const consumiveis = useMemo(() => items.filter(i => i.tipo === 'consumivel'), [items]);
  const fixos = useMemo(() => items.filter(i => i.tipo === 'fixo'), [items]);
  const base = tab === 'consumivel' ? consumiveis : fixos;

  const categorias = useMemo(() => {
    const set = new Set<string>();
    base.forEach(i => { if (i.categoria) set.add(i.categoria); });
    return [...set].sort();
  }, [base]);
  const estados = useMemo(() => {
    const set = new Set<string>();
    base.forEach(i => { if (i.estado) set.add(i.estado); });
    return [...set].sort();
  }, [base]);

  const lista = useMemo(() => {
    const query = q.trim().toLowerCase();
    return base.filter(i => {
      if (filtroCategoria && i.categoria !== filtroCategoria) return false;
      if (filtroEstado && i.estado !== filtroEstado) return false;
      if (filtroValidade && tab === 'consumivel') {
        const dias = diasAteValidade(i.dataValidade);
        if (filtroValidade === 'vencido' && !(dias !== null && dias < 0)) return false;
        if (filtroValidade === 'proximo' && !(dias !== null && dias >= 0 && dias <= 30)) return false;
        if (filtroValidade === 'baixo' && !(i.quantidadeMinima != null && i.quantidade < i.quantidadeMinima)) return false;
      }
      if (query) {
        const hay = `${i.nome} ${i.codigoPatrimonio || ''} ${i.categoria || ''} ${i.localizacao || ''} ${i.notas || ''}`.toLowerCase();
        if (!hay.includes(query)) return false;
      }
      return true;
    });
  }, [base, q, filtroCategoria, filtroEstado, filtroValidade, tab]);

  // KPI: validades
  const alertasValidade = useMemo(() => {
    const vencidos: InventarioItem[] = []; const proximos: InventarioItem[] = [];
    for (const i of consumiveis) {
      const d = diasAteValidade(i.dataValidade);
      if (d === null) continue;
      if (d < 0) vencidos.push(i);
      else if (d <= 30) proximos.push(i);
    }
    return { vencidos, proximos };
  }, [consumiveis]);

  async function abrirCap() {
    try { setCandidatos(await apiGet<Candidato[]>('/inventario/candidatos-ativo')); setShowCap(true); }
    catch (e: any) { toast(e.message || 'Erro', 'error'); }
  }

  async function capitalizar(fat: Candidato, anos: number) {
    try {
      await apiPost('/inventario/criar-de-despesa', { faturaId: fat.id, anosDepreciacao: anos });
      toast('Capitalizado como ativo fixo', 'success');
      setCandidatos(cs => cs.filter(c => c.id !== fat.id));
      reload();
    } catch (e: any) { toast(e.message || 'Erro', 'error'); }
  }

  return (
    <>
      <PageHeader
        title="Inventário"
        subtitle={`${consumiveis.length} consumíveis · ${fixos.length} ativos fixos${alertasValidade.vencidos.length > 0 ? ` · ${alertasValidade.vencidos.length} vencido(s)` : ''}${alertasValidade.proximos.length > 0 ? ` · ${alertasValidade.proximos.length} próximo(s) do fim` : ''}`}
        actions={<>
          <Button variant="ghost" icon={<Boxes className="w-4 h-4" />} onClick={abrirCap}>
            Capitalizar despesas {badgeN > 0 && <span className="ml-1 px-1.5 bg-bad text-white text-xs rounded-full">{badgeN}</span>}
          </Button>
          <Button variant="ghost" icon={<FileText className="w-4 h-4" />} onClick={() => setShowDep(true)}>Depreciações</Button>
          {tab === 'fixo' && (
            <Button variant="ghost" icon={<QrCode className="w-4 h-4" />} loading={acaoPdf === 'etiquetas'} onClick={abrirEtiquetas}>
              Etiquetas QR {selecionados.size > 0 && <span className="ml-1 px-1.5 bg-brand text-white text-xs rounded-full">{selecionados.size}</span>}
            </Button>
          )}
          <Button variant="ghost" icon={<Download className="w-4 h-4" />} loading={acaoPdf === 'export'} onClick={abrirExportPdf}>Exportar PDF</Button>
          <Button icon={<Plus className="w-4 h-4" />} onClick={() => setShowNovo(true)}>Novo item</Button>
        </>}
      />

      {(alertasValidade.vencidos.length > 0 || alertasValidade.proximos.length > 0) && tab === 'consumivel' && (
        <div className="mb-5 flex flex-wrap gap-3">
          {alertasValidade.vencidos.length > 0 && (
            <div className="flex-1 min-w-60 bg-bad-soft border border-bad/30 rounded-lg px-4 py-3">
              <div className="flex items-start gap-2 mb-1">
                <AlertTriangle className="w-4 h-4 text-bad-ink shrink-0 mt-0.5" />
                <div className="text-sm text-bad-ink flex-1">
                  <strong>{alertasValidade.vencidos.length} produto(s) com validade vencida</strong>
                </div>
                <button onClick={() => setFiltroValidade('vencido')}
                        className="text-xs text-bad-ink underline hover:no-underline">Filtrar</button>
              </div>
              <div className="flex flex-wrap gap-1 mt-2 pl-6">
                {alertasValidade.vencidos.map(v => (
                  <button key={v.id} onClick={() => setEditItem(v)}
                          className="text-xs bg-white text-bad-ink border border-bad/30 rounded px-2 py-0.5 hover:bg-bad hover:text-white transition-colors"
                          title="Abrir para rever">
                    {v.nome}
                  </button>
                ))}
              </div>
            </div>
          )}
          {alertasValidade.proximos.length > 0 && (
            <div className="flex-1 min-w-60 bg-warn-soft border border-warn/30 rounded-lg px-4 py-3">
              <div className="flex items-start gap-2 mb-1">
                <Clock className="w-4 h-4 text-warn-ink shrink-0 mt-0.5" />
                <div className="text-sm text-warn-ink flex-1">
                  <strong>{alertasValidade.proximos.length} produto(s) a expirar em ≤ 30 dias</strong>
                </div>
                <button onClick={() => setFiltroValidade('proximo')}
                        className="text-xs text-warn-ink underline hover:no-underline">Filtrar</button>
              </div>
              <div className="flex flex-wrap gap-1 mt-2 pl-6">
                {alertasValidade.proximos.map(v => {
                  const d = diasAteValidade(v.dataValidade);
                  return (
                    <button key={v.id} onClick={() => setEditItem(v)}
                            className="text-xs bg-white text-warn-ink border border-warn/30 rounded px-2 py-0.5 hover:bg-warn hover:text-white transition-colors inline-flex items-center gap-1"
                            title="Abrir para rever">
                      {v.nome}
                      <span className="opacity-60">·{d}d</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      <Card className="mb-5 p-4 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-60">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" />
          <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Pesquisar nome, código, categoria ou local…" className="pl-9" />
        </div>
        {categorias.length > 0 && (
          <Select value={filtroCategoria} onChange={e => setFiltroCategoria(e.target.value)} className="w-52">
            <option value="">Todas as categorias</option>
            {categorias.map(c => <option key={c} value={c}>{c}</option>)}
          </Select>
        )}
        {estados.length > 0 && (
          <Select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)} className="w-40">
            <option value="">Todos os estados</option>
            {estados.map(e => <option key={e} value={e}>{e}</option>)}
          </Select>
        )}
        {tab === 'consumivel' && (
          <Select value={filtroValidade} onChange={e => setFiltroValidade(e.target.value as any)} className="w-52">
            <option value="">Sem filtro de validade</option>
            <option value="vencido">Só vencidos</option>
            <option value="proximo">Só próximos (≤ 30 dias)</option>
            <option value="baixo">Stock abaixo do mínimo</option>
          </Select>
        )}
        {(q || filtroCategoria || filtroEstado || filtroValidade) && (
          <Button variant="ghost" size="sm" onClick={() => { setQ(''); setFiltroCategoria(''); setFiltroEstado(''); setFiltroValidade(''); }}>
            Limpar filtros
          </Button>
        )}
        <span className="ml-auto text-xs text-ink-soft">{lista.length} / {base.length}</span>
      </Card>

      <div className="flex gap-1 mb-5 border-b border-line">
        {([['fixo', `Ativos fixos (${fixos.length})`], ['consumivel', `Consumíveis (${consumiveis.length})`]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={cn(
            'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
            tab === k ? 'text-brand border-brand' : 'text-ink-soft border-transparent hover:text-ink',
          )}>{l}</button>
        ))}
      </div>

      {loading ? <LoadingBlock /> : lista.length === 0 ? (
        <Card><Empty icon={<Package className="w-10 h-10" />}>Sem items.</Empty></Card>
      ) : (
        <Table>
          <THead>
            {tab === 'fixo' && <TH><input type="checkbox" title="Selecionar todos"
                                           checked={selecionados.size > 0 && selecionados.size === fixos.filter(i => i.codigoPatrimonio).length}
                                           onChange={e => {
                                             if (e.target.checked) setSelecionados(new Set(fixos.filter(i => i.codigoPatrimonio).map(i => i.id)));
                                             else setSelecionados(new Set());
                                           }} /></TH>}
            <TH>Nome</TH><TH>Código</TH><TH>Categoria</TH>{tab === 'fixo' && <TH>SNC</TH>}
            <TH>Localização</TH>
            {tab === 'consumivel' && <TH align="right">Qty</TH>}
            {tab === 'consumivel' && <TH>Validade</TH>}
            <TH>Estado</TH>
            <TH align="right">Custo</TH>
            {tab === 'fixo' && <TH align="right">Anos</TH>}
            <TH />
          </THead>
          <TBody>
            {lista.map(i => {
              const baixo = tab === 'consumivel' && i.quantidadeMinima != null && i.quantidade < i.quantidadeMinima;
              const dias = diasAteValidade(i.dataValidade);
              const classeValidade = dias === null ? '' : dias < 0 ? 'text-bad-ink font-semibold' : dias <= 30 ? 'text-warn-ink font-semibold' : 'text-ink-soft';
              return (
                <TR key={i.id}>
                  {tab === 'fixo' && (
                    <TD>
                      <input type="checkbox" checked={selecionados.has(i.id)} onChange={() => toggleSel(i.id)}
                             disabled={!i.codigoPatrimonio}
                             title={!i.codigoPatrimonio ? 'Sem código de património — editar para gerar' : 'Selecionar para etiquetas'} />
                    </TD>
                  )}
                  <TD><div className="font-medium">{i.nome}</div></TD>
                  <TD mono>{i.codigoPatrimonio || '—'}</TD>
                  <TD><span className="text-xs text-ink-soft">{i.categoria || '—'}</span></TD>
                  {tab === 'fixo' && <TD>{i.contaSnc ? <SncBadge codigo={i.contaSnc.codigo} /> : '—'}</TD>}
                  <TD><span className="text-xs">{i.localizacao || '—'}</span></TD>
                  {tab === 'consumivel' && (
                    <TD align="right" mono>
                      <span className={cn('font-semibold', baixo && 'text-bad-ink')}>{i.quantidade}</span>
                      {i.unidade && <span className="text-xs text-ink-muted ml-1">{i.unidade}</span>}
                    </TD>
                  )}
                  {tab === 'consumivel' && (
                    <TD>
                      {dias === null ? <span className="text-ink-muted text-xs">—</span>
                      : <div className={classeValidade}>
                          <div className="text-xs tabular font-mono">{fmtData(i.dataValidade)}</div>
                          <div className="text-[0.68rem]">
                            {dias < 0 ? `${Math.abs(dias)}d vencido` : dias === 0 ? 'Hoje' : `${dias}d`}
                          </div>
                        </div>}
                    </TD>
                  )}
                  <TD>{i.estado && <Badge variant={estadoVariant(i.estado)}>{i.estado}</Badge>}</TD>
                  <TD align="right" mono className="font-semibold">{i.custoUnitario != null ? fmtEuro(i.custoUnitario) : '—'}</TD>
                  {tab === 'fixo' && <TD align="right" mono>{i.anosDepreciacao ?? '—'}</TD>}
                  <TD>
                    <div className="flex gap-1 justify-end">
                      {tab === 'consumivel' && (
                        <>
                          <button onClick={() => setMovItem({ item: i, defaultTipo: 'consumo' })}
                                  className="p-1.5 text-bad-ink hover:bg-bad-soft rounded" title="Registar consumo">
                            <Minus className="w-4 h-4" />
                          </button>
                          <button onClick={() => setMovItem({ item: i, defaultTipo: 'entrada' })}
                                  className="p-1.5 text-good hover:bg-good-soft rounded" title="Registar entrada">
                            <PlusIcon className="w-4 h-4" />
                          </button>
                        </>
                      )}
                      <button onClick={() => setEditItem(i)}
                              className="p-1.5 text-ink-soft hover:text-brand hover:bg-brand-soft rounded" title="Editar">
                        <Pencil className="w-4 h-4" />
                      </button>
                    </div>
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      )}

      {showCap && <CapitalizarModal candidatos={candidatos} onClose={() => setShowCap(false)} onCap={capitalizar} />}
      {showDep && <DepreciacoesModal onClose={() => setShowDep(false)} />}
      {showNovo && <InventarioFormModal onClose={() => setShowNovo(false)} onSaved={() => { setShowNovo(false); reload(); }} />}
      {editItem && <InventarioFormModal item={editItem} onClose={() => setEditItem(null)} onSaved={() => { setEditItem(null); reload(); }} />}
      {movItem && <StockMovimentoModal item={movItem.item} defaultTipo={movItem.defaultTipo}
                                        onClose={() => setMovItem(null)}
                                        onSaved={() => { setMovItem(null); reload(); }} />}
    </>
  );
}

function CapitalizarModal({ candidatos, onClose, onCap }: { candidatos: Candidato[]; onClose: () => void; onCap: (c: Candidato, anos: number) => Promise<void> }) {
  const [anos, setAnos] = useState<Record<number, number>>({});
  /** Sugere anos de vida útil combinando SNC + palavras-chave no título */
  const sugerir = (cod: string | undefined, titulo: string) => {
    const t = (titulo || '').toLowerCase();
    if (!cod) return 8;
    if (cod.startsWith('432')) return 50;      // Edifícios/obras
    if (cod.startsWith('434')) return 4;       // Viaturas
    if (cod.startsWith('433')) return 8;       // Equipamento básico
    // 435 — distinguir TI (3 anos) de mobiliário (8 anos)
    if (cod.startsWith('435')) {
      if (/\b(port[aá]til|notebook|computador|asus|pcdiga|rato|teclado|monitor|impressora|roteador|router|disco)\b/.test(t)) return 3;
      return 8;
    }
    return 8;
  };

  return (
    <Modal open onClose={onClose} title="Capitalizar despesas como ativos fixos" size="lg"
           footer={<Button variant="ghost" onClick={onClose}>Fechar</Button>}>
      <p className="text-sm text-ink-soft mb-2">
        Despesas classificadas em conta SNC 43x (ativos fixos) que ainda não foram transformadas em item de inventário.
      </p>
      <div className="mb-4 bg-info-soft text-info-ink rounded-md p-3 text-xs">
        <strong>Anos = vida útil</strong> (DR 25/2009). O custo é espalhado como depreciação anual na conta 68.
        Padrão: TI 3 anos · mobiliário 8 · insufláveis 8 · viatura 4 · obras 50.
      </div>
      {candidatos.length === 0 ? (
        <div className="text-center py-8 text-ink-soft">Nenhuma despesa pendente de capitalização.</div>
      ) : (
        <Table>
          <THead><TH>Data</TH><TH>Despesa</TH><TH>SNC</TH><TH align="right">Valor</TH><TH>Anos</TH><TH /></THead>
          <TBody>
            {candidatos.map(f => {
              const sug = sugerir(f.contaSnc?.codigo, f.titulo);
              return (
                <TR key={f.id}>
                  <TD mono>{fmtData(f.data)}</TD>
                  <TD>
                    <div className="font-medium">{f.titulo}</div>
                    {f.entidade && <div className="text-xs text-ink-soft">{f.entidade.nome}</div>}
                  </TD>
                  <TD>{f.contaSnc && <SncBadge codigo={f.contaSnc.codigo} />}</TD>
                  <TD align="right" mono className="font-semibold">{fmtEuro(f.valor)}</TD>
                  <TD>
                    <input type="number" min={1} max={60}
                           className="w-16 px-2 py-1 border border-line rounded text-sm"
                           title="Vida útil em anos — período durante o qual o custo é espalhado como depreciação"
                           defaultValue={sug}
                           onChange={e => setAnos(a => ({ ...a, [f.id]: Number(e.target.value) }))} />
                  </TD>
                  <TD align="right">
                    <Button size="sm" onClick={() => onCap(f, anos[f.id] || sug)}>Capitalizar</Button>
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      )}
    </Modal>
  );
}

function DepreciacoesModal({ onClose }: { onClose: () => void }) {
  const [ano, setAno] = useState(new Date().getFullYear());
  const [data, setData] = useState<DepreciacoesData | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { setLoading(true); apiGet<DepreciacoesData>('/inventario/depreciacoes', { ano }).then(setData).finally(() => setLoading(false)); }, [ano]);

  return (
    <Modal open onClose={onClose} title="Mapa de depreciações" size="xl"
           footer={<Button variant="ghost" onClick={onClose}>Fechar</Button>}>
      <div className="flex items-center gap-2 mb-4">
        <span className="text-sm text-ink-soft">Ano:</span>
        <Select value={ano} onChange={e => setAno(Number(e.target.value))} className="w-28">
          {[0, 1, 2, 3, 4].map(d => <option key={d} value={new Date().getFullYear() - d}>{new Date().getFullYear() - d}</option>)}
        </Select>
      </div>
      {loading && <LoadingBlock />}
      {!loading && data && (
        <>
          <div className="grid grid-cols-4 gap-3 mb-4">
            <div className="bg-white border border-line rounded p-3"><div className="text-xs text-ink-soft uppercase">Custo total</div><div className="text-xl font-bold tabular">{fmtEuro(data.totais.custo)}</div></div>
            <div className="bg-bad-soft border border-bad/20 rounded p-3"><div className="text-xs text-bad-ink uppercase">Acumulada</div><div className="text-xl font-bold tabular text-bad-ink">{fmtEuro(data.totais.acumulado)}</div></div>
            <div className="bg-bad-soft border border-bad/20 rounded p-3"><div className="text-xs text-bad-ink uppercase">Do ano {ano}</div><div className="text-xl font-bold tabular text-bad-ink">{fmtEuro(data.totais.ano)}</div></div>
            <div className="bg-good-soft border border-good/20 rounded p-3"><div className="text-xs text-good-ink uppercase">Valor líquido</div><div className="text-xl font-bold tabular text-good-ink">{fmtEuro(data.totais.liquido)}</div></div>
          </div>
          <Table>
            <THead>
              <TH>Ativo</TH><TH>SNC</TH><TH>Aquisição</TH><TH align="right">Custo</TH><TH align="right">Anos</TH>
              <TH align="right">Acum.</TH><TH align="right">Ano</TH><TH align="right">Líquido</TH>
            </THead>
            <TBody>
              {data.itens.map(i => (
                <TR key={i.id}>
                  <TD>
                    <div className="font-medium">{i.nome}</div>
                    {i.codigo && <div className="text-xs font-mono text-ink-muted">{i.codigo}</div>}
                  </TD>
                  <TD>{i.contaSnc && <SncBadge codigo={i.contaSnc.codigo} />}</TD>
                  <TD mono>{fmtData(i.dataAquisicao)}</TD>
                  <TD align="right" mono>{fmtEuro(i.custo)}</TD>
                  <TD align="right" mono>{i.anos}</TD>
                  <TD align="right" mono>{fmtEuro(i.depreciacaoAcumulada)}</TD>
                  <TD align="right" mono className="text-bad-ink">{fmtEuro(i.depreciacaoAno)}</TD>
                  <TD align="right" mono className="font-semibold">{fmtEuro(i.valorLiquido)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
          <p className="text-xs text-ink-soft mt-3">Depreciação do ano = acumulada em 31/12/{ano} menos em 31/12/{ano - 1}. Lançar como gasto na conta <strong>68</strong>.</p>
        </>
      )}
    </Modal>
  );
}
