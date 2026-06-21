require('dotenv/config');
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';

const bootLog = (...args: any[]) => {
  if (process.env.BOOT_DEBUG === 'true') console.log(...args);
};

bootLog('App: carregar auth routes');
const authRoutes = require('./routes/auth').default;
bootLog('App: auth routes carregadas');
bootLog('App: carregar middleware auth');
const { requireAuth, guardWrite } = require('./middleware/auth');
bootLog('App: middleware auth carregado');
bootLog('App: carregar middleware audit');
const { auditRoutes } = require('./middleware/auditMiddleware');
bootLog('App: middleware audit carregado');
bootLog('App: carregar share routes');
const { sharePublicRouter, sharePrivateRouter } = require('./routes/share');
bootLog('App: share routes carregadas');

const app = express();

const allowedOrigins = [
  process.env.APP_URL,
  'http://localhost:3000',
].filter(Boolean) as string[];

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) callback(null, true);
    else callback(null, false);
  },
  credentials: true,
}));
app.use(express.json());

const frontendPath = path.join(process.cwd(), 'src', 'frontend');
app.get('/favicon.ico', (_req, res) => res.status(204).end());
app.use(express.static(frontendPath));

app.get('/api/config', (_req, res) => {
  res.json({
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
  });
});

// Páginas públicas
app.get('/login', (_req, res) => {
  res.sendFile(path.join(frontendPath, 'login.html'));
});
app.get('/set-password', (_req, res) => {
  res.sendFile(path.join(frontendPath, 'set-password.html'));
});
app.get('/reset-password', (_req, res) => {
  res.sendFile(path.join(frontendPath, 'reset-password.html'));
});

// Páginas protegidas (verificação feita no JS do cliente)
app.get('/user', (_req, res) => {
  res.sendFile(path.join(frontendPath, 'user.html'));
});
app.get('/admin', (_req, res) => {
  res.sendFile(path.join(frontendPath, 'admin.html'));
});

// Redirect raiz para login
app.get('/', (_req, res) => {
  res.redirect('/login');
});

// Partilha publica de eventos
app.get('/share/evento/:token', (_req, res) => {
  res.sendFile(path.join(frontendPath, 'share-evento.html'));
});
app.use('/share', sharePublicRouter);

// Rotas públicas de autenticação (com rate limiting)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Demasiadas tentativas. Tente novamente mais tarde.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/auth/login', authLimiter);
app.use('/auth/forgot-password', authLimiter);
app.use('/auth/reset-password', authLimiter);
app.use('/auth', authRoutes);

// Rotas protegidas
bootLog('App: carregar fatura routes');
const faturaRoutes = require('./routes/fatura').default;
bootLog('App: fatura routes carregadas');
bootLog('App: carregar evento routes');
const eventoRoutes = require('./routes/evento').default;
bootLog('App: evento routes carregadas');
bootLog('App: carregar receita routes');
const receitaRoutes = require('./routes/receita').default;
bootLog('App: receita routes carregadas');
bootLog('App: carregar movimento routes');
const movimentoRoutes = require('./routes/movimento').default;
bootLog('App: movimento routes carregadas');
bootLog('App: carregar relatorio routes');
const relatorioRoutes = require('./routes/relatorio').default;
bootLog('App: relatorio routes carregadas');
bootLog('App: carregar inventario routes');
const inventarioRoutes = require('./routes/inventario').default;
bootLog('App: inventario routes carregadas');
bootLog('App: carregar departamento routes');
const departamentoRoutes = require('./routes/departamento').default;
bootLog('App: departamento routes carregadas');

app.use(requireAuth);
app.use(guardWrite);
app.use('/shares', sharePrivateRouter);
app.use('/faturas', auditRoutes('fatura'), faturaRoutes);
app.use('/eventos', auditRoutes('evento'), eventoRoutes);
app.use('/receitas', auditRoutes('receita'), receitaRoutes);
app.use('/movimentos', auditRoutes('movimento'), movimentoRoutes);
app.use('/relatorios', relatorioRoutes);
app.use('/inventario', auditRoutes('inventario'), inventarioRoutes);
app.use('/departamentos', auditRoutes('departamento'), departamentoRoutes);

export default app;
