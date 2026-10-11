import fs from 'fs/promises';
import path from 'path';

let cachedLogo: Buffer | null = null;
let cachedWhiteLogo: Buffer | null = null;

const LOGO_PATHS = [
  path.join(process.cwd(), 'src', 'frontend', 'app', 'logo-original.png'),
  path.join(process.cwd(), 'app', 'public', 'logo-original.png'),
];

const WHITE_LOGO_PATHS = [
  path.join(process.cwd(), 'src', 'backend', 'uploads', 'logo-white.png'),
  path.join(process.cwd(), 'app', 'public', 'logo-white.png'),
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

export async function getWhiteLogoBuffer(): Promise<Buffer | null> {
  if (cachedWhiteLogo) return cachedWhiteLogo;
  for (const p of WHITE_LOGO_PATHS) {
    try {
      const buf = await fs.readFile(p);
      cachedWhiteLogo = buf;
      return cachedWhiteLogo;
    } catch { /* tenta o próximo */ }
  }
  return null;
}
