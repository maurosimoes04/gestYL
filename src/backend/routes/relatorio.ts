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
  doc.rect(40, 30, 515, 60).fill('#4f46e5');
  if (logo) try { doc.image(logo, 50, 34, { height: 52 }); } catch {}
  doc.fillColor('#ffffff').fontSize(14).font('Helvetica-Bold').text(titulo, 200, 45, { width: 345, align: 'right' });
  doc.fontSize(10).font('Helvetica').text(periodoLabel, 200, 65, { width: 345, align: 'right' });
  doc.y = 115;
  doc.fillColor('#0a0a0a').strokeColor('#0a0a0a');
}

// Capa: identidade YL com gradiente índigo → violeta
function drawCover(doc: InstanceType<PDFDocumentType>, titulo: string, subtitulo: string, logo: Buffer | null) {
  const w = doc.page.width, h = doc.page.height;
  doc.save();
  // Fundo com faixas índigo → violeta (simulado com rect sobreposto)
  doc.rect(0, 0, w, h).fill('#4f46e5');
  doc.rect(0, h / 2, w, h / 2).fill('#6d28d9');
  // Faixa clara no topo e no fundo
  doc.rect(0, 0, w, 6).fill('#8b5cf6');
  doc.rect(0, h - 6, w, 6).fill('#8b5cf6');
  // Moldura branca
  doc.rect(32, 32, w - 64, h - 64).lineWidth(1.5).strokeColor('#ffffff').fillOpacity(0).stroke();

  if (logo) { try { doc.image(logo, (w - 160) / 2, 180, { width: 160 }); } catch {} }
  doc.fillColor('#e9d5ff').font('Helvetica').fontSize(11).text('ASSOCIAÇÃO JUVENIL YOUNG-LINK', 40, 150, { width: w - 80, align: 'center', characterSpacing: 3 });
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(32).text(titulo, 40, h / 2 - 20, { width: w - 80, align: 'center' });
  doc.fillColor('#e9d5ff').font('Helvetica').fontSize(16).text(subtitulo, 40, h / 2 + 30, { width: w - 80, align: 'center' });
  const hoje = new Date().toLocaleDateString('pt-PT', { year: 'numeric', month: 'long', day: 'numeric' });
  doc.fillColor('#c4b5fd').font('Helvetica').fontSize(9).text(`Gerado em ${hoje}  ·  Gestor Young-Link`, 40, h - 60, { width: w - 80, align: 'center', characterSpacing: 1 });
  doc.restore();
  doc.fillColor('#0a0a0a').strokeColor('#0a0a0a');
}

// Banda de destaques: cartões com os números grandes (Receitas · Despesas · Resultado).
function drawKpiBand(doc: InstanceType<PDFDocumentType>, cards: { label: string; valor: string; bg: string; fg: string }[]) {
  const x0 = 40, totalW = 515, gap = 10;
  const cardW = (totalW - gap * (cards.length - 1)) / cards.length;
  const y = doc.y;
  const cardH = 56;
  cards.forEach((c, i) => {
    const x = x0 + i * (cardW + gap);
    doc.roundedRect(x, y, cardW, cardH, 8).fill(c.bg);
    doc.fillColor(c.fg).font('Helvetica-Bold').fontSize(8).text(c.label.toUpperCase(), x + 12, y + 10, { width: cardW - 24, characterSpacing: 1, lineBreak: false });
    doc.fillColor(c.fg).font('Helvetica-Bold').fontSize(17).text(c.valor, x + 12, y + 26, { width: cardW - 24, lineBreak: false });
  });
  doc.y = y + cardH + 12;
  doc.x = x0;
  doc.fillColor('#0a0a0a');
}

// Título de secção uniforme com cor índigo YL
function sectionTitle(doc: InstanceType<PDFDocumentType>, texto: string) {
  if (doc.y > doc.page.height - 96) doc.addPage();
  doc.moveDown(0.8);
  const y = doc.y;
  // Barra lateral índigo + título
  doc.rect(40, y + 2, 3, 16).fill('#4f46e5');
  doc.fillColor('#0a0a0a').font('Helvetica-Bold').fontSize(13).text(texto, 50, y + 2, { width: 505 });
  doc.y = y + 24;
  doc.moveTo(40, doc.y).lineTo(555, doc.y).lineWidth(0.5).strokeColor('#e5e7eb').stroke();
  doc.y += 10;
  doc.x = 40;
  doc.fillColor('#0a0a0a').strokeColor('#0a0a0a');
}

// Rodapé com numeração em todas as páginas (requer bufferPages: true no documento).
function drawPageNumbers(doc: InstanceType<PDFDocumentType>) {
  const range = doc.bufferedPageRange();
  // Página 0 é a capa — não numerar.
  for (let i = 1; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    // Anular a margem inferior evita que o PDFKit crie uma página nova ao
    // escrever o rodapé abaixo da área útil (causa das páginas em branco).
    const oldBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    const y = doc.page.height - 28;
    doc.font('Helvetica').fontSize(8).fillColor('#94a3b8')
      .text(`${i} / ${range.count - 1}`, 40, y, { width: 520, align: 'center', lineBreak: false });
    doc.page.margins.bottom = oldBottom;
  }
  doc.fillColor('#0f172a');
}

type Row = { cells: [string, string]; fill?: string; color?: string; bold?: boolean; indent?: number; small?: boolean };

// Tabela de 2 colunas com altura de linha dinâmica — y controlado manualmente para
// evitar as sobreposições clássicas do PDFKit quando se escreve múltiplas colunas
// na mesma linha.
function drawTable(doc: InstanceType<PDFDocumentType>, rows: Row[]) {
  const startX = 40, tableWidth = 515, colWidths = [370, 145], minRow = 22, padY = 5;
  let y = doc.y;
  rows.forEach((row) => {
    const indentPx = (row.indent || 0) * 14;
    const fontSize = row.small ? 9 : 10.5;
    const leftWidth = colWidths[0] - 16 - indentPx;
    doc.font(row.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(fontSize);
    const textH = doc.heightOfString(row.cells[0], { width: leftWidth });
    const rowHeight = Math.max(minRow, textH + padY * 2);
    if (y + rowHeight > doc.page.height - 50) { doc.addPage(); y = 60; }
    if (row.fill) doc.rect(startX, y, tableWidth, rowHeight).fill(row.fill);
    doc.fillColor(row.color || '#0a0a0a').font(row.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(fontSize);
    doc.text(row.cells[0], startX + 10 + indentPx, y + padY, { width: leftWidth, align: 'left' });
    doc.font('Helvetica-Bold').fontSize(fontSize);
    doc.text(row.cells[1], startX + colWidths[0] + 5, y + padY, { width: colWidths[1] - 15, align: 'right' });
    y += rowHeight;
    doc.strokeColor('#f3f4f6').lineWidth(0.5).moveTo(startX, y).lineTo(startX + tableWidth, y).stroke();
  });
  doc.y = y + 8;
  doc.fillColor('#0a0a0a').strokeColor('#0a0a0a');
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
  // Agora considera também as receitas classificadas em SNC 75 (subsídios) além da categoria legada
  const fund = receitas.filter((r) => isFinanciamento(r.categoria) || r.contaSnc?.codigo === '75' || r.contaSnc?.codigo === '59');
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
    const e = r.entidade?.nome || (r.financiador && String(r.financiador).trim()) || 'Sem entidade';
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
        const snc = r.contaSnc ? `[${r.contaSnc.codigo}] ` : '';
        const det = [r.categoria, r.estado].filter(Boolean).join(' · ');
        rows.push({ cells: [`${fmtDate(r.data)} — ${snc}${r.titulo}${det ? `\n${det}` : ''}`, fmt(toNum(r.valor))], indent: 1, small: true });
      });
    });
  return { rows, total };
}

// ==========================================================================
//  ESTRUTURA "POR EVENTO" — organiza os movimentos por atividade (evento)
//  e, dentro de cada evento, agrupa as despesas por departamento e as
//  receitas por entidade. Movimentos não alocados a nenhum evento vão para
//  "fora de eventos", para os totais fecharem certo mesmo com alocações
//  parciais (ex.: fatura de 100 € com 60 € num evento e 40 € sem evento).
// ==========================================================================
type MovLinha = { data: any; titulo: string; extra: string; valor: number };
type MovGrupo = { total: number; itens: MovLinha[] };
type EventoBloco = {
  id: number; nome: string; departamento: string | null;
  dataInicio: any; dataFim: any;
  despTotal: number; recTotal: number;
  despPorDept: Map<string, MovGrupo>;
  recPorEnt: Map<string, MovGrupo>;
};

const ordDesc = (itens: MovLinha[]) =>
  itens.sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());

function buildEventoData(faturas: any[], receitas: any[], faturaEventos: any[], receitaEventos: any[]) {
  const faturaById = new Map<number, any>(faturas.map((f) => [f.id, f]));
  const receitaById = new Map<number, any>(receitas.map((r) => [r.id, r]));
  const eventos = new Map<number, EventoBloco>();

  const ensureEv = (id: number, evObj: any): EventoBloco => {
    if (!eventos.has(id)) {
      eventos.set(id, {
        id, nome: evObj?.nome || `Evento ${id}`, departamento: evObj?.departamento || null,
        dataInicio: evObj?.data_inicio || null, dataFim: evObj?.data_fim || null,
        despTotal: 0, recTotal: 0, despPorDept: new Map(), recPorEnt: new Map(),
      });
    }
    return eventos.get(id)!;
  };

  const faturaAlloc = new Map<number, number>();
  const receitaAlloc = new Map<number, number>();

  faturaEventos.forEach((fe: any) => {
    const f = faturaById.get(fe.faturaId);
    if (!f) return;
    const v = toNum(fe.valor);
    const ev = ensureEv(fe.eventoId, fe.evento);
    const dept = f.departamento || 'Sem departamento';
    if (!ev.despPorDept.has(dept)) ev.despPorDept.set(dept, { total: 0, itens: [] });
    const g = ev.despPorDept.get(dept)!;
    g.total += v;
    g.itens.push({ data: f.data, titulo: f.titulo, extra: (f.fornecedor && String(f.fornecedor).trim()) || '', valor: v });
    ev.despTotal += v;
    faturaAlloc.set(f.id, (faturaAlloc.get(f.id) || 0) + v);
  });

  receitaEventos.forEach((re: any) => {
    const r = receitaById.get(re.receitaId);
    if (!r) return;
    const v = toNum(re.valor);
    const ev = ensureEv(re.eventoId, re.evento);
    const ent = (r.financiador && String(r.financiador).trim()) || 'Sem entidade';
    if (!ev.recPorEnt.has(ent)) ev.recPorEnt.set(ent, { total: 0, itens: [] });
    const g = ev.recPorEnt.get(ent)!;
    g.total += v;
    g.itens.push({ data: r.data, titulo: r.titulo, extra: [r.categoria, r.estado].filter(Boolean).join(' · '), valor: v });
    ev.recTotal += v;
    receitaAlloc.set(r.id, (receitaAlloc.get(r.id) || 0) + v);
  });

  // Fora de eventos: parte não alocada de cada fatura/receita.
  const foraDesp = new Map<string, MovGrupo>();
  faturas.forEach((f) => {
    const resto = +(toNum(f.valor) - (faturaAlloc.get(f.id) || 0)).toFixed(2);
    if (resto <= 0) return;
    const dept = f.departamento || 'Sem departamento';
    if (!foraDesp.has(dept)) foraDesp.set(dept, { total: 0, itens: [] });
    const g = foraDesp.get(dept)!;
    g.total += resto;
    g.itens.push({ data: f.data, titulo: f.titulo, extra: (f.fornecedor && String(f.fornecedor).trim()) || '', valor: resto });
  });
  const foraRec = new Map<string, MovGrupo>();
  receitas.forEach((r) => {
    const resto = +(toNum(r.valor) - (receitaAlloc.get(r.id) || 0)).toFixed(2);
    if (resto <= 0) return;
    const ent = (r.financiador && String(r.financiador).trim()) || 'Sem entidade';
    if (!foraRec.has(ent)) foraRec.set(ent, { total: 0, itens: [] });
    const g = foraRec.get(ent)!;
    g.total += resto;
    g.itens.push({ data: r.data, titulo: r.titulo, extra: [r.categoria, r.estado].filter(Boolean).join(' · '), valor: resto });
  });

  // Ordem cronológica (por data de início; eventos sem data no fim).
  const eventosSorted = Array.from(eventos.values()).sort((a, b) => {
    const da = a.dataInicio ? new Date(a.dataInicio).getTime() : Infinity;
    const db = b.dataInicio ? new Date(b.dataInicio).getTime() : Infinity;
    if (da !== db) return da - db;
    return a.nome.localeCompare(b.nome);
  });

  return { eventosSorted, foraDesp, foraRec };
}

type EventoData = ReturnType<typeof buildEventoData>;

// Linhas de detalhe de UM evento (dept + entidade + movimentos), sem o cabeçalho
// (que é desenhado como banner colorido por drawEventoBloco).
function eventoDetailRows(ev: EventoData['eventosSorted'][number], tipo: TipoRelatorio): Row[] {
  const rows: Row[] = [];
  if (tipo !== 'receitas' && ev.despPorDept.size) {
    Array.from(ev.despPorDept.entries()).sort((a, b) => b[1].total - a[1].total).forEach(([d, g]) => {
      rows.push({ cells: [d, fmt(g.total)], fill: '#ffe2e5', color: '#b91c1c', bold: true });
      ordDesc(g.itens).forEach((it) => rows.push({ cells: [`${fmtDate(it.data)} — ${it.titulo}${it.extra ? ' · ' + it.extra : ''}`, fmt(it.valor)], indent: 1, small: true }));
    });
  }
  if (tipo !== 'despesas' && ev.recPorEnt.size) {
    Array.from(ev.recPorEnt.entries()).sort((a, b) => b[1].total - a[1].total).forEach(([e, g]) => {
      rows.push({ cells: [e, fmt(g.total)], fill: '#dcfce7', color: '#15803d', bold: true });
      ordDesc(g.itens).forEach((it) => rows.push({ cells: [`${fmtDate(it.data)} — ${it.titulo}${it.extra ? ' · ' + it.extra : ''}`, fmt(it.valor)], indent: 1, small: true }));
    });
  }
  const semDesp = tipo === 'receitas' || !ev.despPorDept.size;
  const semRec = tipo === 'despesas' || !ev.recPorEnt.size;
  if (semDesp && semRec) rows.push({ cells: ['Sem movimentos no período.', ''], small: true, color: '#94a3b8' });
  return rows;
}

// Desenha um bloco por evento: banner colorido com nome/datas + cartões de
// estatística (Receitas/Despesas/Saldo) + detalhe. Estilo apelativo, tipo mockup.
function drawEventoBloco(doc: InstanceType<PDFDocumentType>, ev: EventoData['eventosSorted'][number], tipo: TipoRelatorio) {
  const saldo = ev.recTotal - ev.despTotal;
  const umDia = ev.dataInicio && ev.dataFim && new Date(ev.dataInicio).getTime() === new Date(ev.dataFim).getTime();
  const datas = ev.dataInicio ? `${fmtDate(ev.dataInicio)}${ev.dataFim && !umDia ? ' — ' + fmtDate(ev.dataFim) : ''}` : '';
  const meta = [datas, ev.departamento].filter(Boolean).join('  ·  ');

  // Espaço mínimo para banner + cartões antes de partir para nova página.
  const need = 36 + (tipo === 'ambos' ? 68 : 0) + 40;
  if (doc.y + need > doc.page.height - 60) doc.addPage();

  // Banner do evento — índigo YL com nome à esquerda e meta à direita
  const bx = 40, bw = 515, by = doc.y, bh = 32;
  doc.roundedRect(bx, by, bw, bh, 6).fill('#eef2ff');
  doc.rect(bx, by, 4, bh).fill('#4f46e5');
  doc.fillColor('#312e81').font('Helvetica-Bold').fontSize(12).text(ev.nome, bx + 14, by + 10, { width: bw * 0.55 - 14, lineBreak: false, ellipsis: true });
  if (meta) doc.fillColor('#6d28d9').font('Helvetica').fontSize(8).text(meta.toUpperCase(), bx + bw * 0.55, by + 12, { width: bw * 0.45 - 14, align: 'right', characterSpacing: 1, lineBreak: false });
  doc.y = by + bh + 10;
  doc.fillColor('#0a0a0a').strokeColor('#0a0a0a');

  // Cartões de estatística (só quando faz sentido)
  if (tipo === 'ambos') {
    drawKpiBand(doc, [
      { label: 'Receitas', valor: fmt(ev.recTotal), bg: '#dcfce7', fg: '#166534' },
      { label: 'Despesas', valor: fmt(ev.despTotal), bg: '#fee2e2', fg: '#991b1b' },
      { label: 'Saldo', valor: fmt(saldo), bg: saldo >= 0 ? '#dcfce7' : '#fee2e2', fg: saldo >= 0 ? '#166534' : '#991b1b' },
    ]);
  }

  drawTable(doc, eventoDetailRows(ev, tipo));
  doc.moveDown(0.4);
}

// Movimentos gerais (fora de eventos): despesas por dept, receitas por entidade.
function foraEventosRows(data: EventoData, tipo: TipoRelatorio): Row[] {
  const rows: Row[] = [];
  if (tipo !== 'receitas' && data.foraDesp.size) {
    const tot = Array.from(data.foraDesp.values()).reduce((s, g) => s + g.total, 0);
    rows.push({ cells: ['Despesas gerais (sem evento)', fmt(tot)], fill: '#f1f5f9', bold: true });
    Array.from(data.foraDesp.entries()).sort((a, b) => b[1].total - a[1].total).forEach(([d, g]) => {
      rows.push({ cells: [d, fmt(g.total)], fill: '#ffe2e5', color: '#b91c1c', bold: true, indent: 1 });
      ordDesc(g.itens).forEach((it) => rows.push({ cells: [`${fmtDate(it.data)} — ${it.titulo}${it.extra ? ' · ' + it.extra : ''}`, fmt(it.valor)], indent: 2, small: true }));
    });
  }
  if (tipo !== 'despesas' && data.foraRec.size) {
    const tot = Array.from(data.foraRec.values()).reduce((s, g) => s + g.total, 0);
    rows.push({ cells: ['Receitas gerais (sem evento)', fmt(tot)], fill: '#f1f5f9', bold: true });
    Array.from(data.foraRec.entries()).sort((a, b) => b[1].total - a[1].total).forEach(([e, g]) => {
      rows.push({ cells: [e, fmt(g.total)], fill: '#dcfce7', color: '#15803d', bold: true, indent: 1 });
      ordDesc(g.itens).forEach((it) => rows.push({ cells: [`${fmtDate(it.data)} — ${it.titulo}${it.extra ? ' · ' + it.extra : ''}`, fmt(it.valor)], indent: 2, small: true }));
    });
  }
  return rows;
}

/**
 * GET /relatorios/balancete-snc?inicio=&fim=
 * Devolve JSON com agregação de Receitas e Despesas por conta SNC + família.
 * Base para dashboards e para o PDF Balancete.
 */
router.get('/balancete-snc', async (req, res) => {
  try {
    const { inicio, fim } = parsePeriodo(req.query);
    const dateFilter = { gte: new Date(inicio), lte: new Date(fim) };

    const [receitas, faturas, contas] = await Promise.all([
      prisma.receita.findMany({
        where: { data: dateFilter },
        select: { id: true, valor: true, data: true, estado: true, contaSnc: true, entidade: { select: { nome: true } } },
      }),
      prisma.fatura.findMany({
        where: { data: dateFilter },
        select: { id: true, valor: true, data: true, estado: true, contaSnc: true, entidade: { select: { nome: true } } },
      }),
      prisma.contaSNC.findMany({ orderBy: [{ familia: 'asc' }, { codigo: 'asc' }] }),
    ]);

    // Agregar por contaSncId
    const agreg: Record<number, { conta: any; total: number; count: number; items: any[] }> = {};
    const semConta: { tipo: string; total: number; count: number; items: any[] } = { tipo: 'não classificado', total: 0, count: 0, items: [] };

    for (const c of contas) agreg[c.id] = { conta: c, total: 0, count: 0, items: [] };

    for (const r of receitas) {
      if (r.contaSnc) {
        agreg[r.contaSnc.id].total += Number(r.valor);
        agreg[r.contaSnc.id].count++;
      } else {
        semConta.total += Number(r.valor);
        semConta.count++;
      }
    }
    for (const f of faturas) {
      if (f.contaSnc) {
        agreg[f.contaSnc.id].total += Number(f.valor);
        agreg[f.contaSnc.id].count++;
      } else {
        semConta.total += Number(f.valor);
        semConta.count++;
      }
    }

    // Agrupar por família
    const porFamilia: Record<string, { familia: string; tipo: string; total: number; linhas: any[] }> = {};
    for (const [, a] of Object.entries(agreg)) {
      if (a.count === 0) continue;
      const fam = a.conta.familia;
      if (!porFamilia[fam]) porFamilia[fam] = { familia: fam, tipo: a.conta.tipo, total: 0, linhas: [] };
      porFamilia[fam].linhas.push({ codigo: a.conta.codigo, nome: a.conta.nome, total: a.total, count: a.count });
      porFamilia[fam].total += a.total;
    }

    const totalProveitos = Object.values(porFamilia).filter(f => f.tipo === 'proveito').reduce((s, f) => s + f.total, 0);
    const totalGastos = Object.values(porFamilia).filter(f => f.tipo === 'gasto').reduce((s, f) => s + f.total, 0);
    const totalAtivos = Object.values(porFamilia).filter(f => f.tipo === 'ativo').reduce((s, f) => s + f.total, 0);
    const totalPassivos = Object.values(porFamilia).filter(f => f.tipo === 'passivo').reduce((s, f) => s + f.total, 0);

    res.json({
      periodo: { inicio, fim },
      familias: Object.values(porFamilia).sort((a, b) => a.familia.localeCompare(b.familia)),
      semClassificacao: semConta.count ? semConta : null,
      totais: {
        proveitos: totalProveitos,
        gastos: totalGastos,
        resultadoLiquido: totalProveitos - totalGastos,
        ativos: totalAtivos,
        passivos: totalPassivos,
      },
    });
  } catch (err: any) {
    console.error('Erro balancete:', err);
    res.status(500).json({ error: err.message || 'Erro ao gerar balancete' });
  }
});

/**
 * GET /relatorios/balancete-snc/pdf
 * PDF do balancete por conta SNC — layout fixo com y controlado manualmente
 * para evitar sobreposições do PDFKit.
 */
router.get('/balancete-snc/pdf', async (req, res) => {
  try {
    const { default: PDFDocument } = await import('pdfkit');
    const { inicio, fim, label } = parsePeriodo(req.query);
    const dateFilter = { gte: new Date(inicio), lte: new Date(fim) };

    const [receitas, faturas, contas] = await Promise.all([
      prisma.receita.findMany({ where: { data: dateFilter }, select: { valor: true, contaSncId: true } }),
      prisma.fatura.findMany({ where: { data: dateFilter }, select: { valor: true, contaSncId: true } }),
      prisma.contaSNC.findMany({ orderBy: [{ familia: 'asc' }, { codigo: 'asc' }] }),
    ]);

    const totais: Record<number, { total: number; count: number }> = {};
    for (const c of contas) totais[c.id] = { total: 0, count: 0 };
    let semClass = 0, semClassVal = 0;
    for (const r of receitas) {
      if (r.contaSncId) { totais[r.contaSncId].total += Number(r.valor); totais[r.contaSncId].count++; }
      else { semClass++; semClassVal += Number(r.valor); }
    }
    for (const f of faturas) {
      if (f.contaSncId) { totais[f.contaSncId].total += Number(f.valor); totais[f.contaSncId].count++; }
      else { semClass++; semClassVal += Number(f.valor); }
    }

    const fmt = (v: number) => `${v.toFixed(2).replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1 ')} €`;

    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    res.header('Content-Type', 'application/pdf');
    res.attachment(`balancete-snc-${label.replace(/\s+/g, '-').toLowerCase()}.pdf`);
    doc.pipe(res);

    // === Cabeçalho ===
    const logo = await getLogoBuffer();
    doc.rect(40, 30, 515, 70).fill('#4f46e5');
    if (logo) try { doc.image(logo, 50, 38, { height: 54 }); } catch {}
    doc.fillColor('#ffffff').fontSize(10).font('Helvetica').text('BALANCETE', 200, 40, { width: 345, align: 'right', characterSpacing: 3 });
    doc.fontSize(17).font('Helvetica-Bold').text('Balancete por Conta SNC', 200, 54, { width: 345, align: 'right' });
    doc.fontSize(10).font('Helvetica').text(label, 200, 78, { width: 345, align: 'right' });
    doc.fillColor('#0a0a0a').strokeColor('#0a0a0a');

    // === Agrupamentos ===
    const porFamilia: Record<string, { familia: string; tipo: string; linhas: any[]; total: number }> = {};
    for (const c of contas) {
      if (totais[c.id].count === 0) continue;
      if (!porFamilia[c.familia]) porFamilia[c.familia] = { familia: c.familia, tipo: c.tipo, linhas: [], total: 0 };
      porFamilia[c.familia].linhas.push({ codigo: c.codigo, nome: c.nome, ...totais[c.id] });
      porFamilia[c.familia].total += totais[c.id].total;
    }

    // Mostrar passivos como "Subsídios diferidos" quando só são 59/7883
    const familiasPassivo = Object.values(porFamilia).filter(f => f.tipo === 'passivo');
    const soDiferidos = familiasPassivo.length > 0 && familiasPassivo.every(f => f.linhas.every((l: any) => l.codigo === '59' || l.codigo === '7883'));

    const tiposOrdem = ['proveito', 'gasto', 'ativo', 'passivo'];
    const tiposLabel: Record<string, string> = {
      proveito: 'Proveitos (Receitas)',
      gasto: 'Gastos (Despesas)',
      ativo: 'Ativos (bens duradouros)',
      passivo: soDiferidos ? 'Subsídios diferidos (reconhecimento plurianual)' : 'Passivos',
    };
    const tiposCor: Record<string, string> = {
      proveito: '#16a34a', gasto: '#dc2626', ativo: '#2563eb', passivo: '#7c3aed',
    };
    const tiposBg: Record<string, string> = {
      proveito: '#f0fdf4', gasto: '#fef2f2', ativo: '#eff6ff', passivo: '#f5f3ff',
    };

    // === Layout fixo: colunas ===
    const LEFT = 40, RIGHT = 555, WIDTH = RIGHT - LEFT;
    const COL_CODIGO_X = 50;
    const COL_NOME_X = 95;
    const COL_COUNT_X = 395;   // "N regs."
    const COL_COUNT_W = 60;
    const COL_VALOR_X = 460;   // valor direito
    const COL_VALOR_W = 90;

    const LINE_H = 16;      // altura padrão de linha
    const FAM_H = 14;       // altura header família
    const TIPO_H_PRE = 10;
    const TIPO_H = 24;      // header de tipo
    const SUBTOT_H = 22;    // subtotal

    let y = 125;

    function garantirPagina(precisa: number) {
      if (y + precisa > doc.page.height - 60) {
        doc.addPage();
        y = 60;
      }
    }

    function drawLinha(l: any, color = '#111827') {
      garantirPagina(LINE_H);
      doc.font('Helvetica').fontSize(10).fillColor(color);
      doc.text(l.codigo, COL_CODIGO_X, y + 3, { width: COL_NOME_X - COL_CODIGO_X - 4, align: 'left' });
      doc.text(l.nome, COL_NOME_X, y + 3, { width: COL_COUNT_X - COL_NOME_X - 8, align: 'left', lineBreak: false, ellipsis: true });
      doc.fillColor('#6b7280').fontSize(9);
      doc.text(`${l.count}`, COL_COUNT_X, y + 4, { width: COL_COUNT_W, align: 'right' });
      doc.fillColor('#111827').fontSize(10);
      doc.text(fmt(l.total), COL_VALOR_X, y + 3, { width: COL_VALOR_W, align: 'right' });
      y += LINE_H;
      // separador fino
      doc.strokeColor('#f3f4f6').lineWidth(0.5).moveTo(LEFT, y).lineTo(RIGHT, y).stroke();
    }

    function drawFamilia(nome: string) {
      garantirPagina(FAM_H + 2);
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#6b7280')
         .text(nome.toUpperCase(), LEFT, y + 3, { width: WIDTH, align: 'left', characterSpacing: 1 });
      y += FAM_H;
    }

    function drawTipoHeader(tipo: string) {
      garantirPagina(TIPO_H + TIPO_H_PRE);
      y += TIPO_H_PRE;
      doc.rect(LEFT, y, WIDTH, TIPO_H).fill(tiposBg[tipo]);
      doc.font('Helvetica-Bold').fontSize(12).fillColor(tiposCor[tipo])
         .text(tiposLabel[tipo], LEFT + 10, y + 7, { width: WIDTH - 20, align: 'left' });
      y += TIPO_H;
      doc.fillColor('#0a0a0a');
    }

    function drawSubtotal(tipo: string, valor: number) {
      garantirPagina(SUBTOT_H + 6);
      y += 4;
      doc.strokeColor('#9ca3af').lineWidth(0.8).moveTo(LEFT, y).lineTo(RIGHT, y).stroke();
      y += 4;
      doc.font('Helvetica-Bold').fontSize(10).fillColor(tiposCor[tipo])
         .text(`Total ${tiposLabel[tipo]}`, COL_CODIGO_X, y + 3, { width: COL_VALOR_X - COL_CODIGO_X - 10, align: 'left' });
      doc.text(fmt(valor), COL_VALOR_X, y + 3, { width: COL_VALOR_W, align: 'right' });
      y += SUBTOT_H;
      doc.fillColor('#0a0a0a');
    }

    let totalProv = 0, totalGasto = 0;
    for (const tipo of tiposOrdem) {
      const familias = Object.values(porFamilia).filter(f => f.tipo === tipo);
      if (!familias.length) continue;
      drawTipoHeader(tipo);
      let subTotal = 0;
      for (const fam of familias) {
        drawFamilia(fam.familia);
        for (const l of fam.linhas) drawLinha(l);
        subTotal += fam.total;
      }
      drawSubtotal(tipo, subTotal);
      if (tipo === 'proveito') totalProv = subTotal;
      if (tipo === 'gasto') totalGasto = subTotal;
    }

    // === Nota explicativa dos diferidos ===
    if (soDiferidos) {
      garantirPagina(45);
      y += 6;
      doc.rect(LEFT, y, WIDTH, 36).fill('#f5f3ff');
      doc.font('Helvetica-Oblique').fontSize(8).fillColor('#5b21b6')
         .text('Nota: Subsídios diferidos (conta 59) não são dívidas. Representam dinheiro recebido para investimentos duradouros (ex: PAI) que o SNC manda reconhecer como proveito ao longo dos anos de vida útil do ativo, via conta 7883. Não entram no resultado deste período.',
               LEFT + 10, y + 7, { width: WIDTH - 20, align: 'justify' });
      y += 42;
      doc.fillColor('#0a0a0a');
    }

    // === Resultado líquido ===
    const resultado = totalProv - totalGasto;
    const resBg = resultado >= 0 ? '#dcfce7' : '#fee2e2';
    const resFg = resultado >= 0 ? '#166534' : '#991b1b';
    garantirPagina(48);
    y += 10;
    doc.rect(LEFT, y, WIDTH, 42).fill(resBg);
    doc.font('Helvetica-Bold').fontSize(13).fillColor(resFg)
       .text('Resultado Líquido do Período', LEFT + 12, y + 14, { width: COL_VALOR_X - LEFT - 20, align: 'left' });
    doc.fontSize(16)
       .text(fmt(resultado), COL_VALOR_X - 10, y + 12, { width: COL_VALOR_W + 10, align: 'right' });
    y += 48;
    doc.fillColor('#0a0a0a');

    // === Aviso de registos sem classificação ===
    if (semClass > 0) {
      garantirPagina(36);
      y += 10;
      doc.rect(LEFT, y, WIDTH, 28).fill('#fef3c7');
      doc.font('Helvetica').fontSize(9).fillColor('#92400e')
         .text(`⚠ ${semClass} registo(s) sem classificação SNC — ${fmt(semClassVal)} fora deste balancete. Corrige em Despesas / Receitas para aparecerem.`,
               LEFT + 10, y + 9, { width: WIDTH - 20, align: 'left' });
      y += 32;
    }

    // === Rodapé ===
    doc.fontSize(8).font('Helvetica').fillColor('#9ca3af')
       .text(`Gerado em ${new Date().toLocaleString('pt-PT')} · Gestor Young-Link`,
             LEFT, 810, { width: WIDTH, align: 'center' });

    doc.end();
  } catch (err: any) {
    console.error('Erro balancete PDF:', err);
    res.status(500).json({ error: err.message || 'Erro' });
  }
});

router.get('/pdf', async (req, res) => {
  try {
    const { default: PDFDocument } = await import('pdfkit');
    const tipo: TipoRelatorio = (req.query.tipo as TipoRelatorio) || 'ambos';
    const { inicio, fim, label: periodoLabel } = parsePeriodo(req.query);
    const isAnual = ((req.query.periodo as string) || 'custom') === 'anual';

    type FaturaRow = Awaited<ReturnType<typeof prisma.fatura.findMany>>[number];
    type ReceitaRow = Awaited<ReturnType<typeof prisma.receita.findMany>>[number];

    const dateRange = { gte: new Date(inicio), lte: new Date(fim) };
    const incFin = { contaSnc: { select: { codigo: true, nome: true } }, entidade: { select: { nome: true, nif: true } } };
    const [faturas, receitas, faturaEventos, receitaEventos] = await Promise.all([
      tipo === 'receitas' ? Promise.resolve([] as FaturaRow[]) : prisma.fatura.findMany({ where: { data: dateRange }, orderBy: { data: 'desc' }, include: incFin }),
      tipo === 'despesas' ? Promise.resolve([] as ReceitaRow[]) : prisma.receita.findMany({ where: { data: dateRange }, orderBy: { data: 'desc' }, include: incFin }),
      tipo === 'receitas' ? Promise.resolve([]) : prisma.faturaEvento.findMany({
        where: { fatura: { data: dateRange } },
        include: {
          evento: { select: { id: true, nome: true, departamento: true, tipo: true, data_inicio: true, data_fim: true } },
          fatura: { include: incFin },
        },
      }),
      tipo === 'despesas' ? Promise.resolve([]) : prisma.receitaEvento.findMany({
        where: { receita: { data: dateRange } },
        include: {
          evento: { select: { id: true, nome: true, departamento: true, tipo: true, data_inicio: true, data_fim: true } },
          receita: { include: incFin },
        },
      }),
    ]);

    const totalDespesas = faturas.reduce((s, f) => s + toNum(f.valor), 0);
    const totalReceitas = receitas.reduce((s, r) => s + toNum(r.valor), 0);
    const saldo = totalReceitas - totalDespesas;

    // Despesas por departamento — só para o gráfico global de apoio.
    const depDespesas = groupBy(faturas as any[], 'departamento');

    // PDF
    const doc = new PDFDocument({ margin: 40, bufferPages: true });
    res.header('Content-Type', 'application/pdf');
    res.attachment('relatorio-financeiro.pdf');
    doc.pipe(res);

    const logo = await getLogoBuffer();
    const tituloRel = isAnual
      ? 'Relatório Anual de Atividade'
      : (tipo === 'despesas' ? 'Relatório de Despesas' : tipo === 'receitas' ? 'Relatório de Receitas' : 'Relatório Financeiro');

    // Capa
    drawCover(doc, tituloRel, periodoLabel, logo);
    doc.addPage();
    drawHeader(doc, tituloRel, periodoLabel, logo);

    const eventoData = buildEventoData(faturas as any[], receitas as any[], faturaEventos as any[], receitaEventos as any[]);

    // --- A · Visão geral: destaques + placar + gráficos de apoio ---
    sectionTitle(doc, 'Visão Geral');

    // Banda de destaques (números grandes)
    const kpis: { label: string; valor: string; bg: string; fg: string }[] = [];
    if (tipo !== 'despesas') kpis.push({ label: 'Receitas', valor: fmt(totalReceitas), bg: '#e2fee3', fg: '#15803d' });
    if (tipo !== 'receitas') kpis.push({ label: 'Despesas', valor: fmt(totalDespesas), bg: '#ffe2e5', fg: '#b91c1c' });
    if (tipo === 'ambos') kpis.push({ label: isAnual ? 'Resultado do Ano' : 'Saldo do Período', valor: fmt(saldo), bg: saldo >= 0 ? '#dcfce7' : '#fee2e2', fg: saldo >= 0 ? '#166534' : '#b91c1c' });
    drawKpiBand(doc, kpis);

    if (tipo !== 'receitas') renderBars(doc, 'Despesas por Departamento', toArray(depDespesas));
    if (tipo !== 'despesas') {
      const recPorEntidade: Record<string, number> = {};
      (receitas as any[]).forEach((r) => {
        const ent = r.entidade?.nome || (r.financiador && String(r.financiador).trim()) || 'Sem entidade';
        recPorEntidade[ent] = (recPorEntidade[ent] || 0) + toNum(r.valor);
      });
      renderBars(doc, 'Receitas por Entidade', toArray(recPorEntidade));
    }

    // Agrupamentos adicionais por conta SNC (sempre que haja dados classificados)
    if (tipo !== 'receitas') {
      const porSnc: Record<string, number> = {};
      (faturas as any[]).forEach((f) => {
        if (f.contaSnc) {
          const label = `${f.contaSnc.codigo} — ${f.contaSnc.nome}`;
          porSnc[label] = (porSnc[label] || 0) + toNum(f.valor);
        }
      });
      if (Object.keys(porSnc).length) renderBars(doc, 'Despesas por Conta SNC', toArray(porSnc));
    }
    if (tipo !== 'despesas') {
      const porSnc: Record<string, number> = {};
      (receitas as any[]).forEach((r) => {
        if (r.contaSnc) {
          const label = `${r.contaSnc.codigo} — ${r.contaSnc.nome}`;
          porSnc[label] = (porSnc[label] || 0) + toNum(r.valor);
        }
      });
      if (Object.keys(porSnc).length) renderBars(doc, 'Receitas por Conta SNC', toArray(porSnc));
    }

    // --- B · Por evento ---
    if (eventoData.eventosSorted.length) {
      sectionTitle(doc, 'Por Evento');
      eventoData.eventosSorted.forEach((ev) => drawEventoBloco(doc, ev, tipo));
    }

    // --- C · Movimentos gerais (fora de eventos) ---
    const foraRows = foraEventosRows(eventoData, tipo);
    if (foraRows.length) {
      sectionTitle(doc, 'Movimentos Gerais (fora de eventos)');
      drawTable(doc, foraRows);
    }

    // --- D · Transparência: cofinanciamentos e subsídios ---
    if (tipo !== 'despesas' && receitas.length > 0) {
      const cof = cofinanciamentoRows(receitas as any[]);
      sectionTitle(doc, 'Cofinanciamentos e Subsídios');
      drawTable(doc, cof.rows);
    }

    drawPageNumbers(doc);
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
    prisma.receitaEvento.findMany({ where: { receita: { data: dateRange } }, include: { evento: { select: { id: true, nome: true, departamento: true, data_inicio: true, data_fim: true } } } }),
  ]);

  const totalDespesas = faturas.reduce((s, f) => s + toNum(f.valor), 0);
  const totalReceitas = receitas.reduce((s, r) => s + toNum(r.valor), 0);
  const saldo = totalReceitas - totalDespesas;

  const depDespesas = groupBy(faturas as any[], 'departamento');
  const catReceitas = groupBy(receitas as any[], 'categoria');

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

    // Estrutura por evento (mesma lógica do Relatório Financeiro).
    const eventoData = buildEventoData(dados.faturas as any[], dados.receitas as any[], dados.faturaEventos as any[], dados.receitaEventos as any[]);

    // Por evento (evento > departamento > movimento)
    if (eventoData.eventosSorted.length) {
      sectionTitle(doc, 'Por Evento');
      eventoData.eventosSorted.forEach((ev) => drawEventoBloco(doc, ev, 'ambos'));
    }

    // Movimentos gerais (fora de eventos)
    const foraRows = foraEventosRows(eventoData, 'ambos');
    if (foraRows.length) {
      sectionTitle(doc, 'Movimentos Gerais (fora de eventos)');
      drawTable(doc, foraRows);
    }

    // Cofinanciamentos e subsídios (quem financiou e com quanto)
    const cof = cofinanciamentoRows(dados.receitas as any[]);
    sectionTitle(doc, 'Cofinanciamentos e Subsídios');
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
