// Modelos partilhados com o backend (subset do Prisma schema).

export type Role = 'admin' | 'direcao' | 'fiscal';

export interface ContaSNC {
  id: number;
  codigo: string;
  nome: string;
  familia: string;
  tipo: 'proveito' | 'gasto' | 'ativo' | 'passivo' | 'capital';
  pergunta?: string | null;
  naturezaInvestimento: boolean;
  ativaPorOmissao: boolean;
  notas?: string | null;
}

export interface Entidade {
  id: number;
  nome: string;
  nif?: string | null;
  tipos: string[];
  email?: string | null;
  telefone?: string | null;
  morada?: string | null;
  iban?: string | null;
  niss?: string | null;
  tipoVinculo?: string | null;
  funcao?: string | null;
  bolsaBase?: number | null;
  dataNascimento?: string | null;
  ativo: boolean;
  verificado: boolean;
  notas?: string | null;
}

export interface Receita {
  id: number;
  titulo: string;
  valor: number | string;
  data: string;
  categoria: string;
  estado: string;
  financiador?: string | null;
  observacoes?: string | null;
  contaSncId?: number | null;
  entidadeId?: number | null;
  contaSnc?: ContaSNC | null;
  entidade?: Entidade | null;
  anexo?: any;
  receitaEventos?: Array<{ eventoId: number; valor: number; evento?: { id: number; nome: string } }>;
}

export interface Fatura {
  id: number;
  titulo: string;
  valor: number | string;
  data: string;
  departamento: string;
  tipo: string;
  numero?: string | null;
  estado: string;
  fornecedor?: string | null;
  fornecedorNif?: string | null;
  dataVencimento?: string | null;
  descricao?: string | null;
  contaSncId?: number | null;
  entidadeId?: number | null;
  contaSnc?: ContaSNC | null;
  entidade?: Entidade | null;
  anexo?: any;
  /** Comprovativo de pagamento (transferência, Multibanco, recibo). */
  comprovativo?: any;
  faturaEventos?: Array<{ eventoId: number; valor: number; evento?: { id: number; nome: string } }>;
}

export interface Processo {
  id: number;
  nome: string;
  tipo: 'Evento' | 'Projeto Anual' | 'Investimento' | 'Subsídio';
  descricao?: string | null;
  data_inicio?: string | null;
  data_fim?: string | null;
  departamento?: string | null;
  estado: string;
  entidadeFinanciadoraId?: number | null;
  numeroProcesso?: string | null;
  valorAprovado?: number | null;
  contaSncReceitaId?: number | null;
  contaSncDespesaId?: number | null;
}

export interface Documento {
  id: number;
  tipo: string;
  descricao?: string | null;
  processoId?: number | null;
  entidadeId?: number | null;
  estado: string;
  dataLimite?: string | null;
  dataConclusao?: string | null;
  anexo?: any;
  notas?: string | null;
  processo?: { id: number; nome: string; tipo: string } | null;
  entidade?: { id: number; nome: string } | null;
  _dias?: number | null;
  _severidade?: 'ok' | 'aviso' | 'critico' | 'vencido';
}

export interface Movimento {
  id: number;
  tipo: string;
  conta: string;
  valor: number | string;
  data: string;
  descricao?: string | null;
  referencia?: string | null;
  faturaId?: number | null;
  receitaId?: number | null;
}
