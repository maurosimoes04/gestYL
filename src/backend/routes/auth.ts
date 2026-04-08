import express from 'express';
import { supabaseAdmin } from '../config/supabase';
import { prisma } from '../config/prisma';
import { requireAuth } from '../middleware/auth';

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
  // Supabase invalida a sessão no lado do cliente; opcionalmente podemos revogar
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

// Recuperação de senha — envia email de reset
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: 'Email é obrigatório' });

  const { error } = await supabaseAdmin.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.APP_URL || 'https://gestor.younglink.net'}/reset-password`,
  });
  if (error) return res.status(400).json({ error: 'Erro ao enviar email de recuperação' });
  return res.json({ message: 'Email de recuperação enviado' });
});

// Atualizar password (com token do email de reset)
router.post('/reset-password', async (req, res) => {
  const { accessToken, newPassword } = req.body || {};
  if (!accessToken || !newPassword) {
    return res.status(400).json({ error: 'Token e nova password são obrigatórios' });
  }

  const { error } = await supabaseAdmin.auth.admin.updateUserById(
    // Primeiro obtemos o user pelo token
    (await supabaseAdmin.auth.getUser(accessToken)).data.user?.id || '',
    { password: newPassword }
  );
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

// Criar utilizador (envia convite por email)
router.post('/users', requireAuth, async (req, res) => {
  if ((req as any).authRole !== 'admin') {
    return res.status(403).json({ error: 'Apenas administradores' });
  }

  const { email, nome, role } = req.body || {};
  if (!email) {
    return res.status(400).json({ error: 'Email é obrigatório' });
  }

  const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${process.env.APP_URL || 'https://gestor.younglink.net'}/set-password`,
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
  await supabaseAdmin.auth.admin.deleteUser(id);
  await prisma.profile.delete({ where: { id } });
  return res.json({ message: 'Utilizador removido' });
});

export default router;
