import { prisma } from '../config/prisma';
import { aiGenerate, extractJSON } from './aiProvider';

export type TipoRegisto = 'fatura' | 'receita';

export interface SugestaoSNC {
  codigo: string | null;
  confianca: number;
  motivo: string;
  avisos?: string[];
}

interface InputRegisto {
  tipo: TipoRegisto;
  titulo: string;
  valor: number;
  data: string | Date;
  fornecedor?: string | null;
  entidadeNome?: string | null;
  departamento?: string | null;
  numero?: string | null;
  descricao?: string | null;
}

export class SugestaoSncError extends Error {
  constructor(msg: string, public kind: 'no-key' | 'overloaded' | 'blocked' | 'invalid' | 'network') {
    super(msg);
  }
}

const GEMINI_SCHEMA = {
  type: 'OBJECT',
  properties: {
    codigo: { type: 'STRING', nullable: true },
    confianca: { type: 'NUMBER' },
    motivo: { type: 'STRING' },
    avisos: { type: 'ARRAY', items: { type: 'STRING' }, nullable: true },
  },
  required: ['codigo', 'confianca', 'motivo'],
};

export async function sugerirSncParaRegisto(reg: InputRegisto): Promise<SugestaoSNC | null> {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.GEMINI_API_KEY) {
    throw new SugestaoSncError('IA não configurada (falta ANTHROPIC_API_KEY ou GEMINI_API_KEY)', 'no-key');
  }

  const tiposRelevantes = reg.tipo === 'fatura' ? ['gasto', 'ativo'] : ['proveito', 'passivo'];
  const contas = await prisma.contaSNC.findMany({
    where: { tipo: { in: tiposRelevantes }, ativaPorOmissao: true },
    orderBy: [{ familia: 'asc' }, { codigo: 'asc' }],
    select: { codigo: true, nome: true, pergunta: true, familia: true, naturezaInvestimento: true },
  });

  const catalogo = contas.map(c =>
    `  ${c.codigo} — ${c.nome}${c.pergunta ? '  («' + c.pergunta + '»)' : ''}${c.naturezaInvestimento ? '  [INVESTIMENTO]' : ''}`
  ).join('\n');

  const kind = reg.tipo === 'fatura' ? 'DESPESA (saída de dinheiro)' : 'RECEITA (entrada de dinheiro)';
  const entidadeLbl = reg.tipo === 'fatura' ? 'Fornecedor' : 'Financiador';
  const entidade = reg.entidadeNome || reg.fornecedor || '(desconhecido)';

  const prompt = `Classifica o registo abaixo numa conta SNC do plano YL. Responde APENAS JSON válido com os campos: codigo (string), confianca (0..1), motivo (string), avisos (array de strings, opcional).

TIPO: ${kind}
Título: ${reg.titulo}
${entidadeLbl}: ${entidade}
Valor: ${reg.valor.toFixed(2)} €
Data: ${new Date(reg.data).toISOString().slice(0, 10)}
${reg.departamento ? `Departamento interno: ${reg.departamento}` : ''}
${reg.numero ? `Nº documento: ${reg.numero}` : ''}
${reg.descricao ? `Observações: ${reg.descricao}` : ''}

PLANO SNC YL (escolhe UM destes códigos exatos):
${catalogo}

REGRAS CRÍTICAS:
- "Ressarcimento VJNF" ou pagamento a jovem voluntário → sempre 6388 (não 622 nem 631).
- "Bolsa de estágio" a estagiário IEFP com contrato → 631.
- Subsídio PAI, obras na sede ou equipamento duradouro recebido do IPDJ → 59 (nunca 75).
- Prémio pontual recebido do IPDJ/IEFP → 75 (não "Outros").
- Compras de bebidas/snacks para vender no bar → 612 (não 6262).
- Portátil, mesa, mobiliário, equipamento com valor > 100 € e duração > 1 ano → 435 ou 433 (ativos fixos, não despesa consumível).
- Combustível, deslocação, refeições em serviço → 6251.
- Fatura Vodafone, telemóvel, internet, correio → 6253.
- Fatura Fidelidade ou outras apólices de seguro → 6263.
- Prestação de serviços de animador/formador/DJ (recibo verde) → 622.
- Papel, canetas, consumíveis genéricos de escritório → 6262.`;

  const systemPrompt = 'És um contabilista da associação Young-Link (ONG, Castro Marim, isenta de IVA pelo art.º 9.º CIVA).';

  try {
    const { text, provider } = await aiGenerate(
      { prompt, systemPrompt, temperature: 0.1 },
      GEMINI_SCHEMA,
    );
    if (!text) throw new SugestaoSncError('Nenhum provider IA disponível', 'network');

    console.log(`[SNC-IA] Resposta via ${provider}`);
    const parsed = JSON.parse(extractJSON(text)) as SugestaoSNC;

    if (parsed.codigo && !contas.find(c => c.codigo === parsed.codigo)) {
      parsed.avisos = [...(parsed.avisos || []), `código ${parsed.codigo} não existe no plano — ignorado`];
      parsed.codigo = null;
      parsed.confianca = 0;
    }
    return parsed;
  } catch (err: any) {
    if (err instanceof SugestaoSncError) throw err;
    console.error('[SNC-IA] erro', err.message || err);
    throw new SugestaoSncError(err.message || 'Erro na chamada à IA', 'network');
  }
}
