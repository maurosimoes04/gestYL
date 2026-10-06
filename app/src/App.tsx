import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import { AppLayout } from './components/layout/AppLayout';
import { LoginPage } from './pages/Login';
import { ResumoPage } from './pages/Resumo';
import { DespesasPage } from './pages/Despesas';
import { ReceitasPage } from './pages/Receitas';
import { ProcessosPage } from './pages/Processos';
import { TesourariaPage } from './pages/Tesouraria';
import { EntidadesPage } from './pages/Entidades';
import { PartilhasPage } from './pages/Partilhas';
import { LoadingBlock } from './components/ui/Spinner';

// Páginas mais pesadas / menos visitadas — lazy para aliviar o bundle inicial
const InventarioPage = lazy(() => import('./pages/Inventario').then((m) => ({ default: m.InventarioPage })));
const RHPage = lazy(() => import('./pages/RH').then((m) => ({ default: m.RHPage })));
const RelatoriosPage = lazy(() => import('./pages/Relatorios').then((m) => ({ default: m.RelatoriosPage })));
const IAPage = lazy(() => import('./pages/IA').then((m) => ({ default: m.IAPage })));
const AdminPage = lazy(() => import('./pages/Admin').then((m) => ({ default: m.AdminPage })));
const SharePublicPage = lazy(() => import('./pages/SharePublic').then((m) => ({ default: m.SharePublicPage })));

function Protected() {
  const { session, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <div className="h-screen grid place-items-center"><LoadingBlock /></div>;
  if (!session) return <Navigate to="/login" state={{ from: loc }} replace />;
  return <Outlet />;
}

function Lazy({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<LoadingBlock />}>{children}</Suspense>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/share/evento/:token" element={<Lazy><SharePublicPage /></Lazy>} />
      <Route element={<Protected />}>
        <Route element={<AppLayout />}>
          <Route index element={<ResumoPage />} />
          <Route path="despesas" element={<DespesasPage />} />
          <Route path="receitas" element={<ReceitasPage />} />
          <Route path="processos" element={<ProcessosPage />} />
          <Route path="tesouraria" element={<TesourariaPage />} />
          <Route path="inventario" element={<Lazy><InventarioPage /></Lazy>} />
          <Route path="entidades" element={<EntidadesPage />} />
          <Route path="rh" element={<Lazy><RHPage /></Lazy>} />
          <Route path="relatorios" element={<Lazy><RelatoriosPage /></Lazy>} />
          <Route path="partilhas" element={<PartilhasPage />} />
          <Route path="ia" element={<Lazy><IAPage /></Lazy>} />
          <Route path="admin" element={<Lazy><AdminPage /></Lazy>} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
