import { useEffect, useState, useMemo } from 'react';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, KPI } from '@/components/ui/Card';
import { Table, THead, TBody, TH, TR, TD, Empty } from '@/components/ui/Table';
import { LoadingBlock } from '@/components/ui/Spinner';
import { apiGet } from '@/lib/api';
import { fmtData, fmtEuro } from '@/lib/format';
import type { Movimento } from '@/lib/types';

export function TesourariaPage() {
  const [items, setItems] = useState<Movimento[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try { setItems(await apiGet<Movimento[]>('/movimentos')); }
      finally { setLoading(false); }
    })();
  }, []);

  const totais = useMemo(() => {
    let entradas = 0, saidas = 0;
    items.forEach(m => {
      const v = Number(m.valor);
      if (m.tipo === 'entrada') entradas += v;
      else saidas += v;
    });
    return { entradas, saidas, saldo: entradas - saidas };
  }, [items]);

  return (
    <>
      <PageHeader title="Tesouraria" subtitle={`${items.length} movimentos registados`} />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
        <KPI label="Entradas" value={fmtEuro(totais.entradas)} accent="good" />
        <KPI label="Saídas" value={fmtEuro(totais.saidas)} accent="bad" />
        <KPI label="Saldo" value={fmtEuro(totais.saldo)} accent={totais.saldo >= 0 ? 'good' : 'bad'} />
      </div>

      {loading ? <LoadingBlock /> : items.length === 0 ? (
        <Card><Empty>Sem movimentos.</Empty></Card>
      ) : (
        <Table>
          <THead><TH>Data</TH><TH>Tipo</TH><TH>Descrição</TH><TH>Conta</TH><TH align="right">Valor</TH></THead>
          <TBody>
            {items.map(m => (
              <TR key={m.id}>
                <TD mono>{fmtData(m.data)}</TD>
                <TD>
                  {m.tipo === 'entrada'
                    ? <span className="inline-flex items-center gap-1 text-good text-xs font-semibold"><ArrowUpRight className="w-3.5 h-3.5" />Entrada</span>
                    : <span className="inline-flex items-center gap-1 text-bad-ink text-xs font-semibold"><ArrowDownRight className="w-3.5 h-3.5" />Saída</span>}
                </TD>
                <TD>
                  <div className="font-medium">{m.descricao || '—'}</div>
                  {m.referencia && <div className="text-xs text-ink-muted">{m.referencia}</div>}
                </TD>
                <TD><span className="text-xs text-ink-soft">{m.conta}</span></TD>
                <TD align="right" mono className={`font-semibold ${m.tipo === 'entrada' ? 'text-good' : 'text-ink'}`}>
                  {m.tipo === 'entrada' ? '+' : '−'}{fmtEuro(m.valor)}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </>
  );
}
