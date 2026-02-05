/**
 * Projeto: Gestão de Faturas - Backend
 * Versão: 1.0
 * Descrição: Configuração e ligação à base de dados SQLite via Sequelize.
 * Autor: Mauro Simões
 * Data: 20/11/2025
 */

import { Sequelize } from 'sequelize';
import path from 'path';


// Instancia o Sequelize para SQLite (PT-PT)
const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: path.join(process.cwd(), 'src', 'backend', 'database', 'faturas.db'),
  logging: false
});


// Testa a ligação à base de dados (PT-PT)
sequelize.authenticate()
  .then(() => console.log('Ligação à base de dados estabelecida com sucesso.'))
  .catch((err: any) => console.error('Erro ao conectar BD:', err));


export { sequelize };
