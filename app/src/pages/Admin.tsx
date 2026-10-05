import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Settings } from 'lucide-react';

export function AdminPage() {
  return (
    <>
      <PageHeader title="Administração" subtitle="Utilizadores, departamentos, partilhas e auditoria" />
      <Card>
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <Settings className="w-10 h-10 text-ink-muted mb-3" />
          <p className="text-sm text-ink-soft max-w-sm">
            A migração do painel de administração vem numa iteração seguinte. Entretanto podes aceder em{' '}
            <a href="/admin" className="text-brand hover:underline">/admin</a>.
          </p>
        </div>
      </Card>
    </>
  );
}
