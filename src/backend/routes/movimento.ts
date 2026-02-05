import express from 'express';
import { Op } from 'sequelize';
import { sequelize } from '../config/database';
import createMovimentoModel from '../models/Movimento';

const Movimento = createMovimentoModel(sequelize);
const router = express.Router();

// Listar movimentos (entradas/saídas)
router.get('/', async (req, res) => {
  try {
    const { conta, tipo, dateFrom, dateTo } = req.query as any;
    const where: any = {};
    if (conta) where.conta = conta;
    if (tipo) where.tipo = tipo;
    if (dateFrom || dateTo) {
      where.data = {};
      if (dateFrom) where.data[Op.gte] = dateFrom;
      if (dateTo) where.data[Op.lte] = dateTo;
    }
    const movimentos = await Movimento.findAll({ where, order: [['data', 'DESC']] });
    res.json(movimentos);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao listar movimentos', details: err });
  }
});

// Criar movimento
router.post('/', async (req, res) => {
  try {
    const movimento = await Movimento.create(req.body as any);
    res.status(201).json(movimento);
  } catch (err) {
    res.status(400).json({ error: 'Erro ao criar movimento', details: err });
  }
});

// Atualizar movimento
router.put('/:id', async (req, res) => {
  try {
    const mov: any = await Movimento.findByPk(req.params.id);
    if (!mov) return res.status(404).json({ error: 'Movimento não encontrado' });
    await mov.update(req.body as any);
    res.json(mov);
  } catch (err) {
    res.status(400).json({ error: 'Erro ao atualizar movimento', details: err });
  }
});

// Remover movimento
router.delete('/:id', async (req, res) => {
  try {
    const mov: any = await Movimento.findByPk(req.params.id);
    if (!mov) return res.status(404).json({ error: 'Movimento não encontrado' });
    await mov.destroy();
    res.json({ message: 'Movimento removido com sucesso' });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao remover movimento', details: err });
  }
});

export default router;
