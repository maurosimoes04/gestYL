import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';

type TipoDocumentoIA = 'fatura' | 'receita';

interface CamposExtraidos {
  valor: number | null;
  data: string | null;
  nif: string | null;
  numero: string | null;
  fornecedor: string | null;
}

const GEMINI_MODEL = 'gemini-flash-latest';
export const MAX_TENTATIVAS = 3;

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    valor: { type: 'NUMBER', nullable: true },
    data: { type: 'STRING', nullable: true, description: 'formato YYYY-MM-DD' },
    nif: { type: 'STRING', nullable: true },
    numero: { type: 'STRING', nullable: true },
    fornecedor: { type: 'STRING', nullable: true },
  },
};

export interface NarrativaRelatorio {
  notaIntroducao: string;
  administracao: { gestaoInterna: string; parcerias: string; transparencia: string; desafios: string };
  atividadesRealizadas: string;
  atividadesNaoRealizadas: string;
  conclusao: string;
}

const NARRATIVA_SCHEMA = {
  type: 'OBJECT',
  properties: {
    notaIntroducao: { type: 'STRING' },
    administracao: {
      type: 'OBJECT',
      properties: {
        gestaoInterna: { type: 'STRING' },
        parcerias: { type: 'STRING' },
        transparencia: { type: 'STRING' },
        desafios: { type: 'STRING' },
      },
    },
    atividadesRealizadas: { type: 'STRING' },
    atividadesNaoRealizadas: { type: 'STRING' },
    conclusao: { type: 'STRING' },
  },
};

// Gera a narrativa do Relatório e Contas anual a partir do plano de atividades (PDF)
// e de um resumo real dos dados do ano. Devolve texto estruturado por secção (pt-PT).
export async function gerarNarrativaRelatorio(
  planoBuffer: Buffer,
  mimeType: string,
  dadosAno: any,
): Promise<NarrativaRelatorio | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('Relatório IA: GEMINI_API_KEY não definida.');
    return null;
  }

  const prompt = [
    'És o secretário da direção da Associação Young-Link (associação juvenil sem fins lucrativos de Castro Marim, Portugal).',
    `Vais redigir, em português de Portugal, as secções escritas do "Relatório e Contas ${dadosAno.ano}" da associação.`,
    'Em anexo está o PLANO ANUAL DE ATIVIDADES (o que estava previsto). A seguir estão os DADOS REAIS do ano, apurados do sistema de gestão financeira:',
    '',
    JSON.stringify(dadosAno, null, 2),
    '',
    'Instruções:',
    '- Compara o PLANO (anexo) com o REALIZADO (dados reais) para escrever "atividadesRealizadas" (o que se concretizou, com destaques e impacto) e "atividadesNaoRealizadas" (o que estava planeado mas não aconteceu, com uma explicação plausível e construtiva).',
    '- Usa números reais (totais, saldo, valores por atividade) quando fizer sentido, sobretudo na conclusão.',
    '- Tom profissional, caloroso e transparente, dirigido aos associados. Sem inventar factos que contradigam os dados. Não uses markdown nem títulos dentro dos textos — apenas parágrafos.',
    '- "notaIntroducao": carta de abertura aos associados. "administracao": 4 parágrafos (gestão interna, parcerias estratégicas, transparência e participação, desafios e visão). "conclusao": balanço final do ano com referência ao resultado do exercício.',
  ].join('\n');

  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt },
              { inline_data: { mime_type: mimeType || 'application/pdf', data: planoBuffer.toString('base64') } },
            ],
          }],
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: NARRATIVA_SCHEMA,
            temperature: 0.6,
          },
        }),
      },
    );
    if (!resp.ok) {
      console.error('Relatório IA: erro na resposta da API Gemini', resp.status, await resp.text().catch(() => ''));
      return null;
    }
    const json: any = await resp.json();
    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      console.error('Relatório IA: resposta sem conteúdo utilizável', JSON.stringify(json).slice(0, 500));
      return null;
    }
    return JSON.parse(text) as NarrativaRelatorio;
  } catch (err: any) {
    console.error('Relatório IA: falha ao gerar narrativa', err.message || err);
    return null;
  }
}

export async function extrairCamposDocumento(buffer: Buffer, mimeType: string): Promise<CamposExtraidos | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('Análise IA: GEMINI_API_KEY não definida, a ignorar análise.');
    return null;
  }
  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: 'Extrai os seguintes campos deste documento (fatura ou recibo): valor total (número), data (YYYY-MM-DD), NIF do fornecedor/emissor, número do documento, e nome do fornecedor/emissor. Se algum campo não existir, devolve null.' },
              { inline_data: { mime_type: mimeType, data: buffer.toString('base64') } },
            ],
          }],
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: RESPONSE_SCHEMA,
          },
        }),
      },
    );
    if (!resp.ok) {
      console.error('Análise IA: erro na resposta da API Gemini', resp.status, await resp.text().catch(() => ''));
      return null;
    }
    const json: any = await resp.json();
    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      console.error('Análise IA: resposta sem conteúdo utilizável', JSON.stringify(json).slice(0, 500));
      return null;
    }
    return JSON.parse(text) as CamposExtraidos;
  } catch (err: any) {
    console.error('Análise IA: falha ao extrair campos', err.message || err);
    return null;
  }
}

function valoresDivergem(a: number, b: number, tolerancia = 0.01) {
  return Math.abs(a - b) > tolerancia;
}

function fornecedorDivergem(a: string, b: string) {
  const an = a.trim().toLowerCase();
  const bn = b.trim().toLowerCase();
  return !an.includes(bn) && !bn.includes(an);
}

function obterValidacaoManual(analiseIA: any) {
  return analiseIA?.validacaoManual ?? null;
}

function construirAnaliseIA(existente: any, extraido: any, divergencias: string[], analisadoEm: string) {
  const payload: any = { extraido, divergencias, analisadoEm };
  const validacaoManual = obterValidacaoManual(existente);
  if (validacaoManual) payload.validacaoManual = validacaoManual;
  return payload;
}

export async function definirValidacaoIA(tipo: TipoDocumentoIA, id: number, validada: boolean) {
  const existente = tipo === 'fatura'
    ? await prisma.fatura.findUnique({ where: { id } })
    : await prisma.receita.findUnique({ where: { id } });
  if (!existente) return null;

  const analiseIA = (existente as any).analiseIA || {};
  const nextAnaliseIA = {
    ...analiseIA,
    validacaoManual: {
      validada,
      validadaEm: new Date().toISOString(),
    },
  };

  if (tipo === 'fatura') {
    return prisma.fatura.update({ where: { id }, data: { analiseIA: nextAnaliseIA as any } });
  }
  return prisma.receita.update({ where: { id }, data: { analiseIA: nextAnaliseIA as any } });
}

export function compararFatura(extraido: CamposExtraidos, fatura: { valor: any; data: Date; fornecedor: string | null; fornecedorNif: string | null; numero: string | null }): string[] {
  const divergencias: string[] = [];
  if (extraido.valor != null && valoresDivergem(extraido.valor, Number(fatura.valor))) {
    divergencias.push(`Valor no documento (${extraido.valor}€) difere do valor no formulário (${Number(fatura.valor)}€)`);
  }
  if (extraido.data) {
    const dataFatura = new Date(fatura.data).toISOString().slice(0, 10);
    if (extraido.data !== dataFatura) {
      divergencias.push(`Data no documento (${extraido.data}) difere da data no formulário (${dataFatura})`);
    }
  }
  if (extraido.nif && fatura.fornecedorNif && extraido.nif.replace(/\s/g, '') !== fatura.fornecedorNif.replace(/\s/g, '')) {
    divergencias.push(`NIF no documento (${extraido.nif}) difere do NIF no formulário (${fatura.fornecedorNif})`);
  }
  if (extraido.numero && fatura.numero && extraido.numero.trim() !== fatura.numero.trim()) {
    divergencias.push(`Número no documento (${extraido.numero}) difere do número no formulário (${fatura.numero})`);
  }
  if (extraido.fornecedor && fatura.fornecedor && fornecedorDivergem(extraido.fornecedor, fatura.fornecedor)) {
    divergencias.push(`Fornecedor no documento (${extraido.fornecedor}) difere do fornecedor no formulário (${fatura.fornecedor})`);
  }
  return divergencias;
}

export function compararReceita(extraido: CamposExtraidos, receita: { valor: any; data: Date; financiador: string | null }): string[] {
  const divergencias: string[] = [];
  if (extraido.valor != null && valoresDivergem(extraido.valor, Number(receita.valor))) {
    divergencias.push(`Valor no documento (${extraido.valor}€) difere do valor no formulário (${Number(receita.valor)}€)`);
  }
  if (extraido.data) {
    const dataReceita = new Date(receita.data).toISOString().slice(0, 10);
    if (extraido.data !== dataReceita) {
      divergencias.push(`Data no documento (${extraido.data}) difere da data no formulário (${dataReceita})`);
    }
  }
  if (extraido.fornecedor && receita.financiador && fornecedorDivergem(extraido.fornecedor, receita.financiador)) {
    divergencias.push(`Emissor no documento (${extraido.fornecedor}) difere do financiador no formulário (${receita.financiador})`);
  }
  return divergencias;
}

// Recompara os campos já extraídos anteriormente (sem chamar a IA de novo) — usar quando o
// formulário mudou mas o anexo é o mesmo. Não gasta quota nenhuma.
export async function recompararFatura(faturaId: number) {
  try {
    const fatura = await prisma.fatura.findUnique({ where: { id: faturaId } });
    const extraido = (fatura?.analiseIA as any)?.extraido;
    if (!fatura || !extraido) return;
    const divergencias = compararFatura(extraido, fatura);
    await prisma.fatura.update({
      where: { id: faturaId },
      data: { analiseIA: construirAnaliseIA(fatura.analiseIA, extraido, divergencias, (fatura.analiseIA as any).analisadoEm) as any },
    });
  } catch (err: any) {
    console.error('Análise IA: falha ao recomparar fatura', faturaId, err.message || err);
  }
}

export async function recompararReceita(receitaId: number) {
  try {
    const receita = await prisma.receita.findUnique({ where: { id: receitaId } });
    const extraido = (receita?.analiseIA as any)?.extraido;
    if (!receita || !extraido) return;
    const divergencias = compararReceita(extraido, receita);
    await prisma.receita.update({
      where: { id: receitaId },
      data: { analiseIA: construirAnaliseIA(receita.analiseIA, extraido, divergencias, (receita.analiseIA as any).analisadoEm) as any },
    });
  } catch (err: any) {
    console.error('Análise IA: falha ao recomparar receita', receitaId, err.message || err);
  }
}

export async function analisarFatura(faturaId: number, buffer: Buffer, mimeType: string, resetTentativas = false) {
  if (!process.env.GEMINI_API_KEY) return;
  try {
    const faturaAtual = await prisma.fatura.findUnique({ where: { id: faturaId } });
    if (resetTentativas) {
      const validacaoManual = obterValidacaoManual(faturaAtual?.analiseIA);
      await prisma.fatura.update({
        where: { id: faturaId },
        data: {
          analiseTentativas: 0,
          analiseIA: validacaoManual ? { validacaoManual } as any : Prisma.DbNull,
        },
      });
    }
    const fatura = faturaAtual || await prisma.fatura.findUnique({ where: { id: faturaId } });
    if (!fatura) return;
    const extraido = await extrairCamposDocumento(buffer, mimeType);
    if (!extraido) {
      await prisma.fatura.update({ where: { id: faturaId }, data: { analiseTentativas: { increment: 1 } } });
      return;
    }
    const divergencias = compararFatura(extraido, fatura);
    await prisma.fatura.update({
      where: { id: faturaId },
      data: {
        analiseIA: construirAnaliseIA(fatura.analiseIA, extraido, divergencias, new Date().toISOString()) as any,
        analiseTentativas: { increment: 1 },
      },
    });
  } catch (err: any) {
    console.error('Análise IA: falha ao analisar fatura', faturaId, err.message || err);
    await prisma.fatura.update({ where: { id: faturaId }, data: { analiseTentativas: { increment: 1 } } }).catch(() => {});
  }
}

export async function analisarReceita(receitaId: number, buffer: Buffer, mimeType: string, resetTentativas = false) {
  if (!process.env.GEMINI_API_KEY) return;
  try {
    const receitaAtual = await prisma.receita.findUnique({ where: { id: receitaId } });
    if (resetTentativas) {
      const validacaoManual = obterValidacaoManual(receitaAtual?.analiseIA);
      await prisma.receita.update({
        where: { id: receitaId },
        data: {
          analiseTentativas: 0,
          analiseIA: validacaoManual ? { validacaoManual } as any : Prisma.DbNull,
        },
      });
    }
    const receita = receitaAtual || await prisma.receita.findUnique({ where: { id: receitaId } });
    if (!receita) return;
    const extraido = await extrairCamposDocumento(buffer, mimeType);
    if (!extraido) {
      await prisma.receita.update({ where: { id: receitaId }, data: { analiseTentativas: { increment: 1 } } });
      return;
    }
    const divergencias = compararReceita(extraido, receita);
    await prisma.receita.update({
      where: { id: receitaId },
      data: {
        analiseIA: construirAnaliseIA(receita.analiseIA, extraido, divergencias, new Date().toISOString()) as any,
        analiseTentativas: { increment: 1 },
      },
    });
  } catch (err: any) {
    console.error('Análise IA: falha ao analisar receita', receitaId, err.message || err);
    await prisma.receita.update({ where: { id: receitaId }, data: { analiseTentativas: { increment: 1 } } }).catch(() => {});
  }
}
