import { Request, Response, NextFunction } from 'express';
import { logAudit } from '../services/audit';

const METHOD_ACTION: Record<string, string> = {
  POST: 'CREATE',
  PUT: 'UPDATE',
  PATCH: 'UPDATE',
  DELETE: 'DELETE',
};

export function auditRoutes(entity: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const action = METHOD_ACTION[req.method.toUpperCase()];
    if (!action) return next();

    const originalJson = res.json.bind(res);
    res.json = (body: any) => {
      // Só loga se a resposta foi sucesso (2xx)
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const entityId = req.params.id || body?.id?.toString() || null;
        logAudit({
          action,
          entity,
          entityId,
          details: action === 'DELETE' ? undefined : { body: req.body },
          req,
        });
      }
      return originalJson(body);
    };

    next();
  };
}
