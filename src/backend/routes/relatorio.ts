import express from 'express';

type PDFDocumentType = PDFKit.PDFDocument;
import { prisma } from '../config/prisma';
import { getLogoBuffer } from '../utils/logo';
import { gerarNarrativaRelatorio } from '../services/documentAnalysis';
const upload = require('../middleware/upload').default;

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

type Row = { cells: [string, string]; fill?: string; color?: string; bold?: boolean; indent?: number; small?: boolean };

// Tabela de 2 colunas com altura de linha dinâmica (para linhas detalhadas
// em várias linhas não serem cortadas) e paginação automática.
function drawTable(doc: InstanceType<PDFDocumentType>, rows: Row[]) {
  const startX = 40, tableWidth = 520, colWidths = [360, 160], minRow = 26, padY = 6;
  let y = doc.y;
  rows.forEach((row) => {
    const indentPx = (row.indent || 0) * 14;
    const fontSize = row.small ? 9 : 11;
    doc.font(row.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(fontSize);
    const textH = doc.heightOfString(row.cells[0], { width: colWidths[0] - 16 - indentPx });
    const rowHeight = Math.max(minRow, textH + padY * 2);
    if (y + rowHeight > doc.page.height - 50) { doc.addPage(); y = doc.y; }
    if (row.fill) doc.rect(startX, y, tableWidth, rowHeight).fill(row.fill);
    doc.fillColor(row.color || '#0f172a').font(row.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(fontSize);
    doc.text(row.cells[0], startX + 10 + indentPx, y + padY, { width: colWidths[0] - 16 - indentPx, align: 'left' });
    doc.font('Helvetica-Bold').fontSize(row.small ? 9 : 11);
    doc.text(row.cells[1], startX + colWidths[0] + 10, y + padY, { width: colWidths[1] - 20, align: 'right' });
    y += rowHeight;
    doc.moveTo(startX, y - 1).lineTo(startX + tableWidth, y - 1).strokeColor('#e2e8f0').lineWidth(0.5).stroke();
  });
  doc.y = y + 8;
  doc.fillColor('#0f172a').strokeColor('#0f172a');
}

type HierarchyLeaf = { total: number; rubricas: Map<string, number> };
type HierarchyGroup = { total: number; grupos: Map<string, HierarchyLeaf> };

function buildHierarchy(
  items: { id: number; titulo: string | null; valor: any; groupKey: string | null }[],
  allocationsByItemId: Map<number, { label: string; valor: number }[]>,
  directLabel: string,
): Map<string, HierarchyGroup> {
  const tree = new Map<string, HierarchyGroup>();

  items.forEach((item) => {
    const nivel1 = item.groupKey || 'Sem informação';
    const valorTotal = toNum(item.valor);
    const titulo = (item.titulo || 'Sem título').trim();

    const allocs = allocationsByItemId.get(item.id) || [];
    const allocatedSum = allocs.reduce((s, a) => s + a.valor, 0);
    const unallocated = Math.max(0, valorTotal - allocatedSum);

    if (!tree.has(nivel1)) tree.set(nivel1, { total: 0, grupos: new Map() });
    const grupo1 = tree.get(nivel1)!;

    const addToNivel2 = (nivel2: string, valor: number) => {
      if (valor <= 0) return;
      if (!grupo1.grupos.has(nivel2)) grupo1.grupos.set(nivel2, { total: 0, rubricas: new Map() });
      const grupo2 = grupo1.grupos.get(nivel2)!;
      grupo2.total += valor;
      grupo2.rubricas.set(titulo, (grupo2.rubricas.get(titulo) || 0) + valor);
      grupo1.total += valor;
    };

    allocs.forEach((a) => addToNivel2(a.label, a.valor));
    addToNivel2(directLabel, unallocated);
  });

  return tree;
}

function renderHierarchyRows(
  tree: Map<string, HierarchyGroup>,
  opts: { fillNivel1: string; colorNivel1: string; fillNivel2: string },
): Row[] {
  const rows: Row[] = [];
  const nivel1Sorted = Array.from(tree.entries()).sort((a, b) => b[1].total - a[1].total);
  nivel1Sorted.forEach(([nome1, grupo1]) => {
    rows.push({ cells: [nome1, fmt(grupo1.total)], fill: opts.fillNivel1, color: opts.colorNivel1, bold: true });
    const nivel2Sorted = Array.from(grupo1.grupos.entries()).sort((a, b) => b[1].total - a[1].total);
    nivel2Sorted.forEach(([nome2, grupo2]) => {
      rows.push({ cells: [nome2, fmt(grupo2.total)], fill: opts.fillNivel2, bold: true, indent: 1 });
      const rubricasSorted = Array.from(grupo2.rubricas.entries()).sort((a, b) => b[1] - a[1]);
      rubricasSorted.forEach(([titulo, valor]) => {
        rows.push({ cells: [titulo, fmt(valor)], indent: 2 });
      });
    });
  });
  return rows;
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

// Receitas que representam financiamento externo (cofinanciamentos, subsídios,
// patrocínios e doações) — para a secção "quem deu o quê e quanto".
function isFinanciamento(categoria: string | null | undefined) {
  const c = (categoria || '').toLowerCase();
  return c.includes('cofinanc') || c.includes('subsíd') || c.includes('subsid') || c.includes('patrocín') || c.includes('patrocin') || c.includes('doaç') || c.includes('doac');
}

function isRecebido(estado: string | null | undefined) {
  return (estado || '').toLowerCase() === 'recebido';
}

function cofinanciamentoRows(receitas: any[]): { rows: Row[]; total: number } {
  const fund = receitas.filter((r) => isFinanciamento(r.categoria));
  const total = fund.reduce((s, r) => s + toNum(r.valor), 0);
  const recebidoTot = fund.filter((r) => isRecebido(r.estado)).reduce((s, r) => s + toNum(r.valor), 0);
  const pendenteTot = total - recebidoTot;
  const rows: Row[] = [{ cells: ['Cofinanciamentos e Subsídios por Entidade', fmt(total)], fill: '#f1f5f9', bold: true }];
  if (!fund.length) {
    rows.push({ cells: ['Sem cofinanciamentos ou subsídios registados.', ''] });
    return { rows, total };
  }
  rows.push({ cells: [`Recebido ${fmt(recebidoTot)}  ·  Pendente ${fmt(pendenteTot)}`, ''], color: '#64748b', small: true });
  const porEnt = new Map<string, any[]>();
  fund.forEach((r) => {
    const e = (r.financiador && String(r.financiador).trim()) || 'Sem entidade';
    if (!porEnt.has(e)) porEnt.set(e, []);
    porEnt.get(e)!.push(r);
  });
  Array.from(porEnt.entries())
    .map(([ent, itens]) => ({ ent, itens, t: itens.reduce((s, r) => s + toNum(r.valor), 0) }))
    .sort((a, b) => b.t - a.t)
    .forEach(({ ent, itens, t }) => {
      const rec = itens.filter((r) => isRecebido(r.estado)).reduce((s, r) => s + toNum(r.valor), 0);
      const pen = t - rec;
      rows.push({ cells: [`${ent}  (${itens.length})`, fmt(t)], fill: '#dcfce7', color: '#15803d', bold: true });
      rows.push({ cells: [`Recebido ${fmt(rec)}  ·  Pendente ${fmt(pen)}`, ''], color: '#64748b', small: true, indent: 1 });
      itens.sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime()).forEach((r) => {
        const det = [r.categoria, r.estado].filter(Boolean).join(' · ');
        rows.push({ cells: [`${fmtDate(r.data)} — ${r.titulo}${det ? `\n${det}` : ''}`, fmt(toNum(r.valor))], indent: 1, small: true });
      });
    });
  return { rows, total };
}

router.get('/pdf', async (req, res) => {
  try {
    const { default: PDFDocument } = await import('pdfkit');
    const tipo: TipoRelatorio = (req.query.tipo as TipoRelatorio) || 'ambos';
    const { inicio, fim, label: periodoLabel } = parsePeriodo(req.query);
    const isAnual = ((req.query.periodo as string) || 'custom') === 'anual';

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

    // Hierarquia Departamento/Categoria > Atividade > Rubrica (só para o relatório anual)
    const faturaAllocMap = new Map<number, { label: string; valor: number }[]>();
    faturaEventos.forEach((fe: any) => {
      const nome = fe.evento?.nome || `Evento ${fe.eventoId}`;
      const arr = faturaAllocMap.get(fe.faturaId) || [];
      arr.push({ label: nome, valor: toNum(fe.valor) });
      faturaAllocMap.set(fe.faturaId, arr);
    });
    const receitaAllocMap = new Map<number, { label: string; valor: number }[]>();
    receitaEventos.forEach((re: any) => {
      const nome = re.evento?.nome || `Evento ${re.eventoId}`;
      const arr = receitaAllocMap.get(re.receitaId) || [];
      arr.push({ label: nome, valor: toNum(re.valor) });
      receitaAllocMap.set(re.receitaId, arr);
    });
    const despesaTree = buildHierarchy(
      (faturas as any[]).map((f) => ({ id: f.id, titulo: f.titulo, valor: f.valor, groupKey: f.departamento })),
      faturaAllocMap,
      'Despesas diretas',
    );
    const receitaTree = buildHierarchy(
      (receitas as any[]).map((r) => ({ id: r.id, titulo: r.titulo, valor: r.valor, groupKey: r.categoria })),
      receitaAllocMap,
      'Receitas diretas',
    );

    // PDF
    const doc = new PDFDocument({ margin: 40 });
    res.header('Content-Type', 'application/pdf');
    res.attachment('relatorio-financeiro.pdf');
    doc.pipe(res);

    const logo = await getLogoBuffer();
    const tituloRel = isAnual
      ? 'Relatório Anual de Atividade'
      : (tipo === 'despesas' ? 'Relatório de Despesas' : tipo === 'receitas' ? 'Relatório de Receitas' : 'Relatório Financeiro');
    drawHeader(doc, tituloRel, periodoLabel, logo);

    // --- Tabela resumo ---
    const rows: Row[] = [];
    rows.push({ cells: ['Resumo do Período', periodoLabel], fill: '#f8fafc', bold: true });
    if (tipo !== 'receitas') rows.push({ cells: ['Total de Despesas', fmt(totalDespesas)], fill: '#ffe2e5', color: '#b91c1c', bold: true });
    if (tipo !== 'despesas') rows.push({ cells: ['Total de Receitas', fmt(totalReceitas)], fill: '#e2fee3', color: '#15803d', bold: true });
    if (tipo === 'ambos') rows.push({ cells: [isAnual ? 'Resultado do Ano' : 'Saldo do Período', fmt(saldo)], fill: saldo >= 0 ? '#dcfce7' : '#fee2e2', color: saldo >= 0 ? '#166534' : '#b91c1c', bold: true });

    if (tipo !== 'receitas') {
      if (isAnual) {
        rows.push({ cells: ['Despesas por Departamento / Atividade / Rubrica', ''], fill: '#f1f5f9', bold: true });
        rows.push(...renderHierarchyRows(despesaTree, { fillNivel1: '#ffe2e5', colorNivel1: '#b91c1c', fillNivel2: '#fff1f2' }));
      } else {
        rows.push({ cells: ['Despesas por Departamento', ''], fill: '#f1f5f9', bold: true });
        Object.entries(depDespesas).sort((a, b) => b[1] - a[1]).forEach(([dep, val]) => rows.push({ cells: [dep, fmt(val)] }));
        rows.push({ cells: ['Despesas por Categoria', ''], fill: '#f1f5f9', bold: true });
        Object.entries(catDespesas).sort((a, b) => b[1] - a[1]).forEach(([cat, val]) => rows.push({ cells: [cat, fmt(val)] }));
        rows.push({ cells: ['Despesas por Evento', ''], fill: '#f1f5f9', bold: true });
        Object.entries(eventoDespesas).sort((a, b) => b[1] - a[1]).forEach(([ev, val]) => rows.push({ cells: [ev, fmt(val)] }));
      }
    }

    if (tipo !== 'despesas') {
      if (isAnual) {
        rows.push({ cells: ['Receitas por Categoria / Atividade / Rubrica', ''], fill: '#f1f5f9', bold: true });
        rows.push(...renderHierarchyRows(receitaTree, { fillNivel1: '#dcfce7', colorNivel1: '#15803d', fillNivel2: '#f0fdf4' }));
      } else {
        rows.push({ cells: ['Receitas por Departamento', ''], fill: '#f1f5f9', bold: true });
        Object.entries(depReceitas).sort((a, b) => b[1] - a[1]).forEach(([dep, val]) => rows.push({ cells: [dep, fmt(val)] }));
        rows.push({ cells: ['Receitas por Categoria', ''], fill: '#f1f5f9', bold: true });
        Object.entries(catReceitas).sort((a, b) => b[1] - a[1]).forEach(([cat, val]) => rows.push({ cells: [cat, fmt(val)] }));
        rows.push({ cells: ['Receitas por Evento', ''], fill: '#f1f5f9', bold: true });
        Object.entries(eventoReceitas).sort((a, b) => b[1] - a[1]).forEach(([ev, val]) => rows.push({ cells: [ev, fmt(val)] }));
      }
    }

    doc.moveDown(1).fontSize(12).font('Helvetica-Bold').text('Orçamento / Resumo Financeiro');
    drawTable(doc, rows);

    // --- Gráficos de barras ---
    if (tipo !== 'receitas') {
      renderBars(doc, 'Despesas por Departamento', toArray(depDespesas));
      renderBars(doc, 'Despesas por Categoria', toArray(catDespesas));
    }
    if (tipo !== 'despesas') {
      const recPorEntidade: Record<string, number> = {};
      (receitas as any[]).forEach((r) => {
        const ent = (r.financiador && String(r.financiador).trim()) || 'Sem entidade';
        recPorEntidade[ent] = (recPorEntidade[ent] || 0) + toNum(r.valor);
      });
      renderBars(doc, 'Receitas por Departamento', toArray(depReceitas));
      renderBars(doc, 'Receitas por Categoria', toArray(catReceitas));
      renderBars(doc, 'Receitas por Entidade', toArray(recPorEntidade));
    }

    // --- Detalhe: Receitas por Entidade (financiador) com cada receita ---
    if (tipo !== 'despesas' && receitas.length > 0) {
      const porEntidade = new Map<string, any[]>();
      (receitas as any[]).forEach((r) => {
        const ent = (r.financiador && String(r.financiador).trim()) || 'Sem entidade';
        if (!porEntidade.has(ent)) porEntidade.set(ent, []);
        porEntidade.get(ent)!.push(r);
      });
      const entRows: Row[] = [{ cells: ['Receitas por Entidade', 'Valor'], fill: '#f1f5f9', bold: true }];
      Array.from(porEntidade.entries())
        .map(([ent, itens]) => ({ ent, itens, total: itens.reduce((s, r) => s + toNum(r.valor), 0) }))
        .sort((a, b) => b.total - a.total)
        .forEach(({ ent, itens, total }) => {
          entRows.push({ cells: [`${ent}  (${itens.length})`, fmt(total)], fill: '#dcfce7', color: '#15803d', bold: true });
          itens
            .sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime())
            .forEach((r) => {
              const ev = (receitaAllocMap.get(r.id) || []).map((a) => a.label).join(', ');
              const det = [r.categoria, r.estado, ev].filter(Boolean).join(' · ');
              entRows.push({ cells: [`${fmtDate(r.data)} — ${r.titulo}${det ? `\n${det}` : ''}`, fmt(toNum(r.valor))], indent: 1, small: true });
            });
        });
      doc.moveDown(1).fontSize(12).font('Helvetica-Bold').fillColor('#0f172a').text('Detalhe de Receitas por Entidade');
      drawTable(doc, entRows);

      // Cofinanciamentos e subsídios (quem financiou e com quanto)
      const cof = cofinanciamentoRows(receitas as any[]);
      doc.moveDown(1).fontSize(12).font('Helvetica-Bold').fillColor('#0f172a').text('Cofinanciamentos e Subsídios');
      drawTable(doc, cof.rows);
    }

    // --- Detalhe: Despesas por Fornecedor com cada despesa ---
    if (tipo !== 'receitas' && faturas.length > 0) {
      const porFornecedor = new Map<string, any[]>();
      (faturas as any[]).forEach((f) => {
        const forn = (f.fornecedor && String(f.fornecedor).trim()) || 'Sem fornecedor';
        if (!porFornecedor.has(forn)) porFornecedor.set(forn, []);
        porFornecedor.get(forn)!.push(f);
      });
      const fornRows: Row[] = [{ cells: ['Despesas por Fornecedor', 'Valor'], fill: '#f1f5f9', bold: true }];
      Array.from(porFornecedor.entries())
        .map(([forn, itens]) => ({ forn, itens, total: itens.reduce((s, f) => s + toNum(f.valor), 0) }))
        .sort((a, b) => b.total - a.total)
        .forEach(({ forn, itens, total }) => {
          fornRows.push({ cells: [`${forn}  (${itens.length})`, fmt(total)], fill: '#ffe2e5', color: '#b91c1c', bold: true });
          itens
            .sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime())
            .forEach((f) => {
              const ev = (faturaAllocMap.get(f.id) || []).map((a) => a.label).join(', ');
              const det = [f.numero ? `Nº ${f.numero}` : '', f.tipo, f.departamento, f.estado, ev].filter(Boolean).join(' · ');
              fornRows.push({ cells: [`${fmtDate(f.data)} — ${f.titulo}${det ? `\n${det}` : ''}`, fmt(toNum(f.valor))], indent: 1, small: true });
            });
        });
      doc.moveDown(1).fontSize(12).font('Helvetica-Bold').fillColor('#0f172a').text('Detalhe de Despesas por Fornecedor');
      drawTable(doc, fornRows);
    }

    doc.end();
  } catch (err) {
    console.error('Erro ao gerar PDF:', (err as any).message || err);
    res.status(500).json({ error: 'Erro ao exportar PDF' });
  }
});

// ==========================================================================
//  RELATÓRIO E CONTAS ANUAL (gerado por IA + balanço automático)
// ==========================================================================

// Apura todos os dados financeiros de um ano e devolve estruturas reutilizáveis
// (para a análise de IA e para o PDF final).
async function apurarDadosAno(ano: number) {
  const dateRange = { gte: new Date(`${ano}-01-01`), lte: new Date(`${ano}-12-31`) };
  const [faturas, receitas, faturaEventos, receitaEventos] = await Promise.all([
    prisma.fatura.findMany({ where: { data: dateRange }, orderBy: { data: 'desc' } }),
    prisma.receita.findMany({ where: { data: dateRange }, orderBy: { data: 'desc' } }),
    prisma.faturaEvento.findMany({ where: { fatura: { data: dateRange } }, include: { evento: { select: { id: true, nome: true, departamento: true, data_inicio: true, data_fim: true } } } }),
    prisma.receitaEvento.findMany({ where: { receita: { data: dateRange } }, include: { evento: { select: { id: true, nome: true, departamento: true } } } }),
  ]);

  const totalDespesas = faturas.reduce((s, f) => s + toNum(f.valor), 0);
  const totalReceitas = receitas.reduce((s, r) => s + toNum(r.valor), 0);
  const saldo = totalReceitas - totalDespesas;

  const depDespesas = groupBy(faturas as any[], 'departamento');
  const catReceitas = groupBy(receitas as any[], 'categoria');

  const faturaAllocMap = new Map<number, { label: string; valor: number }[]>();
  faturaEventos.forEach((fe: any) => {
    const nome = fe.evento?.nome || `Evento ${fe.eventoId}`;
    const arr = faturaAllocMap.get(fe.faturaId) || [];
    arr.push({ label: nome, valor: toNum(fe.valor) });
    faturaAllocMap.set(fe.faturaId, arr);
  });
  const receitaAllocMap = new Map<number, { label: string; valor: number }[]>();
  receitaEventos.forEach((re: any) => {
    const nome = re.evento?.nome || `Evento ${re.eventoId}`;
    const arr = receitaAllocMap.get(re.receitaId) || [];
    arr.push({ label: nome, valor: toNum(re.valor) });
    receitaAllocMap.set(re.receitaId, arr);
  });

  const despesaTree = buildHierarchy(
    (faturas as any[]).map((f) => ({ id: f.id, titulo: f.titulo, valor: f.valor, groupKey: f.departamento })),
    faturaAllocMap,
    'Despesas diretas',
  );
  const receitaTree = buildHierarchy(
    (receitas as any[]).map((r) => ({ id: r.id, titulo: r.titulo, valor: r.valor, groupKey: r.categoria })),
    receitaAllocMap,
    'Receitas diretas',
  );

  // Receitas por entidade (financiador)
  const receitasPorEntidade: Record<string, number> = {};
  (receitas as any[]).forEach((r) => {
    const ent = (r.financiador && String(r.financiador).trim()) || 'Sem entidade';
    receitasPorEntidade[ent] = (receitasPorEntidade[ent] || 0) + toNum(r.valor);
  });

  // Resumo por evento (gasto e receita alocados)
  const porEvento = new Map<string, { nome: string; departamento: string | null; despesa: number; receita: number }>();
  faturaEventos.forEach((fe: any) => {
    const key = String(fe.eventoId);
    if (!porEvento.has(key)) porEvento.set(key, { nome: fe.evento?.nome || `Evento ${fe.eventoId}`, departamento: fe.evento?.departamento || null, despesa: 0, receita: 0 });
    porEvento.get(key)!.despesa += toNum(fe.valor);
  });
  receitaEventos.forEach((re: any) => {
    const key = String(re.eventoId);
    if (!porEvento.has(key)) porEvento.set(key, { nome: re.evento?.nome || `Evento ${re.eventoId}`, departamento: re.evento?.departamento || null, despesa: 0, receita: 0 });
    porEvento.get(key)!.receita += toNum(re.valor);
  });

  return {
    ano, faturas, receitas, faturaEventos, receitaEventos,
    totalDespesas, totalReceitas, saldo,
    depDespesas, catReceitas, receitasPorEntidade,
    despesaTree, receitaTree, faturaAllocMap, receitaAllocMap,
    eventos: Array.from(porEvento.values()).sort((a, b) => (b.despesa + b.receita) - (a.despesa + a.receita)),
  };
}

// Resumo compacto para enviar ao modelo (evita mandar dados a mais).
function resumoParaIA(dados: Awaited<ReturnType<typeof apurarDadosAno>>) {
  return {
    ano: dados.ano,
    totais: { receitas: +dados.totalReceitas.toFixed(2), despesas: +dados.totalDespesas.toFixed(2), resultadoDoExercicio: +dados.saldo.toFixed(2) },
    eventos: dados.eventos.map((e) => ({ nome: e.nome, departamento: e.departamento, despesa: +e.despesa.toFixed(2), receita: +e.receita.toFixed(2) })),
    despesasPorDepartamento: Object.fromEntries(Object.entries(dados.depDespesas).map(([k, v]) => [k, +Number(v).toFixed(2)])),
    receitasPorEntidade: Object.fromEntries(Object.entries(dados.receitasPorEntidade).map(([k, v]) => [k, +Number(v).toFixed(2)])),
    receitasPorCategoria: Object.fromEntries(Object.entries(dados.catReceitas).map(([k, v]) => [k, +Number(v).toFixed(2)])),
  };
}

// POST /relatorios/anual/analise  (multipart: campo 'plano' = PDF do plano anual)
router.post('/anual/analise', upload.single('plano'), async (req, res) => {
  try {
    const ano = parseInt((req.body?.ano as string) || '', 10) || new Date().getFullYear();
    const dados = await apurarDadosAno(ano);
    const resumo = resumoParaIA(dados);

    let narrativa = null;
    let aviso: string | null = null;
    const file = (req as any).file;
    if (!file) {
      aviso = 'Sem plano anexado — o texto terá de ser escrito manualmente.';
    } else if (!process.env.GEMINI_API_KEY) {
      aviso = 'Análise por IA indisponível (sem chave configurada) — escreva o texto manualmente.';
    } else {
      narrativa = await gerarNarrativaRelatorio(file.buffer, file.mimetype, resumo);
      if (!narrativa) aviso = 'A IA não conseguiu gerar o texto (quota ou erro). Pode escrever manualmente ou tentar de novo.';
    }

    res.json({ ano, narrativa, aviso, financeiro: resumo });
  } catch (err) {
    console.error('Erro na análise do relatório anual:', (err as any).message || err);
    res.status(500).json({ error: 'Erro ao gerar a análise do relatório' });
  }
});

function drawParagraphs(doc: InstanceType<PDFDocumentType>, titulo: string, texto: string | undefined) {
  if (doc.y > doc.page.height - 120) doc.addPage();
  doc.moveDown(0.8);
  doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(15).text(titulo, 40, doc.y, { width: 520 });
  doc.moveDown(0.4);
  const paras = String(texto || '').split(/\n+/).map((p) => p.trim()).filter(Boolean);
  if (!paras.length) { doc.font('Helvetica-Oblique').fontSize(10).fillColor('#94a3b8').text('(sem texto)', { width: 520 }); doc.fillColor('#0f172a'); return; }
  doc.font('Helvetica').fontSize(11).fillColor('#1e293b');
  paras.forEach((p) => { doc.text(p, { width: 520, align: 'justify' }); doc.moveDown(0.5); });
  doc.fillColor('#0f172a');
}

// POST /relatorios/anual/pdf  (corpo JSON: { ano, narrativa })
router.post('/anual/pdf', async (req, res) => {
  try {
    const { default: PDFDocument } = await import('pdfkit');
    const ano = parseInt((req.body?.ano as string) || '', 10) || new Date().getFullYear();
    const narrativa = (req.body?.narrativa || {}) as any;
    const dados = await apurarDadosAno(ano);
    const logo = await getLogoBuffer();

    const doc = new PDFDocument({ margin: 40, bufferPages: true });
    res.header('Content-Type', 'application/pdf');
    res.attachment(`relatorio-e-contas-${ano}.pdf`);
    doc.pipe(res);

    // Contador de páginas (a 1.ª página já existe; conta as seguintes) + registo
    // da página onde cada secção começa, para preencher o índice no fim.
    let pageCount = 1;
    doc.on('pageAdded', () => { pageCount += 1; });
    const secaoPagina: Record<string, number> = {};
    const marcar = (label: string) => {
      if (doc.y > doc.page.height - 140) doc.addPage();
      secaoPagina[label] = pageCount;
    };

    // --- Capa ---
    if (logo) { try { doc.image(logo, (doc.page.width - 260) / 2, 200, { width: 260 }); } catch {} }
    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(15).text('Associação Young-Link', 40, 150, { width: 520, align: 'center' });
    doc.fontSize(30).text('Relatório e Contas', 40, 430, { width: 520, align: 'center' });
    doc.fontSize(22).fillColor('#475569').text(String(ano), 40, 470, { width: 520, align: 'center' });
    doc.addPage();

    // --- Índice ---
    drawHeader(doc, `Relatório e Contas ${ano}`, `Ano ${ano}`, logo);
    doc.moveDown(1).fillColor('#0f172a').font('Helvetica-Bold').fontSize(18).text('Índice', 40, doc.y, { width: 520 });
    doc.moveDown(0.8);
    const indicePageIndex = doc.bufferedPageRange().count - 1;
    const indice = ['Nota de Introdução', 'Administração', 'Atividades', 'Balanço Financeiro', 'Gráficos', 'Conclusão'];
    const indiceEntradasY: number[] = [];
    indice.forEach((sec, i) => {
      const y = doc.y;
      indiceEntradasY.push(y);
      doc.font('Helvetica-Bold').fontSize(12).fillColor('#3457d5').text(`${i + 1}.`, 40, y, { width: 24 });
      doc.font('Helvetica').fontSize(12).fillColor('#1e293b').text(sec, 68, y, { width: 420 });
      // pontilhado até à margem direita (o número de página é escrito no fim)
      doc.font('Helvetica').fontSize(10).fillColor('#cbd5e1').text('.'.repeat(60), 68, y + 1, { width: 480, align: 'right' });
      doc.moveDown(0.7);
    });
    doc.addPage();

    // --- Secções narrativas ---
    drawHeader(doc, `Relatório e Contas ${ano}`, `Ano ${ano}`, logo);
    marcar('Nota de Introdução');
    drawParagraphs(doc, 'Nota de Introdução', narrativa.notaIntroducao);

    marcar('Administração');
    const adm = narrativa.administracao || {};
    if (adm.gestaoInterna || adm.parcerias || adm.transparencia || adm.desafios) {
      drawParagraphs(doc, 'Administração', [adm.gestaoInterna, adm.parcerias, adm.transparencia, adm.desafios].filter(Boolean).join('\n\n'));
    }

    marcar('Atividades');
    drawParagraphs(doc, 'Atividades Realizadas', narrativa.atividadesRealizadas);
    drawParagraphs(doc, 'Atividades Não Realizadas', narrativa.atividadesNaoRealizadas);

    // --- Balanço Financeiro (automático, dados reais) ---
    doc.addPage();
    secaoPagina['Balanço Financeiro'] = pageCount;
    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(15).text('Balanço Financeiro', 40, doc.y, { width: 520 });
    doc.moveDown(0.4);

    const resumoRows: Row[] = [];
    resumoRows.push({ cells: ['Resumo do Exercício', `Ano ${ano}`], fill: '#f8fafc', bold: true });
    resumoRows.push({ cells: ['Total de Receitas', fmt(dados.totalReceitas)], fill: '#e2fee3', color: '#15803d', bold: true });
    resumoRows.push({ cells: ['Total de Custos', fmt(dados.totalDespesas)], fill: '#ffe2e5', color: '#b91c1c', bold: true });
    resumoRows.push({ cells: ['Resultado do Exercício', fmt(dados.saldo)], fill: dados.saldo >= 0 ? '#dcfce7' : '#fee2e2', color: dados.saldo >= 0 ? '#166534' : '#b91c1c', bold: true });
    drawTable(doc, resumoRows);

    // CUSTOS por Departamento > Atividade > Rubrica
    const custosRows: Row[] = [{ cells: ['Custos por Departamento / Atividade / Rubrica', fmt(dados.totalDespesas)], fill: '#f1f5f9', bold: true }];
    custosRows.push(...renderHierarchyRows(dados.despesaTree, { fillNivel1: '#ffe2e5', colorNivel1: '#b91c1c', fillNivel2: '#fff1f2' }));
    doc.moveDown(0.5);
    drawTable(doc, custosRows);

    // RECEITAS por categoria
    const recCatRows: Row[] = [{ cells: ['Receitas por Categoria', fmt(dados.totalReceitas)], fill: '#f1f5f9', bold: true }];
    Object.entries(dados.catReceitas).sort((a, b) => (b[1] as number) - (a[1] as number)).forEach(([cat, val]) => recCatRows.push({ cells: [cat, fmt(val as number)] }));
    doc.moveDown(0.5);
    drawTable(doc, recCatRows);

    // RECEITAS por entidade (cada receita)
    const porEntidade = new Map<string, any[]>();
    (dados.receitas as any[]).forEach((r) => {
      const ent = (r.financiador && String(r.financiador).trim()) || 'Sem entidade';
      if (!porEntidade.has(ent)) porEntidade.set(ent, []);
      porEntidade.get(ent)!.push(r);
    });
    const entRows: Row[] = [{ cells: ['Receitas por Entidade', 'Valor'], fill: '#f1f5f9', bold: true }];
    Array.from(porEntidade.entries())
      .map(([ent, itens]) => ({ ent, itens, total: itens.reduce((s, r) => s + toNum(r.valor), 0) }))
      .sort((a, b) => b.total - a.total)
      .forEach(({ ent, itens, total }) => {
        entRows.push({ cells: [`${ent}  (${itens.length})`, fmt(total)], fill: '#dcfce7', color: '#15803d', bold: true });
        itens.sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime()).forEach((r) => {
          const det = [r.categoria, r.estado].filter(Boolean).join(' · ');
          entRows.push({ cells: [`${fmtDate(r.data)} — ${r.titulo}${det ? `\n${det}` : ''}`, fmt(toNum(r.valor))], indent: 1, small: true });
        });
      });
    doc.moveDown(0.5);
    drawTable(doc, entRows);

    // Cofinanciamentos e subsídios (quem financiou e com quanto)
    const cof = cofinanciamentoRows(dados.receitas as any[]);
    doc.moveDown(0.5);
    drawTable(doc, cof.rows);

    // --- Gráficos ---
    doc.addPage();
    secaoPagina['Gráficos'] = pageCount;
    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(15).text('Gráficos', 40, doc.y, { width: 520 });
    doc.moveDown(0.6);
    renderBars(doc, 'Despesas por Departamento', toArray(dados.depDespesas));
    doc.moveDown(0.4);
    renderBars(doc, 'Receitas por Entidade', toArray(dados.receitasPorEntidade));

    // --- Conclusão ---
    marcar('Conclusão');
    drawParagraphs(doc, 'Conclusão', narrativa.conclusao);

    // --- Assinaturas da direção ---
    if (doc.y > doc.page.height - 220) doc.addPage(); else doc.moveDown(2);
    const mesesPt = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
    const hoje = new Date();
    doc.font('Helvetica').fontSize(11).fillColor('#1e293b')
      .text(`Castro Marim, ${hoje.getDate()} de ${mesesPt[hoje.getMonth()]} de ${hoje.getFullYear()}`, 40, doc.y, { width: 520, align: 'right' });
    doc.moveDown(3);
    doc.font('Helvetica-Bold').fontSize(12).fillColor('#0f172a').text('A Direção', 40, doc.y, { width: 520, align: 'center' });
    doc.moveDown(3.5);

    const cargos = ['Presidente', 'Tesoureiro(a)', 'Secretário(a)'];
    const colW = 520 / cargos.length;
    const yLinha = doc.y;
    cargos.forEach((cargo, i) => {
      const x = 40 + i * colW;
      doc.moveTo(x + 12, yLinha).lineTo(x + colW - 12, yLinha).strokeColor('#94a3b8').lineWidth(0.8).stroke();
      doc.font('Helvetica').fontSize(9).fillColor('#64748b').text(cargo, x, yLinha + 6, { width: colW, align: 'center' });
    });
    doc.fillColor('#0f172a').strokeColor('#0f172a');

    // Preencher os números de página no índice (2.ª passagem sobre a página do índice)
    doc.switchToPage(indicePageIndex);
    indice.forEach((sec, i) => {
      const pag = secaoPagina[sec];
      if (!pag) return;
      doc.font('Helvetica-Bold').fontSize(12).fillColor('#0f172a').text(String(pag), 490, indiceEntradasY[i], { width: 70, align: 'right' });
    });

    doc.end();
  } catch (err) {
    console.error('Erro ao gerar PDF do relatório anual:', (err as any).message || err);
    if (!res.headersSent) res.status(500).json({ error: 'Erro ao gerar o relatório' });
  }
});

export default router;
