import express from 'express';
import { prisma } from '../config/prisma';

const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const payload: any = { ...req.body };
    if (payload.data_inicio) payload.data_inicio = new Date(payload.data_inicio);
    else delete payload.data_inicio;
    if (payload.data_fim) payload.data_fim = new Date(payload.data_fim);
    else delete payload.data_fim;
    const evento = await prisma.evento.create({ data: payload });
    res.status(201).json(evento);
  } catch (err: any) {
    console.error('Erro criar evento:', err.message || err);
    const msg = err.message?.includes('Argument') ? 'Campos obrigatórios em falta (nome)'
      : err.message || 'Erro desconhecido ao criar evento';
    res.status(400).json({ error: 'Erro ao criar evento', details: msg });
  }
});

router.get('/', async (_req, res) => {
  try {
    const eventos = await prisma.evento.findMany();
    res.json(eventos);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao listar eventos', details: err });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const evento = await prisma.evento.findUnique({ where: { id: Number(req.params.id) } });
    if (!evento) return res.status(404).json({ error: 'Evento não encontrado' });
    res.json(evento);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao obter evento', details: err });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const payload: any = { ...req.body };
    if (payload.data_inicio) payload.data_inicio = new Date(payload.data_inicio);
    if (payload.data_fim) payload.data_fim = new Date(payload.data_fim);
    const evento = await prisma.evento.update({
      where: { id: Number(req.params.id) },
      data: payload,
    });
    res.json(evento);
  } catch (err: any) {
    console.error('Erro atualizar evento:', err.message || err);
    res.status(400).json({ error: 'Erro ao atualizar evento', details: err.message || 'Erro desconhecido' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const evento = await prisma.evento.findUnique({ where: { id } });
    if (!evento) return res.status(404).json({ error: 'Evento não encontrado' });

    await prisma.$transaction([
      prisma.fatura.deleteMany({ where: { eventoId: id } }),
      prisma.receita.deleteMany({ where: { eventoId: id } }),
      prisma.evento.delete({ where: { id } }),
    ]);

    res.json({ message: 'Evento e registos associados removidos com sucesso' });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao remover evento', details: err });
  }
});

export default router;
