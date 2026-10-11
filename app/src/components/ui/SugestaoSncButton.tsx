import { useState } from 'react';
import { Button } from './Button';
import { Sparkles, CheckCircle2, AlertTriangle } from 'lucide-react';
import { apiPost } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';

interface Sugestao {
  atual: { codigo: string; nome: string } | null;
  sugerida: { id: number; codigo: string; nome: string } | null;
  confianca: number;
  motivo: string;
  avisos: string[];
  diverge: boolean;
}

interface FormData {
  titulo: string;
  valor?: string | number;
  data?: string;
  entidadeNome?: string;
  departamento?: string;
  numero?: string;
  descricao?: string;
}

interface Props {
  tipo: 'fatura' | 'receita';
  registoId: number | null;
  /** Dados do formulário — permitem sugerir SNC sem registo guardado. */
  formData?: FormData;
  onAplicar: (contaSncId: number) => void;
}

export function SugestaoSncButton({ tipo, registoId, formData, onAplicar }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [sug, setSug] = useState<Sugestao | null>(null);

  const temInfoSuficiente = registoId || (formData?.titulo && formData.titulo.trim().length >= 3);

  async function sugerir() {
    if (!temInfoSuficiente) {
      toast('Preenche pelo menos o título para a IA poder sugerir', 'info');
      return;
    }
    setLoading(true);
    try {
      let r: Sugestao;
      if (registoId) {
        r = await apiPost<Sugestao>(`/ia-snc/sugerir/${tipo}/${registoId}`);
      } else {
        r = await apiPost<Sugestao>('/ia-snc/sugerir-form', {
          tipo,
          titulo: formData!.titulo,
          valor: formData?.valor,
          data: formData?.data,
          entidadeNome: formData?.entidadeNome,
          departamento: formData?.departamento,
          numero: formData?.numero,
          descricao: formData?.descricao,
        });
      }
      setSug(r);
    } catch (e: any) { toast(e.message || 'IA indisponível', 'error'); }
    finally { setLoading(false); }
  }

  function aplicar() {
    if (!sug?.sugerida) return;
    onAplicar(sug.sugerida.id);
    toast(`Conta ${sug.sugerida.codigo} aplicada`, 'success');
    setSug(null);
  }

  const confPct = sug ? Math.round(sug.confianca * 100) : 0;
  const confColor = confPct >= 80 ? 'text-good' : confPct >= 50 ? 'text-warn-ink' : 'text-bad-ink';

  return (
    <div>
      <Button type="button" size="sm" variant="subtle" icon={<Sparkles className="w-3.5 h-3.5" />}
              loading={loading} onClick={sugerir} disabled={!temInfoSuficiente && !loading}>
        {sug ? 'Rever sugestão IA' : 'Sugerir SNC com IA'}
      </Button>
      {!temInfoSuficiente && (
        <p className="text-[0.68rem] text-ink-soft mt-1">Preenche o título para ativar a sugestão IA.</p>
      )}

      {sug && (
        <div className="mt-2 bg-white border-2 border-brand rounded-lg p-3 shadow-card">
          {!sug.sugerida ? (
            <div className="text-sm text-bad-ink">IA não conseguiu sugerir uma conta ({sug.motivo}).</div>
          ) : (
            <>
              <div className="flex items-start gap-2 mb-2">
                <Sparkles className="w-4 h-4 text-brand shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="text-xs text-ink-soft uppercase tracking-wider font-semibold">Sugestão IA</div>
                  <div className="font-semibold text-ink">
                    <span className="font-mono bg-brand-soft text-brand px-1.5 py-0.5 rounded text-sm mr-1">{sug.sugerida.codigo}</span>
                    {sug.sugerida.nome}
                  </div>
                  <div className={`text-xs font-semibold ${confColor}`}>Confiança {confPct}%</div>
                </div>
              </div>
              <p className="text-xs text-ink-soft italic mb-2">{sug.motivo}</p>

              {sug.atual && sug.diverge && (
                <div className="bg-warn-soft text-warn-ink text-xs rounded px-2 py-1 mb-2 flex items-start gap-1">
                  <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                  <span>Diverge do atual: <strong>{sug.atual.codigo}</strong> {sug.atual.nome}</span>
                </div>
              )}
              {sug.avisos.length > 0 && (
                <ul className="text-xs text-warn-ink mb-2 pl-4 list-disc">
                  {sug.avisos.map((a, i) => <li key={i}>{a}</li>)}
                </ul>
              )}

              <div className="flex gap-2">
                <Button type="button" size="sm" icon={<CheckCircle2 className="w-3.5 h-3.5" />} onClick={aplicar}>
                  Aplicar sugestão
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setSug(null)}>Descartar</Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
