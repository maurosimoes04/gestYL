import { useState, FormEvent } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { FormField, FormGrid, FormSection } from '@/components/ui/FormField';
import { EntidadeSelect } from '@/components/ui/EntidadeSelect';
import { apiPost, apiPut } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import { useCatalogos } from '@/hooks/useCatalogos';
import type { Documento } from '@/lib/types';

interface Props { documento: Documento | null; onClose: () => void; onSaved: () => void; }

const TIPOS = ['Contrato', 'Plano Individual', 'Apólice Seguro', 'Declaração SS', 'Declaração NEET',
                'Certificado Habilitações', 'Certificado Final', 'Documento Identificação', 'Protocolo', 'Outro'];

export function DocumentoFormModal({ documento, onClose, onSaved }: Props) {
  const { toast } = useToast();
  const { processos } = useCatalogos();
  const [saving, setSaving] = useState(false);

  const [tipo, setTipo] = useState(documento?.tipo || '');
  const [estado, setEstado] = useState(documento?.estado || 'Pendente');
  const [dataLimite, setDataLimite] = useState(documento?.dataLimite ? String(documento.dataLimite).slice(0, 10) : '');
  const [processoId, setProcessoId] = useState<number | ''>(documento?.processoId || '');
  const [entidadeId, setEntidadeId] = useState<number | null>(documento?.entidadeId || null);
  const [descricao, setDescricao] = useState(documento?.descricao || '');
  const [notas, setNotas] = useState(documento?.notas || '');
  const [anexo, setAnexo] = useState<File | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!tipo) { toast('Escolhe o tipo', 'error'); return; }
    if (!processoId && !entidadeId) { toast('Associa a um processo ou a uma pessoa', 'error'); return; }

    const fd = new FormData();
    fd.append('tipo', tipo);
    fd.append('estado', estado);
    if (processoId) fd.append('processoId', String(processoId));
    if (entidadeId) fd.append('entidadeId', String(entidadeId));
    if (dataLimite) fd.append('dataLimite', dataLimite);
    if (descricao) fd.append('descricao', descricao);
    if (notas) fd.append('notas', notas);
    if (anexo) fd.append('anexo', anexo);

    setSaving(true);
    try {
      if (documento) await apiPut(`/documentos/${documento.id}`, fd);
      else await apiPost('/documentos', fd);
      toast(documento ? 'Documento atualizado' : 'Documento criado', 'success');
      onSaved();
    } catch (e: any) { toast(e.message || 'Erro', 'error'); } finally { setSaving(false); }
  }

  return (
    <Modal open onClose={onClose} title={documento ? 'Editar documento' : 'Novo documento'} size="md"
           footer={<>
             <Button variant="ghost" onClick={onClose}>Cancelar</Button>
             <Button type="submit" form="docForm" loading={saving}>Guardar</Button>
           </>}>
      <form id="docForm" onSubmit={submit}>
        <FormSection title="Tipo e associações">
          <FormField label="Tipo" required className="mb-3">
            <Select value={tipo} onChange={e => setTipo(e.target.value)} required>
              <option value="">Selecionar…</option>
              {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
            </Select>
          </FormField>
          <FormGrid>
            <FormField label="Estado">
              <Select value={estado} onChange={e => setEstado(e.target.value)}>
                <option>Pendente</option><option>Anexado</option><option>Enviado</option>
              </Select>
            </FormField>
            <FormField label="Data-limite"><Input type="date" value={dataLimite} onChange={e => setDataLimite(e.target.value)} /></FormField>
            <FormField label="Processo" className="md:col-span-2">
              <Select value={processoId} onChange={e => setProcessoId(e.target.value ? Number(e.target.value) : '')}>
                <option value="">—</option>
                {processos.map(p => <option key={p.id} value={p.id}>{p.nome} {p.tipo !== 'Evento' ? `[${p.tipo}]` : ''}</option>)}
              </Select>
            </FormField>
            <FormField label="Pessoa (ou outra entidade)" className="md:col-span-2" hint="Tem de ter pelo menos processo ou pessoa.">
              <EntidadeSelect value={entidadeId} onChange={setEntidadeId} />
            </FormField>
          </FormGrid>
        </FormSection>

        <FormSection title="Detalhes">
          <FormField label="Descrição" className="mb-3"><Input value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="ex: Contrato IEFP 2026" /></FormField>
          <FormField label="Anexo (PDF/JPG/PNG)" className="mb-3"><Input type="file" accept="application/pdf,image/*" onChange={e => setAnexo(e.target.files?.[0] || null)} /></FormField>
          <FormField label="Notas"><Textarea value={notas} onChange={e => setNotas(e.target.value)} rows={2} /></FormField>
        </FormSection>
      </form>
    </Modal>
  );
}
