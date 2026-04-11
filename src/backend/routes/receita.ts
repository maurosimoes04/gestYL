import express from 'express';
import { prisma } from '../config/prisma';
import { Prisma } from '@prisma/client';
import upload from '../middleware/upload';
import { uploadBufferToDrive, deleteFromDrive } from '../services/googleDrive';

const router = express.Router();
const RECEITAS_FOLDER_ID = process.env.GDRIVE_RECEITAS_FOLDER_ID!;

router.get('/', async (req, res) => {
  try {
    const { categoria, estado, dateFrom, dateTo, q, eventoId } = req.query as any;
    const where: Prisma.ReceitaWhereInput = {};
    if (categoria) where.categoria = categoria;
    if (estado) where.estado = estado;
    if (eventoId) where.eventoId = Number(eventoId);
    if (dateFrom || dateTo) {
      where.data = {};
      if (dateFrom) where.data.gte = new Date(dateFrom);
      if (dateTo) where.data.lte = new Date(dateTo);
    }
    if (q) {
      where.OR = [
        { titulo: { contains: q, mode: 'insensitive' } },
        { categoria: { contains: q, mode: 'insensitive' } },
        { estado: { contains: q, mode: 'insensitive' } },
        { financiador: { contains: q, mode: 'insensitive' } },
        { observacoes: { contains: q, mode: 'insensitive' } },
      ];
    }
    const receitas = await prisma.receita.findMany({ where, orderBy: { data: 'desc' } });
    res.json(receitas);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao listar receitas', details: err });
  }
});

router.post('/', upload.single('anexo'), async (req, res) => {
  try {
    const raw: any = { ...req.body };
    const payload: any = {};
    for (const [k, v] of Object.entries(raw)) {
      if (v !== '' && v !== null && v !== undefined) payload[k] = v;
    }
    if (payload.valor) payload.valor = parseFloat(payload.valor);
    if (payload.data) payload.data = new Date(payload.data);
    if (payload.eventoId) payload.eventoId = Number(payload.eventoId);
    else delete payload.eventoId;
    let driveError = '';
    if (req.file && RECEITAS_FOLDER_ID) {
      try {
        const driveFile = await uploadBufferToDrive({
          buffer: req.file.buffer,
          filename: req.file.originalname,
          mimeType: req.file.mimetype,
          folderId: RECEITAS_FOLDER_ID,
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
        console.error('Erro upload Drive receita:', driveError);
      }
    } else if (req.file && !RECEITAS_FOLDER_ID) {
      driveError = 'Pasta do Google Drive não configurada (GDRIVE_RECEITAS_FOLDER_ID)';
    }
    const receita = await prisma.receita.create({ data: payload });
    const warnings: string[] = [];
    if (req.file && !payload.anexo) warnings.push(`Anexo não guardado: ${driveError}`);
    res.status(201).json({ ...receita, _warnings: warnings.length ? warnings : undefined });
    res.status(201).json(receita);
  } catch (err: any) {
    console.error('Erro criar receita:', err.message || err);
    const msg = err.code === 'P2003' ? 'Evento referenciado não existe'
      : err.message?.includes('Argument') ? 'Campos obrigatórios em falta (título, valor, data, categoria, estado)'
      : err.message || 'Erro desconhecido ao criar receita';
    res.status(400).json({ error: 'Erro ao criar receita', details: msg });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const receita = await prisma.receita.findUnique({ where: { id: Number(req.params.id) } });
    if (!receita) return res.status(404).json({ error: 'Receita não encontrada' });
    res.json(receita);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao obter receita', details: err });
  }
});

router.get('/:id/anexo', async (req, res) => {
  try {
    const receita = await prisma.receita.findUnique({ where: { id: Number(req.params.id) } });
    if (!receita || !receita.anexo) return res.status(404).json({ error: 'Anexo não encontrado' });
    const anexo = receita.anexo as any;
    const link = anexo.driveWebContentLink || anexo.driveWebViewLink;
    if (link) return res.redirect(link);
    return res.status(404).json({ error: 'Link do anexo indisponível' });
  } catch (err) {
    console.error('Erro servir anexo receita:', err);
    res.status(500).json({ error: 'Erro ao servir anexo' });
  }
});

router.put('/:id', upload.single('anexo'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const receita = await prisma.receita.findUnique({ where: { id } });
    if (!receita) return res.status(404).json({ error: 'Receita não encontrada' });

    const raw: any = { ...req.body };
    const payload: any = {};
    for (const [k, v] of Object.entries(raw)) {
      if (v !== '' && v !== null && v !== undefined) payload[k] = v;
    }
    if (payload.valor) payload.valor = parseFloat(payload.valor);
    if (payload.data) payload.data = new Date(payload.data);
    if (payload.eventoId) payload.eventoId = Number(payload.eventoId);
    else delete payload.eventoId;
    let driveError = '';
    if (req.file && RECEITAS_FOLDER_ID) {
      try {
        const oldAnexo = receita.anexo as any;
        if (oldAnexo?.driveFileId) await deleteFromDrive(oldAnexo.driveFileId);

        const driveFile = await uploadBufferToDrive({
          buffer: req.file.buffer,
          filename: req.file.originalname,
          mimeType: req.file.mimetype,
          folderId: RECEITAS_FOLDER_ID,
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
        console.error('Erro upload Drive receita:', driveError);
      }
    } else if (req.file && !RECEITAS_FOLDER_ID) {
      driveError = 'Pasta do Google Drive não configurada (GDRIVE_RECEITAS_FOLDER_ID)';
    }
    const updated = await prisma.receita.update({ where: { id }, data: payload });
    const warnings: string[] = [];
    if (req.file && !payload.anexo) warnings.push(`Anexo não guardado: ${driveError}`);
    res.json({ ...updated, _warnings: warnings.length ? warnings : undefined });
  } catch (err: any) {
    console.error('Erro atualizar receita:', err.message || err);
    const msg = err.code === 'P2003' ? 'Evento referenciado não existe'
      : err.message?.includes('Argument') ? 'Campos inválidos no pedido'
      : err.message || 'Erro desconhecido ao atualizar receita';
    res.status(400).json({ error: 'Erro ao atualizar receita', details: msg });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const receita = await prisma.receita.findUnique({ where: { id } });
    if (!receita) return res.status(404).json({ error: 'Receita não encontrada' });

    const anexo = receita.anexo as any;
    if (anexo?.driveFileId) {
      try { await deleteFromDrive(anexo.driveFileId); } catch (e) { console.error('Falha ao apagar anexo no Drive (receita):', e); }
    }
    await prisma.receita.delete({ where: { id } });
    res.json({ message: 'Receita removida com sucesso' });
  } catch (err) {
    console.error('Erro ao remover receita:', err);
    res.status(500).json({ error: 'Erro ao remover receita', details: err });
  }
});

export default router;
