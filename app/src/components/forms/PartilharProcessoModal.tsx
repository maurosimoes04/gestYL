import { useState, FormEvent } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input, Textarea, Select } from '@/components/ui/Input';
import { FormField, FormGrid } from '@/components/ui/FormField';
import { Card } from '@/components/ui/Card';
import { apiPost } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import { Share2, Copy, Link as LinkIcon, Key, Clock, CheckCircle2 } from 'lucide-react';
import type { Processo } from '@/lib/types';

interface Props { processo: Processo; onClose: () => void; }

export function PartilharProcessoModal({ processo, onClose }: Props) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [destinatario, setDestinatario] = useState('');
  const [justificacao, setJustificacao] = useState('');
  const [dias, setDias] = useState('30');
  const [result, setResult] = useState<{ link: string; password: string; expiresAt: string } | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!justificacao) { toast('Justificação obrigatória', 'error'); return; }
    setSaving(true);
    try {
      const r = await apiPost<{ link: string; password: string; expiresAt: string }>('/shares', {
        eventoId: processo.id,
        destinatario: destinatario || undefined,
        justificacao,
        expiresInDays: Number(dias),
      });
      setResult(r);
      toast('Partilha criada', 'success');
    } catch (e: any) { toast(e.message || 'Erro', 'error'); } finally { setSaving(false); }
  }

  async function copiar(texto: string, label: string) {
    try {
      await navigator.clipboard.writeText(texto);
      toast(`${label} copiado`, 'success');
    } catch { toast('Não consegui copiar', 'error'); }
  }

  return (
    <Modal open onClose={onClose} size="md"
           title={<span className="flex items-center gap-2"><Share2 className="w-4 h-4" />Partilhar processo</span>}
           footer={result ? (
             <Button onClick={onClose}>Concluir</Button>
           ) : (<>
             <Button variant="ghost" onClick={onClose}>Cancelar</Button>
             <Button type="submit" form="partilharForm" loading={saving}>Criar partilha</Button>
           </>)}>
      {result ? (
        <div className="space-y-4">
          <div className="flex items-start gap-3 bg-good-soft text-good-ink rounded-lg p-4">
            <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
            <div className="text-sm">
              <strong>Partilha criada.</strong> Envia o link e a password ao destinatário — ambos são necessários para aceder.
            </div>
          </div>

          <Card accent="brand">
            <div className="text-xs uppercase tracking-wider text-ink-soft font-semibold flex items-center gap-1 mb-1">
              <LinkIcon className="w-3 h-3" />Link
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs bg-surface-page px-3 py-2 rounded border border-line font-mono break-all">{result.link}</code>
              <Button size="sm" variant="ghost" icon={<Copy className="w-3.5 h-3.5" />} onClick={() => copiar(result.link, 'Link')}>Copiar</Button>
            </div>
          </Card>

          <Card accent="warn">
            <div className="text-xs uppercase tracking-wider text-ink-soft font-semibold flex items-center gap-1 mb-1">
              <Key className="w-3 h-3" />Password (mostrada só agora)
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-lg bg-surface-page px-3 py-2 rounded border border-line font-mono text-center tracking-widest">{result.password}</code>
              <Button size="sm" variant="ghost" icon={<Copy className="w-3.5 h-3.5" />} onClick={() => copiar(result.password, 'Password')}>Copiar</Button>
            </div>
            <p className="text-xs text-warn-ink mt-2 italic">
              ⚠ Guarda ou envia a password agora. Não vais poder recuperá-la depois (só podes criar nova partilha).
            </p>
          </Card>

          <div className="text-xs text-ink-soft flex items-center gap-1 justify-center">
            <Clock className="w-3 h-3" />Expira em {new Date(result.expiresAt).toLocaleDateString('pt-PT')}
          </div>
        </div>
      ) : (
        <form id="partilharForm" onSubmit={submit} className="space-y-4">
          <p className="text-sm text-ink-soft">
            Vais partilhar o processo <strong className="text-ink">{processo.nome}</strong> com acesso apenas de leitura.
            O destinatário vê o resumo financeiro, receitas, despesas e pode descarregar anexos para comprovar.
          </p>

          <FormField label="Destinatário (opcional)" hint="Nome ou email de quem vai aceder — para o teu registo.">
            <Input value={destinatario} onChange={e => setDestinatario(e.target.value)} placeholder="Ex: João Silva (Técnico IPDJ)" />
          </FormField>

          <FormField label="Justificação" required hint="Por que estás a partilhar? Fica no histórico de auditoria.">
            <Textarea value={justificacao} onChange={e => setJustificacao(e.target.value)} rows={2} required
                      placeholder="Ex: Pedido do IPDJ para verificação do processo PAJ 2026" />
          </FormField>

          <FormField label="Validade">
            <Select value={dias} onChange={e => setDias(e.target.value)}>
              <option value="7">7 dias</option>
              <option value="15">15 dias</option>
              <option value="30">30 dias</option>
              <option value="60">60 dias</option>
              <option value="90">90 dias</option>
              <option value="180">180 dias</option>
            </Select>
          </FormField>

          <div className="bg-brand-soft/50 text-brand-strong rounded-md px-3 py-2 text-xs flex items-start gap-2">
            <Key className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>Vai ser gerada uma password aleatória que o destinatário terá de inserir. Mostrada apenas uma vez.</span>
          </div>
        </form>
      )}
    </Modal>
  );
}
