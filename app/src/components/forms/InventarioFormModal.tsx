import { useState, FormEvent, useMemo } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { FormField, FormGrid, FormSection } from '@/components/ui/FormField';
import { SncRichSelect } from '@/components/ui/SncRichSelect';
import { apiPost, apiPut } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';

interface InvItem {
  id?: number; tipo?: string; nome?: string; categoria?: string | null;
  quantidade?: number; unidade?: string | null; localizacao?: string | null; estado?: string | null;
  custoUnitario?: number | null; dataAquisicao?: string | null; dataValidade?: string | null;
  quantidadeMinima?: number | null; contaSncId?: number | null; anosDepreciacao?: number | null;
  notas?: string | null;
}

interface Props { item?: InvItem | null; onClose: () => void; onSaved: () => void; }

/** Modal para criar ou editar item de inventário */
export function InventarioFormModal({ item, onClose, onSaved }: Props) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const editing = !!item?.id;

  const [tipo, setTipo] = useState<'consumivel' | 'fixo'>((item?.tipo as any) || 'consumivel');
  const [nome, setNome] = useState(item?.nome || '');
  const [categoria, setCategoria] = useState(item?.categoria || '');
  const [quantidade, setQuantidade] = useState(item?.quantidade != null ? String(item.quantidade) : '1');
  const [unidade, setUnidade] = useState(item?.unidade || '');
  const [localizacao, setLocalizacao] = useState(item?.localizacao || '');
  const [estado, setEstado] = useState(item?.estado || 'Ativo');
  const [custoUnitario, setCustoUnitario] = useState(item?.custoUnitario != null ? String(item.custoUnitario) : '');
  const [dataAquisicao, setDataAquisicao] = useState(item?.dataAquisicao ? String(item.dataAquisicao).slice(0, 10) : new Date().toISOString().slice(0, 10));
  const [dataValidade, setDataValidade] = useState(item?.dataValidade ? String(item.dataValidade).slice(0, 10) : '');
  const [quantidadeMinima, setQuantidadeMinima] = useState(item?.quantidadeMinima != null ? String(item.quantidadeMinima) : '');
  const [contaSncId, setContaSncId] = useState<number | ''>(item?.contaSncId || '');
  const [anosDepreciacao, setAnosDepreciacao] = useState(item?.anosDepreciacao != null ? String(item.anosDepreciacao) : '8');
  const [notas, setNotas] = useState(item?.notas || '');

  const custoNum = parseFloat(custoUnitario) || 0;
  const anosNum = parseInt(anosDepreciacao, 10) || 0;
  const depAnual = useMemo(() => (anosNum > 0 ? custoNum / anosNum : 0), [custoNum, anosNum]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!nome) { toast('Nome obrigatório', 'error'); return; }
    if (tipo === 'fixo' && !contaSncId) {
      toast('Para ativos fixos escolhe uma conta SNC (classe 43x)', 'error');
      return;
    }

    const payload: any = {
      tipo, nome,
      categoria: categoria || undefined,
      quantidade: parseFloat(quantidade) || 0,
      unidade: unidade || undefined,
      localizacao: localizacao || undefined,
      estado: estado || undefined,
      custoUnitario: custoUnitario ? parseFloat(custoUnitario) : undefined,
      dataAquisicao: dataAquisicao || undefined,
      notas: notas || undefined,
    };
    if (tipo === 'consumivel') {
      if (dataValidade) payload.dataValidade = dataValidade;
      if (quantidadeMinima) payload.quantidadeMinima = parseFloat(quantidadeMinima);
    } else {
      payload.contaSncId = contaSncId;
      if (anosDepreciacao) payload.anosDepreciacao = parseInt(anosDepreciacao, 10);
    }

    // null explícito para apagar validade / qty mínima quando removidos
    if (tipo === 'consumivel') {
      if (!dataValidade) payload.dataValidade = null;
      if (!quantidadeMinima) payload.quantidadeMinima = null;
    }

    setSaving(true);
    try {
      if (editing) await apiPut(`/inventario/${item!.id}`, payload);
      else await apiPost('/inventario', payload);
      toast(editing ? 'Item atualizado' : 'Item criado', 'success');
      onSaved();
    } catch (e: any) { toast(e.message || 'Erro', 'error'); }
    finally { setSaving(false); }
  }

  return (
    <Modal open onClose={onClose} size="lg" title={editing ? 'Editar item de inventário' : 'Novo item de inventário'}
           footer={<>
             <Button variant="ghost" onClick={onClose}>Cancelar</Button>
             <Button type="submit" form="invForm" loading={saving}>Guardar</Button>
           </>}>
      <form id="invForm" onSubmit={submit}>
        <FormSection title="Tipo">
          <FormGrid>
            <FormField label="Tipo" required hint={
              tipo === 'consumivel'
                ? 'Item com quantidade variável que se gasta (papel, bebidas, material)'
                : 'Bem duradouro (vida útil > 1 ano), qty = 1 — vai depreciar na contabilidade'
            }>
              <Select value={tipo} onChange={e => setTipo(e.target.value as any)}>
                <option value="consumivel">Consumível</option>
                <option value="fixo">Ativo fixo</option>
              </Select>
            </FormField>
            <FormField label="Nome" required>
              <Input value={nome} onChange={e => setNome(e.target.value)} required placeholder="ex: Portátil ASUS da sede" />
            </FormField>
          </FormGrid>
        </FormSection>

        <FormSection title="Identificação">
          <FormGrid>
            <FormField label="Categoria"><Input value={categoria} onChange={e => setCategoria(e.target.value)} placeholder="ex: TI, Mobiliário, Papel" /></FormField>
            <FormField label="Localização"><Input value={localizacao} onChange={e => setLocalizacao(e.target.value)} placeholder="ex: Sede · armário A" /></FormField>
            <FormField label="Estado">
              <Select value={estado} onChange={e => setEstado(e.target.value)}>
                <option>Ativo</option><option>Avariado</option><option>Em reparação</option><option>Abatido</option>
              </Select>
            </FormField>
            {tipo === 'consumivel' && (
              <FormField label="Unidade"><Input value={unidade} onChange={e => setUnidade(e.target.value)} placeholder="ex: unidade, caixa, kg, L" /></FormField>
            )}
          </FormGrid>
        </FormSection>

        <FormSection title="Quantidade e valores">
          <FormGrid cols={3}>
            <FormField label={tipo === 'fixo' ? 'Quantidade (ativo = 1)' : 'Quantidade atual'}>
              <Input type="number" step="0.01" value={quantidade} onChange={e => setQuantidade(e.target.value)} />
            </FormField>
            <FormField label="Custo unitário (€)">
              <Input type="number" step="0.01" value={custoUnitario} onChange={e => setCustoUnitario(e.target.value)} />
            </FormField>
            <FormField label="Data de aquisição">
              <Input type="date" value={dataAquisicao} onChange={e => setDataAquisicao(e.target.value)} />
            </FormField>
            {tipo === 'consumivel' && (
              <>
                <FormField label="Validade (quando aplicável)" hint="Datas aproximadas servem — alerta para rever quando próximo">
                  <Input type="date" value={dataValidade} onChange={e => setDataValidade(e.target.value)} />
                </FormField>
                <FormField label="Qty mínima (alerta)" hint="Se a quantidade descer abaixo deste valor, mostra alerta de reabastecer">
                  <Input type="number" step="0.01" value={quantidadeMinima} onChange={e => setQuantidadeMinima(e.target.value)} />
                </FormField>
              </>
            )}
          </FormGrid>
        </FormSection>

        {tipo === 'fixo' && (
          <FormSection title="Capitalização SNC + depreciação" accent>
            <FormGrid>
              <FormField label="Conta SNC (classe 43x)" required hint="Equipamento TI → 435 (3 anos). Mobiliário → 435 (8 anos). Viatura → 434 (4 anos). Obra → 432 (50).">
                <SncRichSelect tipo="ativo" value={contaSncId} onChange={id => setContaSncId(id || '')} />
              </FormField>
              <FormField label="Vida útil (anos)" hint="Período durante o qual o custo é espalhado como depreciação na conta 68">
                <Input type="number" min={1} max={60} value={anosDepreciacao} onChange={e => setAnosDepreciacao(e.target.value)} />
              </FormField>
            </FormGrid>
            {custoNum > 0 && anosNum > 0 && (
              <div className="mt-3 text-xs bg-info-soft text-info-ink rounded p-2">
                Depreciação anual estimada: <strong className="font-mono">{depAnual.toFixed(2)} €/ano</strong>
                {' '}(a aparecer no mapa de depreciações ao longo de {anosNum} anos)
              </div>
            )}
          </FormSection>
        )}

        <FormSection title="Notas">
          <FormField label="Notas"><Textarea value={notas} onChange={e => setNotas(e.target.value)} rows={2} /></FormField>
        </FormSection>
      </form>
    </Modal>
  );
}
