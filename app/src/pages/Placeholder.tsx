import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Construction } from 'lucide-react';

export function PlaceholderPage({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <>
      <PageHeader title={title} subtitle={subtitle} />
      <Card>
        <div className="flex flex-col items-center justify-center py-12 text-center text-ink-soft">
          <Construction className="w-10 h-10 text-ink-muted mb-3" />
          <p className="text-sm max-w-sm">
            Esta secção vai ser implementada nas próximas iterações do novo frontend.<br />
            Entretanto podes usar a versão antiga em <a href="/user" className="text-brand hover:underline">/user</a>.
          </p>
        </div>
      </Card>
    </>
  );
}
