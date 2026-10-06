import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { KPI, Card } from '@/components/ui/Card';
import { LoadingBlock } from '@/components/ui/Spinner';
import { apiGet } from '@/lib/api';
import { fmtEuro } from '@/lib/format';
import { SncBadge } from '@/components/ui/Badge';
import { TrendingUp, TrendingDown, Wallet, AlertCircle } from 'lucide-react';
import { Select } from '@/components/ui/Input';

interface Balancete {
  periodo: { inicio: string; fim: string };
  familias: Array<{ familia: string; tipo: string; total: number; linhas: Array<{ codigo: string; nome: string; total: number; count: number }> }>;
  semClassificacao: { count: number; total: number } | null;
  totais: { proveitos: number; gastos: number; resultadoLiquido: number; ativos: number; passivos: number };
}

export function ResumoPage() {
  const anoAtual = new Date().getFullYear();
  const [ano, setAno] = useState(anoAtual);
  const [bal, setBal] = useState<Balancete | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    apiGet<Balancete>('/relatorios/balancete-snc', { periodo: 'anual', ano }).then(setBal).finally(() => setLoading(false));
  }, [ano]);

  return (
    <>
      <PageHeader
        title="Resumo"
        subtitle={`Balancete por conta SNC — exercício ${ano}`}
        actions={
          <Select value={ano} onChange={e => setAno(Number(e.target.value))} className="w-32">
            {[0, 1, 2, 3, 4].map(d => <option key={d} value={anoAtual - d}>{anoAtual - d}</option>)}
          </Select>
        }
      />

      {loading && <LoadingBlock />}
      {!loading && bal && bal.totais && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <KPI label="Proveitos" value={fmtEuro(bal.totais.proveitos)} accent="good" delta={<><TrendingUp className="inline w-3 h-3 mr-1" />Entradas</>} deltaColor="good" />
            <KPI label="Gastos" value={fmtEuro(bal.totais.gastos)} accent="bad" delta={<><TrendingDown className="inline w-3 h-3 mr-1" />Saídas</>} deltaColor="bad" />
            <KPI label="Resultado líquido" value={fmtEuro(bal.totais.resultadoLiquido)}
                 accent={bal.totais.resultadoLiquido >= 0 ? 'good' : 'bad'}
                 delta={<><Wallet className="inline w-3 h-3 mr-1" />{bal.totais.resultadoLiquido >= 0 ? 'Positivo' : 'Negativo'}</>}
                 deltaColor={bal.totais.resultadoLiquido >= 0 ? 'good' : 'bad'} />
            {bal.totais.ativos > 0 && (
              <KPI label="Ativos capitalizados" value={fmtEuro(bal.totais.ativos)} accent="brand" hint="Classe 43 — depreciação anual" />
            )}
          </div>

          {bal.familias.length === 0 && (
            <Card>
              <p className="text-ink-soft text-sm">Sem registos classificados em {ano}. Começa por classificar receitas e despesas com conta SNC.</p>
            </Card>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {['proveito', 'gasto', 'ativo', 'passivo'].map(tipo => {
              const fams = bal.familias.filter(f => f.tipo === tipo);
              if (!fams.length) return null;
              const soDiferidos = tipo === 'passivo' && fams.every(f => f.linhas.every((l: any) => l.codigo === '59' || l.codigo === '7883'));
              const tipoLabel: Record<string, string> = {
                proveito: 'Proveitos',
                gasto: 'Gastos',
                ativo: 'Ativos',
                passivo: soDiferidos ? 'Subsídios diferidos' : 'Passivos',
              };
              const tipoColor: Record<string, string> = { proveito: 'text-good', gasto: 'text-bad', ativo: 'text-info-ink', passivo: 'text-purple-700' };
              return (
                <Card key={tipo}>
                  <h3 className={`text-sm font-semibold uppercase tracking-wider mb-4 ${tipoColor[tipo]}`}>{tipoLabel[tipo]}</h3>
                  {fams.map(fam => (
                    <div key={fam.familia} className="mb-4 last:mb-0">
                      <div className="flex justify-between items-baseline mb-2 pb-1 border-b border-line-soft">
                        <span className="text-xs font-semibold text-ink-soft">{fam.familia}</span>
                        <span className="font-mono text-xs text-ink">{fmtEuro(fam.total)}</span>
                      </div>
                      {fam.linhas.sort((a, b) => b.total - a.total).map(l => (
                        <div key={l.codigo} className="flex justify-between items-center py-1 text-sm">
                          <span className="flex items-center gap-2 min-w-0">
                            <SncBadge codigo={l.codigo} />
                            <span className="truncate text-ink">{l.nome}</span>
                            <span className="text-ink-muted text-xs shrink-0">({l.count})</span>
                          </span>
                          <span className="font-mono text-xs tabular text-ink shrink-0">{fmtEuro(l.total)}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </Card>
              );
            })}
          </div>

          {bal.semClassificacao && (
            <div className="mt-6 bg-warn-soft border border-warn/30 rounded-lg px-4 py-3 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-warn-ink shrink-0 mt-0.5" />
              <div className="text-sm text-warn-ink">
                <strong>{bal.semClassificacao.count}</strong> registo(s) sem classificação SNC ({fmtEuro(bal.semClassificacao.total)}).
                Classifica-os em Despesas / Receitas para aparecerem no balancete.
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}
