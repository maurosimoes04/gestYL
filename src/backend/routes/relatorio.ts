import express from 'express';
import PDFDocument from 'pdfkit';
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

const formatCurrency = (v: number) => `${v.toFixed(2)} €`;
const formatDateStr = (d: string | Date) => new Date(d).toLocaleDateString('pt-PT');

function drawHeader(doc: InstanceType<typeof PDFDocument>, titulo: string, periodoLabel: string, logoBuffer: Buffer | null) {
  doc.rect(40, 30, 520, 60).fill('#0f172a');
  if (logoBuffer) try { doc.image(logoBuffer, 50, 34, { height: 52 }); } catch {}
  doc.fillColor('#ffffff').fontSize(14).font('Helvetica-Bold').text(titulo, 200, 45, { width: 340, align: 'right' });
  doc.fontSize(10).font('Helvetica').text(`Período: ${periodoLabel}`, 200, 65, { width: 340, align: 'right' });
  doc.moveDown(2).fillColor('#0f172a');
}

function drawFinanceTable(doc: InstanceType<typeof PDFDocument>, rows: Array<{ cells: [string, string]; fill?: string; color?: string; bold?: boolean }>) {
  const startX = 40;
  const tableWidth = 520;
  const colWidths = [360, 160];
  let y = doc.y;
  const rowHeight = 26;
  rows.forEach((row) => {
    if (y + rowHeight > doc.page.height - 50) { doc.addPage(); y = doc.y; }
    if (row.fill) doc.rect(startX, y, tableWidth, rowHeight).fill(row.fill);
    doc.fillColor(row.color || '#0f172a').font(row.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(11);
    doc.text(row.cells[0], startX + 10, y + 6, { width: colWidths[0] - 16, align: 'left' });
    doc.text(row.cells[1], startX + colWidths[0] + 10, y + 6, { width: colWidths[1] - 20, align: 'right' });
    y += rowHeight;
    doc.moveTo(startX, y - 1).lineTo(startX + tableWidth, y - 1).strokeColor('#e2e8f0').lineWidth(0.5).stroke();
  });
  doc.moveDown(1).fillColor('#0f172a').strokeColor('#0f172a');
}

router.get('/pdf', async (req, res) => {
  try {
    const tipo: TipoRelatorio = (req.query.tipo as TipoRelatorio) || 'ambos';
    const { inicio, fim, label: periodoLabel } = parsePeriodo(req.query);

    type FaturaRow = Awaited<ReturnType<typeof prisma.fatura.findMany>>[number];
    type ReceitaRow = Awaited<ReturnType<typeof prisma.receita.findMany>>[number];

    const [faturas, receitas, eventos] = await Promise.all([
      tipo === 'receitas' ? Promise.resolve([] as FaturaRow[]) : prisma.fatura.findMany({ where: { data: { gte: new Date(inicio), lte: new Date(fim) } }, orderBy: { data: 'desc' } }),
      tipo === 'despesas' ? Promise.resolve([] as ReceitaRow[]) : prisma.receita.findMany({ where: { data: { gte: new Date(inicio), lte: new Date(fim) } }, orderBy: { data: 'desc' } }),
      prisma.evento.findMany(),
    ]);

    const eventosMap = new Map(eventos.map((e) => [e.id, e.nome]));
    const eventosDeptMap = new Map(eventos.filter((e) => e.departamento).map((e) => [e.id, e.departamento!]));

    const toNum = (v: any) => Number(v) || 0;
    const totalDespesas = faturas.reduce((s, f) => s + toNum(f.valor), 0);
    const totalReceitas = receitas.reduce((s, r) => s + toNum(r.valor), 0);
    const saldo = totalReceitas - totalDespesas;

    const groupBy = (items: any[], key: string) => {
      const map: Record<string, number> = {};
      items.forEach((it) => { const k = it[key] || 'Sem informação'; map[k] = (map[k] || 0) + toNum(it.valor); });
      return map;
    };

    const depDespesas = groupBy(faturas, 'departamento');
    const catReceitas = groupBy(receitas, 'categoria');
    const depReceitas: Record<string, number> = {};
    receitas.forEach((r) => { const k = (r.eventoId ? eventosDeptMap.get(r.eventoId) : undefined) || 'Sem departamento'; depReceitas[k] = (depReceitas[k] || 0) + toNum(r.valor); });

    const doc = new PDFDocument({ margin: 40 });
    res.header('Content-Type', 'application/pdf');
    res.attachment('relatorio-financeiro.pdf');
    doc.pipe(res);

    const logoBuffer = await getLogoBuffer();
    const tituloRel = tipo === 'despesas' ? 'Relatório de Despesas' : tipo === 'receitas' ? 'Relatório de Receitas' : 'Relatório Financeiro';
    drawHeader(doc, tituloRel, periodoLabel, logoBuffer);

    const tableRows: Array<{ cells: [string, string]; fill?: string; color?: string; bold?: boolean }> = [];
    tableRows.push({ cells: ['Resumo do Período', periodoLabel], fill: '#f8fafc', bold: true });
    if (tipo !== 'receitas') tableRows.push({ cells: ['Total de Despesas', formatCurrency(totalDespesas)], fill: '#ffe2e5', color: '#b91c1c', bold: true });
    if (tipo !== 'despesas') tableRows.push({ cells: ['Total de Receitas', formatCurrency(totalReceitas)], fill: '#e2fee3', color: '#15803d', bold: true });
    if (tipo === 'ambos') tableRows.push({ cells: ['Saldo do Período', formatCurrency(saldo)], fill: saldo >= 0 ? '#dcfce7' : '#fee2e2', color: saldo >= 0 ? '#166534' : '#b91c1c', bold: true });

    if (tipo !== 'receitas') {
      tableRows.push({ cells: ['Despesas por Departamento', ''], fill: '#f1f5f9', bold: true });
      Object.entries(depDespesas).sort((a, b) => b[1] - a[1]).forEach(([dep, val]) => tableRows.push({ cells: [dep, formatCurrency(val)] }));
    }
    if (tipo !== 'despesas') {
      tableRows.push({ cells: ['Receitas por Categoria', ''], fill: '#f1f5f9', bold: true });
      Object.entries(catReceitas).sort((a, b) => b[1] - a[1]).forEach(([cat, val]) => tableRows.push({ cells: [cat, formatCurrency(val)] }));
    }

    doc.moveDown(1).fontSize(12).font('Helvetica-Bold').text('Orçamento / Resumo Financeiro');
    drawFinanceTable(doc, tableRows);
    doc.end();
  } catch (err) {
    console.error('Erro ao gerar PDF:', err);
    res.status(500).json({ erro: 'Erro ao exportar PDF' });
  }
});

export default router;
