import express from 'express';
import crypto from 'crypto';
import path from 'path';
import rateLimit from 'express-rate-limit';
import archiver from 'archiver';
import { prisma } from '../config/prisma';
import { logAudit } from '../services/audit';
import { getLogoBuffer } from '../utils/logo';
import { drawDetailTable } from '../utils/pdfTable';

const ACCESS_TTL_HOURS = 12;
const DEFAULT_EXPIRES_DAYS = 30;

const shareAccessLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: { error: 'Demasiadas tentativas. Tente novamente mais tarde.' },
  standardHeaders: true,
  legacyHeaders: false,
});

function hashPassword(password: string, salt: string) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function verifyPassword(password: string, salt: string, expectedHash: string) {
  const computed = Buffer.from(hashPassword(password, salt), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  if (computed.length !== expected.length) return false;
  return crypto.timingSafeEqual(computed, expected);
}

function hashToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function generateSharePassword() {
  return crypto.randomBytes(6).toString('base64url');
}

function parseCookies(header: string | undefined) {
  const out: Record<string, string> = {};
  if (!header) return out;
  header.split(';').forEach((part) => {
    const idx = part.indexOf('=');
    if (idx === -1) return;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    out[key] = decodeURIComponent(val);
  });
  return out;
}

function isShareActive(share: any) {
  if (!share) return false;
  if (share.revokedAt) return false;
  if (share.expiresAt && new Date(share.expiresAt) < new Date()) return false;
  return true;
}

function buildPublicBase() {
  return process.env.APP_URL || 'http://localhost:3000';
}

function sanitizeFilename(name: string | null | undefined) {
  const cleaned = (name || '')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9-_ ]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60);
  return cleaned || 'documento';
}

function extFromAnexo(anexo: any) {
  const fromName = /\.([a-zA-Z0-9]+)$/.exec(anexo?.originalName || '');
  if (fromName) return fromName[1].toLowerCase();
  const map: Record<string, string> = {
    'application/pdf': 'pdf',
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/webp': 'webp',
  };
  return map[anexo?.mimeType] || 'bin';
}

function csvEscape(value: any) {
  const s = String(value ?? '');
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function formatDateFile(d: Date) {
  return new Date(d).toISOString().slice(0, 10);
}

function formatDatePt(d: Date) {
  return new Date(d).toLocaleDateString('pt-PT');
}

type Row = { cells: [string, string]; fill?: string; color?: string; bold?: boolean };

// Desenha uma tabela de 2 colunas (descrição | valor), com paginação automática
// e altura de linha dinâmica (para descrições que quebram em várias linhas).
function drawTable(doc: any, rows: Row[]) {
  const startX = 40, tableWidth = 520, colWidths = [380, 140], padY = 6, minRowHeight = 24;
  let y = doc.y;
  rows.forEach((row) => {
    doc.font(row.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(10);
    const textHeight = doc.heightOfString(row.cells[0], { width: colWidths[0] - 16 });
    const rowHeight = Math.max(minRowHeight, textHeight + padY * 2);
    if (y + rowHeight > doc.page.height - 50) { doc.addPage(); y = doc.y; }
    if (row.fill) doc.rect(startX, y, tableWidth, rowHeight).fill(row.fill);
    doc.fillColor(row.color || '#0f172a').font(row.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(10);
    doc.text(row.cells[0], startX + 10, y + padY, { width: colWidths[0] - 16, align: 'left' });
    doc.text(row.cells[1], startX + colWidths[0] + 10, y + padY, { width: colWidths[1] - 20, align: 'right' });
    y += rowHeight;
    doc.moveTo(startX, y - 1).lineTo(startX + tableWidth, y - 1).strokeColor('#e2e8f0').lineWidth(0.5).stroke();
  });
  doc.y = y + 8;
  doc.fillColor('#0f172a').strokeColor('#0f172a');
}

async function buildEventoPayload(share: any, token: string) {
  const [faturaEventos, receitaEventos] = await Promise.all([
    prisma.faturaEvento.findMany({
      where: { eventoId: share.eventoId },
      include: { fatura: true },
      orderBy: { fatura: { data: 'desc' } },
    }),
    prisma.receitaEvento.findMany({
      where: { eventoId: share.eventoId },
      include: { receita: true },
      orderBy: { receita: { data: 'desc' } },
    }),
  ]);

  const toNum = (v: any) => Number(v) || 0;
  const totalDespesas = faturaEventos.reduce((s, fe) => s + toNum(fe.valor), 0);
  const totalReceitas = receitaEventos.reduce((s, re) => s + toNum(re.valor), 0);

  const faturas = faturaEventos.map(fe => ({
    id: fe.fatura.id,
    titulo: fe.fatura.titulo,
    departamento: fe.fatura.departamento,
    data: fe.fatura.data,
    numero: fe.fatura.numero,
    fornecedor: fe.fatura.fornecedor,
    estado: fe.fatura.estado,
    valorEvento: toNum(fe.valor),
    anexoLink: fe.fatura.anexo ? `/share/evento/${token}/anexo/fatura/${fe.fatura.id}` : null,
  }));
  const receitas = receitaEventos.map(re => ({
    id: re.receita.id,
    titulo: re.receita.titulo,
    categoria: re.receita.categoria,
    data: re.receita.data,
    financiador: re.receita.financiador,
    estado: re.receita.estado,
    valorEvento: toNum(re.valor),
    anexoLink: re.receita.anexo ? `/share/evento/${token}/anexo/receita/${re.receita.id}` : null,
  }));

  const temAnexos = faturaEventos.some(fe => !!fe.fatura.anexo) || receitaEventos.some(re => !!re.receita.anexo);

  return {
    evento: {
      id: share.evento.id,
      nome: share.evento.nome,
      descricao: share.evento.descricao,
      departamento: share.evento.departamento,
      dataInicio: share.evento.data_inicio,
      dataFim: share.evento.data_fim,
    },
    faturas,
    receitas,
    resumo: {
      totalDespesas,
      totalReceitas,
      saldo: totalReceitas - totalDespesas,
    },
    downloadLink: temAnexos ? `/share/evento/${token}/download` : null,
    relatorioLink: `/share/evento/${token}/relatorio`,
    shareExpiresAt: share.expiresAt,
  };
}

// Valida o cookie de sessão de acesso (emitido após a password ser confirmada em /access).
async function requireAccessToken(token: string, req: express.Request) {
  const share = await prisma.eventoShare.findUnique({ where: { token }, include: { evento: true } });
  if (!share || !isShareActive(share)) {
    return { error: 'Partilha inválida', status: 404 as const };
  }

  const cookies = parseCookies(req.headers.cookie);
  const accessToken = cookies['share_access'];
  if (!accessToken || !share.accessTokenHash || !share.accessTokenExpiresAt) {
    return { error: 'Acesso não autorizado', status: 401 as const };
  }
  if (new Date(share.accessTokenExpiresAt) < new Date()) {
    return { error: 'Sessão expirada', status: 401 as const, expired: true };
  }
  if (hashToken(accessToken) !== share.accessTokenHash) {
    return { error: 'Acesso não autorizado', status: 401 as const };
  }
  return { share };
}

export const sharePublicRouter = express.Router();
export const sharePrivateRouter = express.Router();

// POST /share/evento/:token/access
sharePublicRouter.post('/evento/:token/access', shareAccessLimiter, async (req, res) => {
  try {
    const token = req.params.token as string;
    const password = req.body?.password || '';
    if (!password) return res.status(400).json({ error: 'Password é obrigatória' });

    const share = await prisma.eventoShare.findUnique({
      where: { token },
      include: { evento: true },
    });
    if (!share || !isShareActive(share)) return res.status(404).json({ error: 'Partilha inválida' });

    if (!verifyPassword(password, share.passwordSalt, share.passwordHash)) {
      return res.status(403).json({ error: 'Password incorreta' });
    }

    const accessToken = crypto.randomBytes(24).toString('base64url');
    const accessHash = hashToken(accessToken);
    const sessionExpiresAt = new Date(Date.now() + ACCESS_TTL_HOURS * 60 * 60 * 1000);

    await prisma.eventoShare.update({
      where: { id: share.id },
      data: {
        accessTokenHash: accessHash,
        accessTokenExpiresAt: sessionExpiresAt,
      },
    });

    res.cookie('share_access', accessToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: ACCESS_TTL_HOURS * 60 * 60 * 1000,
      path: `/share/evento/${token}`,
    });

    const payload = await buildEventoPayload(share, token);
    return res.json({ ...payload, sessionExpiresAt });
  } catch (err) {
    console.error('Erro acesso partilha:', err.message || err);
    return res.status(500).json({ error: 'Erro ao validar partilha' });
  }
});

// GET /share/evento/:token/session — restaura a vista sem repetir a password, enquanto o cookie for válido
sharePublicRouter.get('/evento/:token/session', async (req, res) => {
  try {
    const token = req.params.token as string;
    const result = await requireAccessToken(token, req);
    if ('error' in result) return res.status(result.status).json({ error: result.error, expired: (result as any).expired });

    const payload = await buildEventoPayload(result.share, token);
    return res.json(payload);
  } catch (err) {
    console.error('Erro sessão partilha:', err.message || err);
    return res.status(500).json({ error: 'Erro ao restaurar sessão' });
  }
});

// GET /share/evento/:token/anexo/:tipo/:id
sharePublicRouter.get('/evento/:token/anexo/:tipo/:id', async (req, res) => {
  try {
    const token = req.params.token as string;
    const tipo = req.params.tipo as 'fatura' | 'receita';
    const id = Number(req.params.id);

    const result = await requireAccessToken(token, req);
    if ('error' in result) return res.status(result.status).json({ error: result.error, expired: (result as any).expired });
    const share = result.share;

    let anexo: any;
    if (tipo === 'fatura') {
      const link = await prisma.faturaEvento.findFirst({
        where: { faturaId: id, eventoId: share.eventoId },
        include: { fatura: true },
      });
      if (!link || !link.fatura.anexo) {
        return res.status(404).json({ error: 'Anexo não encontrado' });
      }
      anexo = link.fatura.anexo;
    } else {
      const link = await prisma.receitaEvento.findFirst({
        where: { receitaId: id, eventoId: share.eventoId },
        include: { receita: true },
      });
      if (!link || !link.receita.anexo) {
        return res.status(404).json({ error: 'Anexo não encontrado' });
      }
      anexo = link.receita.anexo;
    }

    if (anexo.driveFileId) {
      const { streamFromDrive } = await import('../services/googleDrive');
      const stream = await streamFromDrive(anexo.driveFileId);
      res.setHeader('Content-Type', anexo.mimeType || 'application/octet-stream');
      res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(anexo.originalName || 'anexo')}"`);
      return stream.pipe(res);
    }
    return res.status(404).json({ error: 'Anexo indisponível' });
  } catch (err) {
    console.error('Erro anexo partilha:', err.message || err);
    return res.status(500).json({ error: 'Erro ao servir anexo' });
  }
});

// GET /share/evento/:token/download — descarrega um .zip com todos os anexos + resumo.csv
sharePublicRouter.get('/evento/:token/download', async (req, res) => {
  try {
    const token = req.params.token as string;
    const result = await requireAccessToken(token, req);
    if ('error' in result) return res.status(result.status).json({ error: result.error, expired: (result as any).expired });
    const share = result.share;

    const [faturaEventos, receitaEventos] = await Promise.all([
      prisma.faturaEvento.findMany({ where: { eventoId: share.eventoId }, include: { fatura: true } }),
      prisma.receitaEvento.findMany({ where: { eventoId: share.eventoId }, include: { receita: true } }),
    ]);

    const zipName = `${sanitizeFilename(share.evento.nome)}.zip`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`);

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', (err) => {
      console.error('Erro ao gerar zip da partilha:', err);
      if (!res.headersSent) res.status(500).end();
    });
    archive.pipe(res);

    const { streamFromDrive } = await import('../services/googleDrive');
    const csvLines = ['Tipo;Titulo;Categoria/Departamento;Data;Fornecedor/Financiador;Estado;Valor'];

    for (const fe of faturaEventos) {
      const f = fe.fatura;
      csvLines.push([
        'Despesa', csvEscape(f.titulo), csvEscape(f.departamento), formatDatePt(f.data),
        csvEscape(f.fornecedor || ''), csvEscape(f.estado), Number(fe.valor).toFixed(2),
      ].join(';'));

      const anexo = f.anexo as any;
      if (anexo?.driveFileId) {
        try {
          const stream = await streamFromDrive(anexo.driveFileId);
          archive.append(stream as any, { name: `Despesas/${formatDateFile(f.data)}_${sanitizeFilename(f.titulo)}-${f.id}.${extFromAnexo(anexo)}` });
        } catch (err) {
          console.error('Falha ao anexar despesa ao zip', f.id, err);
        }
      }
    }

    for (const re of receitaEventos) {
      const r = re.receita;
      csvLines.push([
        'Receita', csvEscape(r.titulo), csvEscape(r.categoria), formatDatePt(r.data),
        csvEscape(r.financiador || ''), csvEscape(r.estado), Number(re.valor).toFixed(2),
      ].join(';'));

      const anexo = r.anexo as any;
      if (anexo?.driveFileId) {
        try {
          const stream = await streamFromDrive(anexo.driveFileId);
          archive.append(stream as any, { name: `Receitas/${formatDateFile(r.data)}_${sanitizeFilename(r.titulo)}-${r.id}.${extFromAnexo(anexo)}` });
        } catch (err) {
          console.error('Falha ao anexar receita ao zip', r.id, err);
        }
      }
    }

    archive.append(csvLines.join('\n'), { name: 'resumo.csv' });
    await archive.finalize();
  } catch (err) {
    console.error('Erro ao descarregar partilha:', err.message || err);
    if (!res.headersSent) res.status(500).json({ error: 'Erro ao gerar descarga' });
  }
});

// GET /share/evento/:token/relatorio — relatório PDF do evento
sharePublicRouter.get('/evento/:token/relatorio', async (req, res) => {
  try {
    const token = req.params.token as string;
    const result = await requireAccessToken(token, req);
    if ('error' in result) return res.status(result.status).json({ error: result.error, expired: (result as any).expired });
    const share = result.share;

    const [faturaEventos, receitaEventos] = await Promise.all([
      prisma.faturaEvento.findMany({ where: { eventoId: share.eventoId }, include: { fatura: true }, orderBy: { fatura: { data: 'desc' } } }),
      prisma.receitaEvento.findMany({ where: { eventoId: share.eventoId }, include: { receita: true }, orderBy: { receita: { data: 'desc' } } }),
    ]);

    const toNum = (v: any) => Number(v) || 0;
    const fmt = (v: number) => `${v.toFixed(2)} €`;
    const totalDespesas = faturaEventos.reduce((s, fe) => s + toNum(fe.valor), 0);
    const totalReceitas = receitaEventos.reduce((s, re) => s + toNum(re.valor), 0);
    const saldo = totalReceitas - totalDespesas;

    const { default: PDFDocument } = await import('pdfkit');
    const doc = new PDFDocument({ margin: 40 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Relatorio-${sanitizeFilename(share.evento.nome)}.pdf"`);
    doc.pipe(res);

    // Cabeçalho
    const logo = await getLogoBuffer();
    doc.rect(40, 30, 520, 60).fill('#0f172a');
    if (logo) { try { doc.image(logo, 50, 40, { height: 40 }); } catch {} }
    doc.fillColor('#ffffff').fontSize(15).font('Helvetica-Bold').text('Relatório de Evento', 200, 46, { width: 340, align: 'right' });
    doc.fontSize(9).font('Helvetica').text(`Emitido em ${formatDatePt(new Date())}`, 200, 68, { width: 340, align: 'right' });
    doc.moveDown(3).fillColor('#0f172a');

    // Identificação do evento
    doc.fontSize(16).font('Helvetica-Bold').fillColor('#0f172a').text(share.evento.nome, 40, 110, { width: 520 });
    doc.moveDown(0.3);
    const meta: string[] = [];
    if (share.evento.departamento) meta.push(`Departamento: ${share.evento.departamento}`);
    if (share.evento.data_inicio || share.evento.data_fim) {
      const ini = share.evento.data_inicio ? formatDatePt(share.evento.data_inicio) : '?';
      const fim = share.evento.data_fim ? formatDatePt(share.evento.data_fim) : '?';
      meta.push(`Período: ${ini === fim ? ini : `${ini} — ${fim}`}`);
    }
    if (meta.length) doc.fontSize(10).font('Helvetica').fillColor('#475569').text(meta.join('   ·   '), { width: 520 });
    if (share.evento.descricao) doc.moveDown(0.2).fontSize(10).fillColor('#475569').text(share.evento.descricao, { width: 520 });
    doc.moveDown(1).fillColor('#0f172a');

    const rows: Row[] = [];
    rows.push({ cells: ['Resumo Financeiro', ''], fill: '#f1f5f9', bold: true });
    rows.push({ cells: ['Total de Receitas', fmt(totalReceitas)], fill: '#e2fee3', color: '#15803d', bold: true });
    rows.push({ cells: ['Total de Despesas', fmt(totalDespesas)], fill: '#ffe2e5', color: '#b91c1c', bold: true });
    rows.push({ cells: ['Saldo do Evento', fmt(saldo)], fill: saldo >= 0 ? '#dcfce7' : '#fee2e2', color: saldo >= 0 ? '#166534' : '#b91c1c', bold: true });
    drawTable(doc, rows);

    // Receitas — tabela detalhada
    doc.moveDown(0.5).fontSize(12).font('Helvetica-Bold').fillColor('#0f172a').text('Receitas');
    doc.moveDown(0.3);
    if (receitaEventos.length === 0) {
      doc.fontSize(9).font('Helvetica').fillColor('#64748b').text('Sem receitas registadas.');
      doc.moveDown(0.5);
    } else {
      drawDetailTable(doc, {
        columns: [
          { header: 'Data', key: 'data', width: 60 },
          { header: 'Descrição', key: 'titulo', width: 150 },
          { header: 'Categoria', key: 'categoria', width: 92 },
          { header: 'Financiador', key: 'financiador', width: 118 },
          { header: 'Estado', key: 'estado', width: 45 },
          { header: 'Valor', key: 'valor', width: 50, align: 'right' },
        ],
        zebra: true,
        rows: receitaEventos.map((re) => {
          const r = re.receita;
          return {
            data: formatDatePt(r.data),
            titulo: r.titulo || '-',
            categoria: r.categoria || '-',
            financiador: r.financiador || '-',
            estado: r.estado || '-',
            valor: fmt(toNum(re.valor)),
          };
        }),
        totalRow: { data: '', titulo: 'Subtotal Receitas', categoria: '', financiador: '', estado: '', valor: fmt(totalReceitas) },
        totalColor: '#15803d',
      });
    }

    // Despesas — tabela detalhada
    doc.moveDown(0.5).fontSize(12).font('Helvetica-Bold').fillColor('#0f172a').text('Despesas');
    doc.moveDown(0.3);
    if (faturaEventos.length === 0) {
      doc.fontSize(9).font('Helvetica').fillColor('#64748b').text('Sem despesas registadas.');
      doc.moveDown(0.5);
    } else {
      drawDetailTable(doc, {
        columns: [
          { header: 'Data', key: 'data', width: 60 },
          { header: 'Nº Documento', key: 'numero', width: 78 },
          { header: 'Descrição', key: 'titulo', width: 105 },
          { header: 'Fornecedor', key: 'fornecedor', width: 103 },
          { header: 'Depart.', key: 'departamento', width: 66 },
          { header: 'Estado', key: 'estado', width: 43 },
          { header: 'Valor', key: 'valor', width: 50, align: 'right' },
        ],
        zebra: true,
        rows: faturaEventos.map((fe) => {
          const f = fe.fatura;
          return {
            data: formatDatePt(f.data),
            numero: f.numero || '-',
            titulo: f.titulo || '-',
            fornecedor: f.fornecedor || '-',
            departamento: f.departamento || '-',
            estado: f.estado || '-',
            valor: fmt(toNum(fe.valor)),
          };
        }),
        totalRow: { data: '', numero: '', titulo: 'Subtotal Despesas', fornecedor: '', departamento: '', estado: '', valor: fmt(totalDespesas) },
        totalColor: '#b91c1c',
      });
    }

    doc.moveDown(1).fontSize(8).font('Helvetica').fillColor('#94a3b8')
      .text('Documento gerado automaticamente pela plataforma de Gestão Financeira Young-Link.', 40, doc.y, { width: 520, align: 'center' });

    doc.end();
  } catch (err) {
    console.error('Erro ao gerar relatório da partilha:', err.message || err);
    if (!res.headersSent) res.status(500).json({ error: 'Erro ao gerar relatório' });
  }
});

// POST /shares
sharePrivateRouter.post('/', async (req, res) => {
  try {
    const { eventoId, destinatario, justificacao, expiresInDays } = req.body || {};
    if (!eventoId) return res.status(400).json({ error: 'Evento é obrigatório' });
    if (!justificacao) return res.status(400).json({ error: 'Justificação é obrigatória' });

    const evento = await prisma.evento.findUnique({ where: { id: Number(eventoId) } });
    if (!evento) return res.status(404).json({ error: 'Evento não encontrado' });

    const passwordPlain = generateSharePassword();
    const token = crypto.randomBytes(24).toString('base64url');
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = hashPassword(passwordPlain, salt);
    const days = Math.max(1, parseInt(expiresInDays || DEFAULT_EXPIRES_DAYS, 10));
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    const share = await prisma.eventoShare.create({
      data: {
        token,
        eventoId: Number(eventoId),
        createdById: (req as any).authUserId || null,
        createdByEmail: (req as any).authUser || null,
        destinatario: destinatario || null,
        justificacao,
        passwordHash: hash,
        passwordSalt: salt,
        expiresAt,
      },
    });

    await logAudit({
      action: 'CREATE',
      entity: 'share',
      entityId: share.id.toString(),
      details: { eventoId: share.eventoId, destinatario, justificacao, expiresAt },
      req,
    });

    const link = `${buildPublicBase()}/share/evento/${token}`;
    return res.status(201).json({
      id: share.id,
      link,
      expiresAt,
      password: passwordPlain,
    });
  } catch (err) {
    console.error('Erro criar partilha:', err.message || err);
    return res.status(500).json({ error: 'Erro ao criar partilha' });
  }
});

// GET /shares (admin)
sharePrivateRouter.get('/', async (req, res) => {
  try {
    if (!['admin', 'direcao'].includes((req as any).authRole)) {
      return res.status(403).json({ error: 'Sem permissões' });
    }
    const { limit: lim, offset: off } = req.query as any;
    const take = parseInt(lim || '30', 10);
    const skip = parseInt(off || '0', 10);

    const [shares, total] = await Promise.all([
      prisma.eventoShare.findMany({
        orderBy: { createdAt: 'desc' },
        take,
        skip,
        include: { evento: true },
      }),
      prisma.eventoShare.count(),
    ]);

    return res.json({ shares, total });
  } catch (err) {
    console.error('Erro listar partilhas:', err.message || err);
    return res.status(500).json({ error: 'Erro ao listar partilhas' });
  }
});

// PUT /shares/:id (admin) — editar expiresAt, destinatario
sharePrivateRouter.put('/:id', async (req, res) => {
  try {
    if (!['admin', 'direcao'].includes((req as any).authRole)) {
      return res.status(403).json({ error: 'Sem permissões' });
    }
    const id = Number(req.params.id);
    const { expiresAt, destinatario } = req.body || {};
    const data: any = {};
    if (expiresAt) {
      data.expiresAt = new Date(expiresAt);
      data.revokedAt = null;
    }
    if (destinatario !== undefined) data.destinatario = destinatario || null;
    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: 'Nenhum campo para atualizar' });
    }
    const share = await prisma.eventoShare.update({ where: { id }, data });
    await logAudit({
      action: 'UPDATE',
      entity: 'share',
      entityId: share.id.toString(),
      details: data,
      req,
    });
    return res.json(share);
  } catch (err) {
    console.error('Erro editar partilha:', err.message || err);
    return res.status(500).json({ error: 'Erro ao editar partilha' });
  }
});

// POST /shares/:id/revoke (admin)
sharePrivateRouter.post('/:id/revoke', async (req, res) => {
  try {
    if (!['admin', 'direcao'].includes((req as any).authRole)) {
      return res.status(403).json({ error: 'Sem permissões' });
    }
    const id = Number(req.params.id);
    const share = await prisma.eventoShare.update({
      where: { id },
      data: { revokedAt: new Date() },
    });

    await logAudit({
      action: 'UPDATE',
      entity: 'share',
      entityId: share.id.toString(),
      details: { revokedAt: share.revokedAt },
      req,
    });

    return res.json({ ok: true });
  } catch (err) {
    console.error('Erro revogar partilha:', err.message || err);
    return res.status(500).json({ error: 'Erro ao revogar partilha' });
  }
});
