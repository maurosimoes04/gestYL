import { useState, FormEvent } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { FormField, FormGrid, FormSection } from '@/components/ui/FormField';
import { apiPost, apiPut } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import type { Entidade } from '@/lib/types';
import { useCatalogos } from '@/hooks/useCatalogos';

interface Props { entidade: Entidade | null; onClose: () => void; onSaved: () => void; }

const TIPOS = [
  { v: 'fornecedor', l: 'Fornecedor' },
  { v: 'financiador', l: 'Financiador' },
  { v: 'pessoa-interna', l: 'Pessoa interna (RH)' },
  { v: 'socio', l: 'Sócio' },
  { v: 'cliente', l: 'Cliente' },
];

export function EntidadeFormModal({ entidade, onClose, onSaved }: Props) {
  const { toast } = useToast();
  const { reload } = useCatalogos();
  const [saving, setSaving] = useState(false);

  const [nome, setNome] = useState(entidade?.nome || '');
  const [nif, setNif] = useState(entidade?.nif || '');
  const [tipos, setTipos] = useState<string[]>(entidade?.tipos || []);
  const [email, setEmail] = useState(entidade?.email || '');
  const [telefone, setTelefone] = useState(entidade?.telefone || '');
  const [morada, setMorada] = useState(entidade?.morada || '');
  const [iban, setIban] = useState(entidade?.iban || '');
  const [niss, setNiss] = useState(entidade?.niss || '');
  const [tipoVinculo, setTipoVinculo] = useState(entidade?.tipoVinculo || '');
  const [funcao, setFuncao] = useState(entidade?.funcao || '');
  const [bolsaBase, setBolsaBase] = useState(entidade?.bolsaBase ? String(entidade.bolsaBase) : '');
  const [notas, setNotas] = useState(entidade?.notas || '');
  const [verificado, setVerificado] = useState(entidade?.verificado || false);

  function toggleTipo(t: string) {
    setTipos(ts => ts.includes(t) ? ts.filter(x => x !== t) : [...ts, t]);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!nome) { toast('Nome obrigatório', 'error'); return; }
    if (!tipos.length) { toast('Escolhe pelo menos um tipo', 'error'); return; }

    const payload = {
      nome, nif: nif || null, tipos,
      email: email || null, telefone: telefone || null, morada: morada || null, iban: iban || null,
      niss: niss || null, tipoVinculo: tipoVinculo || null, funcao: funcao || null,
      bolsaBase: bolsaBase ? parseFloat(bolsaBase) : null,
      notas: notas || null, verificado,
    };

    setSaving(true);
    try {
      if (entidade) await apiPut(`/entidades/${entidade.id}`, payload);
      else await apiPost('/entidades', payload);
      toast(entidade ? 'Entidade atualizada' : 'Entidade criada', 'success');
      await reload();
      onSaved();
    } catch (e: any) {
      toast(e.message || 'Erro', 'error');
    } finally { setSaving(false); }
  }

  const ehPessoaInterna = tipos.includes('pessoa-interna');

  return (
    <Modal open onClose={onClose} size="lg"
           title={entidade ? 'Editar entidade' : 'Nova entidade'}
           footer={<>
             <Button variant="ghost" onClick={onClose}>Cancelar</Button>
             <Button type="submit" form="entidadeForm" loading={saving}>Guardar</Button>
           </>}>
      <form id="entidadeForm" onSubmit={submit}>
        <FormSection title="Identificação">
          <FormGrid>
            <FormField label="Nome" required className="md:col-span-2">
              <Input value={nome} onChange={e => setNome(e.target.value)} required />
            </FormField>
            <FormField label="NIF / VAT UE" hint="PT: 9 dígitos; UE: prefixo + dígitos (LU…, ES…)">
              <Input value={nif} onChange={e => setNif(e.target.value)} placeholder="500123456" />
            </FormField>
          </FormGrid>
          <div className="mt-3">
            <label className="text-sm font-medium text-ink">Tipos <span className="text-bad">*</span></label>
            <div className="flex flex-wrap gap-2 mt-1">
              {TIPOS.map(t => (
                <label key={t.v} className={`cursor-pointer px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${tipos.includes(t.v) ? 'bg-brand text-white border-brand' : 'bg-white text-ink-soft border-line hover:bg-surface-alt'}`}>
                  <input type="checkbox" className="sr-only" checked={tipos.includes(t.v)} onChange={() => toggleTipo(t.v)} />
                  {t.l}
                </label>
              ))}
            </div>
          </div>
        </FormSection>

        <FormSection title="Contactos">
          <FormGrid>
            <FormField label="Email"><Input type="email" value={email} onChange={e => setEmail(e.target.value)} /></FormField>
            <FormField label="Telefone"><Input value={telefone} onChange={e => setTelefone(e.target.value)} /></FormField>
            <FormField label="Morada" className="md:col-span-2"><Input value={morada} onChange={e => setMorada(e.target.value)} /></FormField>
            <FormField label="IBAN"><Input value={iban} onChange={e => setIban(e.target.value)} placeholder="PT50 …" /></FormField>
          </FormGrid>
        </FormSection>

        {ehPessoaInterna && (
          <FormSection title="Dados RH (pessoa interna)" accent>
            <FormGrid cols={3}>
              <FormField label="NISS"><Input value={niss} onChange={e => setNiss(e.target.value)} /></FormField>
              <FormField label="Tipo de vínculo">
                <Select value={tipoVinculo} onChange={e => setTipoVinculo(e.target.value)}>
                  <option value="">—</option>
                  <option>Estágio INICIAR</option>
                  <option>Estágio +Talento</option>
                  <option>CEI</option>
                  <option>+Emprego</option>
                  <option>Voluntariado</option>
                  <option>Colaborador</option>
                </Select>
              </FormField>
              <FormField label="Função"><Input value={funcao} onChange={e => setFuncao(e.target.value)} /></FormField>
              <FormField label="Bolsa base (€)"><Input type="number" step="0.01" value={bolsaBase} onChange={e => setBolsaBase(e.target.value)} /></FormField>
            </FormGrid>
          </FormSection>
        )}

        <FormSection title="Notas">
          <FormField label="Notas"><Textarea value={notas} onChange={e => setNotas(e.target.value)} rows={2} /></FormField>
          <label className="inline-flex items-center gap-2 mt-3 text-sm">
            <input type="checkbox" checked={verificado} onChange={e => setVerificado(e.target.checked)} />
            Dados verificados
          </label>
        </FormSection>
      </form>
    </Modal>
  );
}
