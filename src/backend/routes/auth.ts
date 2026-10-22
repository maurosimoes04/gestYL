import express from 'express';
import crypto from 'crypto';
import nodemailer from 'nodemailer';

function getMailTransporter() {
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;
  if (!user || !pass) return null;
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: Number(process.env.EMAIL_PORT || 587),
    secure: process.env.EMAIL_SECURE === 'true',
    auth: { user, pass },
  });
}

async function sendMail(to: string, subject: string, html: string) {
  const transporter = getMailTransporter();
  if (!transporter) {
    console.warn('[Auth] EMAIL_USER/EMAIL_PASS não configurados — email não enviado');
    return false;
  }
  const from = `"Gestor Young-Link" <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`;
  await transporter.sendMail({ from, to, subject, html });
  return true;
}

const bootLog = (...args: any[]) => {
  if (process.env.BOOT_DEBUG === 'true') console.log(...args);
};

bootLog('Auth: carregar supabase');
const { supabaseAdmin } = require('../config/supabase');
bootLog('Auth: supabase carregado');
bootLog('Auth: carregar prisma');
const { prisma } = require('../config/prisma');
bootLog('Auth: prisma carregado');
bootLog('Auth: carregar audit');
const { logAudit } = require('../services/audit');
bootLog('Auth: audit carregado');
bootLog('Auth: carregar middleware auth');
const { requireAuth } = require('../middleware/auth');
bootLog('Auth: middleware auth carregado');

const router = express.Router();

// Login com email + password via Supabase Auth
router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Email e password são obrigatórios' });
  }

  const { data, error } = await supabaseAdmin.auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    return res.status(401).json({ error: 'Credenciais inválidas' });
  }

  const profile = await prisma.profile.findUnique({ where: { id: data.user.id } });
  if (!profile || !profile.ativo) {
    return res.status(403).json({ error: 'Conta desativada' });
  }

  await logAudit({ action: 'LOGIN', entity: 'session', details: { email: profile.email, role: profile.role }, req });

  return res.json({
    token: data.session.access_token,
    refreshToken: data.session.refresh_token,
    user: profile.email,
    nome: profile.nome,
    role: profile.role,
    expiresAt: data.session.expires_at,
  });
});

// Logout
router.post('/logout', requireAuth, async (req, res) => {
  await logAudit({ action: 'LOGOUT', entity: 'session', req });
  return res.json({ ok: true });
});

// Estado da sessão
router.get('/status', requireAuth, (req, res) => {
  return res.json({
    user: (req as any).authUser,
    role: (req as any).authRole,
    nome: (req as any).authNome,
  });
});

// Recuperação de senha — gera link e envia email via SMTP interno
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: 'Email é obrigatório' });

  const profile = await prisma.profile.findFirst({ where: { email, ativo: true } });
  if (!profile) {
    return res.json({ message: 'Se o email existir, receberá instruções de recuperação' });
  }

  const appUrl = process.env.APP_URL || 'https://gestor.younglink.net';
  const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo: `${appUrl}/reset-password` },
  });

  if (linkError || !linkData?.properties?.hashed_token) {
    console.error('[Auth] Erro a gerar link de recovery:', linkError?.message);
    return res.json({ message: 'Se o email existir, receberá instruções de recuperação' });
  }

  const token = linkData.properties.hashed_token;
  const resetLink = `${process.env.SUPABASE_URL}/auth/v1/verify?token=${token}&type=recovery&redirect_to=${encodeURIComponent(appUrl + '/reset-password')}`;

  try {
    await sendMail(email, 'Recuperar Password — Gestor Young-Link', `
      <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto;">
        <h2 style="color: #4f46e5;">Gestor Young-Link</h2>
        <p>Olá${profile.nome ? ` ${profile.nome}` : ''},</p>
        <p>Recebemos um pedido para recuperar a sua password.</p>
        <p>Clique no botão abaixo para definir uma nova password:</p>
        <p style="text-align: center; margin: 30px 0;">
          <a href="${resetLink}" style="background: #4f46e5; color: #fff; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: bold;">
            Redefinir Password
          </a>
        </p>
        <p style="color: #666; font-size: 13px;">Se não fez este pedido, ignore este email. O link expira em 24 horas.</p>
      </div>
    `);
  } catch (mailErr: any) {
    console.error('[Auth] Erro a enviar email de recovery:', mailErr.message);
  }

  return res.json({ message: 'Se o email existir, receberá instruções de recuperação' });
});

// Atualizar password (com token do email de reset)
router.post('/reset-password', async (req, res) => {
  const { accessToken, newPassword } = req.body || {};
  if (!accessToken || !newPassword) {
    return res.status(400).json({ error: 'Token e nova password são obrigatórios' });
  }
  if (typeof newPassword !== 'string' || newPassword.length < 8) {
    return res.status(400).json({ error: 'A password deve ter no mínimo 8 caracteres' });
  }

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(accessToken);
  if (userError || !userData.user?.id) {
    return res.status(401).json({ error: 'Token inválido ou expirado' });
  }

  const { error } = await supabaseAdmin.auth.admin.updateUserById(userData.user.id, {
    password: newPassword,
  });
  if (error) return res.status(400).json({ error: 'Erro ao atualizar password' });
  return res.json({ message: 'Password atualizada com sucesso' });
});

// --- Gestão de utilizadores (apenas admin) ---

// Listar utilizadores
router.get('/users', requireAuth, async (req, res) => {
  if ((req as any).authRole !== 'admin') {
    return res.status(403).json({ error: 'Apenas administradores' });
  }
  const profiles = await prisma.profile.findMany({ orderBy: { createdAt: 'desc' } });
  return res.json(profiles);
});

// Criar utilizador (cria no Supabase + envia convite por email via SMTP)
router.post('/users', requireAuth, async (req, res) => {
  if ((req as any).authRole !== 'admin') {
    return res.status(403).json({ error: 'Apenas administradores' });
  }

  const { email, nome, role } = req.body || {};
  if (!email) {
    return res.status(400).json({ error: 'Email é obrigatório' });
  }

  const tempPassword = crypto.randomBytes(32).toString('hex');
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
  });
  if (error) return res.status(400).json({ error: error.message });

  const profile = await prisma.profile.create({
    data: {
      id: data.user.id,
      email,
      nome: nome || null,
      role: role || 'fiscal',
    },
  });

  // Gerar link de reset para o utilizador definir a password
  const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo: `${process.env.APP_URL || 'https://gestor.younglink.net'}/reset-password` },
  });

  if (!linkError && linkData?.properties?.hashed_token) {
    const appUrl = process.env.APP_URL || 'https://gestor.younglink.net';
    const token = linkData.properties.hashed_token;
    const resetLink = `${process.env.SUPABASE_URL}/auth/v1/verify?token=${token}&type=recovery&redirect_to=${encodeURIComponent(appUrl + '/reset-password')}`;

    try {
      const sent = await sendMail(email, 'Convite — Gestor Young-Link', `
        <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto;">
          <h2 style="color: #4f46e5;">Gestor Young-Link</h2>
          <p>Olá${nome ? ` ${nome}` : ''},</p>
          <p>Foi-lhe criada uma conta no <strong>Gestor Young-Link</strong>.</p>
          <p>Clique no botão abaixo para definir a sua password:</p>
          <p style="text-align: center; margin: 30px 0;">
            <a href="${resetLink}" style="background: #4f46e5; color: #fff; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: bold;">
              Definir Password
            </a>
          </p>
          <p style="color: #666; font-size: 13px;">Se não reconhece este convite, ignore este email.</p>
        </div>
      `);
      if (sent) console.log(`[Auth] Convite enviado para ${email}`);
    } catch (mailErr: any) {
      console.error('[Auth] Erro a enviar email de convite:', mailErr.message);
    }
  }

  return res.status(201).json(profile);
});

// Atualizar role/estado de utilizador
router.put('/users/:id', requireAuth, async (req, res) => {
  if ((req as any).authRole !== 'admin') {
    return res.status(403).json({ error: 'Apenas administradores' });
  }

  const { role, ativo, nome } = req.body || {};
  const profile = await prisma.profile.update({
    where: { id: req.params.id as string },
    data: {
      ...(role !== undefined && { role }),
      ...(ativo !== undefined && { ativo }),
      ...(nome !== undefined && { nome }),
    },
  });
  return res.json(profile);
});

// Remover utilizador
router.delete('/users/:id', requireAuth, async (req, res) => {
  if ((req as any).authRole !== 'admin') {
    return res.status(403).json({ error: 'Apenas administradores' });
  }

  const id = req.params.id as string;
  const { logAudit: logAuditFn } = await import('../services/audit');
  await logAuditFn({ action: 'DELETE', entity: 'user', entityId: id, req });
  await supabaseAdmin.auth.admin.deleteUser(id);
  await prisma.profile.delete({ where: { id } });
  return res.json({ message: 'Utilizador removido' });
});

// --- Auditoria (apenas admin) ---
router.get('/audit', requireAuth, async (req, res) => {
  if ((req as any).authRole !== 'admin') {
    return res.status(403).json({ error: 'Apenas administradores' });
  }

  const { entity, userId, limit: lim, offset: off, dateFrom, dateTo } = req.query as any;
  const where: any = {};
  if (entity) where.entity = entity;
  if (userId) where.userId = userId;
  if (dateFrom || dateTo) {
    const from = dateFrom ? new Date(dateFrom) : undefined;
    const to = dateTo ? new Date(dateTo) : undefined;
    if ((from && isNaN(from.getTime())) || (to && isNaN(to.getTime()))) {
      return res.status(400).json({ error: 'Datas inválidas' });
    }
    if (from && to && from > to) {
      return res.status(400).json({ error: 'Data inicial não pode ser posterior à data final' });
    }
    where.createdAt = {};
    if (from) where.createdAt.gte = from;
    if (to) where.createdAt.lte = to;
  }

  const take = Math.min(Math.max(parseInt(lim || '50', 10) || 50, 1), 200);
  const skip = Math.max(parseInt(off || '0', 10) || 0, 0);

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take,
      skip,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return res.json({ logs, total });
});

export default router;
