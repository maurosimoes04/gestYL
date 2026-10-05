import { useMemo, useState } from 'react';
import { Plus, Search, GitMerge, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Empty } from '@/components/ui/Table';
import { FormField } from '@/components/ui/FormField';
import { LoadingBlock } from '@/components/ui/Spinner';
import { apiDel, apiGet, apiPost } from '@/lib/api';
import { fmtEuro, fmtData } from '@/lib/format';
import { useToast } from '@/contexts/ToastContext';
import { useAuth } from '@/contexts/AuthContext';
import { useCatalogos } from '@/hooks/useCatalogos';
import type { Entidade } from '@/lib/types';
import { EntidadeFormModal } from '@/components/forms/EntidadeFormModal';
import { cn } from '@/lib/cn';

export function EntidadesPage() {
  const { toast } = useToast();
  const { role } = useAuth();
  const { entidades, loaded, reload } = useCatalogos();
  const [q, setQ] = useState('');
  const [tipo, setTipo] = useState('');
  const [soNaoVerif, setSoNaoVerif] = useState(false);
  const [selecionadas, setSelecionadas] = useState<Set<number>>(new Set());
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Entidade | null>(null);
  const [detalhe, setDetalhe] = useState<any | null>(null);
  const [showFundir, setShowFundir] = useState(false);
  const readonly = role === 'fiscal';

  const filtradas = useMemo(() => {
    const query = q.trim().toLowerCase();
    return entidades.filter(e => {
      if (tipo && !(e.tipos || []).includes(tipo)) return false;
      if (soNaoVerif && e.verificado) return false;
      if (query) {
        const hay = `${e.nome} ${e.nif || ''} ${e.email || ''}`.toLowerCase();
        if (!hay.includes(query)) return false;
      }
      return true;
    });
  }, [entidades, q, tipo, soNaoVerif]);

  const totalVerif = entidades.filter(e => e.verificado).length;

  function toggleSel(id: number) {
    setSelecionadas(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  async function abrirDetalhe(id: number) {
    try {
      const data = await apiGet(`/entidades/${id}`);
      setDetalhe(data);
    } catch (e: any) { toast(e.message || 'Erro', 'error'); }
  }

  async function fundir(destinoId: number) {
    const duplicados = [...selecionadas].filter(id => id !== destinoId);
    if (!duplicados.length) return;
    if (!confirm(`Fundir ${duplicados.length} entidade(s) na selecionada?`)) return;
    try {
      const r: any = await apiPost(`/entidades/${destinoId}/fundir`, { duplicadoIds: duplicados });
      toast(`Fundidas: ${r.entidadesEliminadas} eliminadas, ${r.faturasReapontadas + r.receitasReapontadas} movimentos repontados`, 'success');
      setSelecionadas(new Set());
      setShowFundir(false);
      await reload();
    } catch (e: any) { toast(e.message || 'Erro', 'error'); }
  }

  async function eliminarDetalhe() {
    if (!detalhe) return;
    if (!confirm(`Eliminar ${detalhe.entidade.nome}? (Só funciona sem movimentos ligados.)`)) return;
    try {
      await apiDel(`/entidades/${detalhe.entidade.id}`);
      toast('Entidade eliminada', 'success');
      setDetalhe(null);
      await reload();
    } catch (e: any) { toast(e.message || 'Erro', 'error'); }
  }

  return (
    <>
      <PageHeader
        title="Entidades"
        subtitle={`${filtradas.length} de ${entidades.length} · ${totalVerif} verificadas · ${entidades.length - totalVerif} por verificar`}
        actions={<>
          {selecionadas.size >= 2 && !readonly && (
            <Button variant="ghost" icon={<GitMerge className="w-4 h-4" />} onClick={() => setShowFundir(true)}>
              Fundir {selecionadas.size} selecionadas
            </Button>
          )}
          {!readonly && (
            <Button icon={<Plus className="w-4 h-4" />} onClick={() => { setEditing(null); setShowForm(true); }}>Nova entidade</Button>
          )}
        </>}
      />

      <Card className="mb-5 p-4 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-60">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" />
          <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Pesquisar por nome ou NIF…" className="pl-9" />
        </div>
        <Select value={tipo} onChange={e => setTipo(e.target.value)} className="w-56">
          <option value="">Todos os tipos</option>
          <option value="fornecedor">Fornecedores</option>
          <option value="financiador">Financiadores</option>
          <option value="pessoa-interna">Pessoas internas</option>
          <option value="socio">Sócios</option>
          <option value="cliente">Clientes</option>
        </Select>
        <label className="inline-flex items-center gap-2 text-sm text-ink-soft">
          <input type="checkbox" checked={soNaoVerif} onChange={e => setSoNaoVerif(e.target.checked)} />
          Só não verificadas
        </label>
      </Card>

      {!loaded ? <LoadingBlock /> : filtradas.length === 0 ? (
        <Card><Empty>Sem resultados no filtro atual.</Empty></Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {filtradas.map(e => {
            const sel = selecionadas.has(e.id);
            return (
              <div key={e.id} onClick={() => abrirDetalhe(e.id)}
                   className={cn('relative bg-white border rounded-lg shadow-soft p-4 cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-card',
                                sel ? 'border-brand ring-2 ring-brand/30' : 'border-line hover:border-ink-muted')}>
                <button
                  type="button"
                  onClick={ev => { ev.stopPropagation(); toggleSel(e.id); }}
                  className={cn('absolute top-2 right-2 w-5 h-5 rounded border-2 grid place-items-center text-xs transition-colors',
                               sel ? 'bg-brand border-brand text-white' : 'bg-white border-line hover:border-ink-muted')}
                  title="Selecionar para fundir">
                  {sel && <CheckCircle2 className="w-3 h-3" />}
                </button>
                <div className="pr-7">
                  <h3 className="font-semibold text-ink text-sm leading-tight">{e.nome}</h3>
                  <div className="mt-1 flex items-center gap-1 text-xs">
                    {e.nif ? <span className="font-mono text-ink-muted">{e.nif}</span> : <span className="italic text-ink-muted">sem NIF</span>}
                    {!e.verificado && <AlertTriangle className="w-3 h-3 text-warn-ink ml-1" />}
                  </div>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {(e.tipos || []).map(t => <Badge key={t} variant={t as any}>{t.replace('-', ' ')}</Badge>)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <EntidadeFormModal entidade={editing} onClose={() => setShowForm(false)}
                           onSaved={() => { setShowForm(false); reload(); }} />
      )}

      {detalhe && (
        <DetalheEntidadeModal detalhe={detalhe} onClose={() => setDetalhe(null)}
                              onEditar={() => { setEditing(detalhe.entidade); setShowForm(true); setDetalhe(null); }}
                              onEliminar={eliminarDetalhe} readonly={readonly} />
      )}

      {showFundir && (
        <FundirModal
          entidades={[...selecionadas].map(id => entidades.find(e => e.id === id)!).filter(Boolean)}
          onClose={() => setShowFundir(false)}
          onConfirm={fundir}
        />
      )}
    </>
  );
}

function DetalheEntidadeModal({ detalhe, onClose, onEditar, onEliminar, readonly }: any) {
  const e = detalhe.entidade;
  return (
    <Modal open onClose={onClose} size="xl" title={e.nome}
           footer={<>
             {!readonly && <Button variant="ghost" onClick={onEditar}>Editar</Button>}
             {!readonly && <Button variant="danger" onClick={onEliminar}>Eliminar</Button>}
             <Button variant="ghost" onClick={onClose}>Fechar</Button>
           </>}>
      <div className="bg-surface-page rounded-lg p-4 mb-4 flex flex-wrap gap-6">
        <div>
          <div className="text-xs text-ink-soft uppercase tracking-wider">NIF</div>
          <div className="font-mono text-ink">{e.nif || 'sem NIF'}</div>
        </div>
        {e.email && <div><div className="text-xs text-ink-soft uppercase tracking-wider">Email</div><div className="text-ink">{e.email}</div></div>}
        {e.telefone && <div><div className="text-xs text-ink-soft uppercase tracking-wider">Telefone</div><div className="text-ink">{e.telefone}</div></div>}
        {e.iban && <div><div className="text-xs text-ink-soft uppercase tracking-wider">IBAN</div><div className="font-mono text-ink text-xs">{e.iban}</div></div>}
      </div>
      <div className="flex flex-wrap gap-1 mb-6">
        {(e.tipos || []).map((t: string) => <Badge key={t} variant={t as any}>{t.replace('-', ' ')}</Badge>)}
      </div>
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="bg-good-soft rounded-lg p-4 text-center">
          <div className="text-xs text-good-ink uppercase tracking-wider font-semibold">Total receitas</div>
          <div className="text-2xl font-bold text-good-ink mt-1">{fmtEuro(detalhe.totais.receitas)}</div>
          <div className="text-xs text-good-ink/70 mt-1">{detalhe.receitas.length} registo(s)</div>
        </div>
        <div className="bg-bad-soft rounded-lg p-4 text-center">
          <div className="text-xs text-bad-ink uppercase tracking-wider font-semibold">Total despesas</div>
          <div className="text-2xl font-bold text-bad-ink mt-1">{fmtEuro(detalhe.totais.despesas)}</div>
          <div className="text-xs text-bad-ink/70 mt-1">{detalhe.faturas.length} registo(s)</div>
        </div>
      </div>

      {detalhe.receitas.length > 0 && <ListaMovimentos titulo="Receitas" rows={detalhe.receitas} tipo="in" />}
      {detalhe.faturas.length > 0 && <ListaMovimentos titulo="Despesas" rows={detalhe.faturas} tipo="out" />}
    </Modal>
  );
}

function ListaMovimentos({ titulo, rows, tipo }: { titulo: string; rows: any[]; tipo: 'in' | 'out' }) {
  return (
    <div className="mb-4">
      <h4 className="font-semibold text-sm mb-2">{titulo}</h4>
      <div className="rounded border border-line overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface-alt text-xs text-ink-soft uppercase">
            <tr><th className="px-3 py-2 text-left">Data</th><th className="px-3 py-2 text-left">Título</th><th className="px-3 py-2 text-left">SNC</th><th className="px-3 py-2 text-right">Valor</th></tr>
          </thead>
          <tbody className="divide-y divide-line-soft">
            {rows.slice(0, 30).map(r => (
              <tr key={r.id}>
                <td className="px-3 py-2 font-mono text-xs">{fmtData(r.data)}</td>
                <td className="px-3 py-2">{r.titulo}</td>
                <td className="px-3 py-2">{r.contaSnc ? <span className="font-mono text-xs bg-brand-soft text-brand px-1.5 py-0.5 rounded">{r.contaSnc.codigo}</span> : '—'}</td>
                <td className={`px-3 py-2 text-right font-mono tabular font-semibold ${tipo === 'in' ? 'text-good' : 'text-bad-ink'}`}>{fmtEuro(r.valor)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FundirModal({ entidades, onClose, onConfirm }: { entidades: Entidade[]; onClose: () => void; onConfirm: (id: number) => void }) {
  const [destino, setDestino] = useState<number>(entidades[0]?.id);
  return (
    <Modal open onClose={onClose} title="Fundir entidades" size="md"
           footer={<>
             <Button variant="ghost" onClick={onClose}>Cancelar</Button>
             <Button variant="danger" onClick={() => onConfirm(destino)}>Fundir e eliminar duplicados</Button>
           </>}>
      <p className="text-sm text-ink mb-4">
        Escolhe a entidade a <strong>manter</strong>. Todas as receitas/despesas das outras serão repontadas para esta e as outras serão <strong>eliminadas</strong>.
      </p>
      <FormField label="Manter esta entidade">
        <Select value={destino} onChange={e => setDestino(Number(e.target.value))}>
          {entidades.map(e => (
            <option key={e.id} value={e.id}>
              {e.nome} {e.nif ? `[${e.nif}]` : '(sem NIF)'}
            </option>
          ))}
        </Select>
      </FormField>
      <div className="bg-warn-soft border border-warn/30 rounded-lg p-3 mt-4 text-sm text-warn-ink">
        <strong>{entidades.length} entidades selecionadas:</strong>
        <ul className="mt-1 pl-5 list-disc">
          {entidades.map(e => <li key={e.id}>{e.nome} {e.nif ? `[${e.nif}]` : ''}</li>)}
        </ul>
      </div>
    </Modal>
  );
}

