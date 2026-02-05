
import express from 'express';
import cors from 'cors';
/**
 * Projeto: Gestão de Faturas - Backend
 * Versão: 1.0
 * Descrição: Aplicação principal Express para servir API e frontend.
 * Autor: Mauro Simões
 * Data: 20/11/2025
 */

import path from 'path';

const app = express();


app.use(cors());

// Ativa CORS para todas as rotas (PT-PT)



// Permite análise de JSON no corpo dos pedidos (PT-PT)
app.use(express.json());


// Serve ficheiros estáticos do frontend (PT-PT)



const frontendPath = path.join(process.cwd(), 'src', 'frontend');
app.use(express.static(frontendPath));

app.use('/IMAGENS', express.static(path.join(process.cwd(), 'IMAGENS')));

// Sincroniza a base de dados (PT-PT)


import { sequelize } from './config/database';
import { DataTypes } from 'sequelize';

async function ensureReceitaEventoColumn() {
  const qi = sequelize.getQueryInterface();
  const desc = await qi.describeTable('receitas');
  if (!desc.eventoId) {
    await qi.addColumn('receitas', 'eventoId', {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'eventos', key: 'id' }
    });
  }
}


sequelize.sync()
  .then(async () => {
    await ensureReceitaEventoColumn();
    console.log('Base de dados sincronizada');
  })

// Endpoint de estado (PT-PT)
  .catch((err: any) => console.error('Erro ao sincronizar BD:', err));



import faturaRoutes from './routes/fatura';
import eventoRoutes from './routes/evento';
import receitaRoutes from './routes/receita';
import movimentoRoutes from './routes/movimento';
import relatorioRoutes from './routes/relatorio';
app.use('/faturas', faturaRoutes);
app.use('/eventos', eventoRoutes);
app.use('/receitas', receitaRoutes);
app.use('/movimentos', movimentoRoutes);
app.use('/relatorios', relatorioRoutes);


// Inicia o servidor se chamado diretamente (PT-PT)

app.get('/', (req, res) => {
  res.send('API Gestor de Faturas ativa');
});


export default app;


if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Servidor a correr na porta ${PORT}`);
  });
}
