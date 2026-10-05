export function fmtEuro(v: number | string | null | undefined, opts: { sign?: boolean; compact?: boolean } = {}): string {
  const n = Number(v) || 0;
  const formatter = new Intl.NumberFormat('pt-PT', {
    style: 'currency', currency: 'EUR',
    minimumFractionDigits: opts.compact ? 0 : 2,
    maximumFractionDigits: opts.compact ? 0 : 2,
  });
  const txt = formatter.format(n);
  if (opts.sign && n > 0) return '+' + txt;
  return txt;
}

export function fmtData(d: string | Date | null | undefined): string {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('pt-PT'); } catch { return '—'; }
}

export function fmtDataLonga(d: string | Date | null | undefined): string {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('pt-PT', { year: 'numeric', month: 'long', day: 'numeric' }); } catch { return '—'; }
}

export function fmtPercent(v: number | null | undefined, decimals = 1): string {
  if (v === null || v === undefined) return '—';
  return `${v.toFixed(decimals)}%`;
}

export function fmtDias(d: number | null): string {
  if (d === null || d === undefined) return '—';
  if (d < 0) return `${Math.abs(d)}d em atraso`;
  if (d === 0) return 'Hoje';
  if (d === 1) return 'Amanhã';
  return `em ${d} dias`;
}

export function iniciais(nome: string): string {
  return nome.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
}
