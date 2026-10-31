import { Router, Request, Response } from 'express';
import path from 'path';
import { prisma } from '../config/prisma';
import PDFDocument from 'pdfkit';

const router = Router();
const LOGO_PATH = path.resolve(__dirname, '../../../assets/logo.png');

const TSU_PATRONAL = 0.2375;
const TSU_TRABALHADOR = 0.11;

function diasCorridos(inicio: Date, fim: Date): number {
  const ms = fim.getTime() - inicio.getTime();
  return Math.round(ms / 86400000) + 1;
}

function calcRecibo(bolsaMensal: number, diasPeriodo: number, diasFaltas: number, diasUteis: number, subsidioRefeicaoDia: number, taxaPatronal = TSU_PATRONAL, taxaTrab = TSU_TRABALHADOR) {
  const valorDia = +(bolsaMensal / 30).toFixed(4);
  const bolsaProporcional = +(valorDia * diasPeriodo).toFixed(2);
  const descontoFaltas = +(valorDia * diasFaltas).toFixed(2);
  const bolsaBruta = +(bolsaProporcional - descontoFaltas).toFixed(2);
  const valorTSUPatronal = +(bolsaBruta * taxaPatronal).toFixed(2);
  const valorTSUTrabalhador = +(bolsaBruta * taxaTrab).toFixed(2);
  const subsidioRefeicao = +(subsidioRefeicaoDia * diasUteis).toFixed(2);
  const totalBruto = +(bolsaBruta + subsidioRefeicao).toFixed(2);
  const totalLiquido = +(bolsaBruta - valorTSUTrabalhador + subsidioRefeicao).toFixed(2);
  const custoEntidade = +(bolsaBruta + valorTSUPatronal + subsidioRefeicao).toFixed(2);
  return { bolsaProporcional, descontoFaltas, bolsaBruta, valorTSUPatronal, valorTSUTrabalhador, subsidioRefeicao, totalBruto, totalLiquido, custoEntidade };
}

const SNC_BOLSA = 12;       // 631 — Gastos com pessoal — Bolsas
const SNC_ENCARGOS = 13;    // 635 — Encargos sobre remunerações
const SNC_SUB_REF = 311;    // 6382 — Subsídio de refeição

const reciboIncludes = {
  entidade: { select: { id: true, nome: true, nif: true, niss: true, funcao: true } },
  faturas: { select: { id: true, titulo: true, contaSncId: true, valor: true } },
  reciboProcessos: { include: { evento: { select: { id: true, nome: true } } } },
};

// GET /recibos-bolsa?entidadeId=&processoId=
router.get('/', async (req: Request, res: Response) => {
  const where: any = {};
  if (req.query.entidadeId) where.entidadeId = Number(req.query.entidadeId);
  if (req.query.processoId) where.reciboProcessos = { some: { eventoId: Number(req.query.processoId) } };

  const recibos = await prisma.reciboBolsa.findMany({
    where,
    include: reciboIncludes,
    orderBy: { periodoInicio: 'desc' },
  });
  res.json(recibos);
});

// GET /recibos-bolsa/next-number
router.get('/next-number', async (_req: Request, res: Response) => {
  const ano = new Date().getFullYear();
  const ultimo = await prisma.reciboBolsa.findFirst({
    where: { numeroRecibo: { endsWith: `/${ano}` } },
    orderBy: { createdAt: 'desc' },
  });
  const seq = ultimo ? parseInt(ultimo.numeroRecibo.split('/')[0], 10) + 1 : 1;
  res.json({ numero: `${seq}/${ano}` });
});

// GET /recibos-bolsa/defaults/:entidadeId
router.get('/defaults/:entidadeId', async (req: Request, res: Response) => {
  const ent = await prisma.entidade.findUnique({
    where: { id: Number(req.params.entidadeId) },
    select: { bolsaBase: true, subsidioRefeicaoDia: true },
  });
  if (!ent) return res.status(404).json({ error: 'Entidade não encontrada' });
  res.json({
    bolsaMensal: ent.bolsaBase ? Number(ent.bolsaBase) : null,
    subsidioRefeicaoDia: ent.subsidioRefeicaoDia ? Number(ent.subsidioRefeicaoDia) : null,
  });
});

async function syncDespesas(reciboId: number, calc: ReturnType<typeof calcRecibo>, b: any, entidadeNome: string) {
  const mesAno = new Date(b.periodoInicio).toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' });
  const estado = b.estado === 'Pago' ? 'pago' : 'por pagar';
  const entidadeId = Number(b.entidadeId);
  const data = new Date(b.periodoFim);
  const processos: Array<{ processoId: number; valor: number }> = b.processos || [];

  // Remove faturas anteriores deste recibo
  if (reciboId > 0) {
    await prisma.fatura.deleteMany({ where: { reciboBolsaId: reciboId } });
  }

  const linhas: Array<{ titulo: string; valor: number; contaSncId: number; desc: string }> = [
    { titulo: `Bolsa estágio (remuneração) — ${entidadeNome} — ${mesAno}`, valor: calc.bolsaBruta, contaSncId: SNC_BOLSA, desc: `631 Bolsa bruta — Recibo nº ${b.numeroRecibo}` },
  ];
  if (calc.subsidioRefeicao > 0) {
    linhas.push({ titulo: `Sub. refeição — ${entidadeNome} — ${mesAno}`, valor: calc.subsidioRefeicao, contaSncId: SNC_SUB_REF, desc: `6382 Subsídio de refeição — Recibo nº ${b.numeroRecibo}` });
  }
  if (calc.valorTSUPatronal > 0) {
    linhas.push({ titulo: `TSU patronal — ${entidadeNome} — ${mesAno}`, valor: calc.valorTSUPatronal, contaSncId: SNC_ENCARGOS, desc: `635 Encargos sobre remunerações — Recibo nº ${b.numeroRecibo}` });
  }

  const faturaIds: number[] = [];
  for (const l of linhas) {
    const f = await prisma.fatura.create({
      data: {
        titulo: l.titulo, valor: l.valor, data, departamento: 'RH', tipo: 'Recibo Bolsa',
        estado, descricao: l.desc, entidadeId, contaSncId: l.contaSncId,
        reciboBolsaId: reciboId > 0 ? reciboId : undefined,
      },
    });
    faturaIds.push(f.id);

    if (processos.length > 0) {
      await prisma.faturaEvento.createMany({
        data: processos.map(p => ({ faturaId: f.id, eventoId: p.processoId, valor: p.valor })),
      });
    }
  }

  return faturaIds;
}

// POST /recibos-bolsa
router.post('/', async (req: Request, res: Response) => {
  const b = req.body;
  const bolsaMensal = Number(b.bolsaMensal);
  const diasFaltas = Number(b.diasFaltas) || 0;
  const diasUteis = Number(b.diasUteis);
  const subsidioRefeicaoDia = Number(b.subsidioRefeicaoDia) || 0;
  const taxaPatronal = Number(b.taxaTSUPatronal) || TSU_PATRONAL;
  const taxaTrab = Number(b.taxaTSUTrabalhador) || TSU_TRABALHADOR;
  const diasPeriodo = diasCorridos(new Date(b.periodoInicio), new Date(b.periodoFim));

  const calc = calcRecibo(bolsaMensal, diasPeriodo, diasFaltas, diasUteis, subsidioRefeicaoDia, taxaPatronal, taxaTrab);

  const entidade = await prisma.entidade.findUnique({ where: { id: Number(b.entidadeId) }, select: { nome: true } });

  const processos: Array<{ processoId: number; valor: number }> = b.processos || [];

  const recibo = await prisma.reciboBolsa.create({
    data: {
      numeroRecibo: b.numeroRecibo,
      entidadeId: Number(b.entidadeId),
      periodoInicio: new Date(b.periodoInicio),
      periodoFim: new Date(b.periodoFim),
      diasUteis, diasFaltas, bolsaMensal,
      descontoFaltas: calc.descontoFaltas,
      bolsaBruta: calc.bolsaBruta,
      taxaTSUPatronal: taxaPatronal,
      valorTSUPatronal: calc.valorTSUPatronal,
      taxaTSUTrabalhador: taxaTrab,
      valorTSUTrabalhador: calc.valorTSUTrabalhador,
      subsidioRefeicaoDia, subsidioRefeicao: calc.subsidioRefeicao,
      totalBruto: calc.totalBruto,
      totalLiquido: calc.totalLiquido,
      custoEntidade: calc.custoEntidade,
      observacoes: b.observacoes || null,
      estado: b.estado || 'Rascunho',
      dataEmissao: b.dataEmissao ? new Date(b.dataEmissao) : null,
      dataPagamento: b.dataPagamento ? new Date(b.dataPagamento) : null,
      reciboProcessos: processos.length > 0 ? {
        create: processos.map(p => ({ eventoId: p.processoId, valor: p.valor })),
      } : undefined,
    },
    include: reciboIncludes,
  });

  await syncDespesas(recibo.id, calc, b, entidade?.nome || '');
  const updated = await prisma.reciboBolsa.findUnique({ where: { id: recibo.id }, include: reciboIncludes });
  res.status(201).json(updated);
});

// PUT /recibos-bolsa/:id
router.put('/:id', async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const b = req.body;
  const data: any = {};

  if (b.estado) data.estado = b.estado;
  if (b.dataEmissao !== undefined) data.dataEmissao = b.dataEmissao ? new Date(b.dataEmissao) : null;
  if (b.dataPagamento !== undefined) data.dataPagamento = b.dataPagamento ? new Date(b.dataPagamento) : null;
  if (b.observacoes !== undefined) data.observacoes = b.observacoes || null;

  if (b.bolsaMensal != null) {
    const bolsaMensal = Number(b.bolsaMensal);
    const diasFaltas = Number(b.diasFaltas) || 0;
    const diasUteis = Number(b.diasUteis);
    const subsidioRefeicaoDia = Number(b.subsidioRefeicaoDia) || 0;
    const taxaPatronal = Number(b.taxaTSUPatronal) || TSU_PATRONAL;
    const taxaTrab = Number(b.taxaTSUTrabalhador) || TSU_TRABALHADOR;
    const diasPeriodo = diasCorridos(new Date(b.periodoInicio), new Date(b.periodoFim));
    const calc = calcRecibo(bolsaMensal, diasPeriodo, diasFaltas, diasUteis, subsidioRefeicaoDia, taxaPatronal, taxaTrab);
    Object.assign(data, {
      bolsaMensal, diasFaltas, diasUteis,
      descontoFaltas: calc.descontoFaltas, bolsaBruta: calc.bolsaBruta,
      taxaTSUPatronal: taxaPatronal, valorTSUPatronal: calc.valorTSUPatronal,
      taxaTSUTrabalhador: taxaTrab, valorTSUTrabalhador: calc.valorTSUTrabalhador,
      subsidioRefeicaoDia, subsidioRefeicao: calc.subsidioRefeicao,
      totalBruto: calc.totalBruto, totalLiquido: calc.totalLiquido, custoEntidade: calc.custoEntidade,
      periodoInicio: new Date(b.periodoInicio), periodoFim: new Date(b.periodoFim),
    });

    // Sync despesas (recria as 3 faturas com contas SNC corretas)
    const entidade = await prisma.entidade.findUnique({ where: { id: Number(b.entidadeId) }, select: { nome: true } });
    await syncDespesas(id, calc, b, entidade?.nome || '');

    // Sync processos
    const processos: Array<{ processoId: number; valor: number }> = b.processos || [];
    await prisma.reciboBolsaEvento.deleteMany({ where: { reciboBolsaId: id } });
    if (processos.length > 0) {
      await prisma.reciboBolsaEvento.createMany({
        data: processos.map(p => ({ reciboBolsaId: id, eventoId: p.processoId, valor: p.valor })),
      });
    }
  }

  const recibo = await prisma.reciboBolsa.update({ where: { id }, data, include: reciboIncludes });
  res.json(recibo);
});

// DELETE /recibos-bolsa/:id
router.delete('/:id', async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  await prisma.fatura.deleteMany({ where: { reciboBolsaId: id } });
  await prisma.reciboBolsa.delete({ where: { id } });
  res.json({ ok: true });
});

// GET /recibos-bolsa/:id/pdf
router.get('/:id/pdf', async (req: Request, res: Response) => {
  const recibo = await prisma.reciboBolsa.findUnique({
    where: { id: Number(req.params.id) },
    include: {
      entidade: { select: { nome: true, nif: true, niss: true, funcao: true, tipoVinculo: true } },
      reciboProcessos: { include: { evento: { select: { nome: true, numeroProcesso: true } } } },
    },
  });
  if (!recibo) return res.status(404).json({ error: 'Recibo não encontrado' });

  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="recibo-bolsa-${recibo.numeroRecibo.replace('/', '-')}.pdf"`);
  doc.pipe(res);

  const BLACK = '#1a1a1a';
  const GRAY = '#666666';
  const LIGHT = '#999999';
  const LINE = '#d1d5db';
  const BG = '#f9fafb';
  const fmtDate = (d: Date) => d.toLocaleDateString('pt-PT');
  const fmtEur = (v: any) => Number(v).toFixed(2).replace('.', ',') + '€';
  const mesAno = recibo.periodoInicio.toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' });
  const L = 50;   // left margin
  const R = 545;   // right edge
  const W = R - L;  // usable width

  // === HEADER: logo + emitter left, doc info right ===
  try { doc.image(LOGO_PATH, L, 40, { width: 100 }); } catch {}
  doc.font('Helvetica-Bold').fontSize(12).fillColor(BLACK)
    .text('Associação Young-Link', L + 110, 45);
  doc.font('Helvetica').fontSize(8).fillColor(GRAY)
    .text('Rua João de Almeida, Antiga Escola Primária', L + 110, 62)
    .text('8950-414 CP Altura, Castro Marim', L + 110)
    .text('NIPC: 517 483 475', L + 110)
    .text('geral@younglink.net · 914 524 860', L + 110);

  // Doc type — top right
  doc.font('Helvetica-Bold').fontSize(16).fillColor(BLACK)
    .text('Recibo de Bolsa', 350, 50, { width: 195, align: 'right' });
  doc.font('Helvetica-Bold').fontSize(11).fillColor(BLACK)
    .text(`RB ${recibo.numeroRecibo}`, 350, 72, { width: 195, align: 'right' });
  doc.font('Helvetica').fontSize(9).fillColor(GRAY)
    .text(`Data: ${fmtDate(new Date())}`, 350, 88, { width: 195, align: 'right' });

  // Separator
  doc.moveTo(L, 115).lineTo(R, 115).strokeColor(LINE).lineWidth(1).stroke();

  // === ESTAGIÁRIO BLOCK: left column ===
  let y = 128;
  doc.font('Helvetica-Bold').fontSize(9).fillColor(BLACK).text('Estagiário/a', L, y);
  y += 14;
  doc.font('Helvetica-Bold').fontSize(10).fillColor(BLACK).text(recibo.entidade.nome, L, y);
  y += 14;
  doc.font('Helvetica').fontSize(8.5).fillColor(GRAY);
  if (recibo.entidade.nif) { doc.text(`NIF: ${recibo.entidade.nif}`, L, y); y += 12; }
  if (recibo.entidade.niss) { doc.text(`NISS: ${recibo.entidade.niss}`, L, y); y += 12; }
  if (recibo.entidade.funcao) { doc.text(`Função: ${recibo.entidade.funcao}`, L, y); y += 12; }
  if (recibo.entidade.tipoVinculo) { doc.text(`Vínculo: ${recibo.entidade.tipoVinculo}`, L, y); y += 12; }

  // === PERÍODO BLOCK: right column ===
  let yr = 128;
  doc.font('Helvetica-Bold').fontSize(9).fillColor(BLACK).text('Período', 350, yr, { width: 195, align: 'right' });
  yr += 14;
  doc.font('Helvetica').fontSize(9).fillColor(BLACK)
    .text(`${fmtDate(recibo.periodoInicio)} a ${fmtDate(recibo.periodoFim)}`, 350, yr, { width: 195, align: 'right' });
  yr += 13;
  doc.font('Helvetica').fontSize(8.5).fillColor(GRAY)
    .text(`${recibo.diasUteis} dias úteis trabalhados`, 350, yr, { width: 195, align: 'right' });
  yr += 12;
  const dp = diasCorridos(recibo.periodoInicio, recibo.periodoFim);
  const mesCheio = dp >= 28;
  if (!mesCheio) {
    doc.text(`${dp} dias corridos (mês parcial)`, 350, yr, { width: 195, align: 'right' });
    yr += 12;
  }
  if (recibo.reciboProcessos.length > 0) {
    yr += 4;
    doc.font('Helvetica-Bold').fontSize(8).fillColor(BLACK).text('Processo(s)', 350, yr, { width: 195, align: 'right' });
    yr += 11;
    for (const rp of recibo.reciboProcessos) {
      doc.font('Helvetica').fontSize(8).fillColor(GRAY)
        .text(rp.evento.nome + (rp.evento.numeroProcesso ? ` (${rp.evento.numeroProcesso})` : ''), 300, yr, { width: 245, align: 'right' });
      yr += 11;
    }
  }

  // === TABLE ===
  const ty0 = Math.max(y, yr) + 16;
  const colDesc = L;
  const colVal = R - 100;
  let ty = ty0;

  // Table header
  doc.rect(L, ty, W, 22).fill(BG);
  doc.moveTo(L, ty + 22).lineTo(R, ty + 22).strokeColor(LINE).lineWidth(0.5).stroke();
  doc.font('Helvetica-Bold').fontSize(8).fillColor(GRAY);
  doc.text('Descrição', colDesc + 8, ty + 6);
  doc.text('Valor', colVal, ty + 6, { width: 92, align: 'right' });
  ty += 24;

  const row = (label: string, value: string, opts?: { bold?: boolean; color?: string }) => {
    doc.font(opts?.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9).fillColor(opts?.color || BLACK);
    doc.text(label, colDesc + 8, ty + 5);
    doc.text(value, colVal, ty + 5, { width: 92, align: 'right' });
    doc.moveTo(L, ty + 20).lineTo(R, ty + 20).strokeColor('#e5e7eb').lineWidth(0.3).stroke();
    ty += 22;
  };

  row('Bolsa mensal (contrato)', fmtEur(recibo.bolsaMensal));

  if (!mesCheio) {
    const bolsaProp = +(Number(recibo.bolsaMensal) / 30 * dp).toFixed(2);
    row(`Proporcional ${dp} dias (${fmtEur(Number(recibo.bolsaMensal) / 30)}/dia × ${dp}d)`, fmtEur(bolsaProp));
  }

  if (Number(recibo.descontoFaltas) > 0) {
    row(`Desconto faltas (${recibo.diasFaltas}d × ${fmtEur(Number(recibo.bolsaMensal) / 30)}/dia)`, `- ${fmtEur(recibo.descontoFaltas)}`, { color: '#dc2626' });
  }

  row('Bolsa bruta', fmtEur(recibo.bolsaBruta), { bold: true });

  const taxaTrab = Number(recibo.taxaTSUTrabalhador) * 100;
  row(`TSU trabalhador (${taxaTrab.toFixed(0)}%)`, `- ${fmtEur(recibo.valorTSUTrabalhador)}`, { color: '#dc2626' });

  if (Number(recibo.subsidioRefeicao) > 0) {
    row(`Subsídio de refeição (${fmtEur(recibo.subsidioRefeicaoDia)} × ${recibo.diasUteis}d) — isento`, fmtEur(recibo.subsidioRefeicao));
  }

  // === TOTALS (right-aligned, like Moloni) ===
  ty += 6;
  doc.moveTo(colVal - 80, ty).lineTo(R, ty).strokeColor(LINE).lineWidth(0.5).stroke();
  ty += 8;

  doc.font('Helvetica').fontSize(9).fillColor(BLACK);
  doc.text('Total ilíquido', colVal - 80, ty); doc.text(fmtEur(recibo.totalBruto), colVal, ty, { width: 92, align: 'right' });
  ty += 18;

  doc.font('Helvetica-Bold').fontSize(12).fillColor(BLACK);
  doc.text('Líquido a receber', colVal - 80, ty); doc.text(fmtEur(recibo.totalLiquido), colVal, ty, { width: 92, align: 'right' });
  ty += 26;

  // === ENCARGOS PATRONAIS (subtle info box) ===
  doc.rect(L, ty, W, 28).fill(BG);
  doc.moveTo(L, ty).lineTo(R, ty).strokeColor(LINE).lineWidth(0.5).stroke();
  const taxaPat = Number(recibo.taxaTSUPatronal) * 100;
  doc.font('Helvetica-Bold').fontSize(8).fillColor(GRAY).text('Encargos patronais', L + 8, ty + 5);
  doc.font('Helvetica').fontSize(8).fillColor(GRAY)
    .text(`TSU ${taxaPat.toFixed(2)}% = ${fmtEur(recibo.valorTSUPatronal)}`, L + 8, ty + 16);
  doc.font('Helvetica-Bold').fontSize(8).fillColor(BLACK)
    .text(`Custo total entidade: ${fmtEur(recibo.custoEntidade)}`, colVal - 80, ty + 10, { width: 172, align: 'right' });
  ty += 36;

  // === OBSERVAÇÕES ===
  if (recibo.observacoes) {
    doc.font('Helvetica-Bold').fontSize(8).fillColor(BLACK).text('Notas', L, ty);
    ty += 12;
    doc.font('Helvetica').fontSize(8).fillColor(GRAY).text(recibo.observacoes, L, ty, { width: W });
    ty += 18;
  }

  // === ASSINATURAS ===
  const sigY = Math.max(ty + 50, 640);
  doc.font('Helvetica').fontSize(9).fillColor(BLACK);
  doc.moveTo(L, sigY).lineTo(L + 180, sigY).strokeColor(LINE).lineWidth(0.5).stroke();
  doc.text('A Direção', L, sigY + 4);

  doc.moveTo(R - 180, sigY).lineTo(R, sigY).strokeColor(LINE).lineWidth(0.5).stroke();
  doc.text('O/A Estagiário/a', R - 180, sigY + 4);

  // === FOOTER ===
  const footY = 770;
  doc.moveTo(L, footY).lineTo(R, footY).strokeColor(LINE).lineWidth(0.5).stroke();
  doc.font('Helvetica').fontSize(7).fillColor(LIGHT)
    .text('Associação Young-Link · NIPC 517 483 475', L, footY + 6, { width: W, align: 'center' });
  doc.text(`Estado: ${recibo.estado}${recibo.dataEmissao ? ' | Emitido: ' + fmtDate(recibo.dataEmissao) : ''}${recibo.dataPagamento ? ' | Pago: ' + fmtDate(recibo.dataPagamento) : ''}`, L, footY + 16, { width: W, align: 'center' });

  doc.end();
});

export default router;
