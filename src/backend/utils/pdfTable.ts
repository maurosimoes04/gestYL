// Helper para tabelas detalhadas multi-coluna em PDFs (pdfkit).
// Usado nos relatórios de evento (app e partilha) para listar cada
// despesa/receita ao detalhe: data, nº documento, fornecedor, etc.

export interface PdfColumn {
  header: string;
  key: string;
  width: number;
  align?: 'left' | 'right';
}

export interface DrawDetailTableOptions {
  x?: number;
  columns: PdfColumn[];
  rows: Record<string, string>[];
  headerFill?: string;
  headerColor?: string;
  zebra?: boolean;
  fontSize?: number;
  totalRow?: Record<string, string>; // linha de total (a negrito, no fundo)
  totalFill?: string;
  totalColor?: string;
}

// Desenha uma tabela com cabeçalho repetido por página, zebra e altura de
// linha dinâmica (texto que quebra em várias linhas não é cortado).
export function drawDetailTable(doc: any, opts: DrawDetailTableOptions) {
  const x = opts.x ?? 40;
  const fontSize = opts.fontSize ?? 8.5;
  const padX = 5;
  const padY = 5;
  const lineColor = '#e2e8f0';
  const cols = opts.columns;
  const tableWidth = cols.reduce((s, c) => s + c.width, 0);

  const measureRowHeight = (row: Record<string, string>, bold: boolean) => {
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(fontSize);
    let maxH = 0;
    for (const c of cols) {
      const txt = row[c.key] ?? '';
      const h = doc.heightOfString(txt, { width: c.width - padX * 2 });
      if (h > maxH) maxH = h;
    }
    return Math.max(18, maxH + padY * 2);
  };

  const drawRow = (row: Record<string, string>, optsRow: { bold?: boolean; fill?: string; color?: string }) => {
    const bold = !!optsRow.bold;
    const rowH = measureRowHeight(row, bold);
    if (doc.y + rowH > doc.page.height - 45) {
      doc.addPage();
      drawHeader();
    }
    const y = doc.y;
    if (optsRow.fill) doc.rect(x, y, tableWidth, rowH).fill(optsRow.fill);
    doc.fillColor(optsRow.color || '#0f172a').font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(fontSize);
    let cx = x;
    for (const c of cols) {
      const txt = row[c.key] ?? '';
      doc.text(txt, cx + padX, y + padY, { width: c.width - padX * 2, align: c.align || 'left', ellipsis: true, height: rowH - padY });
      cx += c.width;
    }
    doc.y = y + rowH;
    doc.moveTo(x, doc.y).lineTo(x + tableWidth, doc.y).strokeColor(lineColor).lineWidth(0.5).stroke();
    doc.fillColor('#0f172a').strokeColor('#0f172a');
  };

  const headerRow: Record<string, string> = {};
  cols.forEach((c) => { headerRow[c.key] = c.header; });
  const drawHeader = () => {
    drawRow(headerRow, { bold: true, fill: opts.headerFill || '#f1f5f9', color: opts.headerColor || '#0f172a' });
  };

  drawHeader();
  let i = 0;
  for (const row of opts.rows) {
    const fill = opts.zebra && i % 2 === 1 ? '#f8fafc' : undefined;
    drawRow(row, { fill });
    i += 1;
  }
  if (opts.totalRow) {
    drawRow(opts.totalRow, { bold: true, fill: opts.totalFill || '#f8fafc', color: opts.totalColor || '#0f172a' });
  }
  doc.y += 6;
}
