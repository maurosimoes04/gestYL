import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';
import { analisarFatura, analisarReceita, MAX_TENTATIVAS } from './documentAnalysis';
import { streamToBuffer } from '../utils/streamToBuffer';

const INTERVALO_MS = 15 * 60 * 1000;
const BATCH_SIZE = 10;

async function processarFaturasPendentes() {
  const pendentes = await prisma.fatura.findMany({
    where: { analiseIA: { equals: Prisma.DbNull }, anexo: { not: Prisma.DbNull }, analiseTentativas: { lt: MAX_TENTATIVAS } },
    take: BATCH_SIZE,
    orderBy: { createdAt: 'asc' },
  });
  for (const fatura of pendentes) {
    const anexo = fatura.anexo as any;
    if (!anexo?.driveFileId) continue;
    try {
      const { streamFromDrive } = await import('./googleDrive');
      const stream = await streamFromDrive(anexo.driveFileId);
      const buffer = await streamToBuffer(stream);
      await analisarFatura(fatura.id, buffer, anexo.mimeType || 'application/pdf');
    } catch (err) {
      console.error('Reanálise automática: falha na fatura', fatura.id, err);
    }
  }
}

async function processarReceitasPendentes() {
  const pendentes = await prisma.receita.findMany({
    where: { analiseIA: { equals: Prisma.DbNull }, anexo: { not: Prisma.DbNull }, analiseTentativas: { lt: MAX_TENTATIVAS } },
    take: BATCH_SIZE,
    orderBy: { createdAt: 'asc' },
  });
  for (const receita of pendentes) {
    const anexo = receita.anexo as any;
    if (!anexo?.driveFileId) continue;
    try {
      const { streamFromDrive } = await import('./googleDrive');
      const stream = await streamFromDrive(anexo.driveFileId);
      const buffer = await streamToBuffer(stream);
      await analisarReceita(receita.id, buffer, anexo.mimeType || 'application/pdf');
    } catch (err) {
      console.error('Reanálise automática: falha na receita', receita.id, err);
    }
  }
}

export async function runPendingAnalysisSweep() {
  if (!process.env.GEMINI_API_KEY) return;
  await processarFaturasPendentes();
  await processarReceitasPendentes();
}

export function startAnaliseScheduler() {
  runPendingAnalysisSweep().catch((e) => console.error('Reanálise automática: falha na primeira varredura', e));
  setInterval(() => {
    runPendingAnalysisSweep().catch((e) => console.error('Reanálise automática: falha na varredura periódica', e));
  }, INTERVALO_MS);
  console.log(`Reanálise automática: agendada a cada ${INTERVALO_MS / 60000} minutos`);
}
