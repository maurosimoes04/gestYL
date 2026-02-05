import express from 'express';
import { Op } from 'sequelize';
import PDFDocument from 'pdfkit';
import path from 'path';
import { sequelize } from '../config/database';
import createInventarioModel from '../models/Inventario';

const Inventario = createInventarioModel(sequelize);
const router = express.Router();

const LOGO_PATH = path.join(process.cwd(), 'IMAGENS', 'Despesas Mensais Logo.png');

// Lista inventário com filtros
router.get('/', async (req, res) => {
  try {
    const { q, tipo, categoria, estado, faturaId } = req.query as any;
    const where: any = {};
    if (tipo) where.tipo = tipo;
    if (categoria) where.categoria = categoria;
    if (estado) where.estado = estado;
    if (faturaId) where.faturaId = faturaId;
    if (q) {
      where[Op.or] = [
        { nome: { [Op.like]: `%${q}%` } },
        { categoria: { [Op.like]: `%${q}%` } },
        { localizacao: { [Op.like]: `%${q}%` } }
      ];
    }
    const itens = await Inventario.findAll({ where, order: [['nome', 'ASC']] });
    res.json(itens);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao listar inventário', details: err });
  }
});

// Detalhe por id
router.get('/:id', async (req, res) => {
  try {
    const item = await Inventario.findByPk(req.params.id);
    if (!item) return res.status(404).json({ error: 'Item não encontrado' });
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao obter item', details: err });
  }
});

// Criar item
router.post('/', async (req, res) => {
  try {
    const payload = req.body as any;
    const novo = await Inventario.create(payload);
    res.status(201).json(novo);
  } catch (err) {
    res.status(400).json({ error: 'Erro ao criar item', details: err });
  }
});

// Atualizar item
router.put('/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const item: any = await Inventario.findByPk(id);
    if (!item) return res.status(404).json({ error: 'Item não encontrado' });
    await item.update(req.body);
    res.json(item);
  } catch (err) {
    res.status(400).json({ error: 'Erro ao atualizar item', details: err });
  }
});

// Remover item
router.delete('/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const item: any = await Inventario.findByPk(id);
    if (!item) return res.status(404).json({ error: 'Item não encontrado' });
    await item.destroy();
    res.json({ message: 'Item removido com sucesso' });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao remover item', details: err });
  }
});

// Exportar inventário em PDF
router.get('/export/pdf', async (_req, res) => {
  try {
    const itens = await Inventario.findAll({ order: [['tipo', 'ASC'], ['nome', 'ASC']] });
    const doc = new PDFDocument({ margin: 40, layout: 'landscape', size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="inventario.pdf"');
    doc.pipe(res);

    // Header
    const pageWidth = doc.page.width;
    const usableWidth = pageWidth - doc.page.margins.left - doc.page.margins.right;
    const headerRightPadding = 12;
    doc.rect(doc.page.margins.left, 30, usableWidth, 60).fill('#0f172a');
    try {
      doc.image(LOGO_PATH, 50, 34, { height: 52, valign: 'center' });
    } catch {
      // se não existir logo, prossegue sem imagem
    }
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(16)
      .text('Inventário Completo', doc.page.margins.left, 42, { width: usableWidth - headerRightPadding, align: 'right' });
    doc.fontSize(10).font('Helvetica')
      .text(`Gerado em: ${new Date().toLocaleDateString('pt-PT')}`, doc.page.margins.left, 64, { width: usableWidth - headerRightPadding, align: 'right' });
    doc.moveDown(2).fillColor('#0f172a');

    const formatCurrency = (v?: number) => v != null ? `${Number(v).toFixed(2)} €` : '-';
    const formatDatePt = (v?: string | Date | null) => v ? new Date(v as any).toLocaleDateString('pt-PT') : '-';
    const tableColumns = [
      { label: 'Nome', width: 170, align: 'left' as const },
      { label: 'Categoria', width: 100, align: 'left' as const },
      { label: 'Validade', width: 90, align: 'left' as const },
      { label: 'Qtd', width: 60, align: 'center' as const },
      { label: 'Unidade', width: 60, align: 'left' as const },
      { label: 'Localização', width: 120, align: 'left' as const },
      { label: 'Estado', width: 70, align: 'left' as const },
      { label: 'Custo unitário', width: 80, align: 'right' as const }
    ];
    const tableWidth = tableColumns.reduce((acc, c) => acc + c.width, 0);

    const ensureSpace = (height: number, onBreak?: () => void) => {
      if (doc.y + height > doc.page.height - doc.page.margins.bottom) {
        doc.addPage();
        if (onBreak) onBreak();
      }
    };

    const renderSecao = (titulo: string, lista: any[]) => {
      const startX = doc.page.margins.left;
      doc.fontSize(14).font('Helvetica-Bold').text(titulo, startX, doc.y, { align: 'left' });
      doc.moveDown(0.5);
      if (!lista || lista.length === 0) {
        doc.fontSize(10).font('Helvetica').text('Sem itens.');
        doc.moveDown(1);
        return;
      }
      const headerHeight = 18;
      const rowHeight = 18;

      const drawHeader = () => {
        ensureSpace(headerHeight + 4);
        const headerY = doc.y;
        doc.save();
        doc.fillColor('#e2e8f0').rect(startX, headerY, tableWidth, headerHeight).fill();
        doc.restore();
        doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(10);
        let cursorX = startX;
        tableColumns.forEach(col => {
          doc.text(col.label, cursorX + 6, headerY + 4, { width: col.width - 12, align: col.align });
          cursorX += col.width;
        });
        doc.moveTo(startX, headerY + headerHeight).lineTo(startX + tableWidth, headerY + headerHeight).strokeColor('#cbd5e1').lineWidth(0.5).stroke();
        doc.y = headerY + headerHeight + 2;
      };

      const drawRow = (row: any, stripe: boolean) => {
        ensureSpace(rowHeight + 4, () => {
          drawHeader();
        });
        const rowY = doc.y;
        if (stripe) {
          doc.save();
          doc.fillColor('#f8fafc').rect(startX, rowY, tableWidth, rowHeight).fill();
          doc.restore();
        }
        doc.font('Helvetica').fontSize(9).fillColor('#0f172a');
        let cursorX = startX;
        const cells = [
          row.nome,
          row.categoria,
          row.validade,
          row.quantidade,
          row.unidade,
          row.localizacao,
          row.estado,
          row.custo
        ];
        tableColumns.forEach((col, idx) => {
          doc.text(String(cells[idx] ?? '-'), cursorX + 6, rowY + 4, { width: col.width - 12, align: col.align });
          cursorX += col.width;
        });
        doc.moveTo(startX, rowY + rowHeight).lineTo(startX + tableWidth, rowY + rowHeight).strokeColor('#e2e8f0').lineWidth(0.5).stroke();
        doc.y = rowY + rowHeight;
      };

      drawHeader();
      let stripe = false;
      lista.forEach((it: any) => {
        const row = {
          nome: it.nome || '-',
          categoria: it.categoria || '-',
          validade: formatDatePt(it.dataValidade),
          quantidade: it.quantidade ?? '-',
          unidade: it.unidade || '-',
          localizacao: it.localizacao || '-',
          estado: it.estado || '-',
          custo: it.custoUnitario != null ? formatCurrency(it.custoUnitario) : '-'
        };
        drawRow(row, stripe);
        stripe = !stripe;
      });
      doc.moveDown(1.2);
    };

    const consumiveis = itens.filter((i: any) => i.tipo === 'consumivel');
    const fixos = itens.filter((i: any) => i.tipo === 'fixo');
    renderSecao('Consumíveis', consumiveis as any[]);
    renderSecao('Fixos', fixos as any[]);

    doc.end();
  } catch (err) {
    res.status(500).json({ error: 'Erro ao exportar inventário', details: err });
  }
});

export default router;
