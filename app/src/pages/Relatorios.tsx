import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Input';
import { BarChart3, Sparkles, FileSpreadsheet, Download } from 'lucide-react';
import { useState } from 'react';
import { openProtected } from '@/lib/download';
import { useToast } from '@/contexts/ToastContext';

export function RelatoriosPage() {
  const ano = new Date().getFullYear();
  const [anoFin, setAnoFin] = useState(ano);
  const [anoSnc, setAnoSnc] = useState(ano);
  const [loading, setLoading] = useState<string | null>(null);
  const { toast } = useToast();

  async function abrirPdf(url: string, key: string) {
    setLoading(key);
    try { await openProtected(url); }
    catch (e: any) { toast(e.message || 'Erro ao gerar PDF', 'error'); }
    finally { setLoading(null); }
  }

  return (
    <>
      <PageHeader title="Relatórios" subtitle="Documentos financeiros e análises por período" />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <ReportCard
          icon={<FileSpreadsheet className="w-6 h-6" />}
          title="Balancete por Conta SNC"
          description="Agregação legal para contabilista. Proveitos (72, 75, 76) vs gastos (62x, 63), resultado líquido e alertas de registos por classificar."
        >
          <div className="flex items-center gap-2 w-full">
            <Select value={anoSnc} onChange={e => setAnoSnc(Number(e.target.value))} className="flex-1">
              {[0, 1, 2, 3, 4].map(d => <option key={d} value={ano - d}>{ano - d}</option>)}
            </Select>
            <Button icon={<Download className="w-4 h-4" />} loading={loading === 'snc'}
                    onClick={() => abrirPdf(`/relatorios/balancete-snc/pdf?periodo=anual&ano=${anoSnc}`, 'snc')}>PDF</Button>
          </div>
        </ReportCard>

        <ReportCard
          icon={<BarChart3 className="w-6 h-6" />}
          title="Relatório Financeiro"
          description="Resumo detalhado de receitas e despesas por período — por departamento, categoria, evento e entidade, com o detalhe de cada movimento."
        >
          <div className="flex items-center gap-2 w-full">
            <Select value={anoFin} onChange={e => setAnoFin(Number(e.target.value))} className="flex-1">
              {[0, 1, 2, 3, 4].map(d => <option key={d} value={ano - d}>{ano - d}</option>)}
            </Select>
            <Button icon={<Download className="w-4 h-4" />} loading={loading === 'fin'}
                    onClick={() => abrirPdf(`/relatorios/pdf?periodo=anual&ano=${anoFin}&tipo=ambos`, 'fin')}>PDF</Button>
          </div>
        </ReportCard>

        <ReportCard
          icon={<Sparkles className="w-6 h-6" />}
          title="Relatório e Contas (IA)"
          description="Documento anual completo, gerado por IA a partir do plano de atividades. Rascunho editável antes do PDF final."
          purple
        >
          <Button variant="ghost" onClick={() => alert('A integração do Relatório IA será migrada em breve. Usa /user por agora.')}>
            Em breve
          </Button>
        </ReportCard>
      </div>
    </>
  );
}

function ReportCard({ icon, title, description, purple, children }: { icon: React.ReactNode; title: string; description: string; purple?: boolean; children?: React.ReactNode }) {
  return (
    <Card className="flex flex-col gap-3 h-full">
      <div className={`w-11 h-11 rounded-lg grid place-items-center ${purple ? 'bg-gradient-to-br from-brand to-purple-600 text-white' : 'bg-brand-soft text-brand'}`}>
        {icon}
      </div>
      <div>
        <h3 className="font-semibold text-ink">{title}</h3>
        <p className="text-sm text-ink-soft mt-1">{description}</p>
      </div>
      <div className="mt-auto pt-2">{children}</div>
    </Card>
  );
}
