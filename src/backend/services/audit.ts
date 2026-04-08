import { prisma } from '../config/prisma';
import { Request } from 'express';

interface AuditEntry {
  action: string;
  entity?: string;
  entityId?: string;
  details?: any;
  req?: Request;
}

export async function logAudit(entry: AuditEntry) {
  try {
    const userId = (entry.req as any)?.authUserId || null;
    const email = (entry.req as any)?.authUser || null;
    const ip = entry.req?.ip || entry.req?.headers['x-forwarded-for']?.toString() || null;

    await prisma.auditLog.create({
      data: {
        userId,
        email,
        action: entry.action,
        entity: entry.entity || null,
        entityId: entry.entityId || null,
        details: entry.details || undefined,
        ip,
      },
    });
  } catch (err) {
    console.error('Erro ao registar auditoria:', err);
  }
}
