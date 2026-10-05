import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabase: SupabaseClient | null = null;

/**
 * Carrega a config do /api/config (expõe SUPABASE_URL + ANON_KEY).
 * Cache em memória — chamado uma vez no bootstrap da app.
 */
export async function getSupabase(): Promise<SupabaseClient> {
  if (supabase) return supabase;
  const r = await fetch('/api/config');
  if (!r.ok) throw new Error('Não consegui obter a configuração do servidor');
  const cfg = await r.json();
  supabase = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
  return supabase;
}
