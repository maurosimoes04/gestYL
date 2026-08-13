import express from 'express';
import { prisma } from '../config/prisma';
import { Prisma } from '@prisma/client';
import { getLogoBuffer } from '../utils/logo';

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

    const doc = new PDFDocument({ margin: 36, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="etiquetas-inventario.pdf"');
    doc.pipe(res);

    const logo = await getLogoBuffer();
    const base = buildPublicBase();

    // Grelha 2 colunas × 5 linhas = 10 etiquetas por página
    const cols = 2, rows = 5;
    const margin = 36;
    const gap = 12;
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

      // Moldura da etiqueta
      doc.roundedRect(x, y, cellW, cellH, 8).lineWidth(1).strokeColor('#cbd5e1').stroke();

      // Faixa superior com logo — faixa contida, logo grande a preencher a faixa
      const bandH = 46;
      const logoH = 40;
      doc.save();
      doc.roundedRect(x, y, cellW, bandH, 8).fill('#0f172a');
      doc.rect(x, y + bandH - 10, cellW, 10).fill('#0f172a');
      if (logo) { try { doc.image(logo, x + 12, y + (bandH - logoH) / 2, { height: logoH }); } catch {} }
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8.5)
        .text('INVENTÁRIO', x + 10, y + bandH / 2 - 5, { width: cellW - 22, align: 'right' });
      doc.restore();

      // QR à direita
      const qrSize = Math.min(cellH - bandH - 18, 92);
      const qrBuf = await QRCode.toBuffer(`${base}/item/${encodeURIComponent(it.codigoPatrimonio!)}`, { margin: 1, width: 300 });
      const qrX = x + cellW - qrSize - 12;
      const qrY = y + bandH + 8;
      try { doc.image(qrBuf, qrX, qrY, { width: qrSize, height: qrSize }); } catch {}

      // Texto à esquerda: código em destaque + nome
      const textW = cellW - qrSize - 34;
      doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(16)
        .text(it.codigoPatrimonio!, x + 12, y + bandH + 12, { width: textW });
      doc.fillColor('#334155').font('Helvetica').fontSize(9)
        .text(it.nome, x + 12, y + bandH + 36, { width: textW, height: cellH - bandH - 48, ellipsis: true });
      if (it.localizacao) {
        doc.fillColor('#64748b').font('Helvetica').fontSize(8)
          .text(it.localizacao, x + 12, y + cellH - 20, { width: textW, ellipsis: true });
      }
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

router.post('/', async (req, res) => {
  try {
    const ALLOWED_FIELDS = ['tipo', 'nome', 'categoria', 'quantidade', 'unidade', 'localizacao', 'estado', 'custoUnitario', 'dataAquisicao', 'dataValidade', 'quantidadeMinima', 'notas', 'faturaId'];
    const payload: any = {};
    for (const k of ALLOWED_FIELDS) {
      const v = req.body[k];
      if (v !== undefined && v !== '' && v !== null) payload[k] = v;
    }
    if (payload.quantidade) payload.quantidade = parseFloat(payload.quantidade);
    if (payload.custoUnitario) payload.custoUnitario = parseFloat(payload.custoUnitario);
    if (payload.quantidadeMinima) payload.quantidadeMinima = parseFloat(payload.quantidadeMinima);
    if (payload.dataAquisicao) payload.dataAquisicao = new Date(payload.dataAquisicao);
    else delete payload.dataAquisicao;
    if (payload.dataValidade) payload.dataValidade = new Date(payload.dataValidade);
    else delete payload.dataValidade;
    if (payload.faturaId) payload.faturaId = Number(payload.faturaId);
    else delete payload.faturaId;
    // Bens fixos recebem automaticamente um código de património.
    if (payload.tipo === 'fixo') payload.codigoPatrimonio = await proximoCodigoPatrimonio();
    const novo = await prisma.inventario.create({ data: payload });
    res.status(201).json(novo);
  } catch (err) {
    res.status(400).json({ error: 'Erro ao criar item' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const ALLOWED_FIELDS = ['tipo', 'nome', 'categoria', 'quantidade', 'unidade', 'localizacao', 'estado', 'custoUnitario', 'dataAquisicao', 'dataValidade', 'quantidadeMinima', 'notas', 'faturaId'];
    const payload: any = {};
    for (const k of ALLOWED_FIELDS) {
      if (req.body[k] !== undefined) payload[k] = req.body[k];
    }
    if (payload.quantidade) payload.quantidade = parseFloat(payload.quantidade);
    if (payload.custoUnitario) payload.custoUnitario = parseFloat(payload.custoUnitario);
    if (payload.quantidadeMinima) payload.quantidadeMinima = parseFloat(payload.quantidadeMinima);
    if (payload.dataAquisicao) payload.dataAquisicao = new Date(payload.dataAquisicao);
    if (payload.dataValidade) payload.dataValidade = new Date(payload.dataValidade);
    if (payload.faturaId) payload.faturaId = Number(payload.faturaId);
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
  } catch (err) {
    res.status(400).json({ error: 'Erro ao atualizar item' });
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
