/**
 * Faz download autenticado de um ficheiro (PDF, imagem, etc.) e abre numa nova aba
 * usando um blob URL temporário. Necessário porque window.open() não envia o
 * header Authorization com o token da sessão.
 */
import { api } from './api';

export async function openProtected(url: string): Promise<void> {
  return openProtectedRequest(url, { method: 'GET' });
}

/** Variante para endpoints que exigem POST com corpo JSON (ex: /relatorios/anual/pdf). */
export async function openProtectedPost(url: string, body?: any): Promise<void> {
  return openProtectedRequest(url, {
    method: 'POST',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

async function openProtectedRequest(url: string, init: RequestInit): Promise<void> {
  try {
    const res: Response = await api(url, { raw: true, ...init });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error(t || `HTTP ${res.status}`);
    }
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const win = window.open(blobUrl, '_blank');
    // Revogar o URL depois de dar tempo ao browser para carregar
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
    if (!win) {
      // Fallback — forçar download
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = inferFilename(url);
      a.click();
    }
  } catch (e: any) {
    throw new Error(e.message || 'Erro ao obter ficheiro');
  }
}

function inferFilename(url: string): string {
  const seg = url.split('?')[0].split('/').filter(Boolean);
  const last = seg[seg.length - 1] || 'ficheiro';
  if (last.includes('.')) return last;
  return `${last}.pdf`;
}
