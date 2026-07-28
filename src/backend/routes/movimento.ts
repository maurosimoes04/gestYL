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
    const movimentos = await prisma.movimento.findMany({
      where,
      orderBy: { data: 'desc' },
      include: {
        fatura: { select: { id: true, titulo: true } },
        receita: { select: { id: true, titulo: true } },
      },
    });
    res.json(movimentos);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao listar movimentos' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { tipo, conta, valor, data, referencia, descricao } = req.body;
    const payload: any = { tipo, conta };
    if (valor) payload.valor = parseFloat(valor);
    if (data) payload.data = new Date(data);
    if (referencia) payload.referencia = referencia;
    if (descricao) payload.descricao = descricao;
    const movimento = await prisma.movimento.create({ data: payload });
    res.status(201).json(movimento);
  } catch (err) {
    res.status(400).json({ error: 'Erro ao criar movimento' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = await prisma.movimento.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Movimento não encontrado' });
    if (existing.faturaId || existing.receitaId) {
      return res.status(400).json({ error: 'Este movimento é gerado automaticamente — edite a despesa/receita de origem.' });
    }

    const ALLOWED_FIELDS = ['tipo', 'conta', 'valor', 'data', 'referencia', 'descricao'] as const;
    const payload: any = {};
    for (const k of ALLOWED_FIELDS) {
      if (req.body[k] !== undefined) payload[k] = req.body[k];
    }
    if (payload.valor) payload.valor = parseFloat(payload.valor);
    if (payload.data) payload.data = new Date(payload.data);
    const mov = await prisma.movimento.update({
      where: { id },
      data: payload,
    });
    res.json(mov);
  } catch (err) {
    res.status(400).json({ error: 'Erro ao atualizar movimento' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = await prisma.movimento.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Movimento não encontrado' });
    if (existing.faturaId || existing.receitaId) {
      return res.status(400).json({ error: 'Este movimento é gerado automaticamente — edite a despesa/receita de origem.' });
    }
    await prisma.movimento.delete({ where: { id } });
    res.json({ message: 'Movimento removido com sucesso' });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao remover movimento' });
  }
});

export default router;
