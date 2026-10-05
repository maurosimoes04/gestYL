import express from 'express';
import { prisma } from '../config/prisma';
import { Prisma } from '@prisma/client';
import { getLogoBuffer } from '../utils/logo';
import { depreciacaoAnual, depreciacaoAcumulada, valorLiquido, VIDA_UTIL_PADRAO } from '../utils/depreciacao';

const router = express.Router();

// Router público (sem auth) para o QR das etiquetas apontar ao item.
export const inventarioPublicRouter = express.Router();

function buildPublicBase() {
  return process.env.APP_URL || 'http://localhost:3000';
}

// Calcula o próximo código de património sequencial (YL-0001, YL-0002, ...).
async function proximoCodigoPatrimonio(): Promise<string> {
  const comCodigo = await prisma.inventario.findMany({
    where: { codigoPatrimonio: { not: null } },
    select: { codigoPatrimonio: true },
  });
  let max = 0;
  for (const it of comCodigo) {
    const m = /(\d+)\s*$/.exec(it.codigoPatrimonio || '');
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `YL-${String(max + 1).padStart(4, '0')}`;
}

/**
 * GET /inventario/depreciacoes?ano=
 * Mapa de depreciações do exercício: para cada ativo capitalizado, calcula
 * depreciação acumulada e do ano. Base para o lançamento contabilístico (68).
 */
router.get('/depreciacoes', async (req, res) => {
  try {
    const ano = Number(req.query.ano) || new Date().getFullYear();
    const dataRef = new Date(`${ano}-12-31`);
    const dataRefAnoAnterior = new Date(`${ano - 1}-12-31`);

    const itens = await prisma.inventario.findMany({
      where: { tipo: 'fixo', dataAquisicao: { not: null }, anosDepreciacao: { not: null } },
      include: { contaSnc: { select: { codigo: true, nome: true } } },
      orderBy: { dataAquisicao: 'asc' },
    });

    const resultado = itens.map(it => {
      const custo = Number(it.custoUnitario || 0);
      const residual = Number(it.valorResidual || 0);
      const anos = it.anosDepreciacao || 0;
      const dAq = it.dataAquisicao!;
      const acum = depreciacaoAcumulada({ custoAquisicao: custo, anos, dataAquisicao: dAq, dataReferencia: dataRef, valorResidual: residual, dataAbateReal: it.dataAbateReal });
      const acumAnterior = depreciacaoAcumulada({ custoAquisicao: custo, anos, dataAquisicao: dAq, dataReferencia: dataRefAnoAnterior, valorResidual: residual, dataAbateReal: it.dataAbateReal });
      const anual = acum - acumAnterior;
      const liquido = Math.max(residual, custo - acum);
      return {
        id: it.id,
        nome: it.nome,
        codigo: it.codigoPatrimonio,
        contaSnc: it.contaSnc,
        dataAquisicao: it.dataAquisicao,
        custo,
        anos,
        depreciacaoAcumulada: Number(acum.toFixed(2)),
        depreciacaoAno: Number(anual.toFixed(2)),
        valorLiquido: Number(liquido.toFixed(2)),
      };
    });

    const totalAno = resultado.reduce((s, i) => s + i.depreciacaoAno, 0);
    const totalAcumulado = resultado.reduce((s, i) => s + i.depreciacaoAcumulada, 0);
    const totalCusto = resultado.reduce((s, i) => s + i.custo, 0);

    res.json({
      ano,
      itens: resultado,
      totais: { custo: totalCusto, acumulado: totalAcumulado, ano: totalAno, liquido: totalCusto - totalAcumulado },
    });
  } catch (err: any) {
    console.error('Erro depreciações:', err);
    res.status(500).json({ error: err.message || 'Erro' });
  }
});

/**
 * POST /inventario/criar-de-despesa
 * { faturaId, nome?, categoria?, anosDepreciacao?, contaSncCodigo? }
 * Cria um item de inventário (ativo fixo) a partir de uma despesa já registada.
 * Preenche o custoUnitario = fatura.valor e liga via despesaOrigemId.
 */
router.post('/criar-de-despesa', async (req, res) => {
  try {
    const { faturaId, nome, categoria, anosDepreciacao, contaSncCodigo } = req.body;
    if (!faturaId) return res.status(400).json({ error: 'faturaId obrigatório' });

    const fatura = await prisma.fatura.findUnique({
      where: { id: Number(faturaId) },
      include: { contaSnc: true },
    });
    if (!fatura) return res.status(404).json({ error: 'Despesa não encontrada' });

    const contaCod = contaSncCodigo || fatura.contaSnc?.codigo || '435';
    const contaSnc = await prisma.contaSNC.findUnique({ where: { codigo: contaCod } });
    const anos = Number(anosDepreciacao) || VIDA_UTIL_PADRAO[contaCod] || 8;

    const inv = await prisma.inventario.create({
      data: {
        tipo: 'fixo',
        nome: nome || fatura.titulo,
        categoria: categoria || 'Equipamento',
        quantidade: 1,
        custoUnitario: Number(fatura.valor),
        dataAquisicao: fatura.data,
        contaSncId: contaSnc?.id || null,
        anosDepreciacao: anos,
        despesaOrigemId: fatura.id,
        codigoPatrimonio: await proximoCodigoPatrimonio(),
        estado: 'Ativo',
      },
    });
    res.status(201).json(inv);
  } catch (err: any) {
    console.error('Erro criar-de-despesa:', err);
    res.status(400).json({ error: err.message || 'Erro' });
  }
});

/**
 * GET /inventario/candidatos-ativo
 * Lista faturas que estão classificadas em conta 43x (ativo) e ainda não têm
 * um item de inventário associado (via despesaOrigemId).
 */
router.get('/candidatos-ativo', async (_req, res) => {
  try {
    const faturas = await prisma.fatura.findMany({
      where: {
        contaSnc: { codigo: { startsWith: '43' } },
        inventariosOriginados: { none: {} },
      },
      include: { contaSnc: { select: { codigo: true, nome: true } }, entidade: { select: { nome: true } } },
      orderBy: { data: 'desc' },
    });
    res.json(faturas);
  } catch (err: any) {
    console.error('Erro candidatos:', err);
    res.status(500).json({ error: err.message || 'Erro' });
  }
});

/**
 * POST /inventario/:id/movimento — regista movimento de stock e ajusta qty do item.
 * body: { tipo: 'entrada'|'consumo'|'ajuste'|'perda', quantidade, data?, processoId?, faturaId?, notas? }
 * Para "ajuste", quantidade é o novo valor absoluto; para os outros é a quantidade do movimento.
 */
router.post('/:id/movimento', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const item = await prisma.inventario.findUnique({ where: { id } });
    if (!item) return res.status(404).json({ error: 'Item não encontrado' });

    const { tipo, quantidade, data, processoId, faturaId, notas } = req.body || {};
    if (!['entrada', 'consumo', 'ajuste', 'perda'].includes(tipo)) {
      return res.status(400).json({ error: 'tipo inválido' });
    }
    const qty = Number(quantidade);
    if (isNaN(qty) || qty < 0) return res.status(400).json({ error: 'quantidade inválida' });

    const qtdAntes = item.quantidade;
    let qtdDepois: number;
    if (tipo === 'entrada') qtdDepois = qtdAntes + qty;
    else if (tipo === 'ajuste') qtdDepois = qty;             // valor absoluto
    else qtdDepois = Math.max(0, qtdAntes - qty);            // consumo | perda

    const [mov, invAtualizado] = await prisma.$transaction([
      prisma.stockMovimento.create({
        data: {
          inventarioId: id,
          tipo,
          quantidade: qty,
          data: data ? new Date(data) : new Date(),
          processoId: processoId ? Number(processoId) : null,
          faturaId: faturaId ? Number(faturaId) : null,
          qtdAntes, qtdDepois,
          notas: notas || null,
          criadoPorEmail: (req as any).authUser || null,
        },
      }),
      prisma.inventario.update({ where: { id }, data: { quantidade: qtdDepois } }),
    ]);
    res.status(201).json({ movimento: mov, inventario: invAtualizado });
  } catch (err: any) {
    console.error('Erro movimento stock:', err);
    res.status(400).json({ error: err.message || 'Erro' });
  }
});

/** GET /inventario/:id/movimentos — historial de stock de um item */
router.get('/:id/movimentos', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const movs = await prisma.stockMovimento.findMany({
      where: { inventarioId: id },
      orderBy: { data: 'desc' },
      include: {
        processo: { select: { id: true, nome: true, tipo: true } },
        fatura: { select: { id: true, titulo: true, numero: true } },
      },
      take: 200,
    });
    res.json(movs);
  } catch (err: any) {
    console.error('Erro listar movs stock:', err);
    res.status(500).json({ error: err.message || 'Erro' });
  }
});

router.get('/', async (req, res) => {
  try {
    const { q, tipo, categoria, estado, faturaId } = req.query as any;
    const where: Prisma.InventarioWhereInput = {};
    if (tipo) where.tipo = tipo;
    if (categoria) where.categoria = categoria;
    if (estado) where.estado = estado;
    if (faturaId) where.faturaId = Number(faturaId);
    if (q) {
      where.OR = [
        { nome: { contains: q, mode: 'insensitive' } },
        { categoria: { contains: q, mode: 'insensitive' } },
        { localizacao: { contains: q, mode: 'insensitive' } },
      ];
    }
    const itens = await prisma.inventario.findMany({ where, orderBy: { nome: 'asc' } });
    res.json(itens);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao listar inventário' });
  }
});

// Rotas específicas ANTES de /:id
router.get('/export/pdf', async (_req, res) => {
  try {
    const { default: PDFDocument } = await import('pdfkit');
    const itens = await prisma.inventario.findMany({ orderBy: [{ tipo: 'asc' }, { nome: 'asc' }] });
    const doc = new PDFDocument({ margin: 40, layout: 'landscape', size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="inventario.pdf"');
    doc.pipe(res);

    const pageWidth = doc.page.width;
    const usableWidth = pageWidth - doc.page.margins.left - doc.page.margins.right;
    const headerRightPadding = 12;
    doc.rect(doc.page.margins.left, 30, usableWidth, 60).fill('#0f172a');
    try { const logoBuffer = await getLogoBuffer(); if (logoBuffer) doc.image(logoBuffer, 50, 34, { height: 52 }); } catch {}
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(16)
      .text('Inventário Completo', doc.page.margins.left, 42, { width: usableWidth - headerRightPadding, align: 'right' });
    doc.fontSize(10).font('Helvetica')
      .text(`Gerado em: ${new Date().toLocaleDateString('pt-PT')}`, doc.page.margins.left, 64, { width: usableWidth - headerRightPadding, align: 'right' });
    doc.moveDown(2).fillColor('#0f172a');

    const consumiveis = itens.filter((i) => i.tipo === 'consumivel');
    const fixos = itens.filter((i) => i.tipo === 'fixo');

    const formatCurrency = (v?: number | null) => v != null ? `${Number(v).toFixed(2)} €` : '-';
    const formatDatePt = (v?: Date | null) => v ? new Date(v).toLocaleDateString('pt-PT') : '-';

    const renderSecao = (titulo: string, lista: typeof itens) => {
      doc.fontSize(14).font('Helvetica-Bold').text(titulo);
      doc.moveDown(0.5);
      if (!lista.length) { doc.fontSize(10).font('Helvetica').text('Sem itens.'); doc.moveDown(1); return; }
      lista.forEach((it) => {
        doc.fontSize(9).font('Helvetica')
          .text(`${it.nome} | ${it.categoria || '-'} | ${formatDatePt(it.dataValidade)} | Qtd: ${it.quantidade} | ${it.localizacao || '-'} | ${it.estado || '-'} | ${formatCurrency(it.custoUnitario)}`);
      });
      doc.moveDown(1.2);
    };

    renderSecao('Consumíveis', consumiveis);
    renderSecao('Fixos', fixos);
    doc.end();
  } catch (err) {
    res.status(500).json({ error: 'Erro ao exportar inventário' });
  }
});

// Etiquetas de património (PDF) — só para bens fixos com código.
// GET /etiquetas/pdf?ids=1,2,3  (sem ids → todos os fixos com código)
router.get('/etiquetas/pdf', async (req, res) => {
  try {
    const { default: PDFDocument } = await import('pdfkit');
    const QRCode = (await import('qrcode')).default;

    const idsParam = (req.query.ids as string) || '';
    const ids = idsParam.split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => Number.isFinite(n));

    const where: Prisma.InventarioWhereInput = { tipo: 'fixo', codigoPatrimonio: { not: null } };
    if (ids.length) where.id = { in: ids };
    const itens = await prisma.inventario.findMany({ where, orderBy: { codigoPatrimonio: 'asc' } });

    if (!itens.length) return res.status(404).json({ error: 'Sem bens fixos com código para etiquetar.' });

    const doc = new PDFDocument({ margin: 28, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="etiquetas-inventario.pdf"');
    doc.pipe(res);

    const base = buildPublicBase();

    // Grelha 2 × 5 = 10 etiquetas por página
    const cols = 2, rows = 5;
    const margin = 28;
    const gap = 10;
    const usableW = doc.page.width - margin * 2;
    const usableH = doc.page.height - margin * 2;
    const cellW = (usableW - gap * (cols - 1)) / cols;
    const cellH = (usableH - gap * (rows - 1)) / rows;

    for (let i = 0; i < itens.length; i++) {
      const it = itens[i];
      const posInPage = i % (cols * rows);
      if (i > 0 && posInPage === 0) doc.addPage();
      const col = posInPage % cols;
      const row = Math.floor(posInPage / cols);
      const x = margin + col * (cellW + gap);
      const y = margin + row * (cellH + gap);

      // Moldura exterior com cantos arredondados
      doc.save();
      doc.roundedRect(x, y, cellW, cellH, 10).lineWidth(1.2).strokeColor('#e5e7eb').stroke();

      // Faixa índigo YL à esquerda (acento vertical) + mini-barra ao fundo
      doc.rect(x, y, 6, cellH).fill('#4f46e5');

      // Cabeçalho: "YOUNG-LINK · INVENTÁRIO"
      const headerX = x + 16;
      const headerY = y + 10;
      doc.fillColor('#4f46e5').font('Helvetica-Bold').fontSize(7)
         .text('YOUNG-LINK · INVENTÁRIO', headerX, headerY, { width: cellW - 24, characterSpacing: 2 });

      // Código grande e distintivo (como "título" do cartão)
      doc.fillColor('#0a0a0a').font('Helvetica-Bold').fontSize(22)
         .text(it.codigoPatrimonio!, headerX, headerY + 10, { width: cellW - 24 });

      // Nome em destaque secundário
      doc.fillColor('#4b5563').font('Helvetica').fontSize(10)
         .text(it.nome, headerX, headerY + 36, { width: cellW - 110, height: 28, ellipsis: true, lineGap: 2 });

      // QR embaixo à direita (dentro da célula, afastado da faixa)
      const qrSize = Math.min(cellH - 50, 72);
      const qrBuf = await QRCode.toBuffer(`${base}/item/${encodeURIComponent(it.codigoPatrimonio!)}`, {
        margin: 0, width: 300, color: { dark: '#0a0a0a', light: '#ffffff' },
      });
      const qrX = x + cellW - qrSize - 12;
      const qrY = y + cellH - qrSize - 12;
      try { doc.image(qrBuf, qrX, qrY, { width: qrSize, height: qrSize }); } catch {}

      // Localização / categoria no rodapé esquerdo
      const metaY = y + cellH - 28;
      const metaParts: string[] = [];
      if (it.categoria) metaParts.push(it.categoria);
      if (it.localizacao) metaParts.push(`📍 ${it.localizacao}`);
      doc.fillColor('#6b7280').font('Helvetica').fontSize(7.5)
         .text(metaParts.join('  ·  '), headerX, metaY, { width: cellW - qrSize - 28 });

      // Instrução "Aponta a câmara ao QR"
      doc.fillColor('#9ca3af').font('Helvetica-Oblique').fontSize(6.5)
         .text('Lê o QR para ver detalhes', headerX, y + cellH - 14, { width: cellW - qrSize - 28 });

      doc.restore();
    }

    doc.end();
  } catch (err) {
    console.error('Erro ao gerar etiquetas:', (err as any).message || err);
    if (!res.headersSent) res.status(500).json({ error: 'Erro ao gerar etiquetas' });
  }
});

// Rotas genéricas /:id DEPOIS das específicas
router.get('/:id', async (req, res) => {
  try {
    const item = await prisma.inventario.findUnique({ where: { id: Number(req.params.id) } });
    if (!item) return res.status(404).json({ error: 'Item não encontrado' });
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao obter item' });
  }
});

const INV_FIELDS = ['tipo', 'nome', 'categoria', 'quantidade', 'unidade', 'localizacao', 'estado',
                    'custoUnitario', 'dataAquisicao', 'dataValidade', 'quantidadeMinima',
                    'notas', 'faturaId', 'contaSncId', 'anosDepreciacao'];

function sanitizeInventario(body: any): any {
  const payload: any = {};
  for (const k of INV_FIELDS) {
    if (body[k] === undefined) continue;
    payload[k] = body[k];
  }
  // Coerção de tipos
  if (payload.quantidade != null && payload.quantidade !== '') payload.quantidade = parseFloat(payload.quantidade);
  if (payload.custoUnitario != null && payload.custoUnitario !== '') payload.custoUnitario = parseFloat(payload.custoUnitario);
  if (payload.quantidadeMinima != null && payload.quantidadeMinima !== '') payload.quantidadeMinima = parseFloat(payload.quantidadeMinima);
  if (payload.anosDepreciacao != null && payload.anosDepreciacao !== '') payload.anosDepreciacao = parseInt(payload.anosDepreciacao, 10);
  if (payload.contaSncId != null && payload.contaSncId !== '') payload.contaSncId = Number(payload.contaSncId);
  if (payload.faturaId != null && payload.faturaId !== '') payload.faturaId = Number(payload.faturaId);
  if (payload.dataAquisicao) payload.dataAquisicao = new Date(payload.dataAquisicao);
  if (payload.dataValidade) payload.dataValidade = new Date(payload.dataValidade);
  // Valores vazios → null (apagam)
  for (const k of ['dataValidade', 'quantidadeMinima', 'contaSncId', 'anosDepreciacao', 'faturaId', 'custoUnitario']) {
    if (payload[k] === '' || Number.isNaN(payload[k])) payload[k] = null;
  }
  return payload;
}

router.post('/', async (req, res) => {
  try {
    const payload = sanitizeInventario(req.body);
    if (payload.quantidade == null) payload.quantidade = 0;
    // Bens fixos recebem automaticamente um código de património.
    if (payload.tipo === 'fixo') payload.codigoPatrimonio = await proximoCodigoPatrimonio();
    const novo = await prisma.inventario.create({ data: payload });
    res.status(201).json(novo);
  } catch (err: any) {
    console.error('Erro criar inventario:', err.message || err);
    res.status(400).json({ error: err.message || 'Erro ao criar item' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const payload = sanitizeInventario(req.body);
    // Se passou a ser fixo e ainda não tem código, atribuir um.
    if (payload.tipo === 'fixo') {
      const atual = await prisma.inventario.findUnique({ where: { id: Number(req.params.id) }, select: { codigoPatrimonio: true } });
      if (!atual?.codigoPatrimonio) payload.codigoPatrimonio = await proximoCodigoPatrimonio();
    }
    const item = await prisma.inventario.update({
      where: { id: Number(req.params.id) },
      data: payload,
    });
    res.json(item);
  } catch (err: any) {
    console.error('Erro atualizar inventario:', err.message || err);
    res.status(400).json({ error: err.message || 'Erro ao atualizar item' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await prisma.inventario.delete({ where: { id: Number(req.params.id) } });
    res.json({ message: 'Item removido com sucesso' });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao remover item' });
  }
});

// --- API pública (sem auth): destino do QR das etiquetas ---
// Devolve APENAS campos descritivos, não-financeiros (sem custo/fatura/notas).
inventarioPublicRouter.get('/:codigo', async (req, res) => {
  try {
    const item = await prisma.inventario.findUnique({
      where: { codigoPatrimonio: req.params.codigo },
      select: {
        codigoPatrimonio: true, nome: true, categoria: true, tipo: true,
        localizacao: true, estado: true, dataAquisicao: true,
      },
    });
    if (!item || !item.codigoPatrimonio) return res.status(404).json({ error: 'Item não encontrado' });
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao obter item' });
  }
});

export default router;
