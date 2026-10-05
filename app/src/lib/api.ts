/**
 * Cliente HTTP tipado. Lê o token da sessão Supabase (ou do localStorage para
 * compatibilidade) e injeta em todas as requisições.
 */

type ApiOptions = RequestInit & { params?: Record<string, string | number | undefined | null>; raw?: boolean };

let getToken: () => string | null = () => localStorage.getItem('authToken');
export function setTokenGetter(fn: () => string | null) { getToken = fn; }

function buildUrl(path: string, params?: ApiOptions['params']) {
  const url = new URL(path, window.location.origin);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

export async function api<T = any>(path: string, opts: ApiOptions = {}): Promise<T> {
  const { params, raw, headers, ...rest } = opts;
  const token = getToken();
  const h = new Headers(headers || {});
  if (token) h.set('Authorization', `Bearer ${token}`);
  if (!(rest.body instanceof FormData) && rest.body && !h.has('Content-Type')) {
    h.set('Content-Type', 'application/json');
  }
  const res = await fetch(buildUrl(path, params), { ...rest, headers: h });
  if (raw) return res as any;
  if (res.status === 204) return undefined as T;
  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('application/json') ? await res.json() : await res.text();
  if (!res.ok) {
    const msg = (data && typeof data === 'object' && (data.error || data.message)) || res.statusText;
    throw new ApiError(msg, res.status, data);
  }
  return data as T;
}

export class ApiError extends Error {
  constructor(msg: string, public status: number, public body: any) {
    super(msg);
  }
}

/** Helpers idiomáticos */
export const apiGet  = <T=any>(path: string, params?: ApiOptions['params']) => api<T>(path, { method: 'GET', params });
export const apiPost = <T=any>(path: string, body?: any) => api<T>(path, { method: 'POST', body: body instanceof FormData ? body : JSON.stringify(body) });
export const apiPut  = <T=any>(path: string, body?: any) => api<T>(path, { method: 'PUT',  body: body instanceof FormData ? body : JSON.stringify(body) });
export const apiDel  = <T=any>(path: string) => api<T>(path, { method: 'DELETE' });
export const apiPatch= <T=any>(path: string, body?: any) => api<T>(path, { method: 'PATCH', body: body instanceof FormData ? body : JSON.stringify(body) });
