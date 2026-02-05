import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

const TOKEN_TTL_MS = Number(process.env.AUTH_TOKEN_TTL_MS || 1000 * 60 * 60 * 8); // 8h por defeito

type Session = {
  user: string;
  role: 'direcao' | 'fiscal';
  expiresAt: number;
};

const activeTokens = new Map<string, Session>();

export function issueToken(user: string, role: 'direcao' | 'fiscal') {
  const token = uuidv4();
  activeTokens.set(token, { user, role, expiresAt: Date.now() + TOKEN_TTL_MS });
  return { token, role, expiresInMs: TOKEN_TTL_MS };
}

function getTokenFromHeader(req: Request) {
  const queryToken = (req.query?.token as string) || '';
  const header = req.headers.authorization || req.headers['x-auth-token'];
  if (!header) return queryToken;
  if (Array.isArray(header)) return header[0] || '';
  if (header.toLowerCase().startsWith('bearer ')) return header.slice(7).trim();
  const fromHeader = header.toString();
  if (fromHeader) return fromHeader;
  return queryToken;
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  // Permite desativar auth em ambientes locais, se necessário
  if (process.env.AUTH_DISABLED === 'true') return next();

  const token = getTokenFromHeader(req);
  if (!token) return res.status(401).json({ error: 'Não autorizado' });

  const session = activeTokens.get(token);
  if (!session) return res.status(401).json({ error: 'Sessão inválida' });

  if (session.expiresAt < Date.now()) {
    activeTokens.delete(token);
    return res.status(401).json({ error: 'Sessão expirada' });
  }

  (req as any).authUser = session.user;
  (req as any).authRole = session.role;
  return next();
}

export function clearToken(token: string) {
  activeTokens.delete(token);
}

export function getStatus(token: string) {
  const session = activeTokens.get(token);
  if (!session) return { valid: false };
  if (session.expiresAt < Date.now()) {
    activeTokens.delete(token);
    return { valid: false };
  }
  return { valid: true, user: session.user, role: session.role, expiresAt: session.expiresAt };
}

export function guardWrite(req: Request, res: Response, next: NextFunction) {
  const method = (req.method || '').toUpperCase();
  const isWrite = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
  const role = (req as any).authRole as ('direcao' | 'fiscal' | undefined);
  if (!isWrite) return next();
  if (process.env.AUTH_DISABLED === 'true') return next();
  if (role === 'direcao') return next();
  return res.status(403).json({ error: 'Sem permissões para modificar dados' });
}
