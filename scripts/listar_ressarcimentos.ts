import 'dotenv/config';
import { prisma } from '../src/backend/config/prisma';

async function main() {
  const list = await prisma.fatura.findMany({
    where: { OR: [
      { titulo: { contains: 'Ressarcimento', mode: 'insensitive' } },
      { titulo: { contains: 'VJNF', mode: 'insensitive' } },
      { titulo: { contains: 'voluntariado', mode: 'insensitive' } },
    ] },
    include: { contaSnc: true, entidade: true },
    orderBy: { data: 'desc' },
  });
  console.log(`\n${list.length} despesas candidatas:\n`);
  for (const f of list) {
    console.log(`  #${f.id}  ${new Date(f.data).toISOString().slice(0, 10)}  ${Number(f.valor).toFixed(2).padStart(10)} €  SNC ${f.contaSnc?.codigo || '—'}  → ${f.titulo}`);
    if (f.entidade) console.log(`         Entidade: ${f.entidade.nome} ${f.entidade.nif || ''}`);
  }
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
