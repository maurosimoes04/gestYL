const LOGO_URL = 'https://tnmycajugdovbnqydyvx.supabase.co/storage/v1/object/public/IMAGENS/logo.png';

let cachedLogo: Buffer | null = null;

export async function getLogoBuffer(): Promise<Buffer | null> {
  if (cachedLogo) return cachedLogo;
  try {
    const res = await fetch(LOGO_URL);
    if (!res.ok) return null;
    cachedLogo = Buffer.from(await res.arrayBuffer());
    return cachedLogo;
  } catch {
    return null;
  }
}
