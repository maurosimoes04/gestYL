
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


sequelize.sync({ alter: true })
  .then(() => console.log('Base de dados sincronizada (alter)'))

// Endpoint de estado (PT-PT)
  .catch((err: any) => console.error('Erro ao sincronizar BD:', err));



import faturaRoutes from './routes/fatura';
import eventoRoutes from './routes/evento';
app.use('/faturas', faturaRoutes);
app.use('/eventos', eventoRoutes);


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
