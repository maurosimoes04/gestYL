import { sequelize } from '../config/database';
import createEventoModel from '../models/Evento';
import createFaturaModel from '../models/Fatura';
import createReceitaModel from '../models/Receita';

async function seed() {
  console.log('➡️  A semear dados de exemplo (eventos, faturas, receitas)...');

  const Evento = createEventoModel(sequelize);
  const Fatura = createFaturaModel(sequelize);
  const Receita = createReceitaModel(sequelize);

  await sequelize.sync();

  // Limpa dados anteriores para evitar duplicados
  await Promise.all([
    Fatura.destroy({ where: {}, truncate: true, restartIdentity: true, cascade: true }) as any,
    Receita.destroy({ where: {}, truncate: true, restartIdentity: true, cascade: true }) as any
  ]);
  await Evento.destroy({ where: {}, truncate: true, restartIdentity: true, cascade: true } as any);

  const eventos = await Evento.bulkCreate([
    {
      nome: 'Festival de Arte Urbana',
      descricao: 'Evento cultural com exposições e performances.',
      data_inicio: '2026-02-20',
      data_fim: '2026-02-22',
      departamento: 'Cultural'
    },
    {
      nome: 'Corrida Solidária',
      descricao: 'Evento desportivo para angariar fundos.',
      data_inicio: '2026-03-15',
      data_fim: '2026-03-15',
      departamento: 'Desporto'
    },
    {
      nome: 'Feira de Educação e Tecnologia',
      descricao: 'Workshops e palestras sobre inovação.',
      data_inicio: '2026-04-05',
      data_fim: '2026-04-07',
      departamento: 'Educação'
    }
  ], { returning: true });

  const eventoByNome = Object.fromEntries(eventos.map(e => [e.nome, e.id]));

  await Receita.bulkCreate([
    {
      titulo: 'Quotas de Associados - Fevereiro',
      valor: 3200,
      data: '2026-02-05',
      categoria: 'Quotas',
      estado: 'Recebido',
      financiador: 'Associação YL',
      observacoes: 'Recebimento mensal de quotas',
      eventoId: null
    },
    {
      titulo: 'Patrocínio Empresa X',
      valor: 5000,
      data: '2026-02-18',
      categoria: 'Patrocínios/Doações',
      estado: 'Recebido',
      financiador: 'Empresa X',
      eventoId: eventoByNome['Festival de Arte Urbana']
    },
    {
      titulo: 'Cofinanciamento Desporto',
      valor: 2750,
      data: '2026-03-10',
      categoria: 'Cofinanciamentos',
      estado: 'Pendente',
      financiador: 'Município',
      eventoId: eventoByNome['Corrida Solidária']
    },
    {
      titulo: 'Vendas de Merch',
      valor: 860,
      data: '2026-02-22',
      categoria: 'Vendas/Serviços',
      estado: 'Recebido',
      financiador: 'Público do evento',
      eventoId: eventoByNome['Festival de Arte Urbana']
    },
    {
      titulo: 'Reembolso Seguro',
      valor: 420,
      data: '2026-01-28',
      categoria: 'Reembolsos',
      estado: 'Previsto',
      financiador: 'Seguradora',
      eventoId: null
    }
  ]);

  await Fatura.bulkCreate([
    {
      titulo: 'Aluguer de Palco',
      valor: 1800,
      data: '2026-02-12',
      departamento: 'Cultural',
      estado: 'Pendente',
      tipo: 'Fatura',
      numero: 'FAT-2026-001',
      descricao: 'Estrutura e montagem para Festival',
      eventoId: eventoByNome['Festival de Arte Urbana']
    },
    {
      titulo: 'Som e Luz',
      valor: 2400,
      data: '2026-02-13',
      departamento: 'Cultural',
      estado: 'Paga',
      tipo: 'Fatura',
      numero: 'FAT-2026-002',
      descricao: 'Equipamento de áudio e iluminação',
      eventoId: eventoByNome['Festival de Arte Urbana']
    },
    {
      titulo: 'Medalhas e Troféus',
      valor: 650,
      data: '2026-03-02',
      departamento: 'Desporto',
      estado: 'Paga',
      tipo: 'Fatura',
      numero: 'FAT-2026-003',
      descricao: 'Materiais para Corrida Solidária',
      eventoId: eventoByNome['Corrida Solidária']
    },
    {
      titulo: 'Camisolas da Prova',
      valor: 980,
      data: '2026-02-27',
      departamento: 'Desporto',
      estado: 'Pendente',
      tipo: 'Fatura',
      numero: 'FAT-2026-004',
      descricao: 'Produção de camisolas personalizadas',
      eventoId: eventoByNome['Corrida Solidária']
    },
    {
      titulo: 'Aluguer de Auditório',
      valor: 1500,
      data: '2026-04-01',
      departamento: 'Educação',
      estado: 'Pendente',
      tipo: 'Fatura',
      numero: 'FAT-2026-005',
      descricao: 'Espaço para Feira de Educação e Tecnologia',
      eventoId: eventoByNome['Feira de Educação e Tecnologia']
    },
    {
      titulo: 'Catering — Coffee Breaks',
      valor: 720,
      data: '2026-04-02',
      departamento: 'Educação',
      estado: 'Paga',
      tipo: 'Fatura',
      numero: 'FAT-2026-006',
      descricao: 'Serviço de coffee break para os 3 dias',
      eventoId: eventoByNome['Feira de Educação e Tecnologia']
    }
  ]);

  console.log('✅ Seeding concluído com sucesso.');
  await sequelize.close();
}

seed().catch((err) => {
  console.error('Erro no seeding:', err);
  process.exit(1);
});
