import { useMemo, useState } from 'react';
import { Plus, Calendar, Filter } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Empty } from '@/components/ui/Table';
import { LoadingBlock } from '@/components/ui/Spinner';
import { useCatalogos } from '@/hooks/useCatalogos';
import { useAuth } from '@/contexts/AuthContext';
import { fmtData, fmtEuro } from '@/lib/format';
import type { Processo } from '@/lib/types';
import { ProcessoFormModal } from '@/components/forms/ProcessoFormModal';
import { ProcessoDetailModal } from '@/components/forms/ProcessoDetailModal';
import { apiDel } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';

export function ProcessosPage() {
  const { role } = useAuth();
  const { processos, loaded, reload } = useCatalogos();
  const { toast } = useToast();
  const [tipo, setTipo] = useState('');
  const [estado, setEstado] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Processo | null>(null);
  const [detalheId, setDetalheId] = useState<number | null>(null);
  const readonly = role === 'fiscal';

  async function eliminarProcesso(p: Processo) {
    if (!confirm(`Eliminar o processo "${p.nome}"? Receitas e despesas associadas ficam, mas perdem a associação.`)) return;
    try {
      await apiDel(`/eventos/${p.id}`);
      toast('Processo eliminado', 'success');
      setDetalheId(null);
      await reload();
    } catch (e: any) { toast(e.message || 'Erro', 'error'); }
  }

  const filtrados = useMemo(() => processos.filter(p =>
    (!tipo || p.tipo === tipo) && (!estado || p.estado === estado)
  ), [processos, tipo, estado]);

  const badgeVariant = (t: string) => t === 'Subsídio' ? 'subsidio' : t === 'Investimento' ? 'investimento' : t === 'Projeto Anual' ? 'projeto' : 'neutral';

  return (
    <>
      <PageHeader
        title="Processos"
        subtitle="Eventos, projetos anuais, investimentos e subsídios"
        actions={!readonly && <Button icon={<Plus className="w-4 h-4" />} onClick={() => { setEditing(null); setShowForm(true); }}>Novo processo</Button>}
      />

      <Card className="mb-5 p-4 flex flex-wrap gap-3 items-center">
        <Select value={tipo} onChange={e => setTipo(e.target.value)} className="w-56">
          <option value="">Todos os tipos</option>
          <option>Evento</option>
          <option>Projeto Anual</option>
          <option>Investimento</option>
          <option>Subsídio</option>
        </Select>
        <Select value={estado} onChange={e => setEstado(e.target.value)} className="w-48">
          <option value="">Todos os estados</option>
          <option>Em curso</option>
          <option>Concluído</option>
          <option>Cancelado</option>
        </Select>
        <span className="ml-auto text-sm text-ink-soft">{filtrados.length} de {processos.length}</span>
      </Card>

      {!loaded ? <LoadingBlock /> : filtrados.length === 0 ? (
        <Card><Empty icon={<Filter className="w-10 h-10" />}>Sem processos.</Empty></Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtrados.map(p => (
            <div key={p.id} onClick={() => setDetalheId(p.id)}
                 className="bg-white border border-line rounded-lg shadow-soft p-4 cursor-pointer hover:-translate-y-0.5 hover:shadow-card hover:border-ink-muted transition-all">
              <div className="flex items-start justify-between gap-2 mb-2">
                <Badge variant={badgeVariant(p.tipo) as any}>{p.tipo}</Badge>
                <Badge variant={p.estado === 'Concluído' ? 'good' : p.estado === 'Cancelado' ? 'bad' : 'neutral'}>{p.estado}</Badge>
              </div>
              <h3 className="font-semibold text-ink text-sm leading-tight mb-1">{p.nome}</h3>
              {p.departamento && <div className="text-xs text-ink-muted">{p.departamento}</div>}
              <div className="flex items-center gap-1 text-xs text-ink-soft mt-2">
                <Calendar className="w-3 h-3" />
                <span>{fmtData(p.data_inicio) || '—'} → {fmtData(p.data_fim) || '—'}</span>
              </div>
              {p.tipo === 'Subsídio' && (
                <div className="mt-3 pt-3 border-t border-line-soft text-xs space-y-1">
                  {p.numeroProcesso && <div className="text-ink-soft">Processo nº <span className="font-mono text-ink">{p.numeroProcesso}</span></div>}
                  {p.valorAprovado != null && <div className="font-mono tabular font-semibold text-ink">{fmtEuro(p.valorAprovado)} aprovados</div>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <ProcessoFormModal processo={editing} onClose={() => setShowForm(false)}
                           onSaved={() => { setShowForm(false); reload(); }} />
      )}

      {detalheId && (
        <ProcessoDetailModal
          processoId={detalheId}
          onClose={() => setDetalheId(null)}
          onEditar={(p) => { setDetalheId(null); setEditing(p); setShowForm(true); }}
          onEliminar={eliminarProcesso}
        />
      )}
    </>
  );
}
