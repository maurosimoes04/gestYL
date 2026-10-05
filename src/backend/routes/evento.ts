import express from 'express';
import { prisma } from '../config/prisma';
import { getLogoBuffer } from '../utils/logo';
import { drawDetailTable } from '../utils/pdfTable';

const router = express.Router();

const PROCESSO_FIELDS = ['nome', 'tipo', 'descricao', 'data_inicio', 'data_fim', 'departamento', 'estado',
                         'entidadeFinanciadoraId', 'numeroProcesso', 'valorAprovado',
                         'contaSncReceitaId', 'contaSncDespesaId'];

function sanitizeProcesso(body: any) {
  const payload: any = {};
  for (const k of PROCESSO_FIELDS) {
    const v = body[k];
    if (v === '' || v === null || v === undefined) continue;
    payload[k] = v;
  }
  if (payload.data_inicio) payload.data_inicio = new Date(payload.data_inicio);
  if (payload.data_fim) payload.data_fim = new Date(payload.data_fim);
  if (payload.entidadeFinanciadoraId) payload.entidadeFinanciadoraId = Number(payload.entidadeFinanciadoraId);
  if (payload.contaSncReceitaId) payload.contaSncReceitaId = Number(payload.contaSncReceitaId);
  if (payload.contaSncDespesaId) payload.contaSncDespesaId = Number(payload.contaSncDespesaId);
  if (payload.valorAprovado !== undefined) payload.valorAprovado = parseFloat(payload.valorAprovado);
  return payload;
}

router.post('/', async (req, res) => {
  try {
    const payload = sanitizeProcesso(req.body);
    if (!payload.nome) return res.status(400).json({ error: 'Nome do processo é obrigatório' });
    if (!payload.tipo) payload.tipo = 'Evento';
    const evento = await prisma.evento.create({ data: payload });
    res.status(201).json(evento);
  } catch (err: any) {
    console.error('Erro criar processo:', err.message || err);
    const msg = err.message?.includes('Argument') ? 'Campos obrigatórios em falta (nome)'
      : err.message || 'Erro desconhecido ao criar processo';
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
        faturaEventos: {
          include: { fatura: true },
          orderBy: { fatura: { data: 'desc' } },
        },
        receitaEventos: {
          include: { receita: true },
          orderBy: { receita: { data: 'desc' } },
        },
      },
    });
    if (!evento) return res.status(404).json({ error: 'Evento não encontrado' });

    const toNum = (v: any) => Number(v) || 0;
    const faturas = evento.faturaEventos.map(fe => ({ ...fe.fatura, valorEvento: toNum(fe.valor) }));
    const receitas = evento.receitaEventos.map(re => ({ ...re.receita, valorEvento: toNum(re.valor) }));
    const totalDespesas = evento.faturaEventos.reduce((s, fe) => s + toNum(fe.valor), 0);
    const totalReceitas = evento.receitaEventos.reduce((s, re) => s + toNum(re.valor), 0);

    res.json({
      evento: { ...evento, faturaEventos: undefined, receitaEventos: undefined },
      faturas,
      receitas,
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
        entidadeFinanciadora: { select: { id: true, nome: true, nif: true } },
        contaSncReceita: { select: { codigo: true, nome: true } },
        contaSncDespesa: { select: { codigo: true, nome: true } },
        faturaEventos: {
          include: {
            fatura: {
              include: {
                contaSnc: { select: { codigo: true } },
                entidade: { select: { nome: true, nif: true } },
              },
            },
          },
          orderBy: { fatura: { data: 'desc' } },
        },
        receitaEventos: {
          include: {
            receita: {
              include: {
                contaSnc: { select: { codigo: true } },
                entidade: { select: { nome: true, nif: true } },
              },
            },
          },
          orderBy: { receita: { data: 'desc' } },
        },
      },
    });
    if (!evento) return res.status(404).json({ error: 'Processo não encontrado' });

    const { faturaEventos, receitaEventos, ...eventoData } = evento;
    const faturas = faturaEventos.map(fe => ({ ...fe.fatura, valorEvento: Number(fe.valor) }));
    const receitas = receitaEventos.map(re => ({ ...re.receita, valorEvento: Number(re.valor) }));
    const toNum = (v: any) => Number(v) || 0;
    const fmt = (v: number) => `${v.toFixed(2).replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1 ')} €`;
    const fmtDate = (d: string | Date) => new Date(d).toLocaleDateString('pt-PT');
    const totalDespesas = faturas.reduce((s, f) => s + toNum(f.valorEvento), 0);
    const totalReceitas = receitas.reduce((s, r) => s + toNum(r.valorEvento), 0);
    const saldo = totalReceitas - totalDespesas;
    const tipo = (eventoData as any).tipo || 'Evento';
    const estado = (eventoData as any).estado || '';

    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    res.header('Content-Type', 'application/pdf');
    res.attachment(`${tipo.toLowerCase().replace(/\s+/g, '-')}-${eventoData.nome.replace(/\s+/g, '-').toLowerCase()}.pdf`);
    doc.pipe(res);

    // === Cabeçalho ===
    const logo = await getLogoBuffer();
    doc.rect(40, 30, 515, 70).fill('#4f46e5');
    if (logo) try { doc.image(logo, 50, 38, { height: 54 }); } catch {}
    doc.fillColor('#ffffff').fontSize(10).font('Helvetica').text(tipo.toUpperCase(), 200, 40, { width: 345, align: 'right', characterSpacing: 2 });
    doc.fontSize(17).font('Helvetica-Bold').text(eventoData.nome, 200, 54, { width: 345, align: 'right' });
    const dataInicio = eventoData.data_inicio ? fmtDate(eventoData.data_inicio) : '';
    const dataFim = eventoData.data_fim ? fmtDate(eventoData.data_fim) : '';
    const periodo = dataInicio && dataFim ? `${dataInicio} — ${dataFim}` : dataInicio || dataFim || 'Sem data definida';
    doc.fontSize(10).font('Helvetica').text(periodo, 200, 78, { width: 345, align: 'right' });
    doc.y = 115;
    doc.fillColor('#0a0a0a').strokeColor('#0a0a0a');

    // === Metadados específicos de Subsídio ===
    if (tipo === 'Subsídio') {
      doc.rect(40, doc.y, 515, 60).fill('#eef2ff').stroke();
      const y0 = doc.y + 10;
      doc.fillColor('#4338ca').fontSize(8).font('Helvetica-Bold').text('ENTIDADE FINANCIADORA', 50, y0, { characterSpacing: 1 });
      doc.fillColor('#0a0a0a').fontSize(11).font('Helvetica-Bold').text((eventoData as any).entidadeFinanciadora?.nome || '—', 50, y0 + 12);

      doc.fillColor('#4338ca').fontSize(8).font('Helvetica-Bold').text('Nº PROCESSO', 240, y0, { characterSpacing: 1 });
      doc.fillColor('#0a0a0a').fontSize(11).font('Helvetica').text((eventoData as any).numeroProcesso || '—', 240, y0 + 12);

      doc.fillColor('#4338ca').fontSize(8).font('Helvetica-Bold').text('VALOR APROVADO', 400, y0, { characterSpacing: 1 });
      doc.fillColor('#0a0a0a').fontSize(11).font('Helvetica-Bold').text((eventoData as any).valorAprovado ? fmt(Number((eventoData as any).valorAprovado)) : '—', 400, y0 + 12);

      doc.y = y0 + 50;
      doc.fillColor('#0a0a0a').strokeColor('#0a0a0a');
    }

    // === KPIs ===
    doc.moveDown(0.5);
    const kpiY = doc.y;
    const kpiW = (515 - 10) / 3;
    const drawKPI = (x: number, label: string, value: string, bg: string, fg: string) => {
      doc.rect(x, kpiY, kpiW, 60).fill(bg).stroke();
      doc.fillColor(fg).fontSize(8).font('Helvetica-Bold').text(label.toUpperCase(), x + 12, kpiY + 10, { characterSpacing: 1.3 });
      doc.fontSize(17).font('Helvetica-Bold').text(value, x + 12, kpiY + 25);
    };
    drawKPI(40, 'Receitas', fmt(totalReceitas), '#dcfce7', '#166534');
    drawKPI(40 + kpiW + 5, 'Despesas', fmt(totalDespesas), '#fee2e2', '#991b1b');
    drawKPI(40 + 2 * (kpiW + 5), 'Saldo', fmt(saldo), saldo >= 0 ? '#dcfce7' : '#fee2e2', saldo >= 0 ? '#166534' : '#991b1b');
    doc.y = kpiY + 70;
    doc.fillColor('#0a0a0a').strokeColor('#0a0a0a');

    // === Progresso para Subsídios ===
    if (tipo === 'Subsídio' && (eventoData as any).valorAprovado) {
      const aprovado = Number((eventoData as any).valorAprovado);
      const pct = Math.min(100, (totalReceitas / aprovado) * 100);
      doc.fontSize(9).fillColor('#4b5563').text(`Recebido vs aprovado: ${pct.toFixed(1)}%`, 40, doc.y);
      doc.y += 14;
      doc.rect(40, doc.y, 515, 8).fill('#eef2ff');
      doc.rect(40, doc.y, 515 * (pct / 100), 8).fill('#4f46e5');
      doc.y += 20;
      doc.fillColor('#0a0a0a');
    }

    // === Descrição / departamento ===
    if (eventoData.descricao) {
      doc.moveDown(0.5);
      doc.fontSize(9).font('Helvetica-Oblique').fillColor('#4b5563').text(eventoData.descricao, { width: 515 });
      doc.fillColor('#0a0a0a');
    }
    if (eventoData.departamento || estado) {
      doc.moveDown(0.3);
      const parts: string[] = [];
      if (eventoData.departamento) parts.push(`Departamento: ${eventoData.departamento}`);
      if (estado) parts.push(`Estado: ${estado}`);
      doc.fontSize(9).font('Helvetica').fillColor('#6b7280').text(parts.join('  ·  '));
      doc.fillColor('#0a0a0a');
    }
    doc.moveDown(0.8);

    // === Receitas ===
    if (receitas.length > 0) {
      doc.fontSize(12).font('Helvetica-Bold').fillColor('#166534').text('Receitas associadas');
      doc.moveDown(0.3);
      drawDetailTable(doc, {
        columns: [
          { header: 'Data',       key: 'data',       width: 56 },
          { header: 'Descrição',  key: 'titulo',     width: 160 },
          { header: 'Financiador',key: 'entidade',   width: 125 },
          { header: 'SNC',        key: 'snc',        width: 40 },
          { header: 'Estado',     key: 'estado',     width: 60 },
          { header: 'Valor',      key: 'valor',      width: 74, align: 'right' },
        ],
        zebra: true,
        rows: receitas.map((r: any) => ({
          data: fmtDate(r.data),
          titulo: r.titulo || '-',
          entidade: r.entidade?.nome || r.financiador || '-',
          snc: r.contaSnc?.codigo || '—',
          estado: r.estado || '-',
          valor: fmt(toNum(r.valorEvento)),
        })),
        totalRow: { data: '', titulo: 'Total', entidade: '', snc: '', estado: '', valor: fmt(totalReceitas) },
        totalColor: '#166534',
      });
      doc.moveDown(0.5).fillColor('#0a0a0a').strokeColor('#0a0a0a');
    }

    // === Despesas ===
    if (faturas.length > 0) {
      doc.fontSize(12).font('Helvetica-Bold').fillColor('#991b1b').text('Despesas associadas');
      doc.moveDown(0.3);
      drawDetailTable(doc, {
        columns: [
          { header: 'Data',       key: 'data',       width: 56 },
          { header: 'Nº doc.',    key: 'numero',     width: 70 },
          { header: 'Descrição',  key: 'titulo',     width: 115 },
          { header: 'Fornecedor', key: 'entidade',   width: 110 },
          { header: 'SNC',        key: 'snc',        width: 40 },
          { header: 'Estado',     key: 'estado',     width: 50 },
          { header: 'Valor',      key: 'valor',      width: 74, align: 'right' },
        ],
        zebra: true,
        rows: faturas.map((f: any) => ({
          data: fmtDate(f.data),
          numero: f.numero || '-',
          titulo: f.titulo || '-',
          entidade: f.entidade?.nome || f.fornecedor || '-',
          snc: f.contaSnc?.codigo || '—',
          estado: f.estado || '-',
          valor: fmt(toNum(f.valorEvento)),
        })),
        totalRow: { data: '', numero: '', titulo: 'Total', entidade: '', snc: '', estado: '', valor: fmt(totalDespesas) },
        totalColor: '#991b1b',
      });
      doc.moveDown(0.5).fillColor('#0a0a0a').strokeColor('#0a0a0a');
    }

    if (receitas.length === 0 && faturas.length === 0) {
      doc.moveDown(1);
      doc.fontSize(10).font('Helvetica-Oblique').fillColor('#9ca3af').text('Este processo ainda não tem receitas nem despesas associadas.');
    }

    // === Rodapé ===
    doc.fontSize(8).font('Helvetica').fillColor('#9ca3af')
       .text(`Gerado em ${new Date().toLocaleString('pt-PT')} · Gestor Young-Link`, 40, 800, { width: 515, align: 'center' });

    doc.end();
  } catch (err) {
    console.error('Erro ao gerar PDF processo:', err.message || err);
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
    const payload = sanitizeProcesso(req.body);
    const evento = await prisma.evento.update({
      where: { id: Number(req.params.id) },
      data: payload,
    });
    res.json(evento);
  } catch (err: any) {
    console.error('Erro atualizar processo:', err.message || err);
    res.status(400).json({ error: 'Erro ao atualizar processo' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const evento = await prisma.evento.findUnique({ where: { id } });
    if (!evento) return res.status(404).json({ error: 'Evento não encontrado' });

    await prisma.$transaction([
      prisma.eventoShare.deleteMany({ where: { eventoId: id } }),
      prisma.faturaEvento.deleteMany({ where: { eventoId: id } }),
      prisma.receitaEvento.deleteMany({ where: { eventoId: id } }),
      prisma.evento.delete({ where: { id } }),
    ]);

    res.json({ message: 'Evento e registos associados removidos com sucesso' });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao remover evento' });
  }
});

export default router;
