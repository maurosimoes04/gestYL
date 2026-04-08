/**
 * Script de migração: SQLite → Supabase (PostgreSQL via Prisma)
 * Corre com: npx ts-node scripts/migrateToSupabase.ts
 */
import 'dotenv/config';
import Database from 'better-sqlite3';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import path from 'path';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);

const sqlitePath = path.join(process.cwd(), 'src', 'backend', 'database', 'faturas.db');
const sqlite = new Database(sqlitePath, { readonly: true });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('A iniciar migração SQLite → Supabase...\n');

  // 1. Eventos
  const eventos = sqlite.prepare('SELECT * FROM eventos').all() as any[];
  console.log(`Eventos: ${eventos.length}`);
  for (const e of eventos) {
    await prisma.evento.create({
      data: {
        id: e.id,
        nome: e.nome,
        descricao: e.descricao || null,
        data_inicio: e.data_inicio ? new Date(e.data_inicio) : null,
        data_fim: e.data_fim ? new Date(e.data_fim) : null,
        departamento: e.departamento || null,
        createdAt: e.createdAt ? new Date(e.createdAt) : new Date(),
        updatedAt: e.updatedAt ? new Date(e.updatedAt) : new Date(),
      },
    });
  }

  // 2. Inventários
  const inventarios = sqlite.prepare('SELECT * FROM inventarios').all() as any[];
  console.log(`Inventários: ${inventarios.length}`);
  for (const i of inventarios) {
    await prisma.inventario.create({
      data: {
        id: i.id,
        tipo: i.tipo,
        nome: i.nome,
        categoria: i.categoria || null,
        quantidade: i.quantidade ?? 0,
        unidade: i.unidade || null,
        localizacao: i.localizacao || null,
        estado: i.estado || null,
        custoUnitario: i.custoUnitario ?? null,
        dataAquisicao: i.dataAquisicao ? new Date(i.dataAquisicao) : null,
        dataValidade: i.dataValidade ? new Date(i.dataValidade) : null,
        quantidadeMinima: i.quantidadeMinima ?? null,
        notas: i.notas || null,
        faturaId: i.faturaId ?? null,
        createdAt: i.createdAt ? new Date(i.createdAt) : new Date(),
        updatedAt: i.updatedAt ? new Date(i.updatedAt) : new Date(),
      },
    });
  }

  // 3. Faturas
  const faturas = sqlite.prepare('SELECT * FROM Faturas').all() as any[];
  console.log(`Faturas: ${faturas.length}`);
  for (const f of faturas) {
    let anexo = f.anexo;
    let detalhes = f.detalhes;
    if (typeof anexo === 'string') try { anexo = JSON.parse(anexo); } catch { anexo = null; }
    if (typeof detalhes === 'string') try { detalhes = JSON.parse(detalhes); } catch { detalhes = null; }

    await prisma.fatura.create({
      data: {
        id: f.id,
        titulo: f.titulo,
        valor: f.valor,
        data: new Date(f.data),
        departamento: f.departamento,
        tipo: f.tipo || 'Fatura',
        numero: f.numero || null,
        anexo: anexo ?? undefined,
        detalhes: detalhes ?? undefined,
        estado: f.estado,
        descricao: f.descricao || null,
        eventoId: f.eventoId ?? null,
        inventarioId: f.inventarioId ?? null,
        createdAt: f.createdAt ? new Date(f.createdAt) : new Date(),
        updatedAt: f.updatedAt ? new Date(f.updatedAt) : new Date(),
      },
    });
  }

  // 4. Receitas
  const receitas = sqlite.prepare('SELECT * FROM receitas').all() as any[];
  console.log(`Receitas: ${receitas.length}`);
  for (const r of receitas) {
    let anexo = r.anexo;
    if (typeof anexo === 'string') try { anexo = JSON.parse(anexo); } catch { anexo = null; }

    await prisma.receita.create({
      data: {
        id: r.id,
        titulo: r.titulo,
        valor: r.valor,
        data: new Date(r.data),
        categoria: r.categoria,
        estado: r.estado || 'Previsto',
        financiador: r.financiador || null,
        anexo: anexo ?? undefined,
        observacoes: r.observacoes || null,
        eventoId: r.eventoId ?? null,
        createdAt: r.createdAt ? new Date(r.createdAt) : new Date(),
        updatedAt: r.updatedAt ? new Date(r.updatedAt) : new Date(),
      },
    });
  }

  // 5. Movimentos
  const movimentos = sqlite.prepare('SELECT * FROM movimentos').all() as any[];
  console.log(`Movimentos: ${movimentos.length}`);
  for (const m of movimentos) {
    await prisma.movimento.create({
      data: {
        id: m.id,
        tipo: m.tipo,
        conta: m.conta,
        valor: m.valor,
        data: new Date(m.data),
        referencia: m.referencia || null,
        descricao: m.descricao || null,
        createdAt: m.createdAt ? new Date(m.createdAt) : new Date(),
        updatedAt: m.updatedAt ? new Date(m.updatedAt) : new Date(),
      },
    });
  }

  // Reset sequences para que os próximos IDs continuem a partir do máximo
  const tables = [
    { table: 'eventos', seq: 'eventos_id_seq' },
    { table: '"Faturas"', seq: 'Faturas_id_seq' },
    { table: 'inventarios', seq: 'inventarios_id_seq' },
    { table: 'movimentos', seq: 'movimentos_id_seq' },
    { table: 'receitas', seq: 'receitas_id_seq' },
  ];
  for (const { table, seq } of tables) {
    await prisma.$executeRawUnsafe(
      `SELECT setval('"${seq}"', COALESCE((SELECT MAX(id) FROM ${table}), 0) + 1, false)`
    );
  }

  console.log('\nMigração concluída com sucesso!');
}

main()
  .catch((err) => { console.error('Erro na migração:', err); process.exit(1); })
  .finally(() => { sqlite.close(); prisma.$disconnect(); });
