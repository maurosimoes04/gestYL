import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';
import { compararFatura, extrairCamposDocumento, MAX_TENTATIVAS } from './documentAnalysis';
import { syncMovimentoParaFatura } from './movimentoSync';
import { streamToBuffer } from '../utils/streamToBuffer';

export interface BackfillFaturasAntigasResultado {
  total: number;
  processadas: number;
  atualizadas: number;
  movimentosSincronizados: number;
  semAnexo: number;
  semDriveFileId: number;
  semExtraido: number;
  erros: number;
}

function montarTituloPadrao(extraido: { fornecedor: string | null; numero: string | null }, originalName?: string) {
  const partes = [extraido.fornecedor?.trim(), extraido.numero?.trim() ? `#${extraido.numero.trim()}` : '', originalName?.replace(/\.[^.]+$/, '').trim()];
  const titulo = partes.filter(Boolean).join(' ').trim();
  return titulo || 'Despesa antiga';
}

function temCampoEmFalta(valor: any) {
  return valor === null || valor === undefined || String(valor).trim() === '';
}

export async function backfillFaturasAntigas(): Promise<BackfillFaturasAntigasResultado> {
  const resultado: BackfillFaturasAntigasResultado = {
    total: 0,
    processadas: 0,
    atualizadas: 0,
    movimentosSincronizados: 0,
    semAnexo: 0,
    semDriveFileId: 0,
    semExtraido: 0,
    erros: 0,
  };

  const faturas = await prisma.fatura.findMany({
    where: {
      anexo: { not: Prisma.DbNull },
      analiseTentativas: { lt: MAX_TENTATIVAS },
      OR: [{ numero: null }, { fornecedor: null }, { fornecedorNif: null }],
    },
    orderBy: { id: 'asc' },
    include: { movimento: { select: { conta: true } } },
  });

  resultado.total = faturas.length;

  for (const fatura of faturas) {
    resultado.processadas += 1;
    const anexo = fatura.anexo as any;
    if (!anexo) {
      resultado.semAnexo += 1;
      continue;
    }
    if (!anexo.driveFileId) {
      resultado.semDriveFileId += 1;
      continue;
    }

    try {
      const { streamFromDrive } = await import('./googleDrive');
      const stream = await streamFromDrive(anexo.driveFileId);
      const buffer = await streamToBuffer(stream);
      const extraido = await extrairCamposDocumento(buffer, anexo.mimeType || 'application/pdf');
      if (!extraido) {
        resultado.semExtraido += 1;
        await prisma.fatura.update({ where: { id: fatura.id }, data: { analiseTentativas: { increment: 1 } } });
        continue;
      }

      const payload: Record<string, any> = {};
      if (temCampoEmFalta(fatura.titulo)) payload.titulo = montarTituloPadrao(extraido, anexo.originalName);
      if (temCampoEmFalta(fatura.valor) && extraido.valor != null) payload.valor = extraido.valor;
      if (temCampoEmFalta(fatura.data) && extraido.data) payload.data = new Date(extraido.data);
      if (temCampoEmFalta(fatura.numero) && extraido.numero) payload.numero = extraido.numero;
      if (temCampoEmFalta(fatura.fornecedor) && extraido.fornecedor) payload.fornecedor = extraido.fornecedor;
      if (temCampoEmFalta(fatura.fornecedorNif) && extraido.nif) payload.fornecedorNif = extraido.nif;

      // Compara sempre contra o registo ORIGINAL (antes do payload de preenchimento) —
      // comparar contra um objeto já fundido com os próprios dados extraídos nunca detetaria divergências.
      const divergencias = compararFatura(extraido, fatura);

      const analiseAtual = (fatura.analiseIA as any) || {};
      const nextAnaliseIA: any = {
        extraido,
        divergencias,
        analisadoEm: new Date().toISOString(),
      };
      if (analiseAtual.validacaoManual) nextAnaliseIA.validacaoManual = analiseAtual.validacaoManual;

      const updated = await prisma.fatura.update({
        where: { id: fatura.id },
        data: {
          ...payload,
          analiseIA: nextAnaliseIA,
          analiseTentativas: { increment: 1 },
        },
        include: { movimento: { select: { conta: true } } },
      });

      await syncMovimentoParaFatura(updated, updated.movimento?.conta || fatura.movimento?.conta || undefined);
      resultado.atualizadas += Object.keys(payload).length > 0 ? 1 : 0;
      resultado.movimentosSincronizados += updated.estado === 'Paga' ? 1 : 0;
    } catch (error) {
      resultado.erros += 1;
      console.error('Backfill despesas antigas: falha na fatura', fatura.id, error);
      await prisma.fatura.update({ where: { id: fatura.id }, data: { analiseTentativas: { increment: 1 } } }).catch(() => {});
    }
  }

  return resultado;
}