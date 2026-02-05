import express from 'express';
import path from 'path';
import { Op } from 'sequelize';
import { sequelize } from '../config/database';
import createReceitaModel from '../models/Receita';
import upload from '../middleware/upload';

const Receita = createReceitaModel(sequelize);
const router = express.Router();

// Listar receitas (com filtros básicos)
router.get('/', async (req, res) => {
  try {
    const { categoria, estado, dateFrom, dateTo, q, eventoId } = req.query as any;
    const where: any = {};
    if (categoria) where.categoria = categoria;
    if (estado) where.estado = estado;
    if (eventoId) where.eventoId = eventoId;
    if (dateFrom || dateTo) {
      where.data = {};
      if (dateFrom) where.data[Op.gte] = dateFrom;
      if (dateTo) where.data[Op.lte] = dateTo;
    }
    if (q) where.titulo = { [Op.like]: `%${q}%` };
    const receitas = await Receita.findAll({ where, order: [['data', 'DESC']] });
    res.json(receitas);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao listar receitas', details: err });
  }
});

// Criar receita
router.post('/', upload.single('anexo'), async (req, res) => {
  try {
    const payload: any = { ...req.body };
    if (req.body.eventoId) payload.eventoId = req.body.eventoId;
    if (req.file) {
      payload.anexo = {
        originalName: req.file.originalname,
        storedName: req.file.filename,
        mimeType: req.file.mimetype,
        size: req.file.size,
        path: path.join('uploads', req.file.filename)
      };
    }
    const receita = await Receita.create(payload);
    res.status(201).json(receita);
  } catch (err) {
    res.status(400).json({ error: 'Erro ao criar receita', details: err });
  }
});

// Obter receita por id
router.get('/:id', async (req, res) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const receita: any = await Receita.findByPk(id);
    if (!receita) return res.status(404).json({ error: 'Receita não encontrada' });
    res.json(receita);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao obter receita', details: err });
  }
});

// Atualizar receita
router.put('/:id', upload.single('anexo'), async (req, res) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const receita: any = await Receita.findByPk(id);
    if (!receita) return res.status(404).json({ error: 'Receita não encontrada' });
    const payload: any = { ...req.body };
    if (req.body.eventoId) payload.eventoId = req.body.eventoId;
    if (req.file) {
      payload.anexo = {
        originalName: req.file.originalname,
        storedName: req.file.filename,
        mimeType: req.file.mimetype,
        size: req.file.size,
        path: path.join('uploads', req.file.filename)
      };
    }
    await receita.update(payload);
    res.json(receita);
  } catch (err) {
    res.status(400).json({ error: 'Erro ao atualizar receita', details: err });
  }
});

// Remover receita
router.delete('/:id', async (req, res) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const receita: any = await Receita.findByPk(id);
    if (!receita) return res.status(404).json({ error: 'Receita não encontrada' });
    await receita.destroy();
    res.json({ message: 'Receita removida com sucesso' });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao remover receita', details: err });
  }
});

export default router;
