import { useEffect, useState } from 'react';
import { Plus, FileText, Trash2, Pencil, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Input, Select } from '@/components/ui/Input';
import { apiDel, apiGet, apiPost, apiPut } from '@/lib/api';
import { fmtData, fmtEuro } from '@/lib/format';
import { useToast } from '@/contexts/ToastContext';
import { openProtected } from '@/lib/download';
import type { Processo, ReciboBolsa } from '@/lib/types';

interface Props {
  entidadeId: number;
  subsidioRefeicaoDia?: number | null;
  processos: Processo[];
  readonly?: boolean;
}

const TSU_DEFAULT = 0.2375;

export function RecibosBolsaSection({ entidadeId, subsidioRefeicaoDia: subRefDia, processos, readonly }: Props) {
  const { toast, promise } = useToast();
  const [recibos, setRecibos] = useState<ReciboBolsa[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ReciboBolsa | null>(null);

  async function reload() {
    setLoading(true);
    try { setRecibos(await apiGet<ReciboBolsa[]>(`/recibos-bolsa?entidadeId=${entidadeId}`)); }
    finally { setLoading(false); }
  }
  useEffect(() => { reload(); }, [entidadeId]);

  async function remover(r: ReciboBolsa) {
    if (!confirm(`Eliminar recibo ${r.numeroRecibo}?`)) return;
    try { await apiDel(`/recibos-bolsa/${r.id}`); toast('Recibo eliminado', 'success'); reload(); }
    catch (e: any) { toast(e.message || 'Erro', 'error'); }
  }

  function estadoVariant(e: string) {
    if (e === 'Pago') return 'good' as const;
    if (e === 'Emitido') return 'warn' as const;
    return 'neutral' as const;
  }

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-semibold text-ink-soft uppercase tracking-wider flex items-center gap-1.5">
          <FileText className="w-3.5 h-3.5" /> Recibos de Bolsa ({recibos.length})
        </h4>
        {!readonly && (
          <Button size="sm" variant="subtle" icon={<Plus className="w-3 h-3" />} onClick={() => { setEditing(null); setShowForm(true); }}>
            Novo recibo
          </Button>
        )}
      </div>

      {loading ? (
        <p className="text-xs text-ink-soft italic py-1">A carregar...</p>
      ) : recibos.length === 0 ? (
        <p className="text-xs text-ink-soft italic py-2">Sem recibos de bolsa.</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {recibos.map(r => (
            <div key={r.id} className="bg-white border border-line rounded-md px-3 py-2 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-ink">
                  Nº {r.numeroRecibo}
                  <span className="text-ink-soft font-normal"> — {fmtData(r.periodoInicio)} a {fmtData(r.periodoFim)}</span>
                </div>
                <div className="text-xs text-ink-soft flex gap-3 mt-0.5">
                  <span>{r.diasUteis} dias úteis</span>
                  <span className="font-mono">Bolsa: {fmtEuro(r.bolsaBruta)}</span>
                  {Number(r.subsidioRefeicao) > 0 && <span className="font-mono">Sub. ref.: {fmtEuro(r.subsidioRefeicao)}</span>}
                  <span className="font-mono font-semibold text-brand">Líq.: {fmtEuro(r.totalLiquido)}</span>
                </div>
              </div>
              <Badge variant={estadoVariant(r.estado)}>{r.estado}</Badge>
              <button type="button"
                onClick={() => promise(openProtected(`/recibos-bolsa/${r.id}/pdf`), { loading: 'A gerar PDF…', success: 'PDF aberto', error: (e: any) => e?.message || 'Erro' })}
                className="p-1 text-ink-soft hover:text-brand rounded" title="Abrir PDF">
                <ExternalLink className="w-4 h-4" />
              </button>
              {!readonly && (
                <>
                  <button onClick={() => { setEditing(r); setShowForm(true); }}
                          className="p-1 text-ink-soft hover:text-brand rounded"><Pencil className="w-3.5 h-3.5" /></button>
                  <button onClick={() => remover(r)}
                          className="p-1 text-ink-soft hover:text-bad-ink rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <ReciboBolsaFormModal
          entidadeId={entidadeId}
          subsidioRefeicaoDia={subRefDia}
          processos={processos}
          editing={editing}
          onClose={() => { setShowForm(false); setEditing(null); }}
          onSaved={() => { setShowForm(false); setEditing(null); reload(); }}
        />
      )}
    </div>
  );
}

function ReciboBolsaFormModal({ entidadeId, subsidioRefeicaoDia, processos, editing, onClose, onSaved }: {
  entidadeId: number;
  subsidioRefeicaoDia?: number | null;
  processos: Processo[];
  editing: ReciboBolsa | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const isNew = !editing;

  const [numeroRecibo, setNumeroRecibo] = useState(editing?.numeroRecibo || '');
  const [processoId, setProcessoId] = useState(editing?.processoId?.toString() || '');
  const [periodoInicio, setPeriodoInicio] = useState(editing?.periodoInicio?.slice(0, 10) || '');
  const [periodoFim, setPeriodoFim] = useState(editing?.periodoFim?.slice(0, 10) || '');
  const [diasUteis, setDiasUteis] = useState(editing?.diasUteis?.toString() || '');
  const [bolsaDiaria, setBolsaDiaria] = useState(editing ? String(Number(editing.bolsaDiaria)) : '');
  const [taxaTSU, setTaxaTSU] = useState(editing ? String(Number(editing.taxaTSU)) : String(TSU_DEFAULT));
  const [subRefDia, setSubRefDia] = useState(editing ? String(Number(editing.subsidioRefeicaoDia)) : String(subsidioRefeicaoDia || 0));
  const [observacoes, setObservacoes] = useState(editing?.observacoes || '');
  const [estado, setEstado] = useState<'Rascunho' | 'Emitido' | 'Pago'>(editing?.estado || 'Rascunho');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isNew && !numeroRecibo) {
      apiGet<{ numero: string }>('/recibos-bolsa/next-number').then(r => setNumeroRecibo(r.numero)).catch(() => {});
    }
  }, []);

  const dias = Number(diasUteis) || 0;
  const bolsa = Number(bolsaDiaria) || 0;
  const tsu = Number(taxaTSU) || TSU_DEFAULT;
  const subRef = Number(subRefDia) || 0;
  const bolsaBruta = +(bolsa * dias).toFixed(2);
  const valorTSU = +(bolsaBruta * tsu).toFixed(2);
  const subsidioRefeicao = +(subRef * dias).toFixed(2);
  const totalBruto = +(bolsaBruta + subsidioRefeicao).toFixed(2);
  const totalLiquido = +(totalBruto - valorTSU).toFixed(2);

  async function submit() {
    if (!numeroRecibo || !periodoInicio || !periodoFim || !diasUteis || !bolsaDiaria) {
      toast('Preenche todos os campos obrigatórios', 'error');
      return;
    }
    setSaving(true);
    try {
      const body = {
        numeroRecibo, entidadeId,
        processoId: processoId || null,
        periodoInicio, periodoFim,
        diasUteis: Number(diasUteis), bolsaDiaria: Number(bolsaDiaria),
        taxaTSU: tsu, subsidioRefeicaoDia: subRef,
        observacoes: observacoes || null, estado,
        dataEmissao: estado !== 'Rascunho' ? new Date().toISOString() : null,
        dataPagamento: estado === 'Pago' ? new Date().toISOString() : null,
      };
      if (isNew) {
        await apiPost('/recibos-bolsa', body);
        toast('Recibo criado', 'success');
      } else {
        await apiPut(`/recibos-bolsa/${editing!.id}`, body);
        toast('Recibo atualizado', 'success');
      }
      onSaved();
    } catch (e: any) { toast(e.message || 'Erro', 'error'); }
    finally { setSaving(false); }
  }

  return (
    <Modal open onClose={onClose} title={isNew ? 'Novo Recibo de Bolsa' : `Editar Recibo ${editing!.numeroRecibo}`} size="lg"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit} disabled={saving}>{saving ? 'A guardar…' : isNew ? 'Criar' : 'Guardar'}</Button>
        </div>
      }>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-ink-soft mb-1">Nº Recibo *</label>
          <Input value={numeroRecibo} onChange={e => setNumeroRecibo(e.target.value)} placeholder="1/2026" />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-soft mb-1">Processo / Apoio</label>
          <Select value={processoId} onChange={e => setProcessoId(e.target.value)}>
            <option value="">— Nenhum —</option>
            {processos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </Select>
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-soft mb-1">Período início *</label>
          <Input type="date" value={periodoInicio} onChange={e => setPeriodoInicio(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-soft mb-1">Período fim *</label>
          <Input type="date" value={periodoFim} onChange={e => setPeriodoFim(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-soft mb-1">Dias úteis *</label>
          <Input type="number" min="0" value={diasUteis} onChange={e => setDiasUteis(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-soft mb-1">Bolsa diária (€) *</label>
          <Input type="number" step="0.01" min="0" value={bolsaDiaria} onChange={e => setBolsaDiaria(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-soft mb-1">Sub. refeição / dia (€)</label>
          <Input type="number" step="0.01" min="0" value={subRefDia} onChange={e => setSubRefDia(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-soft mb-1">Taxa TSU</label>
          <Input type="number" step="0.0001" min="0" max="1" value={taxaTSU} onChange={e => setTaxaTSU(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-soft mb-1">Estado</label>
          <Select value={estado} onChange={e => setEstado(e.target.value as 'Rascunho' | 'Emitido' | 'Pago')}>
            <option value="Rascunho">Rascunho</option>
            <option value="Emitido">Emitido</option>
            <option value="Pago">Pago</option>
          </Select>
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-ink-soft mb-1">Observações</label>
          <Input value={observacoes} onChange={e => setObservacoes(e.target.value)} placeholder="(opcional)" />
        </div>
      </div>

      {/* Resumo de cálculos */}
      <div className="mt-5 bg-surface-page border border-line rounded-lg p-4">
        <h5 className="text-xs font-semibold text-ink-soft uppercase tracking-wider mb-3">Resumo</h5>
        <div className="grid grid-cols-2 gap-y-2 gap-x-8 text-sm">
          <span className="text-ink-soft">Bolsa bruta ({fmtEuro(bolsa)} × {dias} dias)</span>
          <span className="text-right font-mono">{fmtEuro(bolsaBruta)}</span>

          {subsidioRefeicao > 0 && (
            <>
              <span className="text-ink-soft">Sub. refeição ({fmtEuro(subRef)} × {dias} dias) <span className="text-[0.65rem]">isento TSU</span></span>
              <span className="text-right font-mono">{fmtEuro(subsidioRefeicao)}</span>
            </>
          )}

          <span className="text-ink-soft font-semibold">Total bruto</span>
          <span className="text-right font-mono font-semibold">{fmtEuro(totalBruto)}</span>

          <span className="text-ink-soft">TSU ({(tsu * 100).toFixed(2)}% sobre bolsa)</span>
          <span className="text-right font-mono text-red-600">-{fmtEuro(valorTSU)}</span>

          <span className="text-ink font-bold text-base">Líquido a receber</span>
          <span className="text-right font-mono font-bold text-base text-brand">{fmtEuro(totalLiquido)}</span>
        </div>
      </div>
    </Modal>
  );
}
