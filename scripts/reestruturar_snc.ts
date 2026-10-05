/**
 * Reestruturação SNC — script único.
 *
 * Faz, por esta ordem:
 *   1. Semeia/atualiza o catálogo ContaSNC (idempotente, usa `codigo` como chave).
 *   2. Lê todos os fornecedores e financiadores existentes, desduplica por NIF
 *      (e por nome quando não há NIF), cria/atualiza Entidades.
 *   3. Classifica cada Receita e Fatura numa ContaSNC + liga à Entidade.
 *   4. Imprime relatório final com contagens e casos ambíguos.
 *
 * Modo:
 *   - `--dry-run`: só mostra o que faria, não grava nada (default).
 *   - `--apply`: grava mesmo.
 */

import 'dotenv/config';
import { prisma } from '../src/backend/config/prisma';
import { PLANO_SNC_YL } from '../prisma/seeds/plano_snc';

const DRY = !process.argv.includes('--apply');
const PREFIX = DRY ? '[DRY-RUN]' : '[APPLY]  ';

function log(...a: any[]) { console.log(PREFIX, ...a); }
function section(t: string) { console.log(`\n${'═'.repeat(72)}\n  ${t}\n${'═'.repeat(72)}`); }

/* ──────────────────────────────────────────────────────────────────────── */
/*  1) SEMEAR CONTAS SNC                                                   */
/* ──────────────────────────────────────────────────────────────────────── */
async function semearContasSNC() {
  section('1. Catálogo ContaSNC');
  let criadas = 0, atualizadas = 0;
  for (const c of PLANO_SNC_YL) {
    if (!DRY) {
      const existing = await prisma.contaSNC.findUnique({ where: { codigo: c.codigo } });
      await prisma.contaSNC.upsert({
        where: { codigo: c.codigo },
        create: { ...c },
        update: { nome: c.nome, familia: c.familia, tipo: c.tipo, pergunta: c.pergunta,
                  naturezaInvestimento: !!c.naturezaInvestimento,
                  ativaPorOmissao: c.ativaPorOmissao, notas: c.notas },
      });
      if (existing) atualizadas++; else criadas++;
    }
    log(`  ${c.codigo.padEnd(6)} ${c.nome}  (${c.tipo}${c.naturezaInvestimento ? ', INVESTIMENTO' : ''})`);
  }
  log(`\n  → ${criadas} criadas, ${atualizadas} atualizadas (total ${PLANO_SNC_YL.length})`);
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  2) DESDUPLICAR E CRIAR ENTIDADES                                       */
/* ──────────────────────────────────────────────────────────────────────── */

interface EntidadeKey {
  nif?: string;
  nome: string;
  tipos: Set<string>;
}

function normNif(nif: string | null | undefined): string | undefined {
  if (!nif) return undefined;
  // Remover espaços e pôr maiúsculas, mas preservar letras (VAT UE, CIF espanhol)
  const clean = nif.replace(/\s+/g, '').toUpperCase();
  if (!clean) return undefined;
  return clean;
}

function normNome(nome: string | null | undefined): string {
  if (!nome) return '';
  return nome.trim().replace(/\s+/g, ' ');
}

async function construirEntidades() {
  section('2. Entidades (desduplicação)');

  // Agregar candidatos
  const porNif = new Map<string, { nome: string; tipos: Set<string>; nifOriginal: string }>();
  const semNif = new Map<string, { tipos: Set<string> }>();

  // Fornecedores (Faturas)
  const faturas = await prisma.fatura.findMany({
    select: { fornecedor: true, fornecedorNif: true },
    where: { OR: [{ fornecedor: { not: null } }, { fornecedorNif: { not: null } }] },
  });
  for (const f of faturas) {
    const nif = normNif(f.fornecedorNif);
    const nome = normNome(f.fornecedor);
    if (!nome && !nif) continue;
    if (nif) {
      if (!porNif.has(nif)) porNif.set(nif, { nome, tipos: new Set(), nifOriginal: f.fornecedorNif! });
      porNif.get(nif)!.tipos.add('fornecedor');
      // Preferir o nome mais longo (mais informativo)
      if (nome.length > porNif.get(nif)!.nome.length) porNif.get(nif)!.nome = nome;
    } else {
      const k = nome.toLowerCase();
      if (!semNif.has(k)) semNif.set(k, { tipos: new Set() });
      semNif.get(k)!.tipos.add('fornecedor');
    }
  }

  // Financiadores (Receitas) — não têm NIF guardado hoje; são nomes de instituições
  const receitas = await prisma.receita.findMany({
    select: { financiador: true },
    where: { financiador: { not: null } },
  });
  for (const r of receitas) {
    const nome = normNome(r.financiador);
    if (!nome) continue;
    const k = nome.toLowerCase();
    if (!semNif.has(k)) semNif.set(k, { tipos: new Set() });
    semNif.get(k)!.tipos.add('financiador');
  }

  log(`  Fornecedores únicos (por NIF): ${porNif.size}`);
  log(`  Entidades únicas (sem NIF): ${semNif.size}\n`);

  // Reportar NIFs com formato inválido/suspeito
  const nifInvalidos: string[] = [];
  for (const [nif, info] of porNif) {
    const pt = /^\d{9}$/.test(nif);
    const vatUE = /^(LU|PT|ES|FR|DE|IT|NL|BE|GB|IE|AT|CZ|DK|FI|GR|HU|PL|SE|SK|RO|BG|HR)\d+$/.test(nif);
    const cifES = /^[A-Z]\d{8}$/.test(nif);  // CIF espanhol
    if (!pt && !vatUE && !cifES) nifInvalidos.push(`${info.nome} — NIF="${info.nifOriginal}" (${nif})`);
  }
  if (nifInvalidos.length) {
    log('  ⚠ NIFs com formato suspeito (ficam marcados verificado=false):');
    nifInvalidos.forEach(x => log(`    · ${x}`));
    log('');
  }

  // Criar/atualizar entidades
  let criadas = 0, atualizadas = 0;
  const mapNifToEntidadeId = new Map<string, number>();
  const mapNomeToEntidadeId = new Map<string, number>();

  for (const [nif, info] of porNif) {
    if (DRY) {
      log(`  + Entidade [NIF ${nif}] ${info.nome}  (tipos: ${[...info.tipos].join(',')})`);
      continue;
    }
    const existing = await prisma.entidade.findUnique({ where: { nif } });
    const ptValido = /^\d{9}$/.test(nif);
    const vatValido = /^[A-Z]{2}\d+$/.test(nif);
    const cifES = /^[A-Z]\d{8}$/.test(nif);
    const saved = await prisma.entidade.upsert({
      where: { nif },
      create: {
        nome: info.nome,
        nif,
        tipos: [...info.tipos],
        verificado: ptValido || vatValido || cifES,
        notas: (!ptValido && !vatValido && !cifES) ? `NIF original: "${info.nifOriginal}" — verificar formato` : undefined,
      },
      update: {
        nome: info.nome,
        tipos: [...new Set([...(existing?.tipos || []), ...info.tipos])],
      },
    });
    mapNifToEntidadeId.set(nif, saved.id);
    if (existing) atualizadas++; else criadas++;
  }

  for (const [k, info] of semNif) {
    const nome = [...new Map(receitas.concat(faturas as any).map((r: any) => [normNome(r.financiador || r.fornecedor).toLowerCase(), normNome(r.financiador || r.fornecedor)])).entries()].find(([x]) => x === k)?.[1] || k;
    if (DRY) {
      log(`  + Entidade (sem NIF) ${nome}  (tipos: ${[...info.tipos].join(',')})`);
      continue;
    }
    // Procurar por nome exato (case-insensitive)
    const existente = await prisma.entidade.findFirst({ where: { nome: { equals: nome, mode: 'insensitive' }, nif: null } });
    if (existente) {
      const saved = await prisma.entidade.update({
        where: { id: existente.id },
        data: { tipos: [...new Set([...existente.tipos, ...info.tipos])] },
      });
      mapNomeToEntidadeId.set(k, saved.id);
      atualizadas++;
    } else {
      const saved = await prisma.entidade.create({
        data: { nome, tipos: [...info.tipos], verificado: false },
      });
      mapNomeToEntidadeId.set(k, saved.id);
      criadas++;
    }
  }

  log(`\n  → ${criadas} criadas, ${atualizadas} atualizadas`);
  return { mapNifToEntidadeId, mapNomeToEntidadeId };
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  3) RECLASSIFICAÇÃO SNC (Receitas + Despesas)                           */
/* ──────────────────────────────────────────────────────────────────────── */

type Classif = { codigo: string; motivo: string };

function classificarReceita(r: { categoria: string; titulo: string; financiador: string | null }): Classif {
  const t = (r.titulo || '').toLowerCase();
  const cat = (r.categoria || '').toLowerCase();
  const fin = (r.financiador || '').toLowerCase();

  // Caso especial: PAI é investimento
  if (t.includes('pai') || t.includes(' pai ') || t.includes('obras') || t.includes('investimento')) {
    return { codigo: '59', motivo: 'Receita de investimento (PAI/obras) → entra em 59 e será diferida em 7883' };
  }
  if (cat.includes('cofinanc')) {
    return { codigo: '75', motivo: 'Cofinanciamento corrente' };
  }
  if (cat === 'outros') {
    return { codigo: '75', motivo: 'Prémio / apoio pontual' };
  }
  if (cat.includes('venda') || cat.includes('serviço') || cat.includes('servico')) {
    // Reclassificação: se o "financiador" é entidade pública, provavelmente é apoio não é venda
    if (fin.includes('junta') || fin.includes('município') || fin.includes('municipio') || fin.includes('câmara') || fin.includes('camara')) {
      return { codigo: '75', motivo: `Reclassificado — "venda" com financiador público (${r.financiador}) é apoio` };
    }
    return { codigo: '72', motivo: 'Prestação de serviço / venda' };
  }
  if (cat.includes('quot')) return { codigo: '76', motivo: 'Quota' };
  return { codigo: '75', motivo: 'Default — rever manualmente' };
}

function classificarFatura(f: { titulo: string; tipo: string | null; departamento: string | null; fornecedor: string | null; valor: any }): Classif {
  const t = (f.titulo || '').toLowerCase();
  const dep = (f.departamento || '').toLowerCase();
  const forn = (f.fornecedor || '').toLowerCase();
  const valor = Number(f.valor) || 0;

  // Ativos fixos (duradouros, valor > 100€)
  const parecePortatil = /\b(portát|portatil|notebook|asus|pcdiga|computador)\b/i.test(t);
  const pareceMobiliario = /\b(mesa|cadeira|móvel|movel|estante|mobili[áa]rio|armário|ikea|conforama|jysk|maisons du monde|hôma|homa)\b/i.test(t);
  const pareceObra = /\b(obra|empreitada|construção|construcao|infraestrutura)\b/i.test(t);
  const pareceViatura = /\b(carrinha|carro|viatura|berlingo)\b/i.test(t);
  const pareceEquipDesporto = /\b(insuflável|insuflavel|desport)\b/i.test(t);

  if (pareceViatura && valor >= 500) return { codigo: '434', motivo: 'Viatura (equipamento de transporte)' };
  if (pareceObra) return { codigo: '432', motivo: 'Obra/benfeitoria (edifícios)' };
  if (parecePortatil && valor >= 100) return { codigo: '435', motivo: 'Portátil/TI (equipamento administrativo)' };
  if (pareceMobiliario && valor >= 100) return { codigo: '435', motivo: 'Mobiliário (equipamento administrativo)' };
  if (pareceEquipDesporto && valor >= 100) return { codigo: '433', motivo: 'Equipamento básico (desporto)' };

  // Pessoal / prestadores
  if (/\b(animador|animadora|monitor|monitora|dj|formador|formadora|prestação de servi|prestaçao de servi|prestacao de servi|recibo)\b/i.test(t) || dep === 'educação' && /^\s*(animad|monit)/i.test(forn)) {
    return { codigo: '622', motivo: 'Trabalho especializado (prestador externo)' };
  }

  // Comunicações
  if (/vodafone|meo|nos|comunicaç/i.test(forn + t)) return { codigo: '6253', motivo: 'Comunicações' };

  // Seguros
  if (/fidelidade|allianz|liberty|seguro|apólice|apolice/i.test(forn + t)) return { codigo: '6263', motivo: 'Seguro' };

  // Combustíveis + deslocações
  if (/combust|prio|galp|bp |cepsa|repsol|bomba de gasolina/i.test(forn + t)) return { codigo: '6251', motivo: 'Combustível' };
  if (/refei[çc]|jantar|almoço|almoco|portagem|estada|hotel/i.test(t)) return { codigo: '6251', motivo: 'Deslocação / refeição' };

  // SaaS / software
  if (/anthropic|openai|google|microsoft|weo|software|licen[çc]a|saas/i.test(forn + t)) return { codigo: '622', motivo: 'Serviço SaaS / software' };

  // Notariais
  if (/notaria|escritura|notário|notario|advogado|cartório|cartorio|contabilista/i.test(forn + t)) return { codigo: '622', motivo: 'Serviços profissionais (notariais/jurídicos)' };

  // Bar / mercadoria para venda (bebidas)
  if (/\b(bebida|cerveja|superbock|super bock|sagres|refrigerante|coca[- ]?cola|água|agua)\b/i.test(t)) {
    return { codigo: '612', motivo: 'Mercadoria para venda no bar' };
  }

  // Decoração / consumíveis evento
  if (/\b(fato|fatos|carnaval|decor|flores|planta|pó holi|po holi|insuflav|canhão|canhao)\b/i.test(t)) {
    return { codigo: '6266', motivo: 'Material de decoração/evento' };
  }

  // Consumíveis escritório
  if (/\b(papel|resma|caneta|marcador|tinta|cola|sacos|fita|material escritório|material escritorio|papelaria)\b/i.test(t)) {
    return { codigo: '6262', motivo: 'Consumível de escritório' };
  }

  return { codigo: '6262', motivo: 'Default — consumível/outro (rever manualmente)' };
}

async function reclassificar(mapNifToEntidadeId: Map<string, number>, mapNomeToEntidadeId: Map<string, number>) {
  section('3. Reclassificação Receitas');
  const receitas = await prisma.receita.findMany({
    select: { id: true, titulo: true, categoria: true, financiador: true, data: true, valor: true, contaSncId: true, entidadeId: true },
  });
  const contas = await prisma.contaSNC.findMany();
  const contaPorCodigo = Object.fromEntries(contas.map(c => [c.codigo, c.id]));

  const resumoRec: Record<string, number> = {};
  for (const r of receitas) {
    const classif = classificarReceita(r as any);
    resumoRec[classif.codigo] = (resumoRec[classif.codigo] || 0) + 1;
    const entidadeId = r.financiador ? mapNomeToEntidadeId.get(normNome(r.financiador).toLowerCase()) : undefined;
    log(`  #${String(r.id).padStart(3)}  ${new Date(r.data).toISOString().slice(0,10)}  ${String(Number(r.valor).toFixed(2)).padStart(10)} €  → SNC ${classif.codigo.padEnd(5)}  ${classif.motivo}`);
    if (!DRY) {
      await prisma.receita.update({
        where: { id: r.id },
        data: {
          contaSncId: contaPorCodigo[classif.codigo] || null,
          entidadeId: entidadeId || null,
        },
      });
    }
  }
  log(`\n  Resumo: ${Object.entries(resumoRec).map(([k, v]) => `${k}=${v}`).join('  ')}`);

  section('3. Reclassificação Despesas (Faturas)');
  const faturas = await prisma.fatura.findMany({
    select: { id: true, titulo: true, tipo: true, departamento: true, fornecedor: true, fornecedorNif: true, data: true, valor: true, contaSncId: true, entidadeId: true },
    orderBy: { data: 'desc' },
  });
  const resumoFat: Record<string, number> = {};
  const ativosDetectados: { id: number; titulo: string; valor: number }[] = [];
  for (const f of faturas) {
    const classif = classificarFatura(f as any);
    resumoFat[classif.codigo] = (resumoFat[classif.codigo] || 0) + 1;
    const nif = normNif(f.fornecedorNif);
    const entidadeId = nif ? mapNifToEntidadeId.get(nif) : (f.fornecedor ? mapNomeToEntidadeId.get(normNome(f.fornecedor).toLowerCase()) : undefined);
    if (classif.codigo.startsWith('43')) ativosDetectados.push({ id: f.id, titulo: f.titulo, valor: Number(f.valor) });
    if (!DRY) {
      await prisma.fatura.update({
        where: { id: f.id },
        data: {
          contaSncId: contaPorCodigo[classif.codigo] || null,
          entidadeId: entidadeId || null,
        },
      });
    }
  }
  log(`  Resumo contas: ${Object.entries(resumoFat).sort().map(([k, v]) => `${k}=${v}`).join('  ')}`);
  log(`\n  Candidatos a reclassificar como ATIVO FIXO (hoje são despesa):`);
  for (const a of ativosDetectados.slice(0, 30)) {
    log(`    #${a.id}  ${a.valor.toFixed(2).padStart(8)} €  ${a.titulo}`);
  }
  if (ativosDetectados.length > 30) log(`    … e mais ${ativosDetectados.length - 30}`);
  log(`\n  Total ativos detectados: ${ativosDetectados.length}  (precisam de ir para Inventário com depreciação)`);
}

/* ──────────────────────────────────────────────────────────────────────── */

async function main() {
  console.log('\n' + (DRY ? '🔍  DRY-RUN — nada será gravado. Passa --apply para gravar.' : '✍  APPLY — vai gravar na base de dados.'));
  await semearContasSNC();
  const maps = await construirEntidades();
  await reclassificar(maps.mapNifToEntidadeId, maps.mapNomeToEntidadeId);
  console.log('\n✓ fim\n');
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
