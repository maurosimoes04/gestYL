import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import authRoutes from './routes/auth';
import { requireAuth, guardWrite } from './middleware/auth';

const app = express();

app.use(cors());
app.use(express.json());

const frontendPath = path.join(process.cwd(), 'src', 'frontend');
app.use(express.static(frontendPath));

// Páginas de auth (set-password, reset-password)
app.get('/set-password', (_req, res) => {
  res.sendFile(path.join(frontendPath, 'set-password.html'));
});
app.get('/reset-password', (_req, res) => {
  res.sendFile(path.join(frontendPath, 'reset-password.html'));
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
app.use('/faturas', faturaRoutes);
app.use('/eventos', eventoRoutes);
app.use('/receitas', receitaRoutes);
app.use('/movimentos', movimentoRoutes);
app.use('/relatorios', relatorioRoutes);
app.use('/inventario', inventarioRoutes);

app.get('/', (_req, res) => {
  res.send('API Gestor de Faturas ativa');
});

export default app;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Servidor a correr na porta ${PORT}`);
  });
}
