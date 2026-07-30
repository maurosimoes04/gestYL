import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '../src/backend/config/prisma';
import { compararFatura } from '../src/backend/services/documentAnalysis';
import { syncMovimentoParaFatura } from '../src/backend/services/movimentoSync';

const extraidosPath = process.argv[2];
if (!extraidosPath) {
  console.error('Uso: ts-node scripts/aplicarExtraidos.ts <caminho para extraidos.json>');
  process.exit(1);
}

const extraidos: Record<string, { fornecedor: string | null; fornecedorNif: string | null }> = JSON.parse(
  fs.readFileSync(path.resolve(extraidosPath), 'utf-8'),
);

async function main() {
  let atualizadas = 0;
  let movimentosSincronizados = 0;
  const semAlteracao: number[] = [];

  for (const [idStr, dados] of Object.entries(extraidos)) {
    const id = Number(idStr);
    const fatura = await prisma.fatura.findUnique({ where: { id }, include: { movimento: { select: { conta: true } } } });
    if (!fatura) {
      console.log(`Fatura #${id} não encontrada, a ignorar.`);
      continue;
    }
    if (fatura.fornecedor || fatura.fornecedorNif) {
      semAlteracao.push(id);
      continue;
    }

    const extraido = {
      valor: Number(fatura.valor),
      data: new Date(fatura.data).toISOString().slice(0, 10),
      nif: dados.fornecedorNif,
      numero: fatura.numero,
      fornecedor: dados.fornecedor,
    };
    const divergencias = compararFatura(extraido, fatura);

    const analiseAtual = (fatura.analiseIA as any) || {};
    const nextAnaliseIA: any = {
      extraido,
      divergencias,
      analisadoEm: new Date().toISOString(),
      origem: 'manual',
    };
    if (analiseAtual.validacaoManual) nextAnaliseIA.validacaoManual = analiseAtual.validacaoManual;

    const updated = await prisma.fatura.update({
      where: { id },
      data: {
        fornecedor: dados.fornecedor,
        fornecedorNif: dados.fornecedorNif,
        analiseIA: nextAnaliseIA,
      },
      include: { movimento: { select: { conta: true } } },
    });
    atualizadas += 1;

    await syncMovimentoParaFatura(updated, updated.movimento?.conta || fatura.movimento?.conta || undefined);
    if (updated.estado === 'Paga') movimentosSincronizados += 1;

    console.log(`#${id} -> fornecedor="${dados.fornecedor}" nif="${dados.fornecedorNif}" divergencias=${divergencias.length}`);
  }

  console.log('---');
  console.log(`Atualizadas: ${atualizadas}`);
  console.log(`Movimentos sincronizados (Paga): ${movimentosSincronizados}`);
  console.log(`Ignoradas (já tinham fornecedor/NIF): ${semAlteracao.length}`, semAlteracao);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
