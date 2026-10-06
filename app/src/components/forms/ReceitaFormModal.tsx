import { useState, FormEvent } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { FormField, FormGrid, FormSection } from '@/components/ui/FormField';
import { SncRichSelect } from '@/components/ui/SncRichSelect';
import { SugestaoSncButton } from '@/components/ui/SugestaoSncButton';
import { EntidadeSelect } from '@/components/ui/EntidadeSelect';
import { ProcessoSelect } from '@/components/ui/ProcessoSelect';
import { FileDropzone } from '@/components/ui/FileDropzone';
import { apiPost, apiPut } from '@/lib/api';
import { openProtected } from '@/lib/download';
import { useToast } from '@/contexts/ToastContext';
import { useCatalogos } from '@/hooks/useCatalogos';
import type { Receita } from '@/lib/types';

interface Props {
  receita: Receita | null;
  onClose: () => void;
  onSaved: () => void;
}

export function ReceitaFormModal({ receita, onClose, onSaved }: Props) {
  const { toast, promise } = useToast();
  const { contas, entidades } = useCatalogos();
  const [saving, setSaving] = useState(false);

  // Para registos antigos sem entidadeId, tentamos matchar por nome do financiador
  const entidadeIdInicial = (() => {
    if (receita?.entidadeId) return receita.entidadeId;
    if (receita?.financiador) {
      const nome = receita.financiador.trim().toLowerCase();
      const match = entidades.find(e => e.nome.trim().toLowerCase() === nome);
      if (match) return match.id;
    }
    return null;
  })();

  const [titulo, setTitulo] = useState(receita?.titulo || '');
  const [contaSncId, setContaSncId] = useState<number | ''>(receita?.contaSncId || '');
  const [entidadeId, setEntidadeId] = useState<number | null>(entidadeIdInicial);
  const [valor, setValor] = useState(receita?.valor ? String(receita.valor) : '');
  const [data, setData] = useState(receita?.data ? String(receita.data).slice(0, 10) : new Date().toISOString().slice(0, 10));
  const [estado, setEstado] = useState(receita?.estado || 'Previsto');
  const [observacoes, setObservacoes] = useState(receita?.observacoes || '');
  const [eventoId, setEventoId] = useState<number | null>(receita?.receitaEventos?.[0]?.eventoId ?? null);
  const [anexo, setAnexo] = useState<File | null>(null);
  const [removerAnexo, setRemoverAnexo] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!titulo || !valor || !data) { toast('Preenche título, valor e data', 'error'); return; }
    if (!contaSncId) { toast('Escolhe uma conta SNC', 'error'); return; }
    if (!entidadeId) { toast('Escolhe o financiador (entidade)', 'error'); return; }

    // Mapear SNC → categoria legada (para compatibilidade com dashboards antigos)
    const c = contas.find(x => x.id === contaSncId);
    const categoria = c?.codigo === '72' ? 'Vendas/Serviços'
                   : c?.codigo === '75' ? 'Cofinanciamentos'
                   : c?.codigo === '76' ? 'Quotas'
                   : 'Outros';
    const financiador = entidades.find(x => x.id === entidadeId)?.nome || '';

    const fd = new FormData();
    fd.append('titulo', titulo);
    fd.append('valor', String(parseFloat(valor)));
    fd.append('data', data);
    fd.append('estado', estado);
    fd.append('categoria', categoria);
    fd.append('contaSncId', String(contaSncId));
    fd.append('entidadeId', String(entidadeId));
    fd.append('financiador', financiador);
    if (observacoes) fd.append('observacoes', observacoes);
    if (anexo) fd.append('anexo', anexo);
    if (removerAnexo && !anexo) fd.append('removeAnexo', 'true');
    fd.append('eventoId', eventoId ? String(eventoId) : '');

    setSaving(true);
    try {
      if (receita) await apiPut(`/receitas/${receita.id}`, fd);
      else await apiPost('/receitas', fd);
      toast(receita ? 'Receita atualizada' : 'Receita criada', 'success');
      onSaved();
    } catch (e: any) {
      toast(e.message || 'Erro', 'error');
    } finally { setSaving(false); }
  }

  return (
    <Modal open onClose={onClose} size="lg"
           title={receita ? 'Editar receita' : 'Nova receita'}
           footer={<>
             <Button variant="ghost" onClick={onClose}>Cancelar</Button>
             <Button type="submit" form="receitaForm" loading={saving}>Guardar</Button>
           </>}>
      <form id="receitaForm" onSubmit={submit}>
        <FormSection title="Identificação">
          <FormField label="Título" required>
            <Input value={titulo} onChange={e => setTitulo(e.target.value)} required placeholder="Descrição da receita" />
          </FormField>
        </FormSection>

        <FormSection title="Classificação SNC + Entidade" accent>
          <FormGrid>
            <FormField label="Conta SNC" required>
              <SncRichSelect tipo="proveito" value={contaSncId} onChange={id => setContaSncId(id || '')} required />
              {receita?.id && (
                <div className="mt-2">
                  <SugestaoSncButton tipo="receita" registoId={receita.id} onAplicar={setContaSncId} />
                </div>
              )}
            </FormField>
            <FormField label="Entidade (financiador)" required>
              <EntidadeSelect value={entidadeId} onChange={setEntidadeId} tipo="financiador" placeholder="IPDJ, Câmara, Junta…" />
            </FormField>
            <FormField label="Processo" hint="Evento, projeto, investimento ou subsídio a que esta receita pertence (opcional).">
              <ProcessoSelect value={eventoId} onChange={setEventoId} incluirFechados={!!eventoId} />
            </FormField>
          </FormGrid>
        </FormSection>

        <FormSection title="Valores e datas">
          <FormGrid cols={3}>
            <FormField label="Valor (€)" required><Input type="number" step="0.01" value={valor} onChange={e => setValor(e.target.value)} required /></FormField>
            <FormField label="Data" required><Input type="date" value={data} onChange={e => setData(e.target.value)} required /></FormField>
            <FormField label="Estado"><Select value={estado} onChange={e => setEstado(e.target.value)}>
              <option>Previsto</option><option>Pendente</option><option>Recebido</option>
            </Select></FormField>
          </FormGrid>
        </FormSection>

        <FormSection title="Observações e anexo">
          <FormField label="Observações" className="mb-3">
            <Textarea value={observacoes} onChange={e => setObservacoes(e.target.value)} rows={2} />
          </FormField>
          <FormField label={receita?.anexo && !removerAnexo ? 'Substituir anexo' : 'Anexo (PDF/JPG/PNG)'}>
            <FileDropzone
              value={anexo}
              onChange={setAnexo}
              current={receita?.anexo?.originalName && !removerAnexo ? {
                name: receita.anexo.originalName,
                onOpen: () => promise(openProtected(`/receitas/${receita.id}/anexo`), {
                  loading: 'A abrir anexo…',
                  success: 'Anexo aberto numa nova aba',
                  error: (e) => e?.message || 'Não foi possível abrir',
                }),
              } : null}
            />
          </FormField>
          {receita?.anexo && !removerAnexo && (
            <button type="button" onClick={() => setRemoverAnexo(true)}
                    className="text-xs text-bad-ink hover:underline mt-1 self-start">
              Remover anexo atual
            </button>
          )}
          {removerAnexo && (
            <p className="text-xs text-warn-ink mt-1">
              Anexo será removido ao guardar. <button type="button" onClick={() => setRemoverAnexo(false)} className="underline hover:text-ink">cancelar</button>
            </p>
          )}
        </FormSection>
      </form>
    </Modal>
  );
}
