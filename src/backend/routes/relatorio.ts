import express from 'express';
import PDFDocument from 'pdfkit';
import { Op } from 'sequelize';
import path from 'path';
import { sequelize } from '../config/database';
import createFaturaModel from '../models/Fatura';
import createReceitaModel from '../models/Receita';
import createEventoModel from '../models/Evento';

const router = express.Router();

const Fatura = createFaturaModel(sequelize);
const Receita = createReceitaModel(sequelize);
const Evento = createEventoModel(sequelize);

type TipoRelatorio = 'despesas' | 'receitas' | 'ambos';
type PeriodoTipo = 'custom' | 'anual';

const LOGO_PATH = path.join(process.cwd(), 'IMAGENS', 'Despesas Mensais Logo.png');

function parsePeriodo(q: any): { inicio: Date; fim: Date; label: string } {
  const periodo = (q.periodo as PeriodoTipo) || 'custom';
  if (periodo === 'anual') {
    const ano = parseInt(q.ano as string, 10) || new Date().getFullYear();
    const inicio = new Date(`${ano}-01-01`);
    const fim = new Date(`${ano}-12-31`);
    return { inicio, fim, label: `Ano ${ano}` };
  }
  const now = new Date();
  const startDefault = new Date(now.getFullYear(), now.getMonth(), 1);
  const endDefault = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const inicio = q.dateFrom ? new Date(q.dateFrom as string) : startDefault;
  const fim = q.dateTo ? new Date(q.dateTo as string) : endDefault;
  const label = `${inicio.toLocaleDateString('pt-PT')} a ${fim.toLocaleDateString('pt-PT')}`;
  return { inicio, fim, label };
}

function formatCurrency(v: number) {
  return `${v.toFixed(2)} €`;
}

function formatDateStr(d: string | Date) {
  const dt = new Date(d);
  return dt.toLocaleDateString('pt-PT');
}

function drawHeader(doc: InstanceType<typeof PDFDocument>, titulo: string, periodoLabel: string) {
  // Faixa de topo semelhante ao sistema, com logotipo
  doc.rect(40, 30, 520, 60).fill('#0f172a');
  doc.image(LOGO_PATH, 50, 34, { height: 52, valign: 'center' });
  const textBoxX = 200; // começa mais à direita para encostar o texto ao limite direito
  const textBoxWidth = 340; // termina próximo do limite da faixa (x=560)
  doc.fillColor('#ffffff').fontSize(14).font('Helvetica-Bold').text(titulo, textBoxX, 45, { width: textBoxWidth, align: 'right' });
  doc.fontSize(10).font('Helvetica').text(`Período: ${periodoLabel}`, textBoxX, 65, { width: textBoxWidth, align: 'right' });
  doc.moveDown(2);
  doc.fillColor('#0f172a');
}

function renderBars(doc: InstanceType<typeof PDFDocument>, title: string, data: { label: string; value: number }[], maxWidth = 320) {
  const barHeight = 12;
  const gap = 8;
  const anticipatedHeight = 22 + data.length * (barHeight + gap) + 10;
  if (doc.y + anticipatedHeight > doc.page.height - 60) {
    doc.addPage();
  }
  const titleX = 40;
  const titleWidth = 520;
  doc.fontSize(12).font('Helvetica-Bold').text(title, titleX, doc.y, { width: titleWidth, align: 'center' });
  if (data.length === 0) {
    doc.fontSize(10).font('Helvetica').text('Sem dados.');
    doc.moveDown();
    return;
  }
  const maxVal = Math.max(...data.map(d => d.value), 1);
  const labelX = 40;
  const startX = 160;
  const valueX = startX + maxWidth + 12;
  let y = doc.y + 8;
  data.forEach((d) => {
    const width = Math.max(4, (d.value / maxVal) * maxWidth);
    doc.fontSize(9).font('Helvetica').fillColor('#0f172a').text(d.label.slice(0, 30), labelX, y, { width: startX - labelX - 12, align: 'left' });
    doc.rect(startX, y, width, barHeight).fill('#22c55e');
    doc.fillColor('#0f172a').fontSize(10).text(formatCurrency(d.value), valueX, y - 1, { width: 100, align: 'left' });
    y += barHeight + gap;
  });
  doc.moveDown(1);
  doc.fillColor('#0f172a');
}

function drawFinanceTable(doc: InstanceType<typeof PDFDocument>, rows: Array<{ cells: [string, string]; fill?: string; color?: string; bold?: boolean; fontSize?: number; }>) {
  const startX = 40;
  const tableWidth = 520;
  const colWidths = [360, 160];
  let y = doc.y;
  const rowHeight = 26;
  rows.forEach((row) => {
    const { cells, fill, color, bold, fontSize } = row;
    if (y + rowHeight > doc.page.height - 50) {
      doc.addPage();
      y = doc.y;
    }
    if (fill) {
      doc.rect(startX, y, tableWidth, rowHeight).fill(fill);
    }
    doc.fillColor(color || '#0f172a');
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(fontSize || 11);
    doc.text(cells[0], startX + 10, y + 6, { width: colWidths[0] - 16, align: 'left' });
    doc.text(cells[1], startX + colWidths[0] + 10, y + 6, { width: colWidths[1] - 20, align: 'right' });
    y += rowHeight;
    doc.moveTo(startX, y - 1).lineTo(startX + tableWidth, y - 1).strokeColor('#e2e8f0').lineWidth(0.5).stroke();
  });
  doc.moveDown(1);
  doc.fillColor('#0f172a').strokeColor('#0f172a');
}

router.get('/pdf', async (req, res) => {
  try {
    const tipo: TipoRelatorio = (req.query.tipo as TipoRelatorio) || 'ambos';
    const { inicio, fim, label: periodoLabel } = parsePeriodo(req.query);
    const whereRange = { data: { [Op.gte]: inicio.toISOString().slice(0, 10), [Op.lte]: fim.toISOString().slice(0, 10) } };

    const [faturas, receitas, eventos] = await Promise.all([
      tipo === 'receitas' ? [] : Fatura.findAll({ where: whereRange, order: [['data', 'DESC']] }),
      tipo === 'despesas' ? [] : Receita.findAll({ where: whereRange, order: [['data', 'DESC']] }),
      Evento.findAll()
    ]);

    const eventosMap = new Map<number, string>();
    const eventosDeptMap = new Map<number, string>();
    for (const ev of eventos as any[]) {
      eventosMap.set(ev.id, ev.nome);
      if (ev.departamento) {
        eventosDeptMap.set(ev.id, ev.departamento);
      }
    }

    const totalDespesas = (faturas as any[]).reduce((s, f) => s + parseFloat(f.valor || 0), 0);
    const totalReceitas = (receitas as any[]).reduce((s, r) => s + parseFloat(r.valor || 0), 0);
    const saldo = totalReceitas - totalDespesas;

    const groupBy = (items: any[], key: string) => {
      const map: Record<string, number> = {};
      items.forEach((it) => {
        const k = it[key] || 'Sem informação';
        map[k] = (map[k] || 0) + parseFloat(it.valor || 0);
      });
      return map;
    };

    const groupByAccessor = (items: any[], getter: (item: any) => string | undefined, fallback = 'Sem informação') => {
      const map: Record<string, number> = {};
      items.forEach((it) => {
        const k = getter(it) || fallback;
        map[k] = (map[k] || 0) + parseFloat(it.valor || 0);
      });
      return map;
    };

    const depDespesas = groupBy(faturas as any[], 'departamento');
    const catDespesas = groupByAccessor(faturas as any[], (f) => (f as any).categoria || f.estado, 'Sem categoria');
    const catReceitas = groupBy(receitas as any[], 'categoria');
    const depReceitas = groupByAccessor(receitas as any[], (r) => {
      if (r.eventoId) return eventosDeptMap.get(r.eventoId);
      return undefined;
    }, 'Sem departamento');

    const eventoDespesas = (() => {
      const map: Record<string, number> = {};
      (faturas as any[]).forEach((f) => {
        if (f.eventoId) {
          const nome = eventosMap.get(f.eventoId) || `Evento ${f.eventoId}`;
          map[nome] = (map[nome] || 0) + parseFloat(f.valor || 0);
        }
      });
      return map;
    })();

    const eventoReceitas = (() => {
      const map: Record<string, number> = {};
      (receitas as any[]).forEach((r) => {
        if (r.eventoId) {
          const nome = eventosMap.get(r.eventoId) || `Evento ${r.eventoId}`;
          map[nome] = (map[nome] || 0) + parseFloat(r.valor || 0);
        }
      });
      return map;
    })();

    const doc = new PDFDocument({ margin: 40 });
    res.header('Content-Type', 'application/pdf');
    res.attachment('relatorio-financeiro.pdf');
    doc.pipe(res);

    const tituloRel = tipo === 'despesas' ? 'Relatório de Despesas' : tipo === 'receitas' ? 'Relatório de Receitas' : 'Relatório Financeiro';
    drawHeader(doc, tituloRel, periodoLabel);
    // Tabela principal semelhante a orçamento
    const tableRows: Array<{ cells: [string, string]; fill?: string; color?: string; bold?: boolean; fontSize?: number; }> = [];
    tableRows.push({ cells: ['Resumo do Período', periodoLabel], fill: '#f8fafc', bold: true });
    if (tipo !== 'receitas') tableRows.push({ cells: ['Total de Despesas', formatCurrency(totalDespesas)], fill: '#ffe2e5', color: '#b91c1c', bold: true });
    if (tipo !== 'despesas') tableRows.push({ cells: ['Total de Receitas', formatCurrency(totalReceitas)], fill: '#e2fee3', color: '#15803d', bold: true });
    if (tipo === 'ambos') tableRows.push({ cells: ['Saldo do Período', formatCurrency(saldo)], fill: saldo >= 0 ? '#dcfce7' : '#fee2e2', color: saldo >= 0 ? '#166534' : '#b91c1c', bold: true });

    if (tipo !== 'receitas') {
      tableRows.push({ cells: ['Despesas por Departamento', ''], fill: '#f1f5f9', bold: true });
      Object.entries(depDespesas).sort((a, b) => b[1] - a[1]).forEach(([dep, val]) => {
        tableRows.push({ cells: [dep, formatCurrency(val)] });
      });
      tableRows.push({ cells: ['Despesas por Categoria', ''], fill: '#f1f5f9', bold: true });
      Object.entries(catDespesas).sort((a, b) => b[1] - a[1]).forEach(([cat, val]) => {
        tableRows.push({ cells: [cat, formatCurrency(val)] });
      });
      tableRows.push({ cells: ['Despesas por Evento', ''], fill: '#f1f5f9', bold: true });
      Object.entries(eventoDespesas).sort((a, b) => b[1] - a[1]).forEach(([ev, val]) => {
        tableRows.push({ cells: [ev, formatCurrency(val)] });
      });
    }

    if (tipo !== 'despesas') {
      tableRows.push({ cells: ['Receitas por Departamento', ''], fill: '#f1f5f9', bold: true });
      Object.entries(depReceitas).sort((a, b) => b[1] - a[1]).forEach(([dep, val]) => {
        tableRows.push({ cells: [dep, formatCurrency(val)] });
      });
      tableRows.push({ cells: ['Receitas por Categoria', ''], fill: '#f1f5f9', bold: true });
      Object.entries(catReceitas).sort((a, b) => b[1] - a[1]).forEach(([cat, val]) => {
        tableRows.push({ cells: [cat, formatCurrency(val)] });
      });
      tableRows.push({ cells: ['Receitas por Evento', ''], fill: '#f1f5f9', bold: true });
      Object.entries(eventoReceitas).sort((a, b) => b[1] - a[1]).forEach(([ev, val]) => {
        tableRows.push({ cells: [ev, formatCurrency(val)] });
      });
    }

    doc.moveDown(1);
    doc.fontSize(12).font('Helvetica-Bold').text('Orçamento / Resumo Financeiro', { continued: false });
    drawFinanceTable(doc, tableRows);

    // Gráficos (espelham os do sistema)
    const toArray = (obj: Record<string, number>) => Object.keys(obj).map(k => ({ label: k, value: obj[k] })).sort((a, b) => b.value - a.value);
    if (tipo !== 'receitas') {
      renderBars(doc, 'Despesas por Departamento', toArray(depDespesas));
      renderBars(doc, 'Despesas por Categoria', toArray(catDespesas));
    }
    if (tipo !== 'despesas') {
      renderBars(doc, 'Receitas por Departamento', toArray(depReceitas));
      renderBars(doc, 'Receitas por Categoria', toArray(catReceitas));
    }

    // Listagens finais em tabela
    if (tipo !== 'receitas') {
      const topDespesasRows: Array<{ cells: [string, string]; fill?: string; color?: string; bold?: boolean; fontSize?: number; }> = [];
      topDespesasRows.push({ cells: ['Top Despesas', 'Valor'], fill: '#f1f5f9', bold: true });
      (faturas as any[]).slice(0, 20).forEach((f) => {
        const label = `${formatDateStr(f.data)} — ${f.titulo} (${f.departamento || '-'})`;
        topDespesasRows.push({ cells: [label, formatCurrency(parseFloat(f.valor || 0))] });
      });
      drawFinanceTable(doc, topDespesasRows);
    }

    if (tipo !== 'despesas') {
      const topReceitasRows: Array<{ cells: [string, string]; fill?: string; color?: string; bold?: boolean; fontSize?: number; }> = [];
      topReceitasRows.push({ cells: ['Top Receitas', 'Valor'], fill: '#f1f5f9', bold: true });
      (receitas as any[]).slice(0, 20).forEach((r) => {
        const label = `${formatDateStr(r.data)} — ${r.titulo} (${r.categoria || '-'})`;
        topReceitasRows.push({ cells: [label, formatCurrency(parseFloat(r.valor || 0))] });
      });
      drawFinanceTable(doc, topReceitasRows);
    }

    doc.end();
  } catch (err) {
    console.error('Erro ao gerar PDF:', err);
    res.status(500).json({ erro: 'Erro ao exportar PDF' });
  }
});

export default router;
