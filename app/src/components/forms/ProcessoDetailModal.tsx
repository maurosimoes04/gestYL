import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { KPI } from '@/components/ui/Card';
import { Badge, SncBadge, estadoVariant } from '@/components/ui/Badge';
import { LoadingBlock } from '@/components/ui/Spinner';
import { Table, THead, TBody, TH, TR, TD, Empty } from '@/components/ui/Table';
import { apiGet } from '@/lib/api';
import { fmtData, fmtEuro } from '@/lib/format';
import { Download, Pencil, Share2, Trash2, FileText } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import type { Processo, Fatura, Receita } from '@/lib/types';
import { PartilharProcessoModal } from './PartilharProcessoModal';
import { openProtected } from '@/lib/download';
import { useToast } from '@/contexts/ToastContext';

interface Props {
  processoId: number;
  onClose: () => void;
  onEditar: (p: Processo) => void;
  onEliminar: (p: Processo) => void;
}

interface Details {
  evento: Processo;
  faturas: Array<Fatura & { valorEvento: number }>;
  receitas: Array<Receita & { valorEvento: number }>;
  resumo: { totalDespesas: number; totalReceitas: number; saldo: number };
}

export function ProcessoDetailModal({ processoId, onClose, onEditar, onEliminar }: Props) {
  const { role } = useAuth();
  const { toast } = useToast();
  const [data, setData] = useState<Details | null>(null);
  const [loading, setLoading] = useState(true);
  const [showPartilhar, setShowPartilhar] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const readonly = role === 'fiscal';

  async function baixarPdf() {
    setPdfLoading(true);
    try { await openProtected(`/eventos/${processoId}/pdf`); }
    catch (e: any) { toast(e.message || 'Erro ao gerar PDF', 'error'); }
    finally { setPdfLoading(false); }
  }

  useEffect(() => {
    apiGet<Details>(`/eventos/${processoId}/details`).then(setData).finally(() => setLoading(false));
  }, [processoId]);

  const p = data?.evento;
  const tipoBadge = p?.tipo === 'Subsídio' ? 'subsidio' : p?.tipo === 'Investimento' ? 'investimento' : p?.tipo === 'Projeto Anual' ? 'projeto' : 'neutral';

  const title = p ? (
    <div className="flex items-center gap-2 flex-wrap">
      <Badge variant={tipoBadge as any}>{p.tipo}</Badge>
      <span>{p.nome}</span>
    </div>
  ) : 'Processo';

  const footer = p && (
    <>
      {!readonly && (
        <>
          <Button variant="ghost" icon={<Share2 className="w-4 h-4" />} onClick={() => setShowPartilhar(true)}>Partilhar</Button>
          <Button variant="ghost" icon={<Pencil className="w-4 h-4" />} onClick={() => onEditar(p)}>Editar</Button>
          <Button variant="danger" icon={<Trash2 className="w-4 h-4" />} onClick={() => onEliminar(p)}>Eliminar</Button>
        </>
      )}
      <Button variant="ghost" icon={<Download className="w-4 h-4" />} loading={pdfLoading} onClick={baixarPdf}>PDF</Button>
      <Button variant="ghost" onClick={onClose}>Fechar</Button>
    </>
  );

  return (
    <>
      <Modal open onClose={onClose} size="xl" title={title} footer={footer}>
        {loading && <LoadingBlock />}
        {data && p && (
          <>
            {/* Metadados */}
            <div className="bg-surface-page rounded-lg p-4 mb-5 flex flex-wrap gap-6 text-sm">
              {p.descricao && <div className="w-full"><span className="text-ink-muted uppercase text-[0.68rem] font-semibold tracking-wider">Descrição</span><div className="text-ink mt-1">{p.descricao}</div></div>}
              {p.departamento && <div><span className="text-ink-muted uppercase text-[0.68rem] font-semibold tracking-wider">Departamento</span><div className="text-ink mt-1">{p.departamento}</div></div>}
              <div><span className="text-ink-muted uppercase text-[0.68rem] font-semibold tracking-wider">Período</span><div className="text-ink mt-1">{fmtData(p.data_inicio)} → {fmtData(p.data_fim)}</div></div>
              <div><span className="text-ink-muted uppercase text-[0.68rem] font-semibold tracking-wider">Estado</span><div className="text-ink mt-1"><Badge variant={estadoVariant(p.estado)}>{p.estado}</Badge></div></div>
              {p.tipo === 'Subsídio' && (
                <>
                  {p.numeroProcesso && <div><span className="text-ink-muted uppercase text-[0.68rem] font-semibold tracking-wider">Processo nº</span><div className="text-ink mt-1 font-mono">{p.numeroProcesso}</div></div>}
                  {p.valorAprovado != null && <div><span className="text-ink-muted uppercase text-[0.68rem] font-semibold tracking-wider">Valor aprovado</span><div className="text-ink mt-1 font-mono font-semibold">{fmtEuro(p.valorAprovado)}</div></div>}
                </>
              )}
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-3 gap-3 mb-6">
              <KPI label="Receitas" value={fmtEuro(data.resumo.totalReceitas)} accent="good" hint={`${data.receitas.length} registo(s)`} />
              <KPI label="Despesas" value={fmtEuro(data.resumo.totalDespesas)} accent="bad" hint={`${data.faturas.length} registo(s)`} />
              <KPI label="Saldo" value={fmtEuro(data.resumo.saldo)} accent={data.resumo.saldo >= 0 ? 'good' : 'bad'} hint={data.resumo.saldo >= 0 ? 'Resultado positivo' : 'Resultado negativo'} />
            </div>

            {/* Progresso vs valor aprovado */}
            {p.tipo === 'Subsídio' && p.valorAprovado != null && Number(p.valorAprovado) > 0 && (
              <div className="mb-6">
                <div className="flex justify-between text-xs text-ink-soft mb-1">
                  <span>Recebido vs aprovado</span>
                  <span className="font-mono">{fmtEuro(data.resumo.totalReceitas)} / {fmtEuro(p.valorAprovado)}</span>
                </div>
                <div className="h-2 bg-surface-alt rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-brand to-purple-600" style={{ width: `${Math.min(100, (data.resumo.totalReceitas / Number(p.valorAprovado)) * 100)}%` }} />
                </div>
              </div>
            )}

            {/* Receitas */}
            {data.receitas.length > 0 && (
              <div className="mb-5">
                <h4 className="text-sm font-semibold text-good mb-2">Receitas associadas ({data.receitas.length})</h4>
                <Table>
                  <THead><TH>Data</TH><TH>Título</TH><TH>Financiador</TH><TH>SNC</TH><TH>Estado</TH><TH align="right">Valor</TH></THead>
                  <TBody>
                    {data.receitas.map(r => (
                      <TR key={r.id}>
                        <TD mono>{fmtData(r.data)}</TD>
                        <TD>{r.titulo}</TD>
                        <TD>{r.entidade?.nome || r.financiador || '—'}</TD>
                        <TD>{r.contaSnc && <SncBadge codigo={r.contaSnc.codigo} />}</TD>
                        <TD><Badge variant={estadoVariant(r.estado)}>{r.estado}</Badge></TD>
                        <TD align="right" mono className="font-semibold text-good">{fmtEuro(r.valorEvento)}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </div>
            )}

            {/* Despesas */}
            {data.faturas.length > 0 && (
              <div className="mb-2">
                <h4 className="text-sm font-semibold text-bad mb-2">Despesas associadas ({data.faturas.length})</h4>
                <Table>
                  <THead><TH>Data</TH><TH>Documento</TH><TH>Fornecedor</TH><TH>SNC</TH><TH>Estado</TH><TH align="right">Valor</TH></THead>
                  <TBody>
                    {data.faturas.map(f => (
                      <TR key={f.id}>
                        <TD mono>{fmtData(f.data)}</TD>
                        <TD>{f.titulo}{f.numero && <div className="text-xs text-ink-muted">{f.numero}</div>}</TD>
                        <TD>{f.entidade?.nome || f.fornecedor || '—'}</TD>
                        <TD>{f.contaSnc && <SncBadge codigo={f.contaSnc.codigo} />}</TD>
                        <TD><Badge variant={estadoVariant(f.estado)}>{f.estado}</Badge></TD>
                        <TD align="right" mono className="font-semibold">{fmtEuro(f.valorEvento)}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </div>
            )}

            {data.receitas.length === 0 && data.faturas.length === 0 && (
              <Empty icon={<FileText className="w-10 h-10" />}>Sem receitas nem despesas associadas a este processo.</Empty>
            )}
          </>
        )}
      </Modal>

      {p && showPartilhar && (
        <PartilharProcessoModal processo={p} onClose={() => setShowPartilhar(false)} />
      )}
    </>
  );
}
