import express from 'express';

type PDFDocumentType = PDFKit.PDFDocument;
import { prisma } from '../config/prisma';
import { getLogoBuffer } from '../utils/logo';

const router = express.Router();
type TipoRelatorio = 'despesas' | 'receitas' | 'ambos';

function parsePeriodo(q: any) {
  const periodo = q.periodo || 'custom';
  if (periodo === 'anual') {
    const ano = parseInt(q.ano, 10) || new Date().getFullYear();
    return { inicio: `${ano}-01-01`, fim: `${ano}-12-31`, label: `Ano ${ano}` };
  }
  const now = new Date();
  const startDefault = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const endDefault = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
  const inicio = q.dateFrom || startDefault;
  const fim = q.dateTo || endDefault;
  return { inicio, fim, label: `${new Date(inicio).toLocaleDateString('pt-PT')} a ${new Date(fim).toLocaleDateString('pt-PT')}` };
}

const fmt = (v: number) => `${v.toFixed(2)} €`;
const fmtDate = (d: string | Date) => new Date(d).toLocaleDateString('pt-PT');
const toNum = (v: any) => Number(v) || 0;

function drawHeader(doc: InstanceType<PDFDocumentType>, titulo: string, periodoLabel: string, logo: Buffer | null) {
  doc.rect(40, 30, 520, 60).fill('#0f172a');
  if (logo) try { doc.image(logo, 50, 34, { height: 52 }); } catch {}
  doc.fillColor('#ffffff').fontSize(14).font('Helvetica-Bold').text(titulo, 200, 45, { width: 340, align: 'right' });
  doc.fontSize(10).font('Helvetica').text(`Período: ${periodoLabel}`, 200, 65, { width: 340, align: 'right' });
  doc.moveDown(2).fillColor('#0f172a');
}

type Row = { cells: [string, string]; fill?: string; color?: string; bold?: boolean };

function drawTable(doc: InstanceType<PDFDocumentType>, rows: Row[]) {
  const startX = 40, tableWidth = 520, colWidths = [360, 160], rowHeight = 26;
  let y = doc.y;
  rows.forEach((row) => {
    if (y + rowHeight > doc.page.height - 50) { doc.addPage(); y = doc.y; }
    if (row.fill) doc.rect(startX, y, tableWidth, rowHeight).fill(row.fill);
    doc.fillColor(row.color || '#0f172a').font(row.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(11);
    doc.text(row.cells[0], startX + 10, y + 6, { width: colWidths[0] - 16, align: 'left' });
    doc.text(row.cells[1], startX + colWidths[0] + 10, y + 6, { width: colWidths[1] - 20, align: 'right' });
    y += rowHeight;
    doc.moveTo(startX, y - 1).lineTo(startX + tableWidth, y - 1).strokeColor('#e2e8f0').lineWidth(0.5).stroke();
  });
  doc.y = y + 8;
  doc.fillColor('#0f172a').strokeColor('#0f172a');
}

function renderBars(doc: InstanceType<PDFDocumentType>, title: string, data: { label: string; value: number }[], maxWidth = 320) {
  const barHeight = 12, gap = 8;
  const anticipatedHeight = 22 + data.length * (barHeight + gap) + 10;
  if (doc.y + anticipatedHeight > doc.page.height - 60) doc.addPage();

  const titleX = 40, titleWidth = 520;
  doc.fontSize(12).font('Helvetica-Bold').text(title, titleX, doc.y, { width: titleWidth, align: 'center' });
  if (!data.length) { doc.fontSize(10).font('Helvetica').text('Sem dados.'); doc.moveDown(); return; }

  const maxVal = Math.max(...data.map(d => d.value), 1);
  const labelX = 40, startX = 160, valueX = startX + maxWidth + 12;
  let y = doc.y + 8;

  data.forEach((d) => {
    if (y + barHeight + gap > doc.page.height - 40) { doc.addPage(); y = doc.y + 8; }
    const width = Math.max(4, (d.value / maxVal) * maxWidth);
    doc.fontSize(9).font('Helvetica').fillColor('#0f172a').text(d.label.slice(0, 30), labelX, y, { width: startX - labelX - 12, align: 'left' });
    doc.rect(startX, y, width, barHeight).fill('#22c55e');
    doc.fillColor('#0f172a').fontSize(10).text(fmt(d.value), valueX, y - 1, { width: 100, align: 'left' });
    y += barHeight + gap;
  });
  doc.y = y + 4;
  doc.fillColor('#0f172a');
}

function groupBy(items: any[], key: string) {
  const map: Record<string, number> = {};
  items.forEach((it) => { const k = it[key] || 'Sem informação'; map[k] = (map[k] || 0) + toNum(it.valor); });
  return map;
}

function groupByFn(items: any[], getter: (item: any) => string | undefined, fallback = 'Sem informação') {
  const map: Record<string, number> = {};
  items.forEach((it) => { const k = getter(it) || fallback; map[k] = (map[k] || 0) + toNum(it.valor); });
  return map;
}

function toArray(obj: Record<string, number>) {
  return Object.entries(obj).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}

router.get('/pdf', async (req, res) => {
  try {
    const { default: PDFDocument } = await import('pdfkit');
    const tipo: TipoRelatorio = (req.query.tipo as TipoRelatorio) || 'ambos';
    const { inicio, fim, label: periodoLabel } = parsePeriodo(req.query);

    type FaturaRow = Awaited<ReturnType<typeof prisma.fatura.findMany>>[number];
    type ReceitaRow = Awaited<ReturnType<typeof prisma.receita.findMany>>[number];

    const dateRange = { gte: new Date(inicio), lte: new Date(fim) };
    const [faturas, receitas, eventos, faturaEventos, receitaEventos] = await Promise.all([
      tipo === 'receitas' ? Promise.resolve([] as FaturaRow[]) : prisma.fatura.findMany({ where: { data: dateRange }, orderBy: { data: 'desc' } }),
      tipo === 'despesas' ? Promise.resolve([] as ReceitaRow[]) : prisma.receita.findMany({ where: { data: dateRange }, orderBy: { data: 'desc' } }),
      prisma.evento.findMany(),
      tipo === 'receitas' ? Promise.resolve([]) : prisma.faturaEvento.findMany({
        where: { fatura: { data: dateRange } },
        include: { evento: { select: { id: true, nome: true, departamento: true } } },
      }),
      tipo === 'despesas' ? Promise.resolve([]) : prisma.receitaEvento.findMany({
        where: { receita: { data: dateRange } },
        include: { evento: { select: { id: true, nome: true, departamento: true } } },
      }),
    ]);

    const eventosMap = new Map(eventos.map((e) => [e.id, e.nome]));

    const totalDespesas = faturas.reduce((s, f) => s + toNum(f.valor), 0);
    const totalReceitas = receitas.reduce((s, r) => s + toNum(r.valor), 0);
    const saldo = totalReceitas - totalDespesas;

    // Agrupamentos
    const depDespesas = groupBy(faturas as any[], 'departamento');
    const catDespesas = groupByFn(faturas as any[], (f) => f.categoria || f.estado, 'Sem categoria');
    const catReceitas = groupBy(receitas as any[], 'categoria');

    const depReceitas: Record<string, number> = {};
    receitaEventos.forEach((re: any) => {
      const dept = re.evento?.departamento || 'Sem departamento';
      depReceitas[dept] = (depReceitas[dept] || 0) + toNum(re.valor);
    });

    const eventoDespesas: Record<string, number> = {};
    faturaEventos.forEach((fe: any) => {
      const nome = fe.evento?.nome || `Evento ${fe.eventoId}`;
      eventoDespesas[nome] = (eventoDespesas[nome] || 0) + toNum(fe.valor);
    });
    const eventoReceitas: Record<string, number> = {};
    receitaEventos.forEach((re: any) => {
      const nome = re.evento?.nome || `Evento ${re.eventoId}`;
      eventoReceitas[nome] = (eventoReceitas[nome] || 0) + toNum(re.valor);
    });

    // PDF
    const doc = new PDFDocument({ margin: 40 });
    res.header('Content-Type', 'application/pdf');
    res.attachment('relatorio-financeiro.pdf');
    doc.pipe(res);

    const logo = await getLogoBuffer();
    const tituloRel = tipo === 'despesas' ? 'Relatório de Despesas' : tipo === 'receitas' ? 'Relatório de Receitas' : 'Relatório Financeiro';
    drawHeader(doc, tituloRel, periodoLabel, logo);

    // --- Tabela resumo ---
    const rows: Row[] = [];
    rows.push({ cells: ['Resumo do Período', periodoLabel], fill: '#f8fafc', bold: true });
    if (tipo !== 'receitas') rows.push({ cells: ['Total de Despesas', fmt(totalDespesas)], fill: '#ffe2e5', color: '#b91c1c', bold: true });
    if (tipo !== 'despesas') rows.push({ cells: ['Total de Receitas', fmt(totalReceitas)], fill: '#e2fee3', color: '#15803d', bold: true });
    if (tipo === 'ambos') rows.push({ cells: ['Saldo do Período', fmt(saldo)], fill: saldo >= 0 ? '#dcfce7' : '#fee2e2', color: saldo >= 0 ? '#166534' : '#b91c1c', bold: true });

    if (tipo !== 'receitas') {
      rows.push({ cells: ['Despesas por Departamento', ''], fill: '#f1f5f9', bold: true });
      Object.entries(depDespesas).sort((a, b) => b[1] - a[1]).forEach(([dep, val]) => rows.push({ cells: [dep, fmt(val)] }));
      rows.push({ cells: ['Despesas por Categoria', ''], fill: '#f1f5f9', bold: true });
      Object.entries(catDespesas).sort((a, b) => b[1] - a[1]).forEach(([cat, val]) => rows.push({ cells: [cat, fmt(val)] }));
      rows.push({ cells: ['Despesas por Evento', ''], fill: '#f1f5f9', bold: true });
      Object.entries(eventoDespesas).sort((a, b) => b[1] - a[1]).forEach(([ev, val]) => rows.push({ cells: [ev, fmt(val)] }));
    }

    if (tipo !== 'despesas') {
      rows.push({ cells: ['Receitas por Departamento', ''], fill: '#f1f5f9', bold: true });
      Object.entries(depReceitas).sort((a, b) => b[1] - a[1]).forEach(([dep, val]) => rows.push({ cells: [dep, fmt(val)] }));
      rows.push({ cells: ['Receitas por Categoria', ''], fill: '#f1f5f9', bold: true });
      Object.entries(catReceitas).sort((a, b) => b[1] - a[1]).forEach(([cat, val]) => rows.push({ cells: [cat, fmt(val)] }));
      rows.push({ cells: ['Receitas por Evento', ''], fill: '#f1f5f9', bold: true });
      Object.entries(eventoReceitas).sort((a, b) => b[1] - a[1]).forEach(([ev, val]) => rows.push({ cells: [ev, fmt(val)] }));
    }

    doc.moveDown(1).fontSize(12).font('Helvetica-Bold').text('Orçamento / Resumo Financeiro');
    drawTable(doc, rows);

    // --- Gráficos de barras ---
    if (tipo !== 'receitas') {
      renderBars(doc, 'Despesas por Departamento', toArray(depDespesas));
      renderBars(doc, 'Despesas por Categoria', toArray(catDespesas));
    }
    if (tipo !== 'despesas') {
      renderBars(doc, 'Receitas por Departamento', toArray(depReceitas));
      renderBars(doc, 'Receitas por Categoria', toArray(catReceitas));
    }

    // --- Listagens detalhadas ---
    if (tipo !== 'receitas' && faturas.length > 0) {
      const topDespRows: Row[] = [];
      topDespRows.push({ cells: ['Top Despesas', 'Valor'], fill: '#f1f5f9', bold: true });
      (faturas as any[]).slice(0, 20).forEach((f) => {
        const label = `${fmtDate(f.data)} — ${f.titulo} (${f.departamento || '-'})`;
        topDespRows.push({ cells: [label, fmt(toNum(f.valor))] });
      });
      drawTable(doc, topDespRows);
    }

    if (tipo !== 'despesas' && receitas.length > 0) {
      const topRecRows: Row[] = [];
      topRecRows.push({ cells: ['Top Receitas', 'Valor'], fill: '#f1f5f9', bold: true });
      (receitas as any[]).slice(0, 20).forEach((r) => {
        const label = `${fmtDate(r.data)} — ${r.titulo} (${r.categoria || '-'})`;
        topRecRows.push({ cells: [label, fmt(toNum(r.valor))] });
      });
      drawTable(doc, topRecRows);
    }

    doc.end();
  } catch (err) {
    console.error('Erro ao gerar PDF:', (err as any).message || err);
    res.status(500).json({ error: 'Erro ao exportar PDF' });
  }
});

export default router;
