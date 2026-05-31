import express from 'express';
import crypto from 'crypto';
import path from 'path';
import { prisma } from '../config/prisma';
import { logAudit } from '../services/audit';

const ACCESS_TTL_HOURS = 12;
const DEFAULT_EXPIRES_DAYS = 30;

function hashPassword(password: string, salt: string) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function verifyPassword(password: string, salt: string, expectedHash: string) {
  const computed = Buffer.from(hashPassword(password, salt), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  if (computed.length !== expected.length) return false;
  return crypto.timingSafeEqual(computed, expected);
}

function hashToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function normalizeText(text: string) {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .trim();
}

function initials(text: string, fallback: string) {
  const clean = normalizeText(text);
  if (!clean) return fallback;
  const words = clean.split(/\s+/).filter(Boolean);
  if (!words.length) return fallback;
  return words.map((w) => w[0]).join('').toUpperCase();
}

function buildSimplePassword(eventoNome: string, destinatario: string | undefined | null) {
  const destBase = destinatario?.includes('@') ? destinatario.split('@')[0] : destinatario || '';
  const evSigla = initials(eventoNome, 'EV');
  const destSigla = initials(destBase, 'EXT');
  return `${evSigla}-${destSigla}`;
}

function parseCookies(header: string | undefined) {
  const out: Record<string, string> = {};
  if (!header) return out;
  header.split(';').forEach((part) => {
    const idx = part.indexOf('=');
    if (idx === -1) return;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    out[key] = decodeURIComponent(val);
  });
  return out;
}

function isShareActive(share: any) {
  if (!share) return false;
  if (share.revokedAt) return false;
  if (share.expiresAt && new Date(share.expiresAt) < new Date()) return false;
  return true;
}

function buildPublicBase() {
  return process.env.APP_URL || 'http://localhost:3000';
}

export const sharePublicRouter = express.Router();
export const sharePrivateRouter = express.Router();

// POST /share/evento/:token/access
sharePublicRouter.post('/evento/:token/access', async (req, res) => {
  try {
    const token = req.params.token;
    const password = req.body?.password || '';
    if (!password) return res.status(400).json({ error: 'Password é obrigatória' });

    const share = await prisma.eventoShare.findUnique({
      where: { token },
      include: { evento: true },
    });
    if (!share || !isShareActive(share)) return res.status(404).json({ error: 'Partilha inválida' });

    if (!verifyPassword(password, share.passwordSalt, share.passwordHash)) {
      return res.status(403).json({ error: 'Password incorreta' });
    }

    const accessToken = crypto.randomBytes(24).toString('base64url');
    const accessHash = hashToken(accessToken);
    const sessionExpiresAt = new Date(Date.now() + ACCESS_TTL_HOURS * 60 * 60 * 1000);

    await prisma.eventoShare.update({
      where: { id: share.id },
      data: {
        accessTokenHash: accessHash,
        accessTokenExpiresAt: sessionExpiresAt,
      },
    });

    res.cookie('share_access', accessToken, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: ACCESS_TTL_HOURS * 60 * 60 * 1000,
      path: `/share/evento/${token}`,
    });

    const [faturas, receitas] = await Promise.all([
      prisma.fatura.findMany({ where: { eventoId: share.eventoId }, orderBy: { data: 'desc' } }),
      prisma.receita.findMany({ where: { eventoId: share.eventoId }, orderBy: { data: 'desc' } }),
    ]);

    const toNum = (v: any) => Number(v) || 0;
    const totalDespesas = faturas.reduce((s, f) => s + toNum(f.valor), 0);
    const totalReceitas = receitas.reduce((s, r) => s + toNum(r.valor), 0);

    const withAnexo = (items: any[], tipo: 'fatura' | 'receita') => {
      return items.map((it) => ({
        ...it,
        anexoLink: it.anexo ? `/share/evento/${token}/anexo/${tipo}/${it.id}` : null,
      }));
    };

    return res.json({
      evento: share.evento,
      faturas: withAnexo(faturas as any[], 'fatura'),
      receitas: withAnexo(receitas as any[], 'receita'),
      resumo: {
        totalDespesas,
        totalReceitas,
        saldo: totalReceitas - totalDespesas,
      },
      sessionExpiresAt,
    });
  } catch (err) {
    console.error('Erro acesso partilha:', err);
    return res.status(500).json({ error: 'Erro ao validar partilha' });
  }
});

// GET /share/evento/:token/anexo/:tipo/:id
sharePublicRouter.get('/evento/:token/anexo/:tipo/:id', async (req, res) => {
  try {
    const token = req.params.token;
    const tipo = req.params.tipo as 'fatura' | 'receita';
    const id = Number(req.params.id);

    const share = await prisma.eventoShare.findUnique({ where: { token } });
    if (!share || !isShareActive(share)) return res.status(404).json({ error: 'Partilha inválida' });

    const cookies = parseCookies(req.headers.cookie);
    const accessToken = cookies['share_access'];
    if (!accessToken || !share.accessTokenHash || !share.accessTokenExpiresAt) {
      return res.status(401).json({ error: 'Acesso não autorizado' });
    }
    if (new Date(share.accessTokenExpiresAt) < new Date()) {
      return res.status(401).json({ error: 'Sessão expirada', expired: true });
    }
    const tokenHash = hashToken(accessToken);
    if (tokenHash !== share.accessTokenHash) {
      return res.status(401).json({ error: 'Acesso não autorizado' });
    }

    if (tipo === 'fatura') {
      const fatura = await prisma.fatura.findUnique({ where: { id } });
      if (!fatura || fatura.eventoId !== share.eventoId || !fatura.anexo) {
        return res.status(404).json({ error: 'Anexo não encontrado' });
      }
      const anexo = fatura.anexo as any;
      const link = anexo.driveWebContentLink || anexo.driveWebViewLink;
      if (link) return res.redirect(link);
      if (anexo.path) {
        const resolved = path.resolve(path.join(__dirname, '..', anexo.path));
        if (!resolved.startsWith(path.resolve(path.join(__dirname, '..')))) {
          return res.status(403).json({ error: 'Caminho inválido' });
        }
        return res.sendFile(resolved);
      }
      return res.status(404).json({ error: 'Link do anexo indisponível' });
    }

    const receita = await prisma.receita.findUnique({ where: { id } });
    if (!receita || receita.eventoId !== share.eventoId || !receita.anexo) {
      return res.status(404).json({ error: 'Anexo não encontrado' });
    }
    const anexo = receita.anexo as any;
    const link = anexo.driveWebContentLink || anexo.driveWebViewLink;
    if (link) return res.redirect(link);
    return res.status(404).json({ error: 'Link do anexo indisponível' });
  } catch (err) {
    console.error('Erro anexo partilha:', err);
    return res.status(500).json({ error: 'Erro ao servir anexo' });
  }
});

// POST /shares
sharePrivateRouter.post('/', async (req, res) => {
  try {
    const { eventoId, destinatario, justificacao, expiresInDays } = req.body || {};
    if (!eventoId) return res.status(400).json({ error: 'Evento é obrigatório' });
    if (!justificacao) return res.status(400).json({ error: 'Justificação é obrigatória' });

    const evento = await prisma.evento.findUnique({ where: { id: Number(eventoId) } });
    if (!evento) return res.status(404).json({ error: 'Evento não encontrado' });

    const passwordPlain = buildSimplePassword(evento.nome, destinatario);
    const token = crypto.randomBytes(24).toString('base64url');
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = hashPassword(passwordPlain, salt);
    const days = Math.max(1, parseInt(expiresInDays || DEFAULT_EXPIRES_DAYS, 10));
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    const share = await prisma.eventoShare.create({
      data: {
        token,
        eventoId: Number(eventoId),
        createdById: (req as any).authUserId || null,
        createdByEmail: (req as any).authUser || null,
        destinatario: destinatario || null,
        justificacao,
        passwordHash: hash,
        passwordSalt: salt,
        expiresAt,
      },
    });

    await logAudit({
      action: 'CREATE',
      entity: 'share',
      entityId: share.id.toString(),
      details: { eventoId: share.eventoId, destinatario, justificacao, expiresAt },
      req,
    });

    const link = `${buildPublicBase()}/share/evento/${token}`;
    return res.status(201).json({
      id: share.id,
      link,
      expiresAt,
      password: passwordPlain,
    });
  } catch (err) {
    console.error('Erro criar partilha:', err);
    return res.status(500).json({ error: 'Erro ao criar partilha' });
  }
});

// GET /shares (admin)
sharePrivateRouter.get('/', async (req, res) => {
  try {
    if ((req as any).authRole !== 'admin') {
      return res.status(403).json({ error: 'Apenas administradores' });
    }
    const { limit: lim, offset: off } = req.query as any;
    const take = parseInt(lim || '30', 10);
    const skip = parseInt(off || '0', 10);

    const [shares, total] = await Promise.all([
      prisma.eventoShare.findMany({
        orderBy: { createdAt: 'desc' },
        take,
        skip,
        include: { evento: true },
      }),
      prisma.eventoShare.count(),
    ]);

    return res.json({ shares, total });
  } catch (err) {
    console.error('Erro listar partilhas:', err);
    return res.status(500).json({ error: 'Erro ao listar partilhas' });
  }
});

// POST /shares/:id/revoke (admin)
sharePrivateRouter.post('/:id/revoke', async (req, res) => {
  try {
    if ((req as any).authRole !== 'admin') {
      return res.status(403).json({ error: 'Apenas administradores' });
    }
    const id = Number(req.params.id);
    const share = await prisma.eventoShare.update({
      where: { id },
      data: { revokedAt: new Date() },
    });

    await logAudit({
      action: 'UPDATE',
      entity: 'share',
      entityId: share.id.toString(),
      details: { revokedAt: share.revokedAt },
      req,
    });

    return res.json({ ok: true });
  } catch (err) {
    console.error('Erro revogar partilha:', err);
    return res.status(500).json({ error: 'Erro ao revogar partilha' });
  }
});
