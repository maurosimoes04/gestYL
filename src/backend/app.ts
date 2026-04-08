import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import authRoutes from './routes/auth';
import { requireAuth, guardWrite } from './middleware/auth';
import { auditRoutes } from './middleware/auditMiddleware';

const app = express();

app.use(cors());
app.use(express.json());

const frontendPath = path.join(process.cwd(), 'src', 'frontend');
app.use(express.static(frontendPath));

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

// Rotas públicas de autenticação
app.use('/auth', authRoutes);

// Rotas protegidas
import faturaRoutes from './routes/fatura';
import eventoRoutes from './routes/evento';
import receitaRoutes from './routes/receita';
import movimentoRoutes from './routes/movimento';
import relatorioRoutes from './routes/relatorio';
import inventarioRoutes from './routes/inventario';

app.use(requireAuth);
app.use(guardWrite);
app.use('/faturas', auditRoutes('fatura'), faturaRoutes);
app.use('/eventos', auditRoutes('evento'), eventoRoutes);
app.use('/receitas', auditRoutes('receita'), receitaRoutes);
app.use('/movimentos', auditRoutes('movimento'), movimentoRoutes);
app.use('/relatorios', relatorioRoutes);
app.use('/inventario', auditRoutes('inventario'), inventarioRoutes);

app.get('/', (_req, res) => {
  res.redirect('/login');
});

export default app;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Servidor a correr na porta ${PORT}`);
  });
}
