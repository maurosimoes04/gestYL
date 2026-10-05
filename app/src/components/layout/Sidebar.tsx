import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Receipt, TrendingUp, Calendar, Package, Wallet,
  FileText, Users, BriefcaseBusiness, Sparkles, LogOut, Settings, ChevronLeft, ChevronRight, Share2,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { useAuth } from '@/contexts/AuthContext';
import { useState, useEffect } from 'react';

const items = [
  { to: '/', icon: LayoutDashboard, label: 'Resumo', end: true },
  { to: '/despesas', icon: Receipt, label: 'Despesas' },
  { to: '/receitas', icon: TrendingUp, label: 'Receitas' },
  { to: '/processos', icon: Calendar, label: 'Processos' },
  { to: '/tesouraria', icon: Wallet, label: 'Tesouraria' },
  { to: '/inventario', icon: Package, label: 'Inventário' },
];

const dossie = [
  { to: '/entidades', icon: Users, label: 'Entidades' },
  { to: '/rh', icon: BriefcaseBusiness, label: 'RH / Dossiês' },
];

const analise = [
  { to: '/relatorios', icon: FileText, label: 'Relatórios' },
  { to: '/partilhas', icon: Share2, label: 'Partilhas' },
  { to: '/ia', icon: Sparkles, label: 'Verificação IA' },
];

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { email, role, signOut } = useAuth();
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem('ylSidebarCollapsed') === '1'; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem('ylSidebarCollapsed', collapsed ? '1' : '0'); } catch {}
  }, [collapsed]);

  return (
    <aside className={cn(
      'bg-white border-r border-line flex flex-col transition-all shrink-0',
      collapsed ? 'w-16' : 'w-60',
    )}>
      <div className="px-4 py-4 border-b border-line-soft flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <img src="/app/logo-original.png" alt="Young-Link" className={cn(
            'object-contain shrink-0',
            collapsed ? 'w-12 h-12' : 'w-32 h-14',
          )} />
          {!collapsed && <div className="text-[0.68rem] uppercase tracking-wider text-ink-muted">2026</div>}
        </div>
        <button onClick={() => setCollapsed(!collapsed)}
                className="p-1 rounded hover:bg-surface-alt text-ink-soft hidden md:block"
                title={collapsed ? 'Expandir' : 'Colapsar'}>
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3 flex flex-col gap-0.5">
        {items.map(i => <SidebarLink key={i.to} {...i} collapsed={collapsed} onClick={onNavigate} />)}

        <GroupLabel collapsed={collapsed}>Dossiê</GroupLabel>
        {dossie.map(i => <SidebarLink key={i.to} {...i} collapsed={collapsed} onClick={onNavigate} />)}

        <GroupLabel collapsed={collapsed}>Análise</GroupLabel>
        {analise.map(i => <SidebarLink key={i.to} {...i} collapsed={collapsed} onClick={onNavigate} />)}

        {role === 'admin' && (
          <>
            <GroupLabel collapsed={collapsed}>Admin</GroupLabel>
            <SidebarLink to="/admin" icon={Settings} label="Administração" collapsed={collapsed} onClick={onNavigate} />
          </>
        )}
      </nav>

      <div className="p-3 border-t border-line-soft">
        {!collapsed && email && (
          <div className="flex items-center gap-2 px-2 pb-2.5" title={email}>
            <div className="w-7 h-7 rounded-full bg-brand-soft text-brand text-xs font-bold grid place-items-center shrink-0">
              {email.slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs text-ink font-medium truncate">{email}</div>
              {role && <div className="text-[0.65rem] uppercase tracking-wider text-ink-muted">{role}</div>}
            </div>
          </div>
        )}
        <button
          onClick={() => signOut()}
          className={cn('w-full inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm text-ink-soft hover:bg-surface-alt hover:text-bad-ink border border-line transition-colors',
                       collapsed && 'justify-center px-0')}>
          <LogOut className="w-4 h-4 shrink-0" />
          {!collapsed && <span>Terminar sessão</span>}
        </button>
        {!collapsed && (
          <div className="pt-3 text-center text-[0.65rem] text-ink-muted uppercase tracking-widest font-semibold">
            Gestor YL · 2026
          </div>
        )}
      </div>
    </aside>
  );
}

function SidebarLink({ to, icon: Icon, label, end, collapsed, onClick }: {
  to: string; icon: any; label: string; end?: boolean; collapsed: boolean; onClick?: () => void;
}) {
  return (
    <NavLink to={to} end={end} onClick={onClick}
             className={({ isActive }) => cn(
               'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
               isActive ? 'bg-brand-soft text-brand' : 'text-ink-soft hover:bg-surface-alt hover:text-ink',
               collapsed && 'justify-center px-0',
             )}
             title={collapsed ? label : undefined}>
      <Icon className="w-4 h-4 shrink-0" />
      {!collapsed && <span>{label}</span>}
    </NavLink>
  );
}

function GroupLabel({ children, collapsed }: { children: React.ReactNode; collapsed: boolean }) {
  if (collapsed) return <div className="my-2 h-px bg-line-soft" />;
  return <div className="px-3 pt-4 pb-1 text-[0.68rem] uppercase tracking-wider text-ink-muted font-semibold">{children}</div>;
}
