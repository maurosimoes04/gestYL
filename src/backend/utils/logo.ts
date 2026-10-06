import fs from 'fs/promises';
import path from 'path';

// Carrega o logo YL do build do frontend (que o Express já serve estaticamente).
// Mantém o buffer em cache para evitar ler o ficheiro do disco em cada PDF.
let cachedLogo: Buffer | null = null;

const LOGO_PATHS = [
  path.join(process.cwd(), 'src', 'frontend', 'app', 'logo-original.png'),
  path.join(process.cwd(), 'app', 'public', 'logo-original.png'),
];

export async function getLogoBuffer(): Promise<Buffer | null> {
  if (cachedLogo) return cachedLogo;
  for (const p of LOGO_PATHS) {
    try {
      const buf = await fs.readFile(p);
      cachedLogo = buf;
      return cachedLogo;
    } catch { /* tenta o próximo */ }
  }
  return null;
}
