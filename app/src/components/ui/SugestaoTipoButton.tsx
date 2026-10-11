import { useState } from 'react';
import { Button } from './Button';
import { Sparkles, CheckCircle2 } from 'lucide-react';
import { apiPost } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';

interface Sugestao {
  tipo: string;
  confianca: number;
  motivo: string;
}

interface Props {
  nome: string;
  descricao?: string;
  departamento?: string;
  dataInicio?: string;
  dataFim?: string;
  onAplicar: (tipo: string) => void;
}

export function SugestaoTipoButton({ nome, descricao, departamento, dataInicio, dataFim, onAplicar }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [sug, setSug] = useState<Sugestao | null>(null);

  const temInfo = nome.trim().length >= 3;

  async function sugerir() {
    if (!temInfo) { toast('Preenche o nome para a IA poder sugerir', 'info'); return; }
    setLoading(true);
    try {
      const r = await apiPost<Sugestao>('/ia-snc/sugerir-tipo-processo', {
        nome, descricao, departamento, dataInicio, dataFim,
      });
      setSug(r);
    } catch (e: any) { toast(e.message || 'IA indisponível', 'error'); }
    finally { setLoading(false); }
  }

  function aplicar() {
    if (!sug) return;
    onAplicar(sug.tipo);
    toast(`Tipo "${sug.tipo}" aplicado`, 'success');
    setSug(null);
  }

  const confPct = sug ? Math.round(sug.confianca * 100) : 0;
  const confColor = confPct >= 80 ? 'text-good' : confPct >= 50 ? 'text-warn-ink' : 'text-bad-ink';

  return (
    <div>
      <Button type="button" size="sm" variant="subtle" icon={<Sparkles className="w-3.5 h-3.5" />}
              loading={loading} onClick={sugerir} disabled={!temInfo && !loading}>
        {sug ? 'Rever sugestão IA' : 'Sugerir tipo com IA'}
      </Button>
      {!temInfo && (
        <p className="text-[0.68rem] text-ink-soft mt-1">Preenche o nome para ativar a sugestão IA.</p>
      )}

      {sug && (
        <div className="mt-2 bg-white border-2 border-brand rounded-lg p-3 shadow-card">
          <div className="flex items-start gap-2 mb-2">
            <Sparkles className="w-4 h-4 text-brand shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="text-xs text-ink-soft uppercase tracking-wider font-semibold">Sugestão IA</div>
              <div className="font-semibold text-ink text-sm">{sug.tipo}</div>
              <div className={`text-xs font-semibold ${confColor}`}>Confiança {confPct}%</div>
            </div>
          </div>
          <p className="text-xs text-ink-soft italic mb-2">{sug.motivo}</p>
          <div className="flex gap-2">
            <Button type="button" size="sm" icon={<CheckCircle2 className="w-3.5 h-3.5" />} onClick={aplicar}>
              Aplicar sugestão
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setSug(null)}>Descartar</Button>
          </div>
        </div>
      )}
    </div>
  );
}
