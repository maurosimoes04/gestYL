import { useState, FormEvent } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { FormField, FormSection } from '@/components/ui/FormField';
import { Spinner } from '@/components/ui/Spinner';
import { apiPost } from '@/lib/api';
import { openProtectedPost } from '@/lib/download';
import { useToast } from '@/contexts/ToastContext';
import { Sparkles, FileText, ArrowLeft, Download, AlertTriangle } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
}

interface Administracao {
  gestaoInterna: string;
  parcerias: string;
  transparencia: string;
  desafios: string;
}
interface Narrativa {
  notaIntroducao: string;
  administracao: Administracao;
  atividadesRealizadas: string;
  atividadesNaoRealizadas: string;
  conclusao: string;
}

type Fase = 'inputs' | 'rascunho';

const narrativaVazia = (): Narrativa => ({
  notaIntroducao: '',
  administracao: { gestaoInterna: '', parcerias: '', transparencia: '', desafios: '' },
  atividadesRealizadas: '',
  atividadesNaoRealizadas: '',
  conclusao: '',
});

export function RelatorioIAModal({ open, onClose }: Props) {
  const { toast } = useToast();
  const anoAtual = new Date().getFullYear();
  const [fase, setFase] = useState<Fase>('inputs');
  const [ano, setAno] = useState(anoAtual - 1);
  const [plano, setPlano] = useState<File | null>(null);
  const [loadingAnalise, setLoadingAnalise] = useState(false);
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [narrativa, setNarrativa] = useState<Narrativa>(narrativaVazia());

  function reset() {
    setFase('inputs');
    setPlano(null);
    setAviso(null);
    setNarrativa(narrativaVazia());
  }

  function fechar() {
    reset();
    onClose();
  }

  async function analisar(e: FormEvent) {
    e.preventDefault();
    setLoadingAnalise(true);
    setAviso(null);
    try {
      const fd = new FormData();
      fd.append('ano', String(ano));
      if (plano) fd.append('plano', plano);
      const resp = await apiPost<{ ano: number; narrativa: Narrativa | null; aviso: string | null }>(
        '/relatorios/anual/analise',
        fd,
      );
      if (resp.aviso) setAviso(resp.aviso);
      setNarrativa(resp.narrativa ?? narrativaVazia());
      setFase('rascunho');
    } catch (err: any) {
      toast(err.message || 'Erro ao gerar análise.', 'error');
    } finally {
      setLoadingAnalise(false);
    }
  }

  async function gerarPdf() {
    setLoadingPdf(true);
    try {
      await openProtectedPost('/relatorios/anual/pdf', { ano, narrativa });
      toast('Relatório gerado.', 'success');
    } catch (err: any) {
      toast(err.message || 'Erro ao gerar PDF.', 'error');
    } finally {
      setLoadingPdf(false);
    }
  }

  function updateAdm<K extends keyof Administracao>(key: K, value: string) {
    setNarrativa((n) => ({ ...n, administracao: { ...n.administracao, [key]: value } }));
  }

  const title = (
    <div className="flex items-center gap-2">
      <div className="w-8 h-8 rounded-md bg-gradient-to-br from-brand to-purple-600 text-white grid place-items-center">
        <Sparkles className="w-4 h-4" />
      </div>
      <span>Relatório e Contas (IA)</span>
    </div>
  );

  return (
    <Modal open={open} onClose={fechar} title={title} size="xl">
      <div className="p-6 overflow-y-auto">
        {fase === 'inputs' && (
          <form onSubmit={analisar} className="flex flex-col gap-4">
            <p className="text-sm text-ink-soft">
              Carrega o <strong>Plano Anual de Atividades</strong> (PDF) e escolhe o exercício.
              A IA compara o que estava previsto com o que foi efetivamente registado no sistema
              e redige um rascunho das secções escritas do relatório, pronto para rever.
            </p>

            <FormSection title="Exercício" accent>
              <FormField label="Ano" required>
                <Select value={ano} onChange={(e) => setAno(Number(e.target.value))} className="w-40">
                  {[0, 1, 2, 3, 4].map((d) => (
                    <option key={d} value={anoAtual - d}>{anoAtual - d}</option>
                  ))}
                </Select>
              </FormField>
            </FormSection>

            <FormSection title="Plano Anual de Atividades">
              <FormField
                label="PDF do plano (opcional)"
                hint="Sem plano, a IA não analisa o previsto vs realizado — vais ter de escrever as secções manualmente."
              >
                <Input
                  type="file"
                  accept="application/pdf"
                  onChange={(e) => setPlano(e.target.files?.[0] || null)}
                />
              </FormField>
              {plano && (
                <p className="text-xs text-ink-soft mt-2 inline-flex items-center gap-1">
                  <FileText className="w-3.5 h-3.5" /> {plano.name}
                </p>
              )}
            </FormSection>

            <div className="flex justify-end gap-2 pt-2 border-t border-line">
              <Button type="button" variant="ghost" onClick={fechar}>Cancelar</Button>
              <Button
                type="submit"
                loading={loadingAnalise}
                icon={plano ? <Sparkles className="w-4 h-4" /> : <ArrowLeft className="w-4 h-4 rotate-180" />}
              >
                {plano ? 'Analisar com IA' : 'Avançar sem plano'}
              </Button>
            </div>
          </form>
        )}

        {fase === 'rascunho' && (
          <div className="flex flex-col gap-4">
            {aviso && (
              <div className="rounded-md bg-warn-soft border border-warn/30 px-3 py-2 text-sm text-warn-ink flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> {aviso}
              </div>
            )}

            <p className="text-sm text-ink-soft">
              Rascunho das secções do <strong>Relatório e Contas {ano}</strong>. Revê e corrige
              o texto antes de gerar o PDF final — os números financeiros são apurados em
              tempo real a partir do sistema.
            </p>

            <FormSection title="Nota de abertura" accent>
              <SeccaoTextarea
                label="Carta aos associados"
                value={narrativa.notaIntroducao}
                onChange={(v) => setNarrativa((n) => ({ ...n, notaIntroducao: v }))}
                rows={5}
              />
            </FormSection>

            <FormSection title="Administração">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <SeccaoTextarea label="Gestão interna" value={narrativa.administracao.gestaoInterna} onChange={(v) => updateAdm('gestaoInterna', v)} />
                <SeccaoTextarea label="Parcerias estratégicas" value={narrativa.administracao.parcerias} onChange={(v) => updateAdm('parcerias', v)} />
                <SeccaoTextarea label="Transparência e participação" value={narrativa.administracao.transparencia} onChange={(v) => updateAdm('transparencia', v)} />
                <SeccaoTextarea label="Desafios e visão" value={narrativa.administracao.desafios} onChange={(v) => updateAdm('desafios', v)} />
              </div>
            </FormSection>

            <FormSection title="Atividades">
              <SeccaoTextarea
                label="Atividades realizadas"
                value={narrativa.atividadesRealizadas}
                onChange={(v) => setNarrativa((n) => ({ ...n, atividadesRealizadas: v }))}
                rows={6}
              />
              <div className="h-3" />
              <SeccaoTextarea
                label="Atividades não realizadas"
                value={narrativa.atividadesNaoRealizadas}
                onChange={(v) => setNarrativa((n) => ({ ...n, atividadesNaoRealizadas: v }))}
                rows={4}
              />
            </FormSection>

            <FormSection title="Conclusão" accent>
              <SeccaoTextarea
                label="Balanço final do ano"
                value={narrativa.conclusao}
                onChange={(v) => setNarrativa((n) => ({ ...n, conclusao: v }))}
                rows={5}
              />
            </FormSection>

            <div className="flex justify-between gap-2 pt-2 border-t border-line">
              <Button type="button" variant="ghost" icon={<ArrowLeft className="w-4 h-4" />} onClick={() => setFase('inputs')}>
                Voltar
              </Button>
              <div className="flex gap-2">
                <Button type="button" variant="ghost" onClick={fechar}>Cancelar</Button>
                <Button type="button" loading={loadingPdf} onClick={gerarPdf} icon={<Download className="w-4 h-4" />}>
                  Gerar PDF
                </Button>
              </div>
            </div>
          </div>
        )}

        {loadingAnalise && (
          <div className="mt-4 flex items-center gap-2 text-sm text-ink-soft">
            <Spinner size={16} /> A analisar o plano e os dados do ano…
          </div>
        )}
      </div>
    </Modal>
  );
}

function SeccaoTextarea({
  label,
  value,
  onChange,
  rows = 4,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
}) {
  return (
    <FormField label={label}>
      <Textarea value={value} onChange={(e) => onChange(e.target.value)} rows={rows} />
    </FormField>
  );
}

