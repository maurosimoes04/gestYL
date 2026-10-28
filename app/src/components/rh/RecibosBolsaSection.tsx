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
  processos: Processo[];
  readonly?: boolean;
}

const TSU_PATRONAL = 0.2375;
const TSU_TRABALHADOR = 0.11;

export function RecibosBolsaSection({ entidadeId, processos, readonly }: Props) {
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
                <div className="text-xs text-ink-soft flex flex-wrap gap-3 mt-0.5">
                  <span>Bolsa: {fmtEuro(r.bolsaMensal)}</span>
                  {Number(r.descontoFaltas) > 0 && <span className="text-red-600">-{fmtEuro(r.descontoFaltas)} faltas</span>}
                  <span className="font-mono">Bruta: {fmtEuro(r.bolsaBruta)}</span>
                  <span className="font-mono text-red-600">TSU: -{fmtEuro(r.valorTSUTrabalhador)}</span>
                  {Number(r.subsidioRefeicao) > 0 && <span className="font-mono">Sub.ref.: +{fmtEuro(r.subsidioRefeicao)}</span>}
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
          processos={processos}
          editing={editing}
          onClose={() => { setShowForm(false); setEditing(null); }}
          onSaved={() => { setShowForm(false); setEditing(null); reload(); }}
        />
      )}
    </div>
  );
}

function ReciboBolsaFormModal({ entidadeId, processos, editing, onClose, onSaved }: {
  entidadeId: number;
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
  const [diasFaltas, setDiasFaltas] = useState(editing?.diasFaltas?.toString() || '0');
  const [bolsaMensal, setBolsaMensal] = useState(editing ? String(Number(editing.bolsaMensal)) : '');
  const [subRefDia, setSubRefDia] = useState(editing ? String(Number(editing.subsidioRefeicaoDia)) : '');
  const [observacoes, setObservacoes] = useState(editing?.observacoes || '');
  const [estado, setEstado] = useState<'Rascunho' | 'Emitido' | 'Pago'>(editing?.estado || 'Rascunho');
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (isNew) {
      apiGet<{ numero: string }>('/recibos-bolsa/next-number').then(r => setNumeroRecibo(r.numero)).catch(() => {});
      apiGet<{ bolsaMensal: number | null; subsidioRefeicaoDia: number | null }>(`/recibos-bolsa/defaults/${entidadeId}`).then(d => {
        if (d.bolsaMensal && !bolsaMensal) setBolsaMensal(String(d.bolsaMensal));
        if (d.subsidioRefeicaoDia && !subRefDia) setSubRefDia(String(d.subsidioRefeicaoDia));
        setLoaded(true);
      }).catch(() => setLoaded(true));
    } else {
      setLoaded(true);
    }
  }, []);

  const dias = Number(diasUteis) || 0;
  const faltas = Number(diasFaltas) || 0;
  const mensal = Number(bolsaMensal) || 0;
  const subRef = Number(subRefDia) || 0;

  const descontoFaltas = +(mensal / 30 * faltas).toFixed(2);
  const bolsaBruta = +(mensal - descontoFaltas).toFixed(2);
  const valorTSUPatronal = +(bolsaBruta * TSU_PATRONAL).toFixed(2);
  const valorTSUTrabalhador = +(bolsaBruta * TSU_TRABALHADOR).toFixed(2);
  const subsidioRefeicao = +(subRef * dias).toFixed(2);
  const totalBruto = +(bolsaBruta + subsidioRefeicao).toFixed(2);
  const totalLiquido = +(bolsaBruta - valorTSUTrabalhador + subsidioRefeicao).toFixed(2);
  const custoEntidade = +(bolsaBruta + valorTSUPatronal + subsidioRefeicao).toFixed(2);

  async function submit() {
    if (!numeroRecibo || !periodoInicio || !periodoFim || !diasUteis || !bolsaMensal) {
      toast('Preenche todos os campos obrigatórios', 'error');
      return;
    }
    setSaving(true);
    try {
      const body = {
        numeroRecibo, entidadeId,
        processoId: processoId || null,
        periodoInicio, periodoFim,
        diasUteis: Number(diasUteis), diasFaltas: faltas,
        bolsaMensal: mensal,
        taxaTSUPatronal: TSU_PATRONAL, taxaTSUTrabalhador: TSU_TRABALHADOR,
        subsidioRefeicaoDia: subRef,
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
          <label className="block text-xs font-medium text-ink-soft mb-1">Dias úteis trabalhados *</label>
          <Input type="number" min="0" value={diasUteis} onChange={e => setDiasUteis(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-soft mb-1">Dias de falta</label>
          <Input type="number" min="0" value={diasFaltas} onChange={e => setDiasFaltas(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-soft mb-1">Bolsa mensal (€) * {!loaded && <span className="text-ink-soft italic">a carregar...</span>}</label>
          <Input type="number" step="0.01" min="0" value={bolsaMensal} onChange={e => setBolsaMensal(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-soft mb-1">Sub. refeição / dia (€)</label>
          <Input type="number" step="0.01" min="0" value={subRefDia} onChange={e => setSubRefDia(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-soft mb-1">Estado</label>
          <Select value={estado} onChange={e => setEstado(e.target.value as 'Rascunho' | 'Emitido' | 'Pago')}>
            <option value="Rascunho">Rascunho</option>
            <option value="Emitido">Emitido</option>
            <option value="Pago">Pago</option>
          </Select>
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-soft mb-1">Observações</label>
          <Input value={observacoes} onChange={e => setObservacoes(e.target.value)} placeholder="(opcional)" />
        </div>
      </div>

      {/* Resumo de cálculos */}
      {mensal > 0 && (
        <div className="mt-5 bg-surface-page border border-line rounded-lg p-4">
          <h5 className="text-xs font-semibold text-ink-soft uppercase tracking-wider mb-3">Cálculo automático</h5>
          <div className="grid grid-cols-2 gap-y-2 gap-x-8 text-sm">
            <span className="text-ink-soft">Bolsa mensal (contrato)</span>
            <span className="text-right font-mono">{fmtEuro(mensal)}</span>

            {faltas > 0 && (
              <>
                <span className="text-ink-soft">Desconto faltas ({faltas}d × {fmtEuro(mensal / 30)}/dia)</span>
                <span className="text-right font-mono text-red-600">- {fmtEuro(descontoFaltas)}</span>
              </>
            )}

            <span className="text-ink-soft font-semibold">Bolsa bruta</span>
            <span className="text-right font-mono font-semibold">{fmtEuro(bolsaBruta)}</span>

            <span className="text-ink-soft">TSU trabalhador ({(TSU_TRABALHADOR * 100).toFixed(0)}% retida)</span>
            <span className="text-right font-mono text-red-600">- {fmtEuro(valorTSUTrabalhador)}</span>

            {subsidioRefeicao > 0 && (
              <>
                <span className="text-ink-soft">Sub. refeição ({fmtEuro(subRef)} × {dias} dias) <span className="text-[0.65rem] text-green-700">isento</span></span>
                <span className="text-right font-mono text-green-700">+ {fmtEuro(subsidioRefeicao)}</span>
              </>
            )}

            <div className="col-span-2 border-t border-line my-1" />

            <span className="text-ink font-bold text-base">Líquido a receber</span>
            <span className="text-right font-mono font-bold text-base text-brand">{fmtEuro(totalLiquido)}</span>

            <div className="col-span-2 border-t border-line-soft my-1" />

            <span className="text-ink-soft text-xs">TSU patronal ({(TSU_PATRONAL * 100).toFixed(2)}%)</span>
            <span className="text-right font-mono text-xs text-ink-soft">{fmtEuro(valorTSUPatronal)}</span>

            <span className="text-ink-soft text-xs font-semibold">Custo total entidade</span>
            <span className="text-right font-mono text-xs font-semibold text-ink">{fmtEuro(custoEntidade)}</span>
          </div>
        </div>
      )}
    </Modal>
  );
}
