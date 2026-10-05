import { useEffect, useState, useMemo } from 'react';
import { Share2, Copy, Trash2, Clock, XCircle, Search, ExternalLink } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Table, THead, TBody, TH, TR, TD, Empty } from '@/components/ui/Table';
import { LoadingBlock } from '@/components/ui/Spinner';
import { apiGet, apiPost } from '@/lib/api';
import { fmtData } from '@/lib/format';
import { useToast } from '@/contexts/ToastContext';
import { useAuth } from '@/contexts/AuthContext';

interface Share {
  id: number;
  token: string;
  destinatario?: string | null;
  justificacao: string;
  createdByEmail?: string | null;
  expiresAt: string;
  revokedAt?: string | null;
  createdAt: string;
  evento: { id: number; nome: string; tipo?: string };
}

export function PartilhasPage() {
  const { toast } = useToast();
  const { role } = useAuth();
  const [shares, setShares] = useState<Share[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [estado, setEstado] = useState<'todos' | 'ativas' | 'revogadas' | 'expiradas'>('ativas');

  const readonly = role === 'fiscal';

  async function reload() {
    setLoading(true);
    try {
      const data = await apiGet<{ shares: Share[]; total: number }>('/shares', { limit: 500 });
      setShares(data.shares);
    } catch (e: any) { toast(e.message || 'Erro ao carregar partilhas', 'error'); }
    finally { setLoading(false); }
  }
  useEffect(() => { reload(); }, []);

  const now = Date.now();
  const filtradas = useMemo(() => {
    const query = q.trim().toLowerCase();
    return shares.filter(s => {
      const expirada = new Date(s.expiresAt).getTime() < now;
      if (estado === 'ativas' && (s.revokedAt || expirada)) return false;
      if (estado === 'revogadas' && !s.revokedAt) return false;
      if (estado === 'expiradas' && (!expirada || s.revokedAt)) return false;
      if (query) {
        const hay = `${s.evento.nome} ${s.destinatario || ''} ${s.justificacao} ${s.createdByEmail || ''}`.toLowerCase();
        if (!hay.includes(query)) return false;
      }
      return true;
    });
  }, [shares, q, estado, now]);

  async function revogar(s: Share) {
    if (!confirm(`Revogar partilha "${s.evento.nome}"? O link vai parar imediatamente de funcionar.`)) return;
    try {
      await apiPost(`/shares/${s.id}/revoke`);
      toast('Partilha revogada', 'success');
      reload();
    } catch (e: any) { toast(e.message || 'Erro', 'error'); }
  }

  function copiarLink(token: string) {
    const link = `${window.location.origin}/share/evento/${token}`;
    navigator.clipboard.writeText(link).then(() => toast('Link copiado', 'success'));
  }

  const kpis = useMemo(() => {
    const ativas = shares.filter(s => !s.revokedAt && new Date(s.expiresAt).getTime() > now).length;
    const revogadas = shares.filter(s => s.revokedAt).length;
    const expiradas = shares.filter(s => !s.revokedAt && new Date(s.expiresAt).getTime() < now).length;
    return { ativas, revogadas, expiradas, total: shares.length };
  }, [shares, now]);

  if (role === 'fiscal') {
    return <>
      <PageHeader title="Partilhas" subtitle="Links de leitura partilhados com entidades externas" />
      <Card><Empty>Só admin e direção podem ver partilhas.</Empty></Card>
    </>;
  }

  return (
    <>
      <PageHeader
        title="Partilhas"
        subtitle="Links de leitura partilhados com entidades externas (IPDJ, IEFP, Câmara, auditores…)"
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <StatCard label="Ativas" value={kpis.ativas} color="good" />
        <StatCard label="Expiradas" value={kpis.expiradas} color="warn" />
        <StatCard label="Revogadas" value={kpis.revogadas} color="neutral" />
        <StatCard label="Total" value={kpis.total} color="brand" />
      </div>

      <Card className="mb-5 p-4 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-60">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" />
          <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Pesquisar processo, destinatário, justificação…" className="pl-9" />
        </div>
        <Select value={estado} onChange={e => setEstado(e.target.value as any)} className="w-48">
          <option value="ativas">Ativas</option>
          <option value="expiradas">Expiradas</option>
          <option value="revogadas">Revogadas</option>
          <option value="todos">Todas</option>
        </Select>
      </Card>

      {loading ? <LoadingBlock /> : filtradas.length === 0 ? (
        <Card><Empty icon={<Share2 className="w-10 h-10" />}>Sem partilhas no filtro atual.</Empty></Card>
      ) : (
        <Table>
          <THead>
            <TH>Processo</TH>
            <TH>Destinatário</TH>
            <TH>Justificação</TH>
            <TH>Criada por</TH>
            <TH>Validade</TH>
            <TH>Estado</TH>
            <TH />
          </THead>
          <TBody>
            {filtradas.map(s => {
              const expirada = new Date(s.expiresAt).getTime() < now;
              const revogada = !!s.revokedAt;
              const ativa = !expirada && !revogada;
              return (
                <TR key={s.id}>
                  <TD>
                    <div className="font-medium text-ink">{s.evento.nome}</div>
                    <div className="text-xs text-ink-muted">#{s.evento.id}{s.evento.tipo && ` · ${s.evento.tipo}`}</div>
                  </TD>
                  <TD>{s.destinatario || <span className="italic text-ink-muted">—</span>}</TD>
                  <TD>
                    <div className="text-sm text-ink max-w-xs line-clamp-2">{s.justificacao}</div>
                  </TD>
                  <TD>
                    <div className="text-xs text-ink-soft">{s.createdByEmail || '—'}</div>
                    <div className="text-xs text-ink-muted">{fmtData(s.createdAt)}</div>
                  </TD>
                  <TD mono className="text-xs">{fmtData(s.expiresAt)}</TD>
                  <TD>
                    {revogada && <Badge variant="bad"><XCircle className="w-3 h-3 inline mr-1" />Revogada</Badge>}
                    {!revogada && expirada && <Badge variant="warn"><Clock className="w-3 h-3 inline mr-1" />Expirada</Badge>}
                    {ativa && <Badge variant="good">Ativa</Badge>}
                  </TD>
                  <TD>
                    <div className="flex gap-1 justify-end">
                      {ativa && (
                        <>
                          <button onClick={() => copiarLink(s.token)}
                                  title="Copiar link"
                                  className="p-1.5 text-ink-soft hover:text-brand hover:bg-brand-soft rounded"><Copy className="w-4 h-4" /></button>
                          <a href={`/share/evento/${s.token}`} target="_blank" rel="noopener"
                             title="Abrir numa nova janela"
                             className="p-1.5 text-ink-soft hover:text-brand hover:bg-brand-soft rounded inline-flex"><ExternalLink className="w-4 h-4" /></a>
                          {!readonly && (
                            <button onClick={() => revogar(s)}
                                    title="Revogar"
                                    className="p-1.5 text-ink-soft hover:text-bad-ink hover:bg-bad-soft rounded"><Trash2 className="w-4 h-4" /></button>
                          )}
                        </>
                      )}
                    </div>
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      )}
    </>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: 'good' | 'bad' | 'warn' | 'brand' | 'neutral' }) {
  const colors = {
    good: 'border-l-good text-good',
    bad: 'border-l-bad text-bad',
    warn: 'border-l-warn text-warn-ink',
    brand: 'border-l-brand text-brand',
    neutral: 'border-l-ink-muted text-ink-soft',
  };
  return (
    <Card className={`border-l-4 ${colors[color]}`}>
      <div className="text-xs uppercase tracking-wider text-ink-soft font-semibold">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${colors[color]}`}>{value}</div>
    </Card>
  );
}
