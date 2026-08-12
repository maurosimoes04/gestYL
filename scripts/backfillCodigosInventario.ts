import { prisma } from '../src/backend/config/prisma';

// Atribui código de património (YL-000N) sequencial aos bens fixos que ainda não têm.
async function main() {
  const semCodigo = await prisma.inventario.findMany({
    where: { tipo: 'fixo', codigoPatrimonio: null },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });

  const comCodigo = await prisma.inventario.findMany({
    where: { codigoPatrimonio: { not: null } },
    select: { codigoPatrimonio: true },
  });
  let max = 0;
  for (const it of comCodigo) {
    const m = /(\d+)\s*$/.exec(it.codigoPatrimonio || '');
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }

  let atribuidos = 0;
  for (const item of semCodigo) {
    max += 1;
    const codigo = `YL-${String(max).padStart(4, '0')}`;
    await prisma.inventario.update({ where: { id: item.id }, data: { codigoPatrimonio: codigo } });
    console.log(`#${item.id} "${item.nome}" -> ${codigo}`);
    atribuidos += 1;
  }

  console.log('---');
  console.log(`Fixos sem código: ${semCodigo.length} | atribuídos: ${atribuidos}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
