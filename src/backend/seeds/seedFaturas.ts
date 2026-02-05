/**
 * Projeto: Gestão de Faturas - Backend
 * Versão: 1.0
 * Descrição: Script para popular a base de dados com faturas de exemplo.
 * Autor: Mauro Simões
 * Data: 22/11/2025
 */

import { sequelize } from '../config/database';
import createFaturaModel from '../models/Fatura';

const Fatura = createFaturaModel(sequelize);

/**
 * Insere registos de exemplo na base de dados (30+ faturas variadas).
 * Utilizar apenas em ambiente de desenvolvimento para popular dados iniciais.
 */
async function seed() {
  console.log('Iniciando seeding de faturas de exemplo...');
  
  await sequelize.sync();

  const examples = [
    {
      titulo: 'Renda Habitação',
      valor: 450.00,
      data: '2025-12-01',
      departamento: 'despesas extraordinárias',
      estado: 'Paga',
      numero: 'H-2025-001',
      anexo: null,
      detalhes: { recorrente: true, metodo_pagamento: 'transferencia', ciclico: 'mensal' },
      descricao: 'Renda mensal do apartamento.'
    },
    {
      titulo: 'Internet',
      valor: 35.99,
      data: '2025-12-05',
      departamento: 'despesas extraordinárias',
      estado: 'Paga',
      numero: 'I-2025-001',
      anexo: null,
      detalhes: { recorrente: true, metodo_pagamento: 'débito-direto', ciclico: 'mensal' },
      descricao: 'Serviço de internet residencial.'
    },
    {
      titulo: 'Água',
      valor: 28.50,
      data: '2025-12-08',
      departamento: 'despesas extraordinárias',
      estado: 'Pendente',
      numero: 'A-2025-001',
      anexo: null,
      detalhes: { recorrente: true, metodo_pagamento: 'débito-direto', ciclico: 'mensal' },
      descricao: 'Fatura de água mensal.'
    },
    {
      titulo: 'Electricidade',
      valor: 65.40,
      data: '2025-12-10',
      departamento: 'despesas extraordinárias',
      estado: 'Paga',
      numero: 'E-2025-001',
      anexo: null,
      detalhes: { recorrente: true, metodo_pagamento: 'débito-direto', ciclico: 'mensal' },
      descricao: 'Fatura de eletricidade.'
    },
    {
      titulo: 'Gás',
      valor: 42.30,
      data: '2025-12-10',
      departamento: 'despesas extraordinárias',
      estado: 'Pendente',
      numero: 'G-2025-001',
      anexo: null,
      detalhes: { recorrente: true, metodo_pagamento: 'débito-direto', ciclico: 'mensal' },
      descricao: 'Fatura de gás natural.'
    },
    {
      titulo: 'Seguro Saúde Familiar',
      valor: 85.00,
      data: '2025-12-03',
      departamento: 'despesas extraordinárias',
      estado: 'Paga',
      numero: 'S-2025-001',
      anexo: null,
      detalhes: { recorrente: true, metodo_pagamento: 'cartao', ciclico: 'mensal' },
      descricao: 'Plano de saúde familiar anual.'
    },
    {
      titulo: 'Explicações Matemática',
      valor: 40.00,
      data: '2025-12-07',
      departamento: 'educação',
      estado: 'Paga',
      numero: 'LS-2025-001',
      anexo: null,
      detalhes: { editora: 'EditoraLivros', disciplinas: 5 },
      descricao: 'Livros para novo ano letivo.'
    },
    {
      titulo: 'Reparação Automóvel - Embraiagem',
      valor: 350.00,
      data: '2025-11-20',
      departamento: 'despesas extraordinárias',
      estado: 'Paga',
      numero: 'O-2025-001',
      anexo: null,
      detalhes: { oficina: 'AutoServ', servico: 'Mudança de embraiagem' },
      descricao: 'Reparação da embraiagem do carro.'
    },
    {
      titulo: 'Revisão Automóvel',
      valor: 120.00,
      data: '2025-11-15',
      departamento: 'despesas extraordinárias',
      estado: 'Pendente',
      numero: 'O-2025-002',
      anexo: null,
      detalhes: { oficina: 'AutoServ', servico: 'Revisão 60000km' },
      descricao: 'Revisão periódica do automóvel.'
    },
    {
      titulo: 'Consulta Veterinária - Vacinação',
      valor: 48.00,
      data: '2025-07-11',
      departamento: 'despesas extraordinárias',
      estado: 'Paga',
      numero: 'V-2025-001',
      anexo: null,
      detalhes: { animal: 'Gato', tratamento: 'Vacinação' },
      descricao: 'Vacinação anual do animal de estimação.'
    },
    {
      titulo: 'Alimentação Veterinária Especial',
      valor: 65.50,
      data: '2025-12-02',
      departamento: 'despesas extraordinárias',
      estado: 'Paga',
      numero: 'V-2025-002',
      anexo: null,
      detalhes: { animal: 'Cão', marca: 'VetFood Premium' },
      descricao: 'Ração medicinal para o cão.'
    },
    {
      titulo: 'Compras Supermercado',
      valor: 95.40,
      data: '2025-12-08',
      departamento: 'despesas extraordinárias',
      estado: 'Paga',
      numero: 'SM-2025-001',
      anexo: null,
      detalhes: { loja: 'Continente', itens: 42 },
      descricao: 'Compras semanais de alimentos.'
    },
    {
      titulo: 'Compras Supermercado - Festa',
      valor: 120.80,
      data: '2025-12-15',
      departamento: 'despesas extraordinárias',
      estado: 'Paga',
      numero: 'SM-2025-002',
      anexo: null,
      detalhes: { loja: 'Pingo Doce', itens: 58 },
      descricao: 'Compras para festa de ano novo.'
    },
    {
      titulo: 'Combustível - Gasolina',
      valor: 60.00,
      data: '2025-12-09',
      departamento: 'despesas extraordinárias',
      estado: 'Paga',
      numero: 'T-2025-001',
      anexo: null,
      detalhes: { combustivel: 'Gasolina 95', litros: 50 },
      descricao: 'Abastecimento de gasolina.'
    },
    {
      titulo: 'Passe Transportes - Dezembro',
      valor: 40.00,
      data: '2025-12-01',
      departamento: 'despesas extraordinárias',
      estado: 'Paga',
      numero: 'PT-2025-001',
      anexo: null,
      detalhes: { tipo_passe: 'Mensal', zona: '1-3' },
      descricao: 'Passe mensal de transportes públicos.'
    },
    {
      titulo: 'Almoço - Restaurante',
      valor: 25.50,
      data: '2025-12-06',
      departamento: 'despesas extraordinárias',
      estado: 'Paga',
      numero: 'R-2025-001',
      anexo: null,
      detalhes: { pessoas: 1, local: 'Restaurante Centro' },
      descricao: 'Almoço de trabalho.'
    },
    {
      titulo: 'Jantar - Restaurante Especial',
      valor: 95.00,
      data: '2025-12-07',
      departamento: 'despesas extraordinárias',
      estado: 'Paga',
      numero: 'R-2025-002',
      anexo: null,
      detalhes: { pessoas: 2, local: 'Restaurante Gourmet' },
      descricao: 'Jantar especial de aniversário.'
    },
    {
      titulo: 'Café - Pastelaria',
      valor: 8.50,
      data: '2025-12-10',
      departamento: 'despesas extraordinárias',
      estado: 'Paga',
      numero: 'R-2025-003',
      anexo: null,
      detalhes: { local: 'Pastelaria Local' },
      descricao: 'Café e bolo.'
    },
    {
      titulo: 'Corte de Cabelo',
      valor: 20.00,
      data: '2025-11-25',
      departamento: 'despesas extraordinárias',
      estado: 'Paga',
      numero: 'C-2025-001',
      anexo: null,
      detalhes: { servico: 'Corte Homem' },
      descricao: 'Corte de cabelo em cabeleireiro.'
    },
    {
      titulo: 'Coloração Cabelo',
      valor: 55.00,
      data: '2025-12-01',
      departamento: 'despesas extraordinárias',
      estado: 'Pendente',
      numero: 'C-2025-002',
      anexo: null,
      detalhes: { servico: 'Coloração + Corte' },
      descricao: 'Coloração e corte de cabelo.'
    },
    {
      titulo: 'Donation para Instituição de Caridade',
      valor: 30.00,
      data: '2025-12-04',
      departamento: 'despesas extraordinárias',
      estado: 'Paga',
      numero: 'B-2025-001',
      anexo: null,
      detalhes: { instituicao: 'Cruz Vermelha Portuguesa' },
      descricao: 'Doação para instituição social.'
    },
    {
      titulo: 'Roupas - Loja',
      valor: 85.00,
      data: '2025-12-03',
      departamento: 'despesas extraordinárias',
      estado: 'Paga',
      numero: 'RO-2025-001',
      anexo: null,
      detalhes: { loja: 'Zara', itens: 3 },
      descricao: 'Compra de peças de roupa.'
    }
  ];

  
  for (const f of examples) {
    await Fatura.create(f as any);
  }

  console.log(`Seeding concluído: ${examples.length} faturas inseridas com sucesso! 🎉`);
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Erro no seeding:', err);
    process.exit(1);
  });
