import { prisma } from '../config/prisma';

const GEMINI_MODEL = 'gemini-flash-latest';

const TIPOS_PROCESSO = ['Evento', 'Projeto Anual', 'Investimento', 'Subsídio'] as const;
type TipoProcesso = typeof TIPOS_PROCESSO[number];

export interface SugestaoTipo {
  tipo: TipoProcesso;
  confianca: number;
  motivo: string;
}

interface Input {
  nome: string;
  descricao?: string | null;
  departamento?: string | null;
  dataInicio?: string | null;
  dataFim?: string | null;
}

export class SugestaoTipoError extends Error {
  constructor(msg: string, public kind: 'no-key' | 'overloaded' | 'blocked' | 'invalid' | 'network') {
    super(msg);
  }
}

export async function sugerirTipoProcesso(input: Input, _attempt = 0): Promise<SugestaoTipo | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new SugestaoTipoError('IA não configurada (falta GEMINI_API_KEY)', 'no-key');

  const existentes = await prisma.evento.findMany({
    select: { nome: true, tipo: true },
    orderBy: { createdAt: 'desc' },
    take: 30,
  });
  const exemplos = existentes.map(e => `  "${e.nome}" → ${e.tipo}`).join('\n');

  const prompt = `És o gestor de processos da associação Young-Link (ONG, Castro Marim).
Classifica o novo processo num dos 4 tipos. Responde APENAS JSON válido.

TIPOS POSSÍVEIS:
- Evento — edição concreta com data(s) definida(s), ex: "Carnaval 2026", "Campo de Férias Verão 2026"
- Projeto Anual — programa plurianual ou recorrente que agrupa várias atividades, ex: "Workshops YL 2026", "PodCast Ligação Jovem"
- Investimento — compra ou obra duradoura (equipamento, viatura, obras na sede), ex: "Mobiliário sede", "Carrinha Berlingo"
- Subsídio — subsídio multi-prestação de entidade financiadora (IEFP, IPDJ, Câmara), ex: "Estágio IEFP 2026", "IDA Maria Silva"

NOVO PROCESSO:
Nome: ${input.nome}
${input.descricao ? `Descrição: ${input.descricao}` : ''}
${input.departamento ? `Departamento: ${input.departamento}` : ''}
${input.dataInicio ? `Data início: ${input.dataInicio}` : ''}
${input.dataFim ? `Data fim: ${input.dataFim}` : ''}

${exemplos ? `PROCESSOS EXISTENTES (para contexto):\n${exemplos}` : ''}

REGRAS:
- Se menciona IEFP, IDA, IPDJ, estágio profissional, medida de emprego, bolsa IEFP → Subsídio.
- Se menciona compra, equipamento, obra, investimento, viatura, móveis → Investimento.
- Se tem data(s) específica(s) e é uma atividade pontual (festa, campo, passeio, torneio) → Evento.
- Se é um programa com várias atividades ao longo do ano → Projeto Anual.

Devolve este JSON:
{
  "tipo": "um dos 4 tipos exatos acima",
  "confianca": 0.0 a 1.0,
  "motivo": "frase curta a explicar porquê (< 20 palavras)"
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
                tipo: { type: 'STRING' },
                confianca: { type: 'NUMBER' },
                motivo: { type: 'STRING' },
              },
              required: ['tipo', 'confianca', 'motivo'],
            },
            temperature: 0.1,
          },
        }),
      },
    );
    if (!resp.ok) {
      if ((resp.status === 503 || resp.status === 429 || resp.status >= 500) && _attempt < 1) {
        await new Promise(r => setTimeout(r, 800));
        return sugerirTipoProcesso(input, _attempt + 1);
      }
      if (resp.status === 503 || resp.status === 429) {
        throw new SugestaoTipoError('Gemini sobrecarregado — tenta de novo em alguns segundos', 'overloaded');
      }
      if (resp.status === 400) {
        throw new SugestaoTipoError('Pedido rejeitado pelo Gemini', 'blocked');
      }
      throw new SugestaoTipoError(`API Gemini HTTP ${resp.status}`, 'network');
    }
    const json: any = await resp.json();
    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new SugestaoTipoError('Resposta vazia do Gemini', 'invalid');
    const parsed = JSON.parse(text) as SugestaoTipo;
    if (!TIPOS_PROCESSO.includes(parsed.tipo as any)) {
      parsed.tipo = 'Evento';
      parsed.confianca = 0;
      parsed.motivo = 'Tipo devolvido pela IA não é válido — aplicado Evento por defeito';
    }
    return parsed;
  } catch (err: any) {
    if (err instanceof SugestaoTipoError) throw err;
    throw new SugestaoTipoError(err.message || 'Erro na chamada à IA', 'network');
  }
}
