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
    if (q) where.titulo = { contains: q, mode: 'insensitive' };
    const receitas = await prisma.receita.findMany({ where, orderBy: { data: 'desc' } });
    res.json(receitas);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao listar receitas', details: err });
  }
});

router.post('/', upload.single('anexo'), async (req, res) => {
  try {
    const payload: any = { ...req.body };
    if (payload.eventoId) payload.eventoId = Number(payload.eventoId);
    if (req.file) {
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
    }
    const receita = await prisma.receita.create({ data: payload });
    res.status(201).json(receita);
  } catch (err) {
    res.status(400).json({ error: 'Erro ao criar receita', details: err });
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

    const payload: any = { ...req.body };
    if (payload.eventoId) payload.eventoId = Number(payload.eventoId);
    if (req.file) {
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
    }
    const updated = await prisma.receita.update({ where: { id }, data: payload });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: 'Erro ao atualizar receita', details: err });
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
