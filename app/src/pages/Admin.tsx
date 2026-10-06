import { useEffect, useMemo, useState, FormEvent } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { FormField, FormGrid } from '@/components/ui/FormField';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { Table, THead, TBody, TH, TR, TD, Empty } from '@/components/ui/Table';
import { LoadingBlock } from '@/components/ui/Spinner';
import { apiGet, apiPost, apiPut, apiDel } from '@/lib/api';
import { fmtData } from '@/lib/format';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { ShieldAlert, Plus, Pencil, Trash2, UserPlus, Building2, History, Mail } from 'lucide-react';
import { cn } from '@/lib/cn';

type Tab = 'utilizadores' | 'departamentos' | 'auditoria';
type Role = 'admin' | 'direcao' | 'fiscal';

interface Profile {
  id: string;
  email: string;
  nome: string | null;
  role: Role;
  ativo: boolean;
  createdAt: string;
}
interface Departamento { id: number; nome: string; createdAt?: string }
interface AuditLogRow {
  id: number;
  userId: string | null;
  email: string | null;
  action: string;
  entity: string | null;
  entityId: string | null;
  details: any;
  ip: string | null;
  createdAt: string;
}

const roleLabel: Record<Role, string> = {
  admin: 'Administrador',
  direcao: 'Direção',
  fiscal: 'Fiscal',
};
const roleBadge: Record<Role, 'brand' | 'info' | 'neutral'> = {
  admin: 'brand',
  direcao: 'info',
  fiscal: 'neutral',
};

export function AdminPage() {
  const { role } = useAuth();
  const [tab, setTab] = useState<Tab>('utilizadores');

  if (role !== 'admin') {
    return (
      <>
        <PageHeader title="Administração" />
        <Card>
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <ShieldAlert className="w-10 h-10 text-warn-ink mb-3" />
            <p className="text-sm text-ink-soft max-w-sm">
              Esta secção é restrita a utilizadores com o perfil <strong>administrador</strong>.
            </p>
          </div>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Administração" subtitle="Utilizadores, departamentos e auditoria" />
      <div className="flex gap-1 mb-5 border-b border-line">
        {([
          ['utilizadores', 'Utilizadores', <UserPlus key="u" className="w-4 h-4" />],
          ['departamentos', 'Departamentos', <Building2 key="d" className="w-4 h-4" />],
          ['auditoria', 'Auditoria', <History key="a" className="w-4 h-4" />],
        ] as const).map(([k, l, icon]) => (
          <button key={k} onClick={() => setTab(k)} className={cn(
            'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors inline-flex items-center gap-2',
            tab === k ? 'text-brand border-brand' : 'text-ink-soft border-transparent hover:text-ink',
          )}>{icon}{l}</button>
        ))}
      </div>

      {tab === 'utilizadores' && <UtilizadoresTab />}
      {tab === 'departamentos' && <DepartamentosTab />}
      {tab === 'auditoria' && <AuditoriaTab />}
    </>
  );
}

// -------------------- Utilizadores --------------------

function UtilizadoresTab() {
  const { toast } = useToast();
  const [items, setItems] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Profile | null>(null);

  async function reload() {
    setLoading(true);
    try { setItems(await apiGet<Profile[]>('/auth/users')); }
    catch (e: any) { toast(e.message || 'Erro ao carregar utilizadores', 'error'); }
    finally { setLoading(false); }
  }
  useEffect(() => { reload(); }, []);

  async function remover(p: Profile) {
    if (!confirm(`Remover ${p.email}? Esta ação não pode ser desfeita.`)) return;
    try { await apiDel(`/auth/users/${p.id}`); toast('Utilizador removido', 'success'); reload(); }
    catch (e: any) { toast(e.message || 'Erro', 'error'); }
  }

  if (loading) return <LoadingBlock />;

  return (
    <>
      <div className="flex justify-end mb-3">
        <Button icon={<UserPlus className="w-4 h-4" />} onClick={() => { setEditing(null); setShowForm(true); }}>
          Convidar utilizador
        </Button>
      </div>

      {items.length === 0 ? (
        <Card><Empty icon={<UserPlus className="w-8 h-8" />}>Sem utilizadores registados.</Empty></Card>
      ) : (
        <Table>
          <THead>
            <TH>Email</TH>
            <TH>Nome</TH>
            <TH>Perfil</TH>
            <TH>Estado</TH>
            <TH>Criado</TH>
            <TH align="right">Ações</TH>
          </THead>
          <TBody>
            {items.map((p) => (
              <TR key={p.id}>
                <TD className="font-medium"><span className="inline-flex items-center gap-1.5"><Mail className="w-3.5 h-3.5 text-ink-muted" />{p.email}</span></TD>
                <TD>{p.nome || <span className="text-ink-muted">—</span>}</TD>
                <TD><Badge variant={roleBadge[p.role]}>{roleLabel[p.role]}</Badge></TD>
                <TD>{p.ativo ? <Badge variant="good">Ativo</Badge> : <Badge variant="bad">Inativo</Badge>}</TD>
                <TD className="text-xs text-ink-soft">{fmtData(p.createdAt)}</TD>
                <TD align="right">
                  <div className="flex gap-1 justify-end">
                    <button onClick={() => { setEditing(p); setShowForm(true); }}
                            className="p-1.5 text-ink-soft hover:text-brand hover:bg-brand-soft rounded" title="Editar">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button onClick={() => remover(p)}
                            className="p-1.5 text-ink-soft hover:text-bad-ink hover:bg-bad-soft rounded" title="Remover">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      {showForm && <UtilizadorModal profile={editing} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); reload(); }} />}
    </>
  );
}

function UtilizadorModal({ profile, onClose, onSaved }: { profile: Profile | null; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [email, setEmail] = useState(profile?.email || '');
  const [nome, setNome] = useState(profile?.nome || '');
  const [role, setRole] = useState<Role>(profile?.role || 'fiscal');
  const [ativo, setAtivo] = useState<boolean>(profile?.ativo ?? true);
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      if (profile) {
        await apiPut(`/auth/users/${profile.id}`, { nome, role, ativo });
        toast('Utilizador atualizado', 'success');
      } else {
        await apiPost('/auth/users', { email, nome, role });
        toast('Convite enviado por email', 'success');
      }
      onSaved();
    } catch (e: any) {
      toast(e.message || 'Erro ao guardar', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={profile ? 'Editar utilizador' : 'Convidar utilizador'} size="md">
      <form onSubmit={submit} className="p-6 flex flex-col gap-4">
        <FormField label="Email" required>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required disabled={!!profile}
                 placeholder="exemplo@younglink.net" />
        </FormField>
        <FormField label="Nome">
          <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome completo (opcional)" />
        </FormField>
        <FormGrid cols={2}>
          <FormField label="Perfil" required>
            <Select value={role} onChange={(e) => setRole(e.target.value as Role)}>
              <option value="fiscal">Fiscal (só leitura)</option>
              <option value="direcao">Direção (edita)</option>
              <option value="admin">Administrador (edita + gere utilizadores)</option>
            </Select>
          </FormField>
          {profile && (
            <FormField label="Estado">
              <Select value={ativo ? '1' : '0'} onChange={(e) => setAtivo(e.target.value === '1')}>
                <option value="1">Ativo</option>
                <option value="0">Inativo</option>
              </Select>
            </FormField>
          )}
        </FormGrid>
        {!profile && (
          <p className="text-xs text-ink-soft -mt-2">
            Será enviado um email com link para definir a password. O utilizador fica criado como fiscal/direção/admin conforme escolheste.
          </p>
        )}
        <div className="flex justify-end gap-2 pt-2 border-t border-line">
          <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={saving}>{profile ? 'Guardar' : 'Enviar convite'}</Button>
        </div>
      </form>
    </Modal>
  );
}

// -------------------- Departamentos --------------------

function DepartamentosTab() {
  const { toast } = useToast();
  const [items, setItems] = useState<Departamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [nome, setNome] = useState('');
  const [editing, setEditing] = useState<Departamento | null>(null);
  const [editName, setEditName] = useState('');

  async function reload() {
    setLoading(true);
    try { setItems(await apiGet<Departamento[]>('/departamentos')); }
    catch (e: any) { toast(e.message || 'Erro ao carregar departamentos', 'error'); }
    finally { setLoading(false); }
  }
  useEffect(() => { reload(); }, []);

  async function criar(e: FormEvent) {
    e.preventDefault();
    if (!nome.trim()) return;
    try { await apiPost('/departamentos', { nome: nome.trim() }); setNome(''); toast('Departamento criado', 'success'); reload(); }
    catch (e: any) { toast(e.message || 'Erro ao criar', 'error'); }
  }
  async function guardarEdicao() {
    if (!editing || !editName.trim()) return;
    try { await apiPut(`/departamentos/${editing.id}`, { nome: editName.trim() }); setEditing(null); toast('Guardado', 'success'); reload(); }
    catch (e: any) { toast(e.message || 'Erro ao guardar', 'error'); }
  }
  async function remover(d: Departamento) {
    if (!confirm(`Remover departamento "${d.nome}"?`)) return;
    try { await apiDel(`/departamentos/${d.id}`); toast('Departamento removido', 'success'); reload(); }
    catch (e: any) { toast(e.message || 'Erro ao remover', 'error'); }
  }

  if (loading) return <LoadingBlock />;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <Card className="md:col-span-2">
        {items.length === 0 ? (
          <Empty icon={<Building2 className="w-8 h-8" />}>Ainda não há departamentos. Cria o primeiro à direita.</Empty>
        ) : (
          <ul className="divide-y divide-line-soft">
            {items.map((d) => (
              <li key={d.id} className="flex items-center justify-between py-2.5">
                {editing?.id === d.id ? (
                  <>
                    <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="max-w-xs mr-3" autoFocus />
                    <div className="flex gap-1">
                      <Button size="sm" onClick={guardarEdicao}>Guardar</Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancelar</Button>
                    </div>
                  </>
                ) : (
                  <>
                    <span className="inline-flex items-center gap-2 text-sm text-ink">
                      <Building2 className="w-4 h-4 text-ink-muted" />{d.nome}
                    </span>
                    <div className="flex gap-1">
                      <button onClick={() => { setEditing(d); setEditName(d.nome); }}
                              className="p-1.5 text-ink-soft hover:text-brand hover:bg-brand-soft rounded" title="Renomear">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => remover(d)}
                              className="p-1.5 text-ink-soft hover:text-bad-ink hover:bg-bad-soft rounded" title="Remover">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <h3 className="text-sm font-semibold text-ink mb-3">Novo departamento</h3>
        <form onSubmit={criar} className="flex flex-col gap-3">
          <FormField label="Nome">
            <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="ex: Formação" />
          </FormField>
          <Button type="submit" icon={<Plus className="w-4 h-4" />}>Criar</Button>
        </form>
        <p className="text-xs text-ink-soft mt-3">
          Os departamentos são usados em despesas, processos e nos relatórios.
          Não removas um departamento em uso sem reatribuir primeiro os registos.
        </p>
      </Card>
    </div>
  );
}

// -------------------- Auditoria --------------------

const ENTIDADES_AUDIT = ['fatura', 'receita', 'evento', 'inventario', 'movimento', 'contaSnc', 'entidade', 'documento', 'sncIa', 'user'] as const;

function AuditoriaTab() {
  const { toast } = useToast();
  const [logs, setLogs] = useState<AuditLogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [entity, setEntity] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [limit] = useState(100);

  async function reload() {
    setLoading(true);
    try {
      const resp = await apiGet<{ logs: AuditLogRow[]; total: number }>('/auth/audit', {
        entity: entity || undefined, dateFrom: dateFrom || undefined, dateTo: dateTo || undefined, limit,
      });
      setLogs(resp.logs);
      setTotal(resp.total);
    } catch (e: any) {
      toast(e.message || 'Erro ao carregar auditoria', 'error');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [entity, dateFrom, dateTo]);

  const actionBadge = useMemo(() => ({
    CREATE: 'good',
    UPDATE: 'info',
    DELETE: 'bad',
    LOGIN: 'brand',
    LOGOUT: 'neutral',
  } as Record<string, any>), []);

  return (
    <>
      <Card className="mb-4">
        <FormGrid cols={3}>
          <FormField label="Entidade">
            <Select value={entity} onChange={(e) => setEntity(e.target.value)}>
              <option value="">(todas)</option>
              {ENTIDADES_AUDIT.map((ent) => <option key={ent} value={ent}>{ent}</option>)}
            </Select>
          </FormField>
          <FormField label="Desde">
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </FormField>
          <FormField label="Até">
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </FormField>
        </FormGrid>
        <p className="text-xs text-ink-soft mt-3">
          A mostrar {logs.length} de {total.toLocaleString('pt-PT')} registos{entity && ` (${entity})`}. Os eventos mais recentes aparecem primeiro.
        </p>
      </Card>

      {loading ? <LoadingBlock /> : logs.length === 0 ? (
        <Card><Empty icon={<History className="w-8 h-8" />}>Sem registos de auditoria no período.</Empty></Card>
      ) : (
        <Table>
          <THead>
            <TH>Quando</TH>
            <TH>Utilizador</TH>
            <TH>Ação</TH>
            <TH>Entidade</TH>
            <TH>ID</TH>
            <TH>IP</TH>
          </THead>
          <TBody>
            {logs.map((l) => (
              <TR key={l.id}>
                <TD className="text-xs text-ink-soft whitespace-nowrap">{new Date(l.createdAt).toLocaleString('pt-PT')}</TD>
                <TD className="text-xs">{l.email || <span className="text-ink-muted">(sistema)</span>}</TD>
                <TD><Badge variant={actionBadge[l.action] || 'neutral'}>{l.action}</Badge></TD>
                <TD className="text-sm">{l.entity || '—'}</TD>
                <TD className="font-mono text-xs text-ink-soft">{l.entityId || '—'}</TD>
                <TD className="font-mono text-xs text-ink-soft">{l.ip || '—'}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </>
  );
}
