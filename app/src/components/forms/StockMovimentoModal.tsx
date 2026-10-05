import { useEffect, useState, FormEvent } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { FormField, FormGrid } from '@/components/ui/FormField';
import { Badge } from '@/components/ui/Badge';
import { Table, THead, TBody, TH, TR, TD, Empty } from '@/components/ui/Table';
import { apiGet, apiPost } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import { useCatalogos } from '@/hooks/useCatalogos';
import { fmtData } from '@/lib/format';
import { Minus, Plus, Pencil, AlertTriangle } from 'lucide-react';

interface Item { id: number; nome: string; quantidade: number; unidade?: string | null; quantidadeMinima?: number | null; }

interface Movimento {
  id: number;
  tipo: 'entrada' | 'consumo' | 'ajuste' | 'perda';
  quantidade: number;
  data: string;
  qtdAntes: number | null;
  qtdDepois: number | null;
  notas: string | null;
  criadoPorEmail: string | null;
  processo?: { id: number; nome: string; tipo: string } | null;
}

interface Props { item: Item; defaultTipo?: 'entrada' | 'consumo'; onClose: () => void; onSaved: () => void; }

export function StockMovimentoModal({ item, defaultTipo = 'consumo', onClose, onSaved }: Props) {
  const { toast } = useToast();
  const { processos } = useCatalogos();
  const [tipo, setTipo] = useState<'entrada' | 'consumo' | 'ajuste' | 'perda'>(defaultTipo);
  const [quantidade, setQuantidade] = useState('1');
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [processoId, setProcessoId] = useState<string>('');
  const [notas, setNotas] = useState('');
  const [saving, setSaving] = useState(false);
  const [movs, setMovs] = useState<Movimento[]>([]);
  const [loadingMovs, setLoadingMovs] = useState(true);

  useEffect(() => {
    apiGet<Movimento[]>(`/inventario/${item.id}/movimentos`)
      .then(setMovs)
      .finally(() => setLoadingMovs(false));
  }, [item.id]);

  const qty = parseFloat(quantidade) || 0;
  const previsaoNova = tipo === 'entrada' ? item.quantidade + qty
                     : tipo === 'ajuste' ? qty
                     : Math.max(0, item.quantidade - qty);
  const abaixoMinimo = item.quantidadeMinima != null && previsaoNova < item.quantidadeMinima;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (qty < 0) { toast('Quantidade inválida', 'error'); return; }
    setSaving(true);
    try {
      await apiPost(`/inventario/${item.id}/movimento`, {
        tipo, quantidade: qty, data,
        processoId: processoId || undefined,
        notas: notas || undefined,
      });
      toast('Movimento registado', 'success');
      onSaved();
    } catch (e: any) { toast(e.message || 'Erro', 'error'); }
    finally { setSaving(false); }
  }

  const tipoDesc = {
    entrada: 'Compra, doação, reposição — soma à quantidade atual',
    consumo: 'Uso em evento, atividade ou dia-a-dia — subtrai',
    ajuste: 'Correção manual — define o novo valor absoluto (ex: contaste e descobriste que são outros)',
    perda: 'Perda, quebra, roubo, extravio — subtrai (fica no histórico como perda)',
  };

  const tipoBadge = (t: Movimento['tipo']) => ({
    entrada: <Badge variant="good">+ Entrada</Badge>,
    consumo: <Badge variant="bad">− Consumo</Badge>,
    ajuste: <Badge variant="info">= Ajuste</Badge>,
    perda: <Badge variant="warn">− Perda</Badge>,
  }[t]);

  return (
    <Modal open onClose={onClose} size="xl"
           title={`${item.nome} — stock atual: ${item.quantidade}${item.unidade ? ' ' + item.unidade : ''}`}
           footer={<>
             <Button variant="ghost" onClick={onClose}>Fechar</Button>
             <Button type="submit" form="stockForm" loading={saving}>Registar movimento</Button>
           </>}>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <form id="stockForm" onSubmit={submit} className="space-y-4">
          <h4 className="text-sm font-semibold text-ink">Novo movimento</h4>
          <FormField label="Tipo" required hint={tipoDesc[tipo]}>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setTipo('consumo')}
                      className={`flex items-center gap-2 px-3 py-2 rounded-md border text-sm font-medium transition-colors ${tipo === 'consumo' ? 'bg-bad-soft text-bad-ink border-bad' : 'bg-white border-line text-ink-soft hover:border-ink-muted'}`}>
                <Minus className="w-4 h-4" />Consumo
              </button>
              <button type="button" onClick={() => setTipo('entrada')}
                      className={`flex items-center gap-2 px-3 py-2 rounded-md border text-sm font-medium transition-colors ${tipo === 'entrada' ? 'bg-good-soft text-good-ink border-good' : 'bg-white border-line text-ink-soft hover:border-ink-muted'}`}>
                <Plus className="w-4 h-4" />Entrada
              </button>
              <button type="button" onClick={() => setTipo('ajuste')}
                      className={`flex items-center gap-2 px-3 py-2 rounded-md border text-sm font-medium transition-colors ${tipo === 'ajuste' ? 'bg-info-soft text-info-ink border-info' : 'bg-white border-line text-ink-soft hover:border-ink-muted'}`}>
                <Pencil className="w-4 h-4" />Ajuste
              </button>
              <button type="button" onClick={() => setTipo('perda')}
                      className={`flex items-center gap-2 px-3 py-2 rounded-md border text-sm font-medium transition-colors ${tipo === 'perda' ? 'bg-warn-soft text-warn-ink border-warn' : 'bg-white border-line text-ink-soft hover:border-ink-muted'}`}>
                <AlertTriangle className="w-4 h-4" />Perda
              </button>
            </div>
          </FormField>

          <FormGrid>
            <FormField label={tipo === 'ajuste' ? 'Nova quantidade' : 'Quantidade'} required>
              <Input type="number" step="0.01" min="0" value={quantidade} onChange={e => setQuantidade(e.target.value)} required />
            </FormField>
            <FormField label="Data">
              <Input type="date" value={data} onChange={e => setData(e.target.value)} />
            </FormField>
          </FormGrid>

          {tipo === 'consumo' && (
            <FormField label="Processo (opcional)" hint="Permite ver quanto deste consumível foi gasto em cada evento/projeto">
              <Select value={processoId} onChange={e => setProcessoId(e.target.value)}>
                <option value="">—</option>
                {processos.map(p => <option key={p.id} value={p.id}>{p.nome}{p.tipo !== 'Evento' ? ` [${p.tipo}]` : ''}</option>)}
              </Select>
            </FormField>
          )}

          <FormField label="Notas"><Textarea value={notas} onChange={e => setNotas(e.target.value)} rows={2}
            placeholder={tipo === 'consumo' ? 'ex: imprimir programa' : tipo === 'entrada' ? 'ex: compra Papelaria' : ''} /></FormField>

          <div className="bg-surface-page rounded-lg p-3 text-sm">
            <div className="flex justify-between text-ink-soft">
              <span>Stock atual</span>
              <span className="font-mono">{item.quantidade}{item.unidade ? ` ${item.unidade}` : ''}</span>
            </div>
            <div className="flex justify-between text-ink font-semibold mt-1">
              <span>Depois do movimento</span>
              <span className="font-mono">{previsaoNova}{item.unidade ? ` ${item.unidade}` : ''}</span>
            </div>
            {abaixoMinimo && (
              <div className="mt-2 text-xs text-bad-ink flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />Fica abaixo do mínimo definido ({item.quantidadeMinima})
              </div>
            )}
          </div>
        </form>

        <div>
          <h4 className="text-sm font-semibold text-ink mb-3">Histórico ({movs.length})</h4>
          {loadingMovs ? <p className="text-sm text-ink-soft">A carregar…</p>
          : movs.length === 0 ? <Empty>Sem movimentos registados.</Empty>
          : (
            <div className="max-h-[400px] overflow-y-auto">
              <Table>
                <THead><TH>Data</TH><TH>Tipo</TH><TH>Qtd</TH><TH>Processo / notas</TH></THead>
                <TBody>
                  {movs.map(m => (
                    <TR key={m.id}>
                      <TD mono className="text-xs">{fmtData(m.data)}</TD>
                      <TD>{tipoBadge(m.tipo)}</TD>
                      <TD mono className="font-mono text-xs">
                        {m.tipo === 'entrada' && '+'}{m.tipo !== 'entrada' && m.tipo !== 'ajuste' && '−'}{m.quantidade}
                        {m.qtdDepois != null && <div className="text-ink-muted">→ {m.qtdDepois}</div>}
                      </TD>
                      <TD>
                        {m.processo && <div className="text-xs text-brand">{m.processo.nome}</div>}
                        {m.notas && <div className="text-xs text-ink-soft">{m.notas}</div>}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
