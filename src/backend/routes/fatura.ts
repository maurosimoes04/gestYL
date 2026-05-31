import express from 'express';
import path from 'path';
import { Prisma } from '@prisma/client';

const bootLog = (...args: any[]) => {
  if (process.env.BOOT_DEBUG === 'true') console.log(...args);
};

bootLog('Fatura: carregar prisma');
const { prisma } = require('../config/prisma');
bootLog('Fatura: prisma carregado');
bootLog('Fatura: carregar upload');
const upload = require('../middleware/upload').default;
bootLog('Fatura: upload carregado');

const router = express.Router();
const DESPESAS_FOLDER_ID = process.env.GDRIVE_DESPESAS_FOLDER_ID!;

// GET /faturas
router.get('/', async (req, res) => {
  try {
    const { q, departamento, tipo, estado, dateFrom, dateTo, limit, offset, eventoId, inventarioId } = req.query as any;
    const where: Prisma.FaturaWhereInput = {};
    if (departamento) where.departamento = departamento;
    if (tipo) where.tipo = tipo;
    if (estado) where.estado = estado;
    if (eventoId) where.eventoId = Number(eventoId);
    if (inventarioId) where.inventarioId = Number(inventarioId);
    if (q) {
      where.OR = [
        { titulo: { contains: q, mode: 'insensitive' } },
        { descricao: { contains: q, mode: 'insensitive' } },
        { departamento: { contains: q, mode: 'insensitive' } },
        { tipo: { contains: q, mode: 'insensitive' } },
        { numero: { contains: q, mode: 'insensitive' } },
        { estado: { contains: q, mode: 'insensitive' } },
      ];
    }
    if (dateFrom || dateTo) {
      where.data = {};
      if (dateFrom) where.data.gte = new Date(dateFrom);
      if (dateTo) where.data.lte = new Date(dateTo);
    }

    const faturas = await prisma.fatura.findMany({
      where,
      orderBy: { data: 'desc' },
      ...(limit && { take: parseInt(limit, 10) }),
      ...(offset && { skip: parseInt(offset, 10) }),
    });
    res.json(faturas);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao obter faturas' });
  }
});

// GET /faturas/export/pdf
router.get('/export/pdf', async (_req, res) => {
  try {
    const { default: PDFDocument } = await import('pdfkit');
    const faturas = await prisma.fatura.findMany({ orderBy: { data: 'desc' } });
    const agora = new Date();
    const mesAtual = agora.getMonth();
    const anoAtual = agora.getFullYear();

    const faturasMesAtual = faturas.filter((f) => {
      const d = new Date(f.data);
      return d.getMonth() === mesAtual && d.getFullYear() === anoAtual;
    });

    const toNum = (v: any) => Number(v) || 0;
    const totalMesAtual = faturasMesAtual.reduce((s, f) => s + toNum(f.valor), 0);
    const totalRecorrentes = faturasMesAtual.filter((f) => f.tipo?.includes('Recorrente')).reduce((s, f) => s + toNum(f.valor), 0);
    const totalExtraordinarias = faturasMesAtual.filter((f) => f.tipo?.includes('Extraordinária')).reduce((s, f) => s + toNum(f.valor), 0);
    const totalPagas = faturasMesAtual.filter((f) => f.estado === 'Paga').reduce((s, f) => s + toNum(f.valor), 0);
    const totalPendentes = faturasMesAtual.filter((f) => f.estado === 'Pendente').reduce((s, f) => s + toNum(f.valor), 0);

    const departamentosMap: Record<string, number> = {};
    faturasMesAtual.forEach((f) => {
      departamentosMap[f.departamento] = (departamentosMap[f.departamento] || 0) + toNum(f.valor);
    });
    const departamentoTop = Object.entries(departamentosMap).reduce((a, b) => (b[1] > a[1] ? b : a), ['', 0])[0];

    const doc = new PDFDocument({ margin: 40 });
    res.header('Content-Type', 'application/pdf');
    res.attachment('relatorio-despesas.pdf');
    doc.pipe(res);

    doc.fontSize(24).font('Helvetica-Bold').text('Relatório de Despesas', { align: 'center' });
    doc.fontSize(10).font('Helvetica').text(`Gerado em: ${new Date().toLocaleDateString('pt-PT')}`, { align: 'center' });
    doc.moveDown(1);
    doc.fontSize(16).font('Helvetica-Bold').text('Resumo do Mês Atual');
    doc.moveDown(0.3);

    const dashboardData = [
      `Total Gasto: ${totalMesAtual.toFixed(2)} €`,
      `Recorrentes: ${totalRecorrentes.toFixed(2)} €`,
      `Extraordinárias: ${totalExtraordinarias.toFixed(2)} €`,
      `Pagas: ${totalPagas.toFixed(2)} €`,
      `Pendentes: ${totalPendentes.toFixed(2)} €`,
      `Departamento Top: ${departamentoTop || 'N/A'} (${(departamentosMap[departamentoTop] ?? 0).toFixed(2)} €)`,
    ];
    doc.fontSize(11).font('Helvetica');
    dashboardData.forEach((item) => doc.text(`  ${item}`));
    doc.moveDown(1);
    doc.fontSize(8).font('Helvetica').text('Relatório gerado automaticamente pelo Gestor de Despesas', { align: 'center' });
    doc.end();
  } catch (error) {
    console.error('Erro ao gerar PDF:', error);
    res.status(500).json({ error: 'Erro ao exportar PDF' });
  }
});

// GET /faturas/:id
router.get('/:id', async (req, res) => {
  try {
    const fatura = await prisma.fatura.findUnique({ where: { id: Number(req.params.id) } });
    if (fatura) res.json(fatura);
    else res.status(404).json({ error: 'Fatura não encontrada' });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao obter fatura' });
  }
});

// POST /faturas
router.post('/', upload.single('anexo'), async (req, res) => {
  try {
    const raw: any = { ...req.body };
    // Limpar campos vazios do FormData
    const payload: any = {};
    for (const [k, v] of Object.entries(raw)) {
      if (v !== '' && v !== null && v !== undefined) payload[k] = v;
    }
    if (payload.valor) payload.valor = parseFloat(payload.valor);
    if (payload.data) payload.data = new Date(payload.data);
    if (payload.eventoId) payload.eventoId = Number(payload.eventoId);
    else delete payload.eventoId;
    if (payload.inventarioId) payload.inventarioId = Number(payload.inventarioId);
    else delete payload.inventarioId;
    let driveError = '';
    if (req.file && DESPESAS_FOLDER_ID) {
      try {
        const { uploadBufferToDrive } = await import('../services/googleDrive');
        const driveFile = await uploadBufferToDrive({
          buffer: req.file.buffer,
          filename: req.file.originalname,
          mimeType: req.file.mimetype,
          folderId: DESPESAS_FOLDER_ID,
        });
        payload.anexo = {
          originalName: req.file.originalname,
          mimeType: req.file.mimetype,
          size: req.file.size,
          driveFileId: driveFile.id,
          driveWebViewLink: driveFile.webViewLink,
          driveWebContentLink: driveFile.webContentLink,
        };
      } catch (driveErr: any) {
        driveError = driveErr.message || 'Erro desconhecido';
        console.error('Erro upload Drive:', driveError);
      }
    } else if (req.file && !DESPESAS_FOLDER_ID) {
      driveError = 'Pasta do Google Drive não configurada (GDRIVE_DESPESAS_FOLDER_ID)';
    }
    const novaFatura = await prisma.fatura.create({ data: payload });
    const warnings: string[] = [];
    if (req.file && !payload.anexo) warnings.push(`Anexo não guardado: ${driveError}`);
    res.status(201).json({ ...novaFatura, _warnings: warnings.length ? warnings : undefined });
  } catch (error: any) {
    console.error('Erro criar fatura:', error.message || error);
    const msg = error.code === 'P2002' ? 'Já existe uma fatura com estes dados'
      : error.code === 'P2003' ? 'Evento ou inventário referenciado não existe'
      : error.message?.includes('Argument') ? 'Campos obrigatórios em falta (título, valor, data, departamento, estado)'
      : error.message || 'Erro desconhecido ao criar fatura';
    res.status(400).json({ error: 'Erro ao criar fatura', details: msg });
  }
});

// PUT /faturas/:id
router.put('/:id', upload.single('anexo'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const fatura = await prisma.fatura.findUnique({ where: { id } });
    if (!fatura) return res.status(404).json({ error: 'Fatura não encontrada' });

    const raw: any = { ...req.body };
    const payload: any = {};
    for (const [k, v] of Object.entries(raw)) {
      if (v !== '' && v !== null && v !== undefined) payload[k] = v;
    }
    if (payload.valor) payload.valor = parseFloat(payload.valor);
    if (payload.data) payload.data = new Date(payload.data);
    if (payload.eventoId) payload.eventoId = Number(payload.eventoId);
    else delete payload.eventoId;
    if (payload.inventarioId) payload.inventarioId = Number(payload.inventarioId);
    else delete payload.inventarioId;

    let driveError = '';
    if (req.file && DESPESAS_FOLDER_ID) {
      try {
        const { uploadBufferToDrive, deleteFromDrive } = await import('../services/googleDrive');
        const oldAnexo = fatura.anexo as any;
        if (oldAnexo?.driveFileId) await deleteFromDrive(oldAnexo.driveFileId);

        const driveFile = await uploadBufferToDrive({
          buffer: req.file.buffer,
          filename: req.file.originalname,
          mimeType: req.file.mimetype,
          folderId: DESPESAS_FOLDER_ID,
        });
        payload.anexo = {
          originalName: req.file.originalname,
          mimeType: req.file.mimetype,
          size: req.file.size,
          driveFileId: driveFile.id,
          driveWebViewLink: driveFile.webViewLink,
          driveWebContentLink: driveFile.webContentLink,
        };
      } catch (driveErr: any) {
        driveError = driveErr.message || 'Erro desconhecido';
        console.error('Erro upload Drive:', driveError);
      }
    } else if (req.file && !DESPESAS_FOLDER_ID) {
      driveError = 'Pasta do Google Drive não configurada (GDRIVE_DESPESAS_FOLDER_ID)';
    }

    const updated = await prisma.fatura.update({ where: { id }, data: payload });
    const warnings: string[] = [];
    if (req.file && !payload.anexo) warnings.push(`Anexo não guardado: ${driveError}`);
    res.json({ ...updated, _warnings: warnings.length ? warnings : undefined });
  } catch (error: any) {
    console.error('Erro atualizar fatura:', error.message || error);
    const msg = error.code === 'P2003' ? 'Evento ou inventário referenciado não existe'
      : error.message?.includes('Argument') ? 'Campos inválidos no pedido'
      : error.message || 'Erro desconhecido ao atualizar fatura';
    res.status(400).json({ error: 'Erro ao atualizar fatura', details: msg });
  }
});

// DELETE /faturas/:id
router.delete('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const fatura = await prisma.fatura.findUnique({ where: { id } });
    if (!fatura) return res.status(404).json({ error: 'Fatura não encontrada' });

    const anexo = fatura.anexo as any;
    if (anexo?.driveFileId) {
      try {
        const { deleteFromDrive } = await import('../services/googleDrive');
        await deleteFromDrive(anexo.driveFileId);
      } catch (e) {
        console.error('Falha ao apagar anexo no Drive:', e);
      }
    }

    await prisma.fatura.delete({ where: { id } });
    res.json({ message: 'Fatura eliminada com sucesso' });
  } catch (error) {
    console.error('Erro ao eliminar fatura:', error);
    res.status(500).json({ error: 'Erro ao eliminar fatura' });
  }
});

// GET /faturas/:id/anexo
router.get('/:id/anexo', async (req, res) => {
  try {
    const fatura = await prisma.fatura.findUnique({ where: { id: Number(req.params.id) } });
    if (!fatura || !fatura.anexo) return res.status(404).json({ error: 'Anexo não encontrado' });

    const anexo = fatura.anexo as any;
    const link = anexo.driveWebContentLink || anexo.driveWebViewLink;
    if (link) return res.redirect(link);
    if (anexo.path) {
      const resolved = path.resolve(path.join(__dirname, '..', anexo.path));
      if (!resolved.startsWith(path.resolve(path.join(__dirname, '..')))) {
        return res.status(403).json({ error: 'Caminho inválido' });
      }
      return res.sendFile(resolved);
    }
    return res.status(404).json({ error: 'Link do anexo indisponível' });
  } catch (error: any) {
    console.error('Erro servir anexo:', error.message || error);
    res.status(500).json({ error: 'Erro ao servir anexo' });
  }
});

export default router;
