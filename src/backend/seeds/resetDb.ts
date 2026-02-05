import { sequelize } from '../config/database';
import createEventoModel from '../models/Evento';
import createFaturaModel from '../models/Fatura';
import createReceitaModel from '../models/Receita';
import createMovimentoModel from '../models/Movimento';

async function resetDb() {
  console.log('🧹 A limpar todas as tabelas (eventos, faturas, receitas, movimentos)...');

  const Evento = createEventoModel(sequelize);
  const Fatura = createFaturaModel(sequelize);
  const Receita = createReceitaModel(sequelize);
  const Movimento = createMovimentoModel(sequelize);

  await sequelize.sync();

  await sequelize.transaction(async (t) => {
    await Fatura.destroy({ where: {}, truncate: true, restartIdentity: true, cascade: true, transaction: t } as any);
    await Receita.destroy({ where: {}, truncate: true, restartIdentity: true, cascade: true, transaction: t } as any);
    await Movimento.destroy({ where: {}, truncate: true, restartIdentity: true, cascade: true, transaction: t } as any);
    await Evento.destroy({ where: {}, truncate: true, restartIdentity: true, cascade: true, transaction: t } as any);
  });

  console.log('✅ Base de dados limpa.');
  await sequelize.close();
}

resetDb().catch((err) => {
  console.error('Erro ao limpar BD:', err);
  process.exit(1);
});
