import { useState, FormEvent } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { FormField, FormGrid, FormSection } from '@/components/ui/FormField';
import { SncRichSelect } from '@/components/ui/SncRichSelect';
import { EntidadeSelect } from '@/components/ui/EntidadeSelect';
import { apiPost, apiPut } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import { useCatalogos } from '@/hooks/useCatalogos';
import type { Processo } from '@/lib/types';
import { Info } from 'lucide-react';

interface Props { processo: Processo | null; onClose: () => void; onSaved: () => void; }

/** Pergunta de decisão para cada tipo — ajuda o utilizador a classificar sem precisar de pedir. */
const TIPO_HELP: Record<Processo['tipo'], string> = {
  'Evento':
    'Uma edição concreta com data(s) definida(s). Se o mesmo evento se repete anualmente, cria um por ano (ex: "Carnaval 2026", "Carnaval 2027"). Permite comparar edições e ver finanças exatas de cada uma.',
  'Projeto Anual':
    'Programa guarda-chuva que corre o ano todo ou se repete em várias atividades (ex: "Workshops YL 2026", "PodCast Ligação Jovem", "Jovens pelo Ambiente"). Agrupa receitas e despesas de várias atividades sob o mesmo programa.',
  'Investimento':
    'Compra ou obra duradoura (equipamento, viatura, obras na sede). Vai gerar ativos capitalizáveis em Inventário com depreciação anual. Ex: "Mobiliário sede", "Carrinha Berlingo", "Obras PAI".',
  'Subsídio':
    'Subsídio multi-prestação (IEFP, IPDJ, Câmara). Permite guardar nº de processo, valor aprovado e ligar as receitas das prestações recebidas.',
};

export function ProcessoFormModal({ processo, onClose, onSaved }: Props) {
  const { toast } = useToast();
  const { departamentos, reload } = useCatalogos();
  const [saving, setSaving] = useState(false);

  const [nome, setNome] = useState(processo?.nome || '');
  const [tipo, setTipo] = useState<Processo['tipo']>(processo?.tipo || 'Evento');
  const [estado, setEstado] = useState(processo?.estado || 'Em curso');
  const [descricao, setDescricao] = useState(processo?.descricao || '');
  const [dataInicio, setDataInicio] = useState(processo?.data_inicio ? String(processo.data_inicio).slice(0, 10) : '');
  const [dataFim, setDataFim] = useState(processo?.data_fim ? String(processo.data_fim).slice(0, 10) : '');
  const [departamento, setDepartamento] = useState(processo?.departamento || '');
  const [entidadeFinanciadoraId, setEntidadeFinanciadoraId] = useState<number | null>(processo?.entidadeFinanciadoraId || null);
  const [numeroProcesso, setNumeroProcesso] = useState(processo?.numeroProcesso || '');
  const [valorAprovado, setValorAprovado] = useState(processo?.valorAprovado ? String(processo.valorAprovado) : '');
  const [contaSncReceitaId, setContaSncReceitaId] = useState<number | ''>(processo?.contaSncReceitaId || '');

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!nome) { toast('Nome obrigatório', 'error'); return; }

    const payload: any = {
      nome, tipo, estado,
      descricao: descricao || undefined,
      data_inicio: dataInicio || undefined, data_fim: dataFim || undefined,
      departamento: departamento || undefined,
    };
    if (tipo === 'Subsídio') {
      if (entidadeFinanciadoraId) payload.entidadeFinanciadoraId = entidadeFinanciadoraId;
      if (numeroProcesso) payload.numeroProcesso = numeroProcesso;
      if (valorAprovado) payload.valorAprovado = parseFloat(valorAprovado);
      if (contaSncReceitaId) payload.contaSncReceitaId = contaSncReceitaId;
    }

    setSaving(true);
    try {
      if (processo) await apiPut(`/eventos/${processo.id}`, payload);
      else await apiPost('/eventos', payload);
      toast(processo ? 'Processo atualizado' : 'Processo criado', 'success');
      await reload();
      onSaved();
    } catch (e: any) {
      toast(e.message || 'Erro', 'error');
    } finally { setSaving(false); }
  }

  return (
    <Modal open onClose={onClose} size="lg"
           title={processo ? 'Editar processo' : 'Novo processo'}
           footer={<>
             <Button variant="ghost" onClick={onClose}>Cancelar</Button>
             <Button type="submit" form="processoForm" loading={saving}>Guardar</Button>
           </>}>
      <form id="processoForm" onSubmit={submit}>
        <FormSection title="Tipo e informações">
          <FormGrid>
            <FormField label="Tipo" required>
              <Select value={tipo} onChange={e => setTipo(e.target.value as any)} required>
                <option value="Evento">Evento — edição concreta com data</option>
                <option value="Projeto Anual">Projeto Anual — programa plurianual / recorrente</option>
                <option value="Investimento">Investimento — obra ou equipamento duradouro</option>
                <option value="Subsídio">Subsídio — processo multi-prestação (IEFP/IPDJ)</option>
              </Select>
              <div className="mt-2 flex items-start gap-2 bg-brand-soft/50 text-brand-strong rounded-md px-3 py-2 text-xs">
                <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>{TIPO_HELP[tipo]}</span>
              </div>
            </FormField>
            <FormField label="Estado">
              <Select value={estado} onChange={e => setEstado(e.target.value)}>
                <option>Em curso</option><option>Concluído</option><option>Cancelado</option>
              </Select>
            </FormField>
            <FormField label="Nome" required className="md:col-span-2">
              <Input value={nome} onChange={e => setNome(e.target.value)} required />
            </FormField>
            <FormField label="Data de início"><Input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} /></FormField>
            <FormField label="Data de fim"><Input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} /></FormField>
            <FormField label="Departamento" className="md:col-span-2">
              <Select value={departamento} onChange={e => setDepartamento(e.target.value)}>
                <option value="">—</option>
                {departamentos.map(d => <option key={d} value={d}>{d}</option>)}
              </Select>
            </FormField>
          </FormGrid>
          <FormField label="Descrição" className="mt-3">
            <Textarea value={descricao} onChange={e => setDescricao(e.target.value)} rows={2} />
          </FormField>
        </FormSection>

        {tipo === 'Subsídio' && (
          <FormSection title="Dados do subsídio" accent>
            <FormGrid>
              <FormField label="Entidade financiadora">
                <EntidadeSelect value={entidadeFinanciadoraId} onChange={setEntidadeFinanciadoraId} tipo="financiador" />
              </FormField>
              <FormField label="Nº processo / candidatura">
                <Input value={numeroProcesso} onChange={e => setNumeroProcesso(e.target.value)} />
              </FormField>
              <FormField label="Valor total aprovado (€)">
                <Input type="number" step="0.01" value={valorAprovado} onChange={e => setValorAprovado(e.target.value)} />
              </FormField>
              <FormField label="Conta SNC das prestações recebidas">
                <SncRichSelect tipo="proveito" value={contaSncReceitaId} onChange={id => setContaSncReceitaId(id || '')} />
              </FormField>
            </FormGrid>
          </FormSection>
        )}
      </form>
    </Modal>
  );
}
