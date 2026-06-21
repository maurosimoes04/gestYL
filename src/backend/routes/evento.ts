import express from 'express';
import { prisma } from '../config/prisma';
import { getLogoBuffer } from '../utils/logo';

const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const { nome, descricao, data_inicio, data_fim, departamento } = req.body;
    if (!nome) return res.status(400).json({ error: 'Nome do evento é obrigatório' });
    const payload: any = { nome };
    if (descricao) payload.descricao = descricao;
    if (departamento) payload.departamento = departamento;
    if (data_inicio) payload.data_inicio = new Date(data_inicio);
    if (data_fim) payload.data_fim = new Date(data_fim);
    const evento = await prisma.evento.create({ data: payload });
    res.status(201).json(evento);
  } catch (err: any) {
    console.error('Erro criar evento:', err.message || err);
    const msg = err.message?.includes('Argument') ? 'Campos obrigatórios em falta (nome)'
      : err.message || 'Erro desconhecido ao criar evento';
    res.status(400).json({ error: msg });
  }
});

router.get('/', async (_req, res) => {
  try {
    const eventos = await prisma.evento.findMany();
    res.json(eventos);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao listar eventos' });
  }
});

// Rotas específicas ANTES de /:id
router.get('/:id/details', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const evento = await prisma.evento.findUnique({
      where: { id },
      include: {
        faturas: { orderBy: { data: 'desc' } },
        receitas: { orderBy: { data: 'desc' } },
      },
    });
    if (!evento) return res.status(404).json({ error: 'Evento não encontrado' });

    const toNum = (v: any) => Number(v) || 0;
    const totalDespesas = evento.faturas.reduce((s, f) => s + toNum(f.valor), 0);
    const totalReceitas = evento.receitas.reduce((s, r) => s + toNum(r.valor), 0);

    res.json({
      evento: { ...evento, faturas: undefined, receitas: undefined },
      faturas: evento.faturas,
      receitas: evento.receitas,
      resumo: { totalDespesas, totalReceitas, saldo: totalReceitas - totalDespesas },
    });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao obter detalhes do evento' });
  }
});

router.get('/:id/pdf', async (req, res) => {
  try {
    const { default: PDFDocument } = await import('pdfkit');
    const id = Number(req.params.id);
    const evento = await prisma.evento.findUnique({
      where: { id },
      include: {
        faturas: { orderBy: { data: 'desc' } },
        receitas: { orderBy: { data: 'desc' } },
      },
    });
    if (!evento) return res.status(404).json({ error: 'Evento não encontrado' });

    const { faturas, receitas, ...eventoData } = evento;
    const toNum = (v: any) => Number(v) || 0;
    const fmt = (v: number) => `${v.toFixed(2)} €`;
    const fmtDate = (d: string | Date) => new Date(d).toLocaleDateString('pt-PT');
    const totalDespesas = faturas.reduce((s, f) => s + toNum(f.valor), 0);
    const totalReceitas = receitas.reduce((s, r) => s + toNum(r.valor), 0);
    const saldo = totalReceitas - totalDespesas;

    const doc = new PDFDocument({ margin: 40 });
    res.header('Content-Type', 'application/pdf');
    res.attachment(`evento-${eventoData.nome.replace(/\s+/g, '-').toLowerCase()}.pdf`);
    doc.pipe(res);

    const logo = await getLogoBuffer();
    doc.rect(40, 30, 520, 60).fill('#0f172a');
    if (logo) try { doc.image(logo, 50, 34, { height: 52 }); } catch {}
    doc.fillColor('#ffffff').fontSize(14).font('Helvetica-Bold').text(`Evento: ${eventoData.nome}`, 200, 45, { width: 340, align: 'right' });
    const dataInicio = eventoData.data_inicio ? fmtDate(eventoData.data_inicio) : '';
    const dataFim = eventoData.data_fim ? fmtDate(eventoData.data_fim) : '';
    const periodo = dataInicio && dataFim ? `${dataInicio} a ${dataFim}` : dataInicio || dataFim || '';
    doc.fontSize(10).font('Helvetica').text(periodo, 200, 65, { width: 340, align: 'right' });
    doc.moveDown(2).fillColor('#0f172a');

    doc.fontSize(12).font('Helvetica-Bold').text('Resumo Financeiro');
    doc.moveDown(0.3);
    const startX = 40, tableWidth = 520, colWidths = [360, 160], rowHeight = 26;
    const drawRow = (label: string, value: string, fill?: string, color?: string, bold = false) => {
      const y = doc.y;
      if (fill) doc.rect(startX, y, tableWidth, rowHeight).fill(fill);
      doc.fillColor(color || '#0f172a').font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(11);
      doc.text(label, startX + 10, y + 6, { width: colWidths[0] - 16, align: 'left' });
      doc.text(value, startX + colWidths[0] + 10, y + 6, { width: colWidths[1] - 20, align: 'right' });
      doc.y = y + rowHeight;
      doc.moveTo(startX, doc.y - 1).lineTo(startX + tableWidth, doc.y - 1).strokeColor('#e2e8f0').lineWidth(0.5).stroke();
    };

    const col3Widths = [300, 120, 100];
    const drawRow3 = (
      label: string,
      value: string,
      linkLabel: string,
      link?: string,
      fill?: string,
      color?: string,
      bold = false
    ) => {
      const y = doc.y;
      if (fill) doc.rect(startX, y, tableWidth, rowHeight).fill(fill);
      doc.fillColor(color || '#0f172a').font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(10);
      doc.text(label, startX + 10, y + 6, { width: col3Widths[0] - 16, align: 'left' });
      doc.text(value, startX + col3Widths[0] + 10, y + 6, { width: col3Widths[1] - 20, align: 'right' });
      const linkX = startX + col3Widths[0] + col3Widths[1] + 10;
      if (link) {
        doc.fillColor('#2563eb');
        doc.text(linkLabel, linkX, y + 6, {
          width: col3Widths[2] - 20,
          align: 'left',
          link,
          underline: true,
        });
        doc.fillColor(color || '#0f172a');
      } else {
        doc.text(linkLabel, linkX, y + 6, { width: col3Widths[2] - 20, align: 'left' });
      }
      doc.y = y + rowHeight;
      doc.moveTo(startX, doc.y - 1).lineTo(startX + tableWidth, doc.y - 1).strokeColor('#e2e8f0').lineWidth(0.5).stroke();
    };

    const getAnexoLink = (anexo: any) => anexo?.driveWebViewLink || anexo?.driveWebContentLink || '';

    drawRow('Total de Receitas', fmt(totalReceitas), '#e2fee3', '#15803d', true);
    drawRow('Total de Despesas', fmt(totalDespesas), '#ffe2e5', '#b91c1c', true);
    drawRow('Saldo', fmt(saldo), saldo >= 0 ? '#dcfce7' : '#fee2e2', saldo >= 0 ? '#166534' : '#b91c1c', true);
    doc.moveDown(1).fillColor('#0f172a').strokeColor('#0f172a');

    if (eventoData.descricao) {
      doc.fontSize(10).font('Helvetica').text(eventoData.descricao);
      doc.moveDown(1);
    }
    if (eventoData.departamento) {
      doc.fontSize(10).font('Helvetica-Bold').text(`Departamento: ${eventoData.departamento}`);
      doc.moveDown(1);
    }

    if (receitas.length > 0) {
      doc.fontSize(12).font('Helvetica-Bold').text('Receitas');
      doc.moveDown(0.3);
      drawRow3('Título', 'Valor', 'Anexo', undefined, '#f1f5f9', '#0f172a', true);
      receitas.forEach((r) => {
        const link = getAnexoLink(r.anexo);
        drawRow3(
          `${fmtDate(r.data)} — ${r.titulo} (${r.categoria})`,
          fmt(toNum(r.valor)),
          link ? 'Abrir' : '-',
          link || undefined
        );
      });
      doc.moveDown(1).fillColor('#0f172a').strokeColor('#0f172a');
    }

    if (faturas.length > 0) {
      doc.fontSize(12).font('Helvetica-Bold').text('Despesas');
      doc.moveDown(0.3);
      drawRow3('Título', 'Valor', 'Anexo', undefined, '#f1f5f9', '#0f172a', true);
      faturas.forEach((f) => {
        const link = getAnexoLink(f.anexo);
        drawRow3(
          `${fmtDate(f.data)} — ${f.titulo} (${f.departamento})`,
          fmt(toNum(f.valor)),
          link ? 'Abrir' : '-',
          link || undefined
        );
      });
      doc.moveDown(1).fillColor('#0f172a').strokeColor('#0f172a');
    }

    doc.end();
  } catch (err) {
    console.error('Erro ao gerar PDF evento:', err.message || err);
    res.status(500).json({ error: 'Erro ao gerar PDF do evento' });
  }
});

// Rotas genéricas /:id DEPOIS das específicas
router.get('/:id', async (req, res) => {
  try {
    const evento = await prisma.evento.findUnique({ where: { id: Number(req.params.id) } });
    if (!evento) return res.status(404).json({ error: 'Evento não encontrado' });
    res.json(evento);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao obter evento' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const ALLOWED_FIELDS = ['nome', 'descricao', 'data_inicio', 'data_fim', 'departamento'] as const;
    const payload: any = {};
    for (const k of ALLOWED_FIELDS) {
      if (req.body[k] !== undefined) payload[k] = req.body[k];
    }
    if (payload.data_inicio) payload.data_inicio = new Date(payload.data_inicio);
    if (payload.data_fim) payload.data_fim = new Date(payload.data_fim);
    const evento = await prisma.evento.update({
      where: { id: Number(req.params.id) },
      data: payload,
    });
    res.json(evento);
  } catch (err: any) {
    console.error('Erro atualizar evento:', err.message || err);
    res.status(400).json({ error: 'Erro ao atualizar evento' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const evento = await prisma.evento.findUnique({ where: { id } });
    if (!evento) return res.status(404).json({ error: 'Evento não encontrado' });

    await prisma.$transaction([
      prisma.eventoShare.deleteMany({ where: { eventoId: id } }),
      prisma.fatura.deleteMany({ where: { eventoId: id } }),
      prisma.receita.deleteMany({ where: { eventoId: id } }),
      prisma.evento.delete({ where: { id } }),
    ]);

    res.json({ message: 'Evento e registos associados removidos com sucesso' });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao remover evento' });
  }
});

export default router;
