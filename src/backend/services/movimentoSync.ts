import { prisma } from '../config/prisma';

interface FaturaSyncInput {
  id: number;
  valor: any;
  data: Date;
  estado: string;
  titulo: string;
}

interface ReceitaSyncInput {
  id: number;
  valor: any;
  data: Date;
  estado: string;
  titulo: string;
}

export async function syncMovimentoParaFatura(fatura: FaturaSyncInput, conta?: string) {
  if (fatura.estado === 'Paga') {
    await prisma.movimento.upsert({
      where: { faturaId: fatura.id },
      create: {
        tipo: 'saida',
        conta: conta || 'Banco',
        valor: fatura.valor,
        data: fatura.data,
        referencia: `Fatura #${fatura.id}`,
        descricao: fatura.titulo,
        faturaId: fatura.id,
      },
      update: {
        valor: fatura.valor,
        data: fatura.data,
        descricao: fatura.titulo,
        ...(conta ? { conta } : {}),
      },
    });
  } else {
    await prisma.movimento.deleteMany({ where: { faturaId: fatura.id } });
  }
}

export async function syncMovimentoParaReceita(receita: ReceitaSyncInput, conta?: string) {
  if (receita.estado === 'Recebido') {
    await prisma.movimento.upsert({
      where: { receitaId: receita.id },
      create: {
        tipo: 'entrada',
        conta: conta || 'Banco',
        valor: receita.valor,
        data: receita.data,
        referencia: `Receita #${receita.id}`,
        descricao: receita.titulo,
        receitaId: receita.id,
      },
      update: {
        valor: receita.valor,
        data: receita.data,
        descricao: receita.titulo,
        ...(conta ? { conta } : {}),
      },
    });
  } else {
    await prisma.movimento.deleteMany({ where: { receitaId: receita.id } });
  }
}
