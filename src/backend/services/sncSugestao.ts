/**
 * Sugestão de conta SNC por IA (Gemini).
 *
 * Dado o título, fornecedor/entidade, valor e opcionalmente o anexo, pede ao
 * Gemini a conta SNC mais provável do plano YL + nível de confiança + motivo.
 *
 * O prompt inclui o catálogo completo de contas ativas (código, nome, pergunta
 * de decisão) para o modelo escolher dentro do universo YL — não "do SNC geral".
 */

import { prisma } from '../config/prisma';

const GEMINI_MODEL = 'gemini-flash-latest';

export type TipoRegisto = 'fatura' | 'receita';

export interface SugestaoSNC {
  codigo: string | null;
  confianca: number; // 0..1
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

/**
 * Chama o Gemini com um prompt que inclui o plano de contas ativo.
 * Faz 1 retry quando o modelo devolve 503 (overloaded).
 * Lança `SugestaoSncError` com motivo preciso — chamador decide o que mostrar.
 */
export async function sugerirSncParaRegisto(reg: InputRegisto, _attempt = 0): Promise<SugestaoSNC | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('[SNC-IA] GEMINI_API_KEY não definida');
    throw new SugestaoSncError('IA não configurada (falta GEMINI_API_KEY)', 'no-key');
  }

  // Carregar o plano SNC relevante (gasto p/ despesas, proveito+passivo p/ receitas)
  const tiposRelevantes = reg.tipo === 'fatura'
    ? ['gasto', 'ativo']
    : ['proveito', 'passivo'];
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

  const prompt = `És um contabilista da associação Young-Link (ONG, Castro Marim, isenta de IVA pelo art.º 9.º CIVA).
Classifica o registo abaixo numa conta SNC do plano YL. Responde APENAS JSON válido.

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
- Papel, canetas, consumíveis genéricos de escritório → 6262.

Devolve este JSON:
{
  "codigo": "código escolhido (string exata de um dos códigos listados)",
  "confianca": 0.0 a 1.0 (quão certo estás),
  "motivo": "frase curta a explicar porquê (< 25 palavras)",
  "avisos": ["aviso1 se houver dúvida ou ambiguidade", "..."]
}`;

  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: 'OBJECT',
              properties: {
                codigo: { type: 'STRING', nullable: true },
                confianca: { type: 'NUMBER' },
                motivo: { type: 'STRING' },
                avisos: { type: 'ARRAY', items: { type: 'STRING' }, nullable: true },
              },
              required: ['codigo', 'confianca', 'motivo'],
            },
            temperature: 0.1,
          },
        }),
      },
    );
    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      console.error('[SNC-IA] HTTP', resp.status, body.slice(0, 200));
      // Retry 1x para erros transitórios do Gemini (sobrecarga)
      if ((resp.status === 503 || resp.status === 429 || resp.status >= 500) && _attempt < 1) {
        await new Promise(r => setTimeout(r, 800));
        return sugerirSncParaRegisto(reg, _attempt + 1);
      }
      if (resp.status === 503 || resp.status === 429) {
        throw new SugestaoSncError('Gemini sobrecarregado — tenta de novo em alguns segundos', 'overloaded');
      }
      if (resp.status === 400) {
        throw new SugestaoSncError('Pedido rejeitado pelo Gemini (conteúdo bloqueado?)', 'blocked');
      }
      throw new SugestaoSncError(`API Gemini HTTP ${resp.status}`, 'network');
    }
    const json: any = await resp.json();
    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new SugestaoSncError('Resposta vazia do Gemini', 'invalid');
    const parsed = JSON.parse(text) as SugestaoSNC;
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
