import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { FormField } from '@/components/ui/FormField';
import { useToast } from '@/contexts/ToastContext';

export function LoginPage() {
  const { signIn } = useAuth();
  const nav = useNavigate();
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await signIn(email.trim(), password);
      nav('/', { replace: true });
    } catch (err: any) {
      toast(err.message || 'Email ou password inválidos.', 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-soft via-surface-page to-purple-50 p-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center gap-3 mb-8">
          <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-brand to-purple-600 text-white font-bold grid place-items-center text-xl shadow-card">YL</div>
          <div className="text-center">
            <h1 className="text-xl font-bold text-ink">Gestor Young-Link</h1>
            <p className="text-sm text-ink-soft mt-1">Entra com a tua conta YL</p>
          </div>
        </div>

        <form onSubmit={onSubmit} className="bg-white rounded-lg border border-line shadow-card p-6 flex flex-col gap-4">
          <FormField label="Email" required>
            <Input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus />
          </FormField>
          <FormField label="Password" required>
            <Input type="password" value={password} onChange={e => setPassword(e.target.value)} required />
          </FormField>
          <Button type="submit" loading={loading} className="w-full justify-center mt-2">
            Entrar
          </Button>
          <div className="flex justify-between text-xs text-ink-soft pt-2">
            <a href="/reset-password" className="hover:text-brand">Esqueci-me da password</a>
            <a href="/set-password" className="hover:text-brand">Primeira sessão</a>
          </div>
        </form>
      </div>
    </div>
  );
}
