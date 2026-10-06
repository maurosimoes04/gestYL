import { useState, useEffect, FormEvent } from 'react';
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
import type { Fatura } from '@/lib/types';

interface Props {
  fatura: Fatura | null;
  onClose: () => void;
  onSaved: () => void;
}

export function FaturaFormModal({ fatura, onClose, onSaved }: Props) {
  const { toast, promise } = useToast();
  const { departamentos, entidades } = useCatalogos();
  const [saving, setSaving] = useState(false);

  // Para registos antigos sem entidadeId, tentamos matchar por NIF ou nome do fornecedor
  const entidadeIdInicial = (() => {
    if (fatura?.entidadeId) return fatura.entidadeId;
    if (fatura?.fornecedorNif) {
      const match = entidades.find(e => e.nif && e.nif.replace(/\s+/g, '').toUpperCase() === fatura.fornecedorNif!.replace(/\s+/g, '').toUpperCase());
      if (match) return match.id;
    }
    if (fatura?.fornecedor) {
      const nome = fatura.fornecedor.trim().toLowerCase();
      const match = entidades.find(e => e.nome.trim().toLowerCase() === nome);
      if (match) return match.id;
    }
    return null;
  })();

  const [titulo, setTitulo] = useState(fatura?.titulo || '');
  const [tipo, setTipo] = useState(fatura?.tipo || 'Fatura');
  const [numero, setNumero] = useState(fatura?.numero || '');
  const [departamento, setDepartamento] = useState(fatura?.departamento || '');
  const [contaSncId, setContaSncId] = useState<number | ''>(fatura?.contaSncId || '');
  const [entidadeId, setEntidadeId] = useState<number | null>(entidadeIdInicial);
  const [valor, setValor] = useState(fatura?.valor ? String(fatura.valor) : '');
  const [data, setData] = useState(fatura?.data ? String(fatura.data).slice(0, 10) : new Date().toISOString().slice(0, 10));
  const [dataVencimento, setDataVencimento] = useState(fatura?.dataVencimento ? String(fatura.dataVencimento).slice(0, 10) : '');
  const [estado, setEstado] = useState(fatura?.estado || 'Pendente');
  const [descricao, setDescricao] = useState(fatura?.descricao || '');
  const [eventoId, setEventoId] = useState<number | null>(fatura?.faturaEventos?.[0]?.eventoId ?? null);
  const [anexo, setAnexo] = useState<File | null>(null);
  const [removerAnexo, setRemoverAnexo] = useState(false);
  const [comprovativo, setComprovativo] = useState<File | null>(null);
  const [removerComprovativo, setRemoverComprovativo] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!titulo || !valor || !data || !departamento) { toast('Preenche título, valor, data e departamento', 'error'); return; }
    if (!contaSncId) { toast('Escolhe uma conta SNC', 'error'); return; }
    if (!entidadeId) { toast('Escolhe o fornecedor (entidade)', 'error'); return; }

    const fd = new FormData();
    fd.append('titulo', titulo);
    fd.append('valor', String(parseFloat(valor)));
    fd.append('data', data);
    fd.append('departamento', departamento);
    fd.append('tipo', tipo);
    fd.append('estado', estado);
    fd.append('contaSncId', String(contaSncId));
    fd.append('entidadeId', String(entidadeId));
    if (numero) fd.append('numero', numero);
    if (descricao) fd.append('descricao', descricao);
    if (dataVencimento) fd.append('dataVencimento', dataVencimento);
    if (anexo) fd.append('anexo', anexo);
    if (removerAnexo && !anexo) fd.append('removeAnexo', 'true');
    if (comprovativo) fd.append('comprovativo', comprovativo);
    if (removerComprovativo && !comprovativo) fd.append('removeComprovativo', 'true');
    // eventoId: envia o id (ou string vazia para desassociar); o backend trata ambos
    fd.append('eventoId', eventoId ? String(eventoId) : '');

    setSaving(true);
    try {
      if (fatura) await apiPut(`/faturas/${fatura.id}`, fd);
      else await apiPost('/faturas', fd);
      toast(fatura ? 'Despesa atualizada' : 'Despesa criada', 'success');
      onSaved();
    } catch (e: any) {
      toast(e.message || 'Erro', 'error');
    } finally { setSaving(false); }
  }

  return (
    <Modal open onClose={onClose} size="lg"
           title={fatura ? 'Editar despesa' : 'Nova despesa'}
           footer={<>
             <Button variant="ghost" onClick={onClose}>Cancelar</Button>
             <Button type="submit" form="faturaForm" loading={saving}>Guardar</Button>
           </>}>
      <form id="faturaForm" onSubmit={submit} className="space-y-0">
        <FormSection title="Documento">
          <FormGrid>
            <FormField label="Título" required className="md:col-span-2">
              <Input value={titulo} onChange={e => setTitulo(e.target.value)} required placeholder="Descrição da despesa" />
            </FormField>
            <FormField label="Tipo"><Select value={tipo} onChange={e => setTipo(e.target.value)}>
              <option>Fatura</option><option>Recibo</option><option>Recibo Verde</option><option>Nota de Crédito</option><option>Outro</option>
            </Select></FormField>
            <FormField label="Nº documento"><Input value={numero} onChange={e => setNumero(e.target.value)} placeholder="ex: FT 2026/001" /></FormField>
          </FormGrid>
        </FormSection>

        <FormSection title="Classificação SNC + Entidade" accent>
          <FormGrid>
            <FormField label="Conta SNC" required>
              <SncRichSelect tipo="gasto" value={contaSncId} onChange={id => setContaSncId(id || '')} required />
              {fatura?.id && (
                <div className="mt-2">
                  <SugestaoSncButton tipo="fatura" registoId={fatura.id} onAplicar={setContaSncId} />
                </div>
              )}
            </FormField>
            <FormField label="Entidade (fornecedor)" required>
              <EntidadeSelect value={entidadeId} onChange={setEntidadeId} tipo="fornecedor" />
            </FormField>
            <FormField label="Departamento" required>
              <Select value={departamento} onChange={e => setDepartamento(e.target.value)} required>
                <option value="">Selecionar…</option>
                {departamentos.map(d => <option key={d} value={d}>{d}</option>)}
              </Select>
            </FormField>
            <FormField label="Processo" hint="Evento, projeto, investimento ou subsídio a que esta despesa pertence (opcional).">
              <ProcessoSelect value={eventoId} onChange={setEventoId} incluirFechados={!!eventoId} />
            </FormField>
          </FormGrid>
        </FormSection>

        <FormSection title="Valores e datas">
          <FormGrid cols={3}>
            <FormField label="Valor (€)" required><Input type="number" step="0.01" value={valor} onChange={e => setValor(e.target.value)} required /></FormField>
            <FormField label="Data" required><Input type="date" value={data} onChange={e => setData(e.target.value)} required /></FormField>
            <FormField label="Vencimento"><Input type="date" value={dataVencimento} onChange={e => setDataVencimento(e.target.value)} /></FormField>
            <FormField label="Estado"><Select value={estado} onChange={e => setEstado(e.target.value)}>
              <option>Pendente</option><option>Paga</option>
            </Select></FormField>
          </FormGrid>
        </FormSection>

        <FormSection title="Observações">
          <FormField label="Observações">
            <Textarea value={descricao} onChange={e => setDescricao(e.target.value)} rows={2} />
          </FormField>
        </FormSection>

        <FormSection title="Documentos" accent>
          <p className="text-xs text-ink-soft mb-3">
            Guarda a <strong>fatura/recibo</strong> e, em separado, o <strong>comprovativo de pagamento</strong>
            (transferência, Multibanco, recibo da entidade). Ambos são opcionais e podem ser substituídos a qualquer momento.
          </p>
          <FormGrid cols={2}>
            <FormField label="Fatura / recibo (documento da despesa)">
              <FileDropzone
                value={anexo}
                onChange={setAnexo}
                current={fatura?.anexo?.originalName && !removerAnexo ? {
                  name: fatura.anexo.originalName,
                  onOpen: () => promise(openProtected(`/faturas/${fatura.id}/anexo`), {
                    loading: 'A abrir documento…',
                    success: 'Documento aberto numa nova aba',
                    error: (e) => e?.message || 'Não foi possível abrir',
                  }),
                } : null}
              />
              {fatura?.anexo && !removerAnexo && !anexo && (
                <button type="button" onClick={() => setRemoverAnexo(true)}
                        className="text-xs text-bad-ink hover:underline mt-1">
                  Remover documento atual
                </button>
              )}
              {removerAnexo && (
                <p className="text-xs text-warn-ink mt-1">
                  Documento será removido ao guardar. <button type="button" onClick={() => setRemoverAnexo(false)} className="underline hover:text-ink">cancelar</button>
                </p>
              )}
            </FormField>

            <FormField label="Comprovativo de pagamento">
              <FileDropzone
                value={comprovativo}
                onChange={setComprovativo}
                current={fatura?.comprovativo?.originalName && !removerComprovativo ? {
                  name: fatura.comprovativo.originalName,
                  onOpen: () => promise(openProtected(`/faturas/${fatura.id}/comprovativo`), {
                    loading: 'A abrir comprovativo…',
                    success: 'Comprovativo aberto numa nova aba',
                    error: (e) => e?.message || 'Não foi possível abrir',
                  }),
                } : null}
              />
              {fatura?.comprovativo && !removerComprovativo && !comprovativo && (
                <button type="button" onClick={() => setRemoverComprovativo(true)}
                        className="text-xs text-bad-ink hover:underline mt-1">
                  Remover comprovativo atual
                </button>
              )}
              {removerComprovativo && (
                <p className="text-xs text-warn-ink mt-1">
                  Comprovativo será removido ao guardar. <button type="button" onClick={() => setRemoverComprovativo(false)} className="underline hover:text-ink">cancelar</button>
                </p>
              )}
            </FormField>
          </FormGrid>
        </FormSection>
      </form>
    </Modal>
  );
}
