/**
 * Plano de contas SNC — Young-Link (ONG, isenta de IVA pelo art.º 9.º CIVA)
 *
 * Este ficheiro é a ÚNICA fonte de verdade do catálogo. O seed insere/atualiza
 * cada conta via `code` como chave natural, logo pode ser corrido várias vezes
 * sem duplicar.
 *
 * Decisões de desenho:
 *   - Agrupamos contas por "familia" para a UI (dropdown agrupado).
 *   - Cada conta tem `tipo` (proveito/gasto/ativo/passivo/capital) e, quando útil,
 *     uma `pergunta` que ajuda o utilizador comum a decidir — vem do Guia Prático.
 *   - Marcamos `naturezaInvestimento=true` as contas que exigem tratamento diferido
 *     (59 e 7883). Isso permite ao backend bloquear/avisar que não vão à 75.
 *   - `ativaPorOmissao=false` para contas que a YL ainda não usa mas podem usar
 *     (ex: IVA 243 se perder isenção, 76 quando introduzir quotas).
 */

export interface ContaSncSeed {
  codigo: string;             // ex: '75', '7883', '622', '43', '12'
  nome: string;               // nome oficial
  familia: string;            // agrupador na UI
  tipo: 'proveito' | 'gasto' | 'ativo' | 'passivo' | 'capital';
  pergunta?: string;          // ajuda "como sei que é esta?"
  naturezaInvestimento?: boolean;
  ativaPorOmissao: boolean;
  notas?: string;
}

export const PLANO_SNC_YL: ContaSncSeed[] = [

  // ─────────────────────────────────────────────────────────────────
  // PROVEITOS (entradas de dinheiro)
  // ─────────────────────────────────────────────────────────────────
  {
    codigo: '72',
    nome: 'Prestações de serviços',
    familia: 'Proveitos — Atividade',
    tipo: 'proveito',
    pergunta: 'Vendemos algo ou prestámos um serviço? (café, bar, inscrições em workshops pagos, prestação a terceiros)',
    ativaPorOmissao: true,
  },
  {
    codigo: '75',
    nome: 'Subsídios à exploração',
    familia: 'Proveitos — Apoios públicos e privados',
    tipo: 'proveito',
    pergunta: 'É dinheiro de IEFP/IPDJ/Câmara/Junta/Fundação/doador para gastar este ano em atividades correntes?',
    ativaPorOmissao: true,
    notas: 'Bolsa de estágio IEFP, IDA/PAJ/PAACJ IPDJ, apoios da Câmara a eventos, mecenato corrente.',
  },
  {
    codigo: '76',
    nome: 'Quotizações',
    familia: 'Proveitos — Atividade',
    tipo: 'proveito',
    pergunta: 'É uma quota de sócio da associação?',
    ativaPorOmissao: false,  // ligar quando começarem a cobrar quotas
  },
  {
    codigo: '7883',
    nome: 'Imputação do subsídio ao investimento',
    familia: 'Proveitos — Apoios públicos (investimento, diferido)',
    tipo: 'proveito',
    pergunta: 'Fatia anual de um subsídio de investimento (ex: PAI), transferida da 59 à medida que o ativo deprecia.',
    naturezaInvestimento: true,
    ativaPorOmissao: true,
    notas: 'Nunca registar aqui diretamente — gerado automaticamente a partir de uma receita em 59.',
  },

  // ─────────────────────────────────────────────────────────────────
  // GASTOS (saídas correntes)
  // ─────────────────────────────────────────────────────────────────
  {
    codigo: '612',
    nome: 'Custo das mercadorias vendidas',
    familia: 'Gastos — Operacionais',
    tipo: 'gasto',
    pergunta: 'Compra de produtos para venda direta no bar/evento (bebidas, snacks).',
    ativaPorOmissao: true,
  },
  {
    codigo: '622',
    nome: 'Fornecimentos — Trabalhos especializados',
    familia: 'Gastos — Fornecimentos e serviços externos',
    tipo: 'gasto',
    pergunta: 'Pagamento a prestador externo (animador, formador, DJ, consultor, notário, software SaaS).',
    ativaPorOmissao: true,
  },
  {
    codigo: '6251',
    nome: 'Deslocações, estadas e combustíveis',
    familia: 'Gastos — Fornecimentos e serviços externos',
    tipo: 'gasto',
    pergunta: 'Combustível, portagens, refeições em deslocação, alojamento fora da sede.',
    ativaPorOmissao: true,
  },
  {
    codigo: '6253',
    nome: 'Comunicações',
    familia: 'Gastos — Fornecimentos e serviços externos',
    tipo: 'gasto',
    pergunta: 'Telemóvel, internet, correio.',
    ativaPorOmissao: true,
  },
  {
    codigo: '6263',
    nome: 'Seguros',
    familia: 'Gastos — Fornecimentos e serviços externos',
    tipo: 'gasto',
    pergunta: 'Apólice de seguro (RC, acidentes de trabalho, viatura, estagiários).',
    ativaPorOmissao: true,
  },
  {
    codigo: '6262',
    nome: 'Outros fornecimentos — Material de escritório e consumíveis',
    familia: 'Gastos — Fornecimentos e serviços externos',
    tipo: 'gasto',
    pergunta: 'Papel, canetas, tintas, material de limpeza, sacos, pequeno material pontual.',
    ativaPorOmissao: true,
  },
  {
    codigo: '6266',
    nome: 'Decoração e consumíveis de evento',
    familia: 'Gastos — Fornecimentos e serviços externos',
    tipo: 'gasto',
    pergunta: 'Fatos, flores, decorações, pós holi, extintores de pó — material que se consome num evento.',
    ativaPorOmissao: true,
    notas: 'Específico para separar da 6262 (escritório). Pode ser desativado se não interessar.',
  },
  {
    codigo: '631',
    nome: 'Gastos com pessoal — Bolsas',
    familia: 'Gastos — Pessoal',
    tipo: 'gasto',
    pergunta: 'Pagamento mensal da bolsa a estagiário/CEI (NUNCA em numerário; comprovativo bancário obrigatório).',
    ativaPorOmissao: true,
  },
  {
    codigo: '6388',
    nome: 'Gastos com pessoal — Bolsas/ressarcimentos a voluntários',
    familia: 'Gastos — Pessoal',
    tipo: 'gasto',
    pergunta: 'Ressarcimento/bolsa paga a jovem voluntário (programa VJNF, Jovens pelo Ambiente, etc.). Sem vínculo laboral; comprovativo bancário obrigatório.',
    ativaPorOmissao: true,
    notas: 'Usar quando NÃO há vínculo de estágio/trabalho — apenas voluntariado.',
  },
  {
    codigo: '635',
    nome: 'Gastos com pessoal — Encargos sobre remunerações (TSU)',
    familia: 'Gastos — Pessoal',
    tipo: 'gasto',
    pergunta: 'Contribuição patronal à Segurança Social (quando aplicável a vínculos CEI/+Emprego).',
    ativaPorOmissao: false,
  },
  {
    codigo: '68',
    nome: 'Outros gastos — Depreciações do exercício',
    familia: 'Gastos — Depreciações',
    tipo: 'gasto',
    pergunta: 'Fatia anual de desgaste de um ativo (mobiliário, viatura, portátil).',
    ativaPorOmissao: true,
    notas: 'Gerada automaticamente pelo módulo de ativos.',
  },

  // ─────────────────────────────────────────────────────────────────
  // ATIVOS
  // ─────────────────────────────────────────────────────────────────
  {
    codigo: '433',
    nome: 'Ativos fixos — Equipamento básico',
    familia: 'Ativos fixos tangíveis',
    tipo: 'ativo',
    pergunta: 'Equipamento duradouro usado nas atividades (ex: insufláveis, equipamento desportivo).',
    ativaPorOmissao: true,
  },
  {
    codigo: '434',
    nome: 'Ativos fixos — Equipamento de transporte',
    familia: 'Ativos fixos tangíveis',
    tipo: 'ativo',
    pergunta: 'Viatura (carrinha, carro).',
    ativaPorOmissao: true,
  },
  {
    codigo: '435',
    nome: 'Ativos fixos — Equipamento administrativo',
    familia: 'Ativos fixos tangíveis',
    tipo: 'ativo',
    pergunta: 'Mobiliário de escritório/sede, portáteis, impressoras, equipamento de TI com vida útil > 1 ano.',
    ativaPorOmissao: true,
  },
  {
    codigo: '432',
    nome: 'Ativos fixos — Edifícios e outras construções',
    familia: 'Ativos fixos tangíveis',
    tipo: 'ativo',
    pergunta: 'Obras na sede, benfeitorias duradouras (PAI).',
    ativaPorOmissao: true,
  },
  {
    codigo: '11',
    nome: 'Caixa',
    familia: 'Meios financeiros',
    tipo: 'ativo',
    pergunta: 'Dinheiro em caixa física (deve ser quase 0 — tudo em banco).',
    ativaPorOmissao: true,
  },
  {
    codigo: '12',
    nome: 'Depósitos à ordem',
    familia: 'Meios financeiros',
    tipo: 'ativo',
    pergunta: 'Saldo em conta bancária.',
    ativaPorOmissao: true,
  },

  // ─────────────────────────────────────────────────────────────────
  // PASSIVOS
  // ─────────────────────────────────────────────────────────────────
  {
    codigo: '22',
    nome: 'Fornecedores — Contas a pagar',
    familia: 'Passivos correntes',
    tipo: 'passivo',
    pergunta: 'Fatura recebida mas ainda não paga (pendente).',
    ativaPorOmissao: true,
  },
  {
    codigo: '232',
    nome: 'Pessoal — Bolsas a pagar',
    familia: 'Passivos correntes',
    tipo: 'passivo',
    pergunta: 'Bolsa processada e ainda não transferida à pessoa.',
    ativaPorOmissao: true,
  },
  {
    codigo: '59',
    nome: 'Subsídios ao investimento (diferido)',
    familia: 'Capital próprio — Diferidos',
    tipo: 'passivo',
    pergunta: 'Subsídio recebido para construir/adquirir ativo que vai durar vários anos (ex: PAI). Entra aqui todo e é desdobrado ao longo dos anos para a 7883.',
    naturezaInvestimento: true,
    ativaPorOmissao: true,
  },
];

export const CONTAS_SNC_POR_CODIGO = Object.fromEntries(PLANO_SNC_YL.map(c => [c.codigo, c]));
