import { Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import { AppLayout } from './components/layout/AppLayout';
import { LoginPage } from './pages/Login';
import { ResumoPage } from './pages/Resumo';
import { DespesasPage } from './pages/Despesas';
import { ReceitasPage } from './pages/Receitas';
import { EntidadesPage } from './pages/Entidades';
import { ProcessosPage } from './pages/Processos';
import { RHPage } from './pages/RH';
import { InventarioPage } from './pages/Inventario';
import { TesourariaPage } from './pages/Tesouraria';
import { RelatoriosPage } from './pages/Relatorios';
import { IAPage } from './pages/IA';
import { AdminPage } from './pages/Admin';
import { PartilhasPage } from './pages/Partilhas';
import { LoadingBlock } from './components/ui/Spinner';

function Protected() {
  const { session, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <div className="h-screen grid place-items-center"><LoadingBlock /></div>;
  if (!session) return <Navigate to="/login" state={{ from: loc }} replace />;
  return <Outlet />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<Protected />}>
        <Route element={<AppLayout />}>
          <Route index element={<ResumoPage />} />
          <Route path="despesas" element={<DespesasPage />} />
          <Route path="receitas" element={<ReceitasPage />} />
          <Route path="processos" element={<ProcessosPage />} />
          <Route path="tesouraria" element={<TesourariaPage />} />
          <Route path="inventario" element={<InventarioPage />} />
          <Route path="entidades" element={<EntidadesPage />} />
          <Route path="rh" element={<RHPage />} />
          <Route path="relatorios" element={<RelatoriosPage />} />
          <Route path="partilhas" element={<PartilhasPage />} />
          <Route path="ia" element={<IAPage />} />
          <Route path="admin" element={<AdminPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
