import { Router, Request, Response } from 'express';
import { prisma } from '../config/prisma';
import PDFDocument from 'pdfkit';

const router = Router();

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

const reciboIncludes = {
  entidade: { select: { id: true, nome: true, nif: true, niss: true, funcao: true } },
  fatura: { select: { id: true, titulo: true } },
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

async function syncDespesa(reciboId: number, calc: ReturnType<typeof calcRecibo>, b: any, entidadeNome: string, faturaIdExistente: number | null) {
  const mesAno = new Date(b.periodoInicio).toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' });
  const titulo = `Bolsa estágio — ${entidadeNome} — ${mesAno}`;
  const faturaData: any = {
    titulo,
    valor: calc.custoEntidade,
    data: new Date(b.periodoFim),
    departamento: 'RH',
    tipo: 'Recibo Bolsa',
    estado: b.estado === 'Pago' ? 'pago' : 'por pagar',
    descricao: `Recibo nº ${b.numeroRecibo}: bolsa ${calc.bolsaBruta}€ + TSU patronal ${calc.valorTSUPatronal}€ + sub.ref ${calc.subsidioRefeicao}€`,
    entidadeId: Number(b.entidadeId),
  };

  let faturaId: number;
  if (faturaIdExistente) {
    await prisma.fatura.update({ where: { id: faturaIdExistente }, data: faturaData });
    faturaId = faturaIdExistente;
  } else {
    const fatura = await prisma.fatura.create({ data: faturaData });
    faturaId = fatura.id;
  }

  // Sync processos → faturaEventos
  const processos: Array<{ processoId: number; valor: number }> = b.processos || [];
  if (processos.length > 0) {
    await prisma.faturaEvento.deleteMany({ where: { faturaId } });
    await prisma.faturaEvento.createMany({
      data: processos.map(p => ({ faturaId, eventoId: p.processoId, valor: p.valor })),
    });
  }

  return faturaId;
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
  const faturaId = await syncDespesa(0, calc, b, entidade?.nome || '', null);

  const processos: Array<{ processoId: number; valor: number }> = b.processos || [];

  const recibo = await prisma.reciboBolsa.create({
    data: {
      numeroRecibo: b.numeroRecibo,
      entidadeId: Number(b.entidadeId),
      faturaId,
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
  res.status(201).json(recibo);
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

    // Sync despesa
    const existing = await prisma.reciboBolsa.findUnique({ where: { id }, select: { faturaId: true } });
    const entidade = await prisma.entidade.findUnique({ where: { id: Number(b.entidadeId) }, select: { nome: true } });
    const faturaId = await syncDespesa(id, calc, b, entidade?.nome || '', existing?.faturaId || null);
    data.faturaId = faturaId;

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
  const recibo = await prisma.reciboBolsa.findUnique({ where: { id: Number(req.params.id) }, select: { faturaId: true } });
  await prisma.reciboBolsa.delete({ where: { id: Number(req.params.id) } });
  if (recibo?.faturaId) {
    await prisma.fatura.delete({ where: { id: recibo.faturaId } }).catch(() => {});
  }
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

  const INDIGO = '#4f46e5';
  const formatDate = (d: Date) => d.toLocaleDateString('pt-PT');
  const formatEur = (v: any) => Number(v).toFixed(2).replace('.', ',') + ' €';
  const mesAno = recibo.periodoInicio.toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' });

  // Header
  doc.rect(0, 0, 595, 80).fill(INDIGO);
  doc.fillColor('#ffffff').fontSize(18).font('Helvetica-Bold')
    .text('ASSOCIAÇÃO JUVENIL DE CASTRO MARIM', 50, 20, { width: 495, align: 'center' });
  doc.fontSize(10).font('Helvetica')
    .text('NIPC: 510 455 340 | Castro Marim, Faro', 50, 45, { width: 495, align: 'center' });
  doc.fillColor('#000000');

  // Title
  doc.moveDown(2);
  doc.fontSize(14).font('Helvetica-Bold').fillColor(INDIGO)
    .text(`RECIBO DE BOLSA DE ESTÁGIO`, { align: 'center' });
  doc.fontSize(11).font('Helvetica').fillColor('#666666')
    .text(`Nº ${recibo.numeroRecibo} — ${mesAno.charAt(0).toUpperCase() + mesAno.slice(1)}`, { align: 'center' });

  doc.moveDown(1.5);
  doc.fillColor('#000000');

  // Dados do estagiário
  doc.fontSize(10).font('Helvetica-Bold').text('DADOS DO ESTAGIÁRIO', 50);
  doc.moveDown(0.3);
  doc.font('Helvetica').fontSize(9);
  doc.text(`Nome: ${recibo.entidade.nome}`);
  if (recibo.entidade.nif) doc.text(`NIF: ${recibo.entidade.nif}`);
  if (recibo.entidade.niss) doc.text(`NISS: ${recibo.entidade.niss}`);
  if (recibo.entidade.funcao) doc.text(`Função: ${recibo.entidade.funcao}`);
  if (recibo.entidade.tipoVinculo) doc.text(`Vínculo: ${recibo.entidade.tipoVinculo}`);
  if (recibo.reciboProcessos.length > 0) {
    const procs = recibo.reciboProcessos.map(rp => rp.evento.nome + (rp.evento.numeroProcesso ? ` (${rp.evento.numeroProcesso})` : '')).join(', ');
    doc.text(`Processo(s): ${procs}`);
  }
  doc.text(`Período: ${formatDate(recibo.periodoInicio)} a ${formatDate(recibo.periodoFim)} (${recibo.diasUteis} dias úteis)`);

  // Discriminação
  doc.moveDown(1.5);
  doc.font('Helvetica-Bold').fontSize(10).text('DISCRIMINAÇÃO DE VALORES', 50);
  doc.moveDown(0.5);

  const tableX = 50;
  const tableW = 495;
  const colDesc = tableX;
  const colVal = tableX + 350;
  let ty = doc.y;

  // Table header
  doc.rect(tableX, ty, tableW, 20).fill('#f3f4f6');
  doc.fillColor('#000000').font('Helvetica-Bold').fontSize(9);
  doc.text('Descrição', colDesc + 8, ty + 5);
  doc.text('Valor', colVal, ty + 5, { width: 137, align: 'right' });
  ty += 22;

  const row = (label: string, value: string, bold = false) => {
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9).fillColor('#000000');
    doc.text(label, colDesc + 8, ty + 4);
    doc.text(value, colVal, ty + 4, { width: 137, align: 'right' });
    doc.moveTo(tableX, ty + 18).lineTo(tableX + tableW, ty + 18).strokeColor('#e5e7eb').lineWidth(0.5).stroke();
    ty += 20;
  };

  const dp = diasCorridos(recibo.periodoInicio, recibo.periodoFim);
  const mesCheio = dp >= 28;
  row('Bolsa mensal (contrato)', formatEur(recibo.bolsaMensal));

  if (!mesCheio) {
    const bolsaProp = +(Number(recibo.bolsaMensal) / 30 * dp).toFixed(2);
    row(`Proporcional ${dp} dias (${formatEur(Number(recibo.bolsaMensal) / 30)}/dia × ${dp}d)`, formatEur(bolsaProp));
  }

  if (Number(recibo.descontoFaltas) > 0) {
    row(`Desconto faltas (${recibo.diasFaltas}d × ${formatEur(Number(recibo.bolsaMensal) / 30)}/dia)`, `- ${formatEur(recibo.descontoFaltas)}`);
  }

  row(`Bolsa bruta`, formatEur(recibo.bolsaBruta), true);

  const taxaTrab = Number(recibo.taxaTSUTrabalhador) * 100;
  row(`Retenção TSU trabalhador (${taxaTrab.toFixed(2)}%)`, `- ${formatEur(recibo.valorTSUTrabalhador)}`);

  if (Number(recibo.subsidioRefeicao) > 0) {
    row(`Subsídio de refeição (${formatEur(recibo.subsidioRefeicaoDia)} × ${recibo.diasUteis} dias) — isento TSU/IRS`, formatEur(recibo.subsidioRefeicao));
  }

  // Líquido
  ty += 4;
  doc.rect(tableX, ty, tableW, 24).fill(INDIGO);
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(11);
  doc.text('LÍQUIDO A RECEBER', colDesc + 8, ty + 6);
  doc.text(formatEur(recibo.totalLiquido), colVal, ty + 6, { width: 137, align: 'right' });
  ty += 30;

  // Encargos patronais (info)
  doc.fillColor('#000000');
  ty += 8;
  doc.rect(tableX, ty, tableW, 20).fill('#fef9c3');
  doc.fillColor('#92400e').font('Helvetica').fontSize(8);
  const taxaPat = Number(recibo.taxaTSUPatronal) * 100;
  doc.text(`Encargo patronal: TSU ${taxaPat.toFixed(2)}% = ${formatEur(recibo.valorTSUPatronal)}  ·  Custo total entidade: ${formatEur(recibo.custoEntidade)}`, colDesc + 8, ty + 5, { width: tableW - 16 });
  ty += 26;

  doc.fillColor('#000000');

  if (recibo.observacoes) {
    doc.y = ty + 10;
    doc.font('Helvetica').fontSize(8).fillColor('#666666')
      .text(`Obs: ${recibo.observacoes}`, 50, doc.y, { width: 495 });
  }

  // Footer
  doc.y = Math.max(doc.y + 40, 620);
  doc.fontSize(8).fillColor('#666666')
    .text(`Estado: ${recibo.estado}${recibo.dataEmissao ? ' | Emitido: ' + formatDate(recibo.dataEmissao) : ''}${recibo.dataPagamento ? ' | Pago: ' + formatDate(recibo.dataPagamento) : ''}`, 50);

  doc.moveDown(3);
  doc.fontSize(9).fillColor('#000000');
  doc.text('_______________________________', 50);
  doc.text('A Direção', 50);
  doc.moveDown(0.5);

  doc.text('_______________________________', 320);
  doc.text('O/A Estagiário/a', 320);

  doc.moveDown(2);
  doc.fontSize(7).fillColor('#999999')
    .text(`Documento gerado pelo sistema Gestor YL em ${new Date().toLocaleDateString('pt-PT')}`, 50, doc.y, { width: 495, align: 'center' });

  doc.end();
});

export default router;
