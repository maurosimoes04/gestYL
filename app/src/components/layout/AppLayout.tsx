import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { useState } from 'react';
import { Menu } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { role } = useAuth();

  return (
    <div className="h-full flex bg-surface-page">
      {/* Sidebar mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/40 z-30 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}
      <div className={`fixed md:static inset-y-0 left-0 z-40 transition-transform md:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <Sidebar onNavigate={() => setSidebarOpen(false)} />
      </div>

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Mobile topbar */}
        <header className="md:hidden flex items-center justify-between px-4 py-3 bg-white border-b border-line">
          <button onClick={() => setSidebarOpen(true)} className="p-2 -m-2 text-ink-soft">
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-gradient-to-br from-brand to-purple-600 text-white font-bold grid place-items-center text-xs">YL</div>
            <span className="font-semibold text-sm">Gestor</span>
          </div>
          <div className="w-9" />
        </header>

        {role === 'fiscal' && (
          <div className="px-6 py-2 bg-warn-soft text-warn-ink text-xs font-medium border-b border-warn/20">
            Acesso de visualização (Conselho Fiscal). Alterações estão bloqueadas.
          </div>
        )}

        <main className="flex-1 overflow-y-auto">
          <div className="max-w-[1400px] mx-auto px-4 md:px-8 py-6 md:py-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
