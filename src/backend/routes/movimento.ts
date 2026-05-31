import express from 'express';
import { prisma } from '../config/prisma';
import { Prisma } from '@prisma/client';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const { conta, tipo, dateFrom, dateTo } = req.query as any;
    const where: Prisma.MovimentoWhereInput = {};
    if (conta) where.conta = conta;
    if (tipo) where.tipo = tipo;
    if (dateFrom || dateTo) {
      where.data = {};
      if (dateFrom) where.data.gte = new Date(dateFrom);
      if (dateTo) where.data.lte = new Date(dateTo);
    }
    const movimentos = await prisma.movimento.findMany({ where, orderBy: { data: 'desc' } });
    res.json(movimentos);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao listar movimentos' });
  }
});

router.post('/', async (req, res) => {
  try {
    const payload: any = { ...req.body };
    if (payload.valor) payload.valor = parseFloat(payload.valor);
    if (payload.data) payload.data = new Date(payload.data);
    const movimento = await prisma.movimento.create({ data: payload });
    res.status(201).json(movimento);
  } catch (err) {
    res.status(400).json({ error: 'Erro ao criar movimento' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const payload: any = { ...req.body };
    if (payload.valor) payload.valor = parseFloat(payload.valor);
    if (payload.data) payload.data = new Date(payload.data);
    const mov = await prisma.movimento.update({
      where: { id: Number(req.params.id) },
      data: payload,
    });
    res.json(mov);
  } catch (err) {
    res.status(400).json({ error: 'Erro ao atualizar movimento' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await prisma.movimento.delete({ where: { id: Number(req.params.id) } });
    res.json({ message: 'Movimento removido com sucesso' });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao remover movimento' });
  }
});

export default router;
