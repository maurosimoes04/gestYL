import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { prisma } from '../config/prisma';

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (process.env.AUTH_DISABLED === 'true') return next();

  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Não autorizado' });
  }

  const token = header.slice(7);
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) {
    return res.status(401).json({ error: 'Sessão inválida' });
  }

  const profile = await prisma.profile.findUnique({ where: { id: data.user.id } });
  if (!profile || !profile.ativo) {
    return res.status(403).json({ error: 'Conta desativada' });
  }

  (req as any).authUser = profile.email;
  (req as any).authRole = profile.role;
  (req as any).authUserId = profile.id;
  return next();
}

export function guardWrite(req: Request, res: Response, next: NextFunction) {
  const method = (req.method || '').toUpperCase();
  const isWrite = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
  if (!isWrite) return next();
  if (process.env.AUTH_DISABLED === 'true') return next();

  const role = (req as any).authRole;
  if (role === 'admin' || role === 'direcao') return next();
  return res.status(403).json({ error: 'Sem permissões para modificar dados' });
}
