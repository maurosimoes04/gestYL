import { useEffect, useState, FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { FormField } from '@/components/ui/FormField';
import { Card, KPI } from '@/components/ui/Card';
import { Badge, estadoVariant } from '@/components/ui/Badge';
import { Table, THead, TH, TBody, TR, TD } from '@/components/ui/Table';
import { Spinner } from '@/components/ui/Spinner';
import { fmtEuro, fmtData } from '@/lib/format';
import { Lock, Download, FileText, ShieldAlert, ExternalLink } from 'lucide-react';

type ShareReceita = {
  id: number;
  titulo?: string;
  categoria?: string;
  financiador?: string;
  data?: string;
  estado?: string;
  valor: number;
  valorEvento?: number;
  anexoLink?: string | null;
};

type ShareFatura = {
  id: number;
  titulo?: string;
  departamento?: string;
  fornecedor?: string;
  numero?: string;
  data?: string;
  estado?: string;
  valor: number;
  valorEvento?: number;
  anexoLink?: string | null;
};

type ShareData = {
  evento?: {
    nome?: string;
    descricao?: string;
    dataInicio?: string;
    dataFim?: string;
    departamento?: string;
  };
  resumo?: {
    totalReceitas: number;
    totalDespesas: number;
    saldo: number;
  };
  receitas?: ShareReceita[];
  faturas?: ShareFatura[];
  downloadLink?: string | null;
  relatorioLink?: string | null;
  shareExpiresAt?: string | null;
};

type Phase = 'loading' | 'login' | 'ok' | 'expired';

export function SharePublicPage() {
  const { token = '' } = useParams();
  const [phase, setPhase] = useState<Phase>('loading');
  const [data, setData] = useState<ShareData | null>(null);
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const resp = await fetch(`/share/evento/${token}/session`);
        if (!resp.ok) {
          setPhase('login');
          return;
        }
        const json = await resp.json();
        setData(json);
        setPhase('ok');
      } catch {
        setPhase('login');
      }
    })();
  }, [token]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!password) {
      setError('Password obrigatória.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const resp = await fetch(`/share/evento/${token}/access`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const json = await resp.json().catch(() => ({}));
      if (resp.status === 401 && json.expired) {
        setPhase('expired');
        return;
      }
      if (!resp.ok) {
        throw new Error(json.error || 'Password incorreta.');
      }
      setData(json);
      setPhase('ok');
    } catch (err: any) {
      setError(err.message || 'Erro ao validar partilha.');
    } finally {
      setSubmitting(false);
    }
  }

  if (phase === 'loading') {
    return <AuthShell><div className="flex items-center justify-center gap-3 py-12"><Spinner /><span className="text-sm text-ink-soft">A verificar sessão…</span></div></AuthShell>;
  }

  if (phase === 'login') {
    return (
      <AuthShell>
        <div className="flex flex-col items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-full bg-brand-soft text-brand grid place-items-center">
            <Lock className="w-5 h-5" />
          </div>
          <div className="text-center">
            <h1 className="text-lg font-bold text-ink">Acesso ao processo</h1>
            <p className="text-sm text-ink-soft mt-1">
              Introduz a password que recebeste para consultar os dados.
            </p>
          </div>
        </div>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <FormField label="Password" required>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoFocus
              required
            />
          </FormField>
          {error && (
            <div className="text-xs text-bad-ink bg-bad-soft border border-bad/20 rounded-md px-3 py-2">
              {error}
            </div>
          )}
          <Button type="submit" loading={submitting} className="w-full justify-center">
            Aceder
          </Button>
        </form>
      </AuthShell>
    );
  }

  if (phase === 'expired') {
    return (
      <AuthShell>
        <div className="flex flex-col items-center gap-3 mb-5 text-center">
          <div className="w-12 h-12 rounded-full bg-bad-soft text-bad-ink grid place-items-center">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-ink">Sessão expirada</h1>
            <p className="text-sm text-ink-soft mt-1">
              O teu acesso a esta partilha expirou. Volta a introduzir a password para continuares.
            </p>
          </div>
        </div>
        <Button onClick={() => { setPhase('login'); setPassword(''); setError(null); }} className="w-full justify-center">
          Voltar ao login
        </Button>
      </AuthShell>
    );
  }

  const d = data ?? {};
  const resumo = d.resumo ?? { totalReceitas: 0, totalDespesas: 0, saldo: 0 };
  const receitas = d.receitas ?? [];
  const faturas = d.faturas ?? [];
  const evento = d.evento ?? {};

  const inicio = evento.dataInicio ? fmtData(evento.dataInicio) : '';
  const fim = evento.dataFim ? fmtData(evento.dataFim) : '';
  const periodo = inicio && fim ? (inicio === fim ? inicio : `${inicio} — ${fim}`) : (inicio || fim || '');

  return (
    <div className="min-h-screen bg-surface-page">
      <header className="bg-white border-b border-line">
        <div className="max-w-5xl mx-auto px-5 py-3 flex items-center gap-3">
          <img src="/app/logo-original.png" alt="Young-Link" className="w-28 h-10 object-contain" />
          <div className="h-5 w-px bg-line" />
          <span className="text-xs font-semibold uppercase tracking-wider text-ink-soft">
            Partilha de processo
          </span>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-5 py-8 flex flex-col gap-6">
        <Card accent="brand" className="flex flex-col gap-3">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <h2 className="text-xl font-bold text-ink">{evento.nome || 'Processo'}</h2>
              {evento.descricao && <p className="text-sm text-ink-soft mt-1">{evento.descricao}</p>}
              <div className="flex flex-wrap items-center gap-2 mt-3">
                {periodo && <span className="text-xs text-ink-soft">{periodo}</span>}
                {evento.departamento && <Badge variant="brand">{evento.departamento}</Badge>}
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              {d.relatorioLink && (
                <Button variant="ghost" icon={<FileText className="w-4 h-4" />}
                  onClick={() => window.open(d.relatorioLink!, '_blank')}>
                  Relatório PDF
                </Button>
              )}
              {d.downloadLink && (
                <Button icon={<Download className="w-4 h-4" />}
                  onClick={() => { window.location.href = d.downloadLink!; }}>
                  Descarregar tudo
                </Button>
              )}
            </div>
          </div>
          {d.shareExpiresAt && (
            <p className="text-xs text-ink-soft border-t border-line-soft pt-3">
              Partilha válida até {new Date(d.shareExpiresAt).toLocaleString('pt-PT')}
            </p>
          )}
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <KPI label="Receitas" value={fmtEuro(resumo.totalReceitas)} accent="good" />
          <KPI label="Despesas" value={fmtEuro(resumo.totalDespesas)} accent="bad" />
          <KPI
            label="Saldo"
            value={fmtEuro(resumo.saldo)}
            accent={resumo.saldo >= 0 ? 'good' : 'bad'}
          />
        </div>

        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-bold text-ink uppercase tracking-wider">Receitas ({receitas.length})</h3>
          {receitas.length === 0 ? (
            <Card><p className="text-sm text-ink-soft italic text-center py-4">Sem receitas registadas.</p></Card>
          ) : (
            <Table>
              <THead>
                <TH>Título</TH>
                <TH>Categoria</TH>
                <TH>Financiador</TH>
                <TH>Data</TH>
                <TH>Estado</TH>
                <TH align="right">Valor</TH>
                <TH align="center">Anexo</TH>
              </THead>
              <TBody>
                {receitas.map((r) => (
                  <TR key={`r-${r.id}`}>
                    <TD className="font-medium">{r.titulo || '—'}</TD>
                    <TD>{r.categoria || '—'}</TD>
                    <TD>{r.financiador || '—'}</TD>
                    <TD>{fmtData(r.data)}</TD>
                    <TD>{r.estado ? <Badge variant={estadoVariant(r.estado)}>{r.estado}</Badge> : '—'}</TD>
                    <TD align="right" className="tabular font-medium">
                      {fmtEuro(r.valorEvento ?? r.valor)}
                    </TD>
                    <TD align="center">{renderAnexo(r.anexoLink)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </section>

        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-bold text-ink uppercase tracking-wider">Despesas ({faturas.length})</h3>
          {faturas.length === 0 ? (
            <Card><p className="text-sm text-ink-soft italic text-center py-4">Sem despesas registadas.</p></Card>
          ) : (
            <Table>
              <THead>
                <TH>Título</TH>
                <TH>Departamento</TH>
                <TH>Fornecedor</TH>
                <TH>Nº documento</TH>
                <TH>Data</TH>
                <TH>Estado</TH>
                <TH align="right">Valor</TH>
                <TH align="center">Anexo</TH>
              </THead>
              <TBody>
                {faturas.map((f) => (
                  <TR key={`f-${f.id}`}>
                    <TD className="font-medium">{f.titulo || '—'}</TD>
                    <TD>{f.departamento || '—'}</TD>
                    <TD>{f.fornecedor || '—'}</TD>
                    <TD className="font-mono text-xs">{f.numero || '—'}</TD>
                    <TD>{fmtData(f.data)}</TD>
                    <TD>{f.estado ? <Badge variant={estadoVariant(f.estado)}>{f.estado}</Badge> : '—'}</TD>
                    <TD align="right" className="tabular font-medium">
                      {fmtEuro(f.valorEvento ?? f.valor)}
                    </TD>
                    <TD align="center">{renderAnexo(f.anexoLink)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </section>

        <footer className="text-center text-xs text-ink-soft border-t border-line pt-5">
          Partilha segura · Young-Link — Associação Juvenil de Castro Marim
        </footer>
      </div>
    </div>
  );
}

function renderAnexo(link?: string | null) {
  if (!link || !link.startsWith('/')) return <span className="text-ink-muted">—</span>;
  return (
    <a
      href={link}
      target="_blank"
      rel="noopener"
      className="inline-flex items-center gap-1 text-brand hover:text-brand-hover font-medium text-xs"
    >
      Abrir <ExternalLink className="w-3 h-3" />
    </a>
  );
}

function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-soft via-surface-page to-purple-50 p-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center gap-3 mb-6">
          <img src="/app/logo-original.png" alt="Young-Link" className="w-56 h-28 object-contain" />
        </div>
        <div className="bg-white rounded-lg border border-line shadow-card p-6">
          {children}
        </div>
      </div>
    </div>
  );
}
