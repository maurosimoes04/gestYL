import express from 'express';
import { issueToken, clearToken, getStatus, requireAuth } from '../middleware/auth';

const router = express.Router();

const DIRECAO_USER = process.env.APP_ADMIN_USER || 'direcao@younglink.net';
const DIRECAO_PASSWORD = process.env.APP_ADMIN_PASSWORD || 'Link23@';
const FISCAL_USER = process.env.APP_FISCAL_USER || 'fiscal@younglink.net';
const FISCAL_PASSWORD = process.env.APP_FISCAL_PASSWORD || 'Fiscal23@';

router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Utilizador e password são obrigatórios' });
  }

  let role: 'direcao' | 'fiscal' | null = null;
  if (username === DIRECAO_USER && password === DIRECAO_PASSWORD) role = 'direcao';
  if (username === FISCAL_USER && password === FISCAL_PASSWORD) role = 'fiscal';

  if (!role) return res.status(401).json({ error: 'Credenciais inválidas' });

  const session = issueToken(username, role);
  return res.json({ token: session.token, user: username, role, expiresInMs: session.expiresInMs });
});

router.post('/logout', requireAuth, (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.toString().replace(/bearer\s+/i, '') || '';
  if (token) clearToken(token);
  return res.json({ ok: true });
});

router.get('/status', (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.toString().replace(/bearer\s+/i, '') || '';
  if (!token) return res.status(401).json({ error: 'Token em falta' });
  const status = getStatus(token);
  if (!status.valid) return res.status(401).json({ error: 'Sessão inválida' });
  return res.json({ user: status.user, role: status.role, expiresAt: status.expiresAt });
});

export default router;
