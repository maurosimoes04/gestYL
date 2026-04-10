import express from 'express';
import PDFDocument from 'pdfkit';
import { prisma } from '../config/prisma';
import { Prisma } from '@prisma/client';
import { getLogoBuffer } from '../utils/logo';

const router = express.Router();

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
    res.status(500).json({ error: 'Erro ao listar inventário', details: err });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const item = await prisma.inventario.findUnique({ where: { id: Number(req.params.id) } });
    if (!item) return res.status(404).json({ error: 'Item não encontrado' });
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao obter item', details: err });
  }
});

router.post('/', async (req, res) => {
  try {
    const payload: any = { ...req.body };
    if (payload.quantidade) payload.quantidade = parseFloat(payload.quantidade);
    if (payload.custoUnitario) payload.custoUnitario = parseFloat(payload.custoUnitario);
    if (payload.quantidadeMinima) payload.quantidadeMinima = parseFloat(payload.quantidadeMinima);
    if (payload.dataAquisicao) payload.dataAquisicao = new Date(payload.dataAquisicao);
    else delete payload.dataAquisicao;
    if (payload.dataValidade) payload.dataValidade = new Date(payload.dataValidade);
    else delete payload.dataValidade;
    if (payload.faturaId) payload.faturaId = Number(payload.faturaId);
    else delete payload.faturaId;
    const novo = await prisma.inventario.create({ data: payload });
    res.status(201).json(novo);
  } catch (err) {
    res.status(400).json({ error: 'Erro ao criar item', details: err });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const payload: any = { ...req.body };
    if (payload.quantidade) payload.quantidade = parseFloat(payload.quantidade);
    if (payload.custoUnitario) payload.custoUnitario = parseFloat(payload.custoUnitario);
    if (payload.quantidadeMinima) payload.quantidadeMinima = parseFloat(payload.quantidadeMinima);
    if (payload.dataAquisicao) payload.dataAquisicao = new Date(payload.dataAquisicao);
    if (payload.dataValidade) payload.dataValidade = new Date(payload.dataValidade);
    if (payload.faturaId) payload.faturaId = Number(payload.faturaId);
    const item = await prisma.inventario.update({
      where: { id: Number(req.params.id) },
      data: payload,
    });
    res.json(item);
  } catch (err) {
    res.status(400).json({ error: 'Erro ao atualizar item', details: err });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await prisma.inventario.delete({ where: { id: Number(req.params.id) } });
    res.json({ message: 'Item removido com sucesso' });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao remover item', details: err });
  }
});

// Exportar inventário em PDF
router.get('/export/pdf', async (_req, res) => {
  try {
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
    res.status(500).json({ error: 'Erro ao exportar inventário', details: err });
  }
});

export default router;
