import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { getSupabase } from '@/lib/supabase';
import { setTokenGetter } from '@/lib/api';

interface AuthState {
  loading: boolean;
  session: Session | null;
  email: string | null;
  role: 'admin' | 'direcao' | 'fiscal' | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthState>({} as any);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<AuthState['role']>(null);

  useEffect(() => {
    setTokenGetter(() => session?.access_token ?? localStorage.getItem('authToken') ?? null);
  }, [session]);

  useEffect(() => {
    (async () => {
      const supabase = await getSupabase();
      const { data } = await supabase.auth.getSession();
      setSession(data.session);
      if (data.session) {
        localStorage.setItem('authToken', data.session.access_token);
        setRole((localStorage.getItem('authRole') as any) || null);
      }
      supabase.auth.onAuthStateChange((_evt, s) => {
        setSession(s);
        if (s) localStorage.setItem('authToken', s.access_token);
        else { localStorage.removeItem('authToken'); localStorage.removeItem('authRole'); setRole(null); }
      });
      setLoading(false);
    })();
  }, []);

  async function signIn(email: string, password: string) {
    const supabase = await getSupabase();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    if (data.session) {
      localStorage.setItem('authToken', data.session.access_token);
      // Vamos tentar obter o role do profile via auth status
      try {
        const r = await fetch('/auth/status', { headers: { Authorization: `Bearer ${data.session.access_token}` } });
        if (r.ok) {
          const j = await r.json();
          if (j.role) {
            localStorage.setItem('authRole', j.role);
            setRole(j.role);
          }
        }
      } catch { /* ignore */ }
    }
    setSession(data.session);
  }

  async function signOut() {
    const supabase = await getSupabase();
    await supabase.auth.signOut();
    localStorage.removeItem('authToken');
    localStorage.removeItem('authRole');
    setRole(null);
    setSession(null);
  }

  return (
    <Ctx.Provider value={{
      loading, session, role,
      email: session?.user?.email ?? null,
      signIn, signOut,
    }}>
      {children}
    </Ctx.Provider>
  );
}
