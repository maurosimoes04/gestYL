/**
 * Seed: Todas as contas SNC-ESNL para Associação sem fins lucrativos.
 * Usa pg Pool directamente (Prisma 7 adapter não permite PrismaClient standalone).
 * Idempotente — usa INSERT ... ON CONFLICT (codigo) DO UPDATE.
 */
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

interface Conta {
  codigo: string;
  nome: string;
  familia: string;
  tipo: 'proveito' | 'gasto' | 'ativo' | 'passivo' | 'capital';
  pergunta?: string;
  naturezaInvestimento?: boolean;
}

const contas: Conta[] = [
  // ═══════ CLASSE 1 — Meios financeiros líquidos ═══════
  { codigo: '11', nome: 'Caixa', familia: 'Meios financeiros', tipo: 'ativo' },
  { codigo: '12', nome: 'Depósitos à ordem', familia: 'Meios financeiros', tipo: 'ativo' },
  { codigo: '13', nome: 'Depósitos a prazo', familia: 'Meios financeiros', tipo: 'ativo' },
  { codigo: '14', nome: 'Outros depósitos bancários', familia: 'Meios financeiros', tipo: 'ativo' },

  // ═══════ CLASSE 2 — Contas a receber e a pagar ═══════
  { codigo: '21', nome: 'Clientes', familia: 'Contas a receber e a pagar', tipo: 'ativo' },
  { codigo: '211', nome: 'Clientes c/c', familia: 'Contas a receber e a pagar', tipo: 'ativo' },
  { codigo: '212', nome: 'Clientes — Títulos a receber', familia: 'Contas a receber e a pagar', tipo: 'ativo' },
  { codigo: '218', nome: 'Clientes de cobrança duvidosa', familia: 'Contas a receber e a pagar', tipo: 'ativo' },
  { codigo: '219', nome: 'Perdas por imparidade acumuladas', familia: 'Contas a receber e a pagar', tipo: 'ativo' },
  { codigo: '22', nome: 'Fornecedores — Contas a pagar', familia: 'Contas a receber e a pagar', tipo: 'passivo' },
  { codigo: '221', nome: 'Fornecedores c/c', familia: 'Contas a receber e a pagar', tipo: 'passivo' },
  { codigo: '222', nome: 'Fornecedores — Títulos a pagar', familia: 'Contas a receber e a pagar', tipo: 'passivo' },
  { codigo: '225', nome: 'Faturas em receção e conferência', familia: 'Contas a receber e a pagar', tipo: 'passivo' },
  { codigo: '228', nome: 'Fornecedores — Adiantamentos', familia: 'Contas a receber e a pagar', tipo: 'ativo' },
  { codigo: '23', nome: 'Pessoal', familia: 'Contas a receber e a pagar', tipo: 'passivo' },
  { codigo: '231', nome: 'Remunerações a pagar', familia: 'Contas a receber e a pagar', tipo: 'passivo' },
  { codigo: '232', nome: 'Pessoal — Bolsas a pagar', familia: 'Contas a receber e a pagar', tipo: 'passivo' },
  { codigo: '237', nome: 'Adiantamentos ao pessoal', familia: 'Contas a receber e a pagar', tipo: 'ativo' },
  { codigo: '238', nome: 'Outras operações com pessoal', familia: 'Contas a receber e a pagar', tipo: 'passivo' },
  { codigo: '24', nome: 'Estado e outros entes públicos', familia: 'Estado e outros entes públicos', tipo: 'passivo' },
  { codigo: '241', nome: 'Imposto sobre o rendimento', familia: 'Estado e outros entes públicos', tipo: 'passivo' },
  { codigo: '2432', nome: 'IVA — Dedutível', familia: 'Estado e outros entes públicos', tipo: 'ativo' },
  { codigo: '2433', nome: 'IVA — Liquidado', familia: 'Estado e outros entes públicos', tipo: 'passivo' },
  { codigo: '2434', nome: 'IVA — Regularizações', familia: 'Estado e outros entes públicos', tipo: 'passivo' },
  { codigo: '2435', nome: 'IVA — Apuramento', familia: 'Estado e outros entes públicos', tipo: 'passivo' },
  { codigo: '2436', nome: 'IVA — A pagar', familia: 'Estado e outros entes públicos', tipo: 'passivo' },
  { codigo: '2437', nome: 'IVA — A recuperar', familia: 'Estado e outros entes públicos', tipo: 'ativo' },
  { codigo: '245', nome: 'Contribuições para a Segurança Social', familia: 'Estado e outros entes públicos', tipo: 'passivo' },
  { codigo: '246', nome: 'Tributos das autarquias locais', familia: 'Estado e outros entes públicos', tipo: 'passivo' },
  { codigo: '248', nome: 'Outras tributações', familia: 'Estado e outros entes públicos', tipo: 'passivo' },
  { codigo: '25', nome: 'Financiamentos obtidos', familia: 'Contas a receber e a pagar', tipo: 'passivo' },
  { codigo: '251', nome: 'Instituições de crédito e sociedades financeiras', familia: 'Contas a receber e a pagar', tipo: 'passivo' },
  { codigo: '252', nome: 'Mercado de valores mobiliários', familia: 'Contas a receber e a pagar', tipo: 'passivo' },
  { codigo: '253', nome: 'Participantes / Associados', familia: 'Contas a receber e a pagar', tipo: 'passivo' },
  { codigo: '258', nome: 'Outros financiadores', familia: 'Contas a receber e a pagar', tipo: 'passivo' },
  { codigo: '26', nome: 'Fundadores / Patrocinadores / Doadores / Associados', familia: 'Contas a receber e a pagar', tipo: 'ativo' },
  { codigo: '262', nome: 'Quotas a receber', familia: 'Contas a receber e a pagar', tipo: 'ativo' },
  { codigo: '263', nome: 'Doações a receber', familia: 'Contas a receber e a pagar', tipo: 'ativo' },
  { codigo: '268', nome: 'Outras operações — fundadores/associados', familia: 'Contas a receber e a pagar', tipo: 'ativo' },
  { codigo: '27', nome: 'Outras contas a receber e a pagar', familia: 'Contas a receber e a pagar', tipo: 'ativo' },
  { codigo: '271', nome: 'Fornecedores de investimentos', familia: 'Contas a receber e a pagar', tipo: 'passivo' },
  { codigo: '272', nome: 'Devedores e credores por acréscimos', familia: 'Contas a receber e a pagar', tipo: 'ativo' },
  { codigo: '2721', nome: 'Devedores por acréscimos de rendimentos', familia: 'Contas a receber e a pagar', tipo: 'ativo' },
  { codigo: '2722', nome: 'Credores por acréscimos de gastos', familia: 'Contas a receber e a pagar', tipo: 'passivo' },
  { codigo: '273', nome: 'Benefícios pós-emprego', familia: 'Contas a receber e a pagar', tipo: 'passivo' },
  { codigo: '274', nome: 'Impostos diferidos', familia: 'Contas a receber e a pagar', tipo: 'ativo' },
  { codigo: '276', nome: 'Adiantamentos por conta de vendas', familia: 'Contas a receber e a pagar', tipo: 'passivo' },
  { codigo: '278', nome: 'Outros devedores e credores', familia: 'Contas a receber e a pagar', tipo: 'ativo' },
  { codigo: '279', nome: 'Perdas por imparidade acumuladas — outros', familia: 'Contas a receber e a pagar', tipo: 'ativo' },
  { codigo: '29', nome: 'Diferimentos', familia: 'Contas a receber e a pagar', tipo: 'passivo' },
  { codigo: '281', nome: 'Gastos a reconhecer', familia: 'Contas a receber e a pagar', tipo: 'ativo' },
  { codigo: '282', nome: 'Rendimentos a reconhecer', familia: 'Contas a receber e a pagar', tipo: 'passivo' },

  // ═══════ CLASSE 3 — Inventários e ativos biológicos ═══════
  { codigo: '31', nome: 'Compras', familia: 'Inventários', tipo: 'ativo' },
  { codigo: '32', nome: 'Mercadorias', familia: 'Inventários', tipo: 'ativo' },
  { codigo: '33', nome: 'Matérias-primas, subsidiárias e de consumo', familia: 'Inventários', tipo: 'ativo' },
  { codigo: '34', nome: 'Produtos acabados e intermédios', familia: 'Inventários', tipo: 'ativo' },
  { codigo: '35', nome: 'Subprodutos, desperdícios, resíduos e refugos', familia: 'Inventários', tipo: 'ativo' },
  { codigo: '36', nome: 'Produtos e trabalhos em curso', familia: 'Inventários', tipo: 'ativo' },
  { codigo: '37', nome: 'Ativos biológicos', familia: 'Inventários', tipo: 'ativo' },
  { codigo: '38', nome: 'Reclassificação e regularização de inventários', familia: 'Inventários', tipo: 'ativo' },
  { codigo: '39', nome: 'Perdas por imparidade acumuladas — inventários', familia: 'Inventários', tipo: 'ativo' },

  // ═══════ CLASSE 4 — Investimentos ═══════
  { codigo: '41', nome: 'Investimentos financeiros', familia: 'Investimentos', tipo: 'ativo' },
  { codigo: '411', nome: 'Investimentos em subsidiárias', familia: 'Investimentos', tipo: 'ativo' },
  { codigo: '412', nome: 'Investimentos em associadas', familia: 'Investimentos', tipo: 'ativo' },
  { codigo: '413', nome: 'Investimentos noutras entidades', familia: 'Investimentos', tipo: 'ativo' },
  { codigo: '414', nome: 'Outros investimentos financeiros', familia: 'Investimentos', tipo: 'ativo' },
  { codigo: '419', nome: 'Perdas por imparidade acumuladas — inv. financeiros', familia: 'Investimentos', tipo: 'ativo' },
  { codigo: '42', nome: 'Propriedades de investimento', familia: 'Investimentos', tipo: 'ativo' },
  { codigo: '421', nome: 'Terrenos e recursos naturais', familia: 'Investimentos', tipo: 'ativo' },
  { codigo: '422', nome: 'Edifícios e outras construções', familia: 'Investimentos', tipo: 'ativo' },
  { codigo: '426', nome: 'Outras propriedades de investimento', familia: 'Investimentos', tipo: 'ativo' },
  { codigo: '428', nome: 'Depreciações acumuladas — propriedades investimento', familia: 'Investimentos', tipo: 'ativo' },
  { codigo: '429', nome: 'Perdas por imparidade acumuladas — propriedades', familia: 'Investimentos', tipo: 'ativo' },
  { codigo: '43', nome: 'Ativos fixos tangíveis', familia: 'Ativos fixos tangíveis', tipo: 'ativo' },
  { codigo: '431', nome: 'Terrenos e recursos naturais', familia: 'Ativos fixos tangíveis', tipo: 'ativo' },
  { codigo: '432', nome: 'Ativos fixos — Edifícios e outras construções', familia: 'Ativos fixos tangíveis', tipo: 'ativo' },
  { codigo: '433', nome: 'Ativos fixos — Equipamento básico', familia: 'Ativos fixos tangíveis', tipo: 'ativo' },
  { codigo: '434', nome: 'Ativos fixos — Equipamento de transporte', familia: 'Ativos fixos tangíveis', tipo: 'ativo' },
  { codigo: '435', nome: 'Ativos fixos — Equipamento administrativo', familia: 'Ativos fixos tangíveis', tipo: 'ativo' },
  { codigo: '436', nome: 'Equipamento biológico', familia: 'Ativos fixos tangíveis', tipo: 'ativo' },
  { codigo: '437', nome: 'Outros ativos fixos tangíveis', familia: 'Ativos fixos tangíveis', tipo: 'ativo' },
  { codigo: '438', nome: 'Depreciações acumuladas — ativos fixos tangíveis', familia: 'Ativos fixos tangíveis', tipo: 'ativo' },
  { codigo: '439', nome: 'Perdas por imparidade acumuladas — ativos fixos', familia: 'Ativos fixos tangíveis', tipo: 'ativo' },
  { codigo: '44', nome: 'Ativos intangíveis', familia: 'Ativos intangíveis', tipo: 'ativo' },
  { codigo: '441', nome: 'Goodwill', familia: 'Ativos intangíveis', tipo: 'ativo' },
  { codigo: '442', nome: 'Projetos de desenvolvimento', familia: 'Ativos intangíveis', tipo: 'ativo' },
  { codigo: '443', nome: 'Programas de computador', familia: 'Ativos intangíveis', tipo: 'ativo' },
  { codigo: '444', nome: 'Propriedade industrial', familia: 'Ativos intangíveis', tipo: 'ativo' },
  { codigo: '446', nome: 'Outros ativos intangíveis', familia: 'Ativos intangíveis', tipo: 'ativo' },
  { codigo: '448', nome: 'Amortizações acumuladas — ativos intangíveis', familia: 'Ativos intangíveis', tipo: 'ativo' },
  { codigo: '449', nome: 'Perdas por imparidade acumuladas — intangíveis', familia: 'Ativos intangíveis', tipo: 'ativo' },
  { codigo: '45', nome: 'Investimentos em curso', familia: 'Investimentos', tipo: 'ativo' },
  { codigo: '451', nome: 'Investimentos financeiros em curso', familia: 'Investimentos', tipo: 'ativo' },
  { codigo: '452', nome: 'Propriedades de investimento em curso', familia: 'Investimentos', tipo: 'ativo' },
  { codigo: '453', nome: 'Ativos fixos tangíveis em curso', familia: 'Investimentos', tipo: 'ativo' },
  { codigo: '454', nome: 'Ativos intangíveis em curso', familia: 'Investimentos', tipo: 'ativo' },
  { codigo: '455', nome: 'Adiantamentos por conta de investimentos', familia: 'Investimentos', tipo: 'ativo' },
  { codigo: '46', nome: 'Ativos não correntes detidos para venda', familia: 'Investimentos', tipo: 'ativo' },

  // ═══════ CLASSE 5 — Capital, reservas e resultados transitados ═══════
  { codigo: '51', nome: 'Fundos', familia: 'Capital e reservas', tipo: 'capital' },
  { codigo: '511', nome: 'Fundo patrimonial', familia: 'Capital e reservas', tipo: 'capital' },
  { codigo: '512', nome: 'Fundo patrimonial — Outros', familia: 'Capital e reservas', tipo: 'capital' },
  { codigo: '52', nome: 'Ações (quotas) próprias', familia: 'Capital e reservas', tipo: 'capital' },
  { codigo: '53', nome: 'Outros instrumentos de capital próprio', familia: 'Capital e reservas', tipo: 'capital' },
  { codigo: '54', nome: 'Prémios de emissão', familia: 'Capital e reservas', tipo: 'capital' },
  { codigo: '55', nome: 'Reservas', familia: 'Capital e reservas', tipo: 'capital' },
  { codigo: '551', nome: 'Reservas legais', familia: 'Capital e reservas', tipo: 'capital' },
  { codigo: '552', nome: 'Outras reservas', familia: 'Capital e reservas', tipo: 'capital' },
  { codigo: '56', nome: 'Resultados transitados', familia: 'Capital e reservas', tipo: 'capital' },
  { codigo: '57', nome: 'Ajustamentos em ativos financeiros', familia: 'Capital e reservas', tipo: 'capital' },
  { codigo: '58', nome: 'Excedentes de revalorização', familia: 'Capital e reservas', tipo: 'capital' },
  { codigo: '581', nome: 'Excedentes de reavaliação — ativos fixos tangíveis', familia: 'Capital e reservas', tipo: 'capital' },
  { codigo: '589', nome: 'Outros excedentes de revalorização', familia: 'Capital e reservas', tipo: 'capital' },
  { codigo: '59', nome: 'Subsídios ao investimento (diferido)', familia: 'Capital e reservas', tipo: 'passivo', naturezaInvestimento: true },

  // ═══════ CLASSE 6 — Gastos ═══════
  // 61 — Custo das mercadorias vendidas e matérias consumidas
  { codigo: '61', nome: 'Custo das mercadorias vendidas e das matérias consumidas', familia: 'Custo das mercadorias', tipo: 'gasto' },
  { codigo: '611', nome: 'Mercadorias', familia: 'Custo das mercadorias', tipo: 'gasto' },
  { codigo: '612', nome: 'Custo das mercadorias vendidas', familia: 'Custo das mercadorias', tipo: 'gasto' },
  { codigo: '613', nome: 'Matérias-primas', familia: 'Custo das mercadorias', tipo: 'gasto' },
  { codigo: '614', nome: 'Matérias subsidiárias', familia: 'Custo das mercadorias', tipo: 'gasto' },
  { codigo: '615', nome: 'Materiais diversos', familia: 'Custo das mercadorias', tipo: 'gasto' },

  // 62 — Fornecimentos e serviços externos
  { codigo: '62', nome: 'Fornecimentos e serviços externos', familia: 'Fornecimentos e serviços externos', tipo: 'gasto' },
  { codigo: '621', nome: 'Subcontratos', familia: 'Fornecimentos e serviços externos', tipo: 'gasto' },
  { codigo: '622', nome: 'Fornecimentos — Trabalhos especializados', familia: 'Fornecimentos e serviços externos', tipo: 'gasto' },
  { codigo: '6221', nome: 'Trabalhos especializados', familia: 'Fornecimentos e serviços externos', tipo: 'gasto' },
  { codigo: '6222', nome: 'Publicidade e propaganda', familia: 'Fornecimentos e serviços externos', tipo: 'gasto' },
  { codigo: '6223', nome: 'Vigilância e segurança', familia: 'Fornecimentos e serviços externos', tipo: 'gasto' },
  { codigo: '6224', nome: 'Honorários', familia: 'Fornecimentos e serviços externos', tipo: 'gasto' },
  { codigo: '6225', nome: 'Comissões', familia: 'Fornecimentos e serviços externos', tipo: 'gasto' },
  { codigo: '6226', nome: 'Conservação e reparação', familia: 'Fornecimentos e serviços externos', tipo: 'gasto' },
  { codigo: '6228', nome: 'Outros trabalhos especializados', familia: 'Fornecimentos e serviços externos', tipo: 'gasto' },
  { codigo: '623', nome: 'Materiais', familia: 'Fornecimentos e serviços externos', tipo: 'gasto' },
  { codigo: '6231', nome: 'Ferramentas e utensílios de desgaste rápido', familia: 'Fornecimentos e serviços externos', tipo: 'gasto' },
  { codigo: '6232', nome: 'Livros e documentação técnica', familia: 'Fornecimentos e serviços externos', tipo: 'gasto' },
  { codigo: '6233', nome: 'Material de escritório', familia: 'Fornecimentos e serviços externos', tipo: 'gasto' },
  { codigo: '6238', nome: 'Outros materiais', familia: 'Fornecimentos e serviços externos', tipo: 'gasto' },
  { codigo: '624', nome: 'Energia e fluidos', familia: 'Fornecimentos e serviços externos', tipo: 'gasto' },
  { codigo: '6241', nome: 'Eletricidade', familia: 'Fornecimentos e serviços externos', tipo: 'gasto' },
  { codigo: '6242', nome: 'Combustíveis', familia: 'Fornecimentos e serviços externos', tipo: 'gasto' },
  { codigo: '6243', nome: 'Água', familia: 'Fornecimentos e serviços externos', tipo: 'gasto' },
  { codigo: '6248', nome: 'Outros (gás, etc.)', familia: 'Fornecimentos e serviços externos', tipo: 'gasto' },
  { codigo: '625', nome: 'Deslocações, estadas e transportes', familia: 'Fornecimentos e serviços externos', tipo: 'gasto' },
  { codigo: '6251', nome: 'Deslocações, estadas e combustíveis', familia: 'Fornecimentos e serviços externos', tipo: 'gasto' },
  { codigo: '6252', nome: 'Transportes de pessoal', familia: 'Fornecimentos e serviços externos', tipo: 'gasto' },
  { codigo: '6253', nome: 'Comunicações', familia: 'Fornecimentos e serviços externos', tipo: 'gasto' },
  { codigo: '6258', nome: 'Outros (transportes de mercadorias, etc.)', familia: 'Fornecimentos e serviços externos', tipo: 'gasto' },
  { codigo: '626', nome: 'Serviços diversos', familia: 'Fornecimentos e serviços externos', tipo: 'gasto' },
  { codigo: '6261', nome: 'Rendas e alugueres', familia: 'Fornecimentos e serviços externos', tipo: 'gasto' },
  { codigo: '6262', nome: 'Outros fornecimentos — Material de escritório e consumíveis', familia: 'Fornecimentos e serviços externos', tipo: 'gasto' },
  { codigo: '6263', nome: 'Seguros', familia: 'Fornecimentos e serviços externos', tipo: 'gasto' },
  { codigo: '6264', nome: 'Royalties', familia: 'Fornecimentos e serviços externos', tipo: 'gasto' },
  { codigo: '6265', nome: 'Contencioso e notariado', familia: 'Fornecimentos e serviços externos', tipo: 'gasto' },
  { codigo: '6266', nome: 'Decoração e consumíveis de evento', familia: 'Fornecimentos e serviços externos', tipo: 'gasto' },
  { codigo: '6267', nome: 'Limpeza, higiene e conforto', familia: 'Fornecimentos e serviços externos', tipo: 'gasto' },
  { codigo: '6268', nome: 'Outros serviços', familia: 'Fornecimentos e serviços externos', tipo: 'gasto' },

  // 63 — Gastos com o pessoal
  { codigo: '63', nome: 'Gastos com o pessoal', familia: 'Gastos com pessoal', tipo: 'gasto' },
  { codigo: '631', nome: 'Gastos com pessoal — Bolsas', familia: 'Gastos com pessoal', tipo: 'gasto' },
  { codigo: '632', nome: 'Remunerações do pessoal', familia: 'Gastos com pessoal', tipo: 'gasto' },
  { codigo: '6321', nome: 'Órgãos sociais', familia: 'Gastos com pessoal', tipo: 'gasto' },
  { codigo: '6322', nome: 'Pessoal', familia: 'Gastos com pessoal', tipo: 'gasto' },
  { codigo: '634', nome: 'Indemnizações', familia: 'Gastos com pessoal', tipo: 'gasto' },
  { codigo: '635', nome: 'Encargos sobre remunerações', familia: 'Gastos com pessoal', tipo: 'gasto' },
  { codigo: '636', nome: 'Seguros de acidentes de trabalho e doenças profissionais', familia: 'Gastos com pessoal', tipo: 'gasto' },
  { codigo: '637', nome: 'Gastos de ação social', familia: 'Gastos com pessoal', tipo: 'gasto' },
  { codigo: '638', nome: 'Outros gastos com o pessoal', familia: 'Gastos com pessoal', tipo: 'gasto' },
  { codigo: '6381', nome: 'Formação', familia: 'Gastos com pessoal', tipo: 'gasto' },
  { codigo: '6388', nome: 'Gastos com pessoal — Bolsas/ressarcimentos a voluntários', familia: 'Gastos com pessoal', tipo: 'gasto' },

  // 64 — Gastos de depreciação e amortização
  { codigo: '64', nome: 'Gastos de depreciação e de amortização', familia: 'Depreciações e amortizações', tipo: 'gasto' },
  { codigo: '641', nome: 'Propriedades de investimento', familia: 'Depreciações e amortizações', tipo: 'gasto' },
  { codigo: '642', nome: 'Ativos fixos tangíveis', familia: 'Depreciações e amortizações', tipo: 'gasto' },
  { codigo: '643', nome: 'Ativos intangíveis', familia: 'Depreciações e amortizações', tipo: 'gasto' },

  // 65 — Perdas por imparidade
  { codigo: '65', nome: 'Perdas por imparidade', familia: 'Imparidades e provisões', tipo: 'gasto' },
  { codigo: '651', nome: 'Em dívidas a receber', familia: 'Imparidades e provisões', tipo: 'gasto' },
  { codigo: '652', nome: 'Em inventários', familia: 'Imparidades e provisões', tipo: 'gasto' },
  { codigo: '653', nome: 'Em investimentos financeiros', familia: 'Imparidades e provisões', tipo: 'gasto' },
  { codigo: '654', nome: 'Em propriedades de investimento', familia: 'Imparidades e provisões', tipo: 'gasto' },
  { codigo: '655', nome: 'Em ativos fixos tangíveis', familia: 'Imparidades e provisões', tipo: 'gasto' },
  { codigo: '656', nome: 'Em ativos intangíveis', familia: 'Imparidades e provisões', tipo: 'gasto' },

  // 66 — Perdas por reduções de justo valor
  { codigo: '66', nome: 'Perdas por reduções de justo valor', familia: 'Justo valor', tipo: 'gasto' },
  { codigo: '661', nome: 'Em instrumentos financeiros', familia: 'Justo valor', tipo: 'gasto' },
  { codigo: '662', nome: 'Em propriedades de investimento', familia: 'Justo valor', tipo: 'gasto' },
  { codigo: '663', nome: 'Em ativos biológicos', familia: 'Justo valor', tipo: 'gasto' },

  // 67 — Provisões do período
  { codigo: '67', nome: 'Provisões do período', familia: 'Imparidades e provisões', tipo: 'gasto' },
  { codigo: '671', nome: 'Impostos', familia: 'Imparidades e provisões', tipo: 'gasto' },
  { codigo: '672', nome: 'Garantias a clientes', familia: 'Imparidades e provisões', tipo: 'gasto' },
  { codigo: '673', nome: 'Processos judiciais em curso', familia: 'Imparidades e provisões', tipo: 'gasto' },
  { codigo: '674', nome: 'Acidentes de trabalho e doenças profissionais', familia: 'Imparidades e provisões', tipo: 'gasto' },
  { codigo: '678', nome: 'Outras provisões', familia: 'Imparidades e provisões', tipo: 'gasto' },

  // 68 — Outros gastos
  { codigo: '68', nome: 'Outros gastos', familia: 'Outros gastos e perdas', tipo: 'gasto' },
  { codigo: '681', nome: 'Impostos — Outros gastos', familia: 'Outros gastos e perdas', tipo: 'gasto' },
  { codigo: '6811', nome: 'Impostos diretos', familia: 'Outros gastos e perdas', tipo: 'gasto' },
  { codigo: '6812', nome: 'Impostos Indiretos', familia: 'Outros gastos e perdas', tipo: 'gasto' },
  { codigo: '6813', nome: 'Taxas', familia: 'Outros gastos e perdas', tipo: 'gasto' },
  { codigo: '682', nome: 'Descontos de pronto pagamento concedidos', familia: 'Outros gastos e perdas', tipo: 'gasto' },
  { codigo: '683', nome: 'Dívidas incobráveis', familia: 'Outros gastos e perdas', tipo: 'gasto' },
  { codigo: '684', nome: 'Perdas em inventários', familia: 'Outros gastos e perdas', tipo: 'gasto' },
  { codigo: '685', nome: 'Gastos e perdas em subsidiárias, associadas e empreendimentos conjuntos', familia: 'Outros gastos e perdas', tipo: 'gasto' },
  { codigo: '686', nome: 'Gastos e perdas nos restantes investimentos financeiros', familia: 'Outros gastos e perdas', tipo: 'gasto' },
  { codigo: '687', nome: 'Gastos e perdas em investimentos não financeiros', familia: 'Outros gastos e perdas', tipo: 'gasto' },
  { codigo: '6871', nome: 'Alienações — ativos fixos tangíveis', familia: 'Outros gastos e perdas', tipo: 'gasto' },
  { codigo: '6872', nome: 'Alienações — ativos intangíveis', familia: 'Outros gastos e perdas', tipo: 'gasto' },
  { codigo: '6873', nome: 'Alienações — propriedades de investimento', familia: 'Outros gastos e perdas', tipo: 'gasto' },
  { codigo: '6874', nome: 'Sinistros', familia: 'Outros gastos e perdas', tipo: 'gasto' },
  { codigo: '6878', nome: 'Outras (investimentos não financeiros)', familia: 'Outros gastos e perdas', tipo: 'gasto' },
  { codigo: '688', nome: 'Outros — Depreciações do exercício', familia: 'Outros gastos e perdas', tipo: 'gasto' },
  { codigo: '6881', nome: 'Correções relativas a períodos anteriores', familia: 'Outros gastos e perdas', tipo: 'gasto' },
  { codigo: '6882', nome: 'Donativos concedidos', familia: 'Outros gastos e perdas', tipo: 'gasto' },
  { codigo: '6883', nome: 'Quotizações', familia: 'Outros gastos e perdas', tipo: 'gasto' },
  { codigo: '6884', nome: 'Ofertas e amostras de inventários', familia: 'Outros gastos e perdas', tipo: 'gasto' },
  { codigo: '6885', nome: 'Insuficiência da estimativa para impostos', familia: 'Outros gastos e perdas', tipo: 'gasto' },
  { codigo: '6886', nome: 'Perdas em instrumentos financeiros', familia: 'Outros gastos e perdas', tipo: 'gasto' },
  { codigo: '6888', nome: 'Outros não especificados', familia: 'Outros gastos e perdas', tipo: 'gasto' },

  // 69 — Gastos e perdas de financiamento
  { codigo: '69', nome: 'Gastos e perdas de financiamento', familia: 'Gastos financeiros', tipo: 'gasto' },
  { codigo: '691', nome: 'Juros suportados', familia: 'Gastos financeiros', tipo: 'gasto' },
  { codigo: '6911', nome: 'Juros de financiamentos obtidos', familia: 'Gastos financeiros', tipo: 'gasto' },
  { codigo: '6918', nome: 'Outros juros', familia: 'Gastos financeiros', tipo: 'gasto' },
  { codigo: '692', nome: 'Diferenças de câmbio desfavoráveis', familia: 'Gastos financeiros', tipo: 'gasto' },
  { codigo: '698', nome: 'Outros gastos e perdas de financiamento', familia: 'Gastos financeiros', tipo: 'gasto' },

  // ═══════ CLASSE 7 — Rendimentos ═══════
  // 71 — Vendas
  { codigo: '71', nome: 'Vendas', familia: 'Vendas e prestações de serviços', tipo: 'proveito' },
  { codigo: '711', nome: 'Mercadorias', familia: 'Vendas e prestações de serviços', tipo: 'proveito' },
  { codigo: '712', nome: 'Produtos acabados e intermédios', familia: 'Vendas e prestações de serviços', tipo: 'proveito' },
  { codigo: '713', nome: 'Subprodutos, desperdícios, resíduos e refugos', familia: 'Vendas e prestações de serviços', tipo: 'proveito' },
  { codigo: '716', nome: 'IVA dos regimes de IVA especiais', familia: 'Vendas e prestações de serviços', tipo: 'proveito' },
  { codigo: '717', nome: 'Devoluções de vendas', familia: 'Vendas e prestações de serviços', tipo: 'proveito' },
  { codigo: '718', nome: 'Descontos e abatimentos em vendas', familia: 'Vendas e prestações de serviços', tipo: 'proveito' },

  // 72 — Prestações de serviços
  { codigo: '72', nome: 'Prestações de serviços', familia: 'Vendas e prestações de serviços', tipo: 'proveito' },
  { codigo: '721', nome: 'Serviço A', familia: 'Vendas e prestações de serviços', tipo: 'proveito' },
  { codigo: '728', nome: 'Descontos e abatimentos em prestações de serviços', familia: 'Vendas e prestações de serviços', tipo: 'proveito' },

  // 73 — Variações nos inventários da produção
  { codigo: '73', nome: 'Variações nos inventários da produção', familia: 'Variação de produção', tipo: 'proveito' },
  { codigo: '731', nome: 'Produtos acabados e intermédios', familia: 'Variação de produção', tipo: 'proveito' },
  { codigo: '732', nome: 'Subprodutos, desperdícios, resíduos e refugos', familia: 'Variação de produção', tipo: 'proveito' },
  { codigo: '733', nome: 'Produtos e trabalhos em curso', familia: 'Variação de produção', tipo: 'proveito' },
  { codigo: '734', nome: 'Ativos biológicos', familia: 'Variação de produção', tipo: 'proveito' },

  // 74 — Trabalhos para a própria entidade
  { codigo: '74', nome: 'Trabalhos para a própria entidade', familia: 'Trabalhos para a própria entidade', tipo: 'proveito' },
  { codigo: '741', nome: 'Ativos fixos tangíveis', familia: 'Trabalhos para a própria entidade', tipo: 'proveito' },
  { codigo: '742', nome: 'Ativos intangíveis', familia: 'Trabalhos para a própria entidade', tipo: 'proveito' },
  { codigo: '743', nome: 'Propriedades de investimento', familia: 'Trabalhos para a própria entidade', tipo: 'proveito' },

  // 75 — Subsídios, doações e legados à exploração
  { codigo: '75', nome: 'Subsídios à exploração', familia: 'Subsídios e doações', tipo: 'proveito' },
  { codigo: '751', nome: 'Subsídios do Estado e outros entes públicos', familia: 'Subsídios e doações', tipo: 'proveito' },
  { codigo: '752', nome: 'Subsídios de outras entidades', familia: 'Subsídios e doações', tipo: 'proveito' },
  { codigo: '753', nome: 'Doações', familia: 'Subsídios e doações', tipo: 'proveito' },
  { codigo: '754', nome: 'Legados', familia: 'Subsídios e doações', tipo: 'proveito' },
  { codigo: '755', nome: 'Quotizações', familia: 'Subsídios e doações', tipo: 'proveito' },
  { codigo: '756', nome: 'Heranças', familia: 'Subsídios e doações', tipo: 'proveito' },

  // 76 — Reversões
  { codigo: '76', nome: 'Reversões', familia: 'Reversões', tipo: 'proveito' },
  { codigo: '761', nome: 'De depreciações e amortizações', familia: 'Reversões', tipo: 'proveito' },
  { codigo: '762', nome: 'De perdas por imparidade', familia: 'Reversões', tipo: 'proveito' },
  { codigo: '763', nome: 'De provisões', familia: 'Reversões', tipo: 'proveito' },

  // 77 — Ganhos por aumentos de justo valor
  { codigo: '77', nome: 'Ganhos por aumentos de justo valor', familia: 'Justo valor', tipo: 'proveito' },
  { codigo: '771', nome: 'Em instrumentos financeiros', familia: 'Justo valor', tipo: 'proveito' },
  { codigo: '772', nome: 'Em propriedades de investimento', familia: 'Justo valor', tipo: 'proveito' },
  { codigo: '773', nome: 'Em ativos biológicos', familia: 'Justo valor', tipo: 'proveito' },

  // 78 — Outros rendimentos
  { codigo: '78', nome: 'Outros rendimentos', familia: 'Outros rendimentos e ganhos', tipo: 'proveito' },
  { codigo: '781', nome: 'Rendimentos suplementares', familia: 'Outros rendimentos e ganhos', tipo: 'proveito' },
  { codigo: '7811', nome: 'Serviços sociais', familia: 'Outros rendimentos e ganhos', tipo: 'proveito' },
  { codigo: '7812', nome: 'Aluguer de equipamento', familia: 'Outros rendimentos e ganhos', tipo: 'proveito' },
  { codigo: '7813', nome: 'Estudos, projetos e assistência tecnológica', familia: 'Outros rendimentos e ganhos', tipo: 'proveito' },
  { codigo: '7818', nome: 'Outros rendimentos suplementares', familia: 'Outros rendimentos e ganhos', tipo: 'proveito' },
  { codigo: '782', nome: 'Descontos de pronto pagamento obtidos', familia: 'Outros rendimentos e ganhos', tipo: 'proveito' },
  { codigo: '783', nome: 'Recuperação de dívidas a receber', familia: 'Outros rendimentos e ganhos', tipo: 'proveito' },
  { codigo: '784', nome: 'Ganhos em inventários', familia: 'Outros rendimentos e ganhos', tipo: 'proveito' },
  { codigo: '785', nome: 'Rendimentos em subsidiárias, associadas e empreendimentos conjuntos', familia: 'Outros rendimentos e ganhos', tipo: 'proveito' },
  { codigo: '786', nome: 'Rendimentos nos restantes investimentos financeiros', familia: 'Outros rendimentos e ganhos', tipo: 'proveito' },
  { codigo: '787', nome: 'Rendimentos e ganhos em investimentos não financeiros', familia: 'Outros rendimentos e ganhos', tipo: 'proveito' },
  { codigo: '7871', nome: 'Alienações — ativos fixos tangíveis', familia: 'Outros rendimentos e ganhos', tipo: 'proveito' },
  { codigo: '7872', nome: 'Alienações — ativos intangíveis', familia: 'Outros rendimentos e ganhos', tipo: 'proveito' },
  { codigo: '7873', nome: 'Alienações — propriedades de investimento', familia: 'Outros rendimentos e ganhos', tipo: 'proveito' },
  { codigo: '7874', nome: 'Sinistros', familia: 'Outros rendimentos e ganhos', tipo: 'proveito' },
  { codigo: '7878', nome: 'Outras (investimentos não financeiros)', familia: 'Outros rendimentos e ganhos', tipo: 'proveito' },
  { codigo: '788', nome: 'Outros', familia: 'Outros rendimentos e ganhos', tipo: 'proveito' },
  { codigo: '7881', nome: 'Correções relativas a períodos anteriores', familia: 'Outros rendimentos e ganhos', tipo: 'proveito' },
  { codigo: '7882', nome: 'Excesso da estimativa para impostos', familia: 'Outros rendimentos e ganhos', tipo: 'proveito' },
  { codigo: '7883', nome: 'Imputação do subsídio ao investimento', familia: 'Outros rendimentos e ganhos', tipo: 'proveito', naturezaInvestimento: true },
  { codigo: '7884', nome: 'Ganhos em instrumentos financeiros', familia: 'Outros rendimentos e ganhos', tipo: 'proveito' },
  { codigo: '7888', nome: 'Outros não especificados', familia: 'Outros rendimentos e ganhos', tipo: 'proveito' },

  // 79 — Rendimentos e ganhos de financiamento
  { codigo: '79', nome: 'Juros, dividendos e outros rendimentos similares', familia: 'Rendimentos financeiros', tipo: 'proveito' },
  { codigo: '791', nome: 'Juros obtidos', familia: 'Rendimentos financeiros', tipo: 'proveito' },
  { codigo: '7911', nome: 'Juros de depósitos', familia: 'Rendimentos financeiros', tipo: 'proveito' },
  { codigo: '7912', nome: 'Juros de outras aplicações de meios financeiros líquidos', familia: 'Rendimentos financeiros', tipo: 'proveito' },
  { codigo: '7918', nome: 'Outros juros', familia: 'Rendimentos financeiros', tipo: 'proveito' },
  { codigo: '792', nome: 'Dividendos obtidos', familia: 'Rendimentos financeiros', tipo: 'proveito' },
  { codigo: '793', nome: 'Diferenças de câmbio favoráveis', familia: 'Rendimentos financeiros', tipo: 'proveito' },
  { codigo: '798', nome: 'Outros rendimentos e ganhos financeiros', familia: 'Rendimentos financeiros', tipo: 'proveito' },

  // ═══════ CLASSE 8 — Resultados ═══════
  { codigo: '81', nome: 'Resultado líquido do período', familia: 'Resultados', tipo: 'capital' },
  { codigo: '811', nome: 'Resultado antes de impostos', familia: 'Resultados', tipo: 'capital' },
  { codigo: '812', nome: 'Imposto sobre o rendimento do período', familia: 'Resultados', tipo: 'capital' },
  { codigo: '818', nome: 'Resultado líquido', familia: 'Resultados', tipo: 'capital' },
];

async function main() {
  const connStr = process.env.DIRECT_URL || process.env.DATABASE_URL;
  const pool = new Pool({ connectionString: connStr });

  let created = 0;
  let updated = 0;

  for (const c of contas) {
    const result = await pool.query(`
      INSERT INTO contas_snc (codigo, nome, familia, tipo, "naturezaInvestimento", "ativaPorOmissao", "createdAt", "updatedAt")
      VALUES ($1, $2, $3, $4, $5, true, NOW(), NOW())
      ON CONFLICT (codigo) DO UPDATE SET
        nome = EXCLUDED.nome,
        familia = EXCLUDED.familia,
        tipo = EXCLUDED.tipo,
        "naturezaInvestimento" = EXCLUDED."naturezaInvestimento"
      RETURNING (xmax = 0) AS inserted
    `, [c.codigo, c.nome, c.familia, c.tipo, c.naturezaInvestimento || false]);

    if (result.rows[0]?.inserted) created++;
    else updated++;
  }

  const countResult = await pool.query('SELECT COUNT(*) FROM contas_snc');
  const total = countResult.rows[0].count;

  console.log(`Seed SNC completo: ${created} criadas, ${updated} atualizadas. Total no BD: ${total}`);

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
