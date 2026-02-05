// ...existing code...
import express from 'express';
import { sequelize } from '../config/database';
import createEventoModel from '../models/Evento';
import createFaturaModel from '../models/Fatura';
import createReceitaModel from '../models/Receita';

const Evento = createEventoModel(sequelize);
const Fatura = createFaturaModel(sequelize);
const Receita = createReceitaModel(sequelize);
const router = express.Router();

// Criar evento
router.post('/', async (req, res) => {
  try {
    const evento = await Evento.create(req.body);
    res.status(201).json(evento);
  } catch (err) {
    res.status(400).json({ error: 'Erro ao criar evento', details: err });
  }
});

// Listar eventos
router.get('/', async (req, res) => {
  try {
    const eventos = await Evento.findAll();
    res.json(eventos);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao listar eventos', details: err });
  }
});

// Obter evento por ID
router.get('/:id', async (req, res) => {
  try {
    const evento = await Evento.findByPk(req.params.id);
    if (!evento) return res.status(404).json({ error: 'Evento não encontrado' });
    res.json(evento);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao obter evento', details: err });
  }
});

// Atualizar evento
router.put('/:id', async (req, res) => {
  try {
    const evento = await Evento.findByPk(req.params.id);
    if (!evento) return res.status(404).json({ error: 'Evento não encontrado' });
    await evento.update(req.body);
    res.json(evento);
  } catch (err) {
    res.status(400).json({ error: 'Erro ao atualizar evento', details: err });
  }
});

// Remover evento
router.delete('/:id', async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const evento = await Evento.findByPk(req.params.id, { transaction });
    if (!evento) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Evento não encontrado' });
    }

    await Promise.all([
      Fatura.destroy({ where: { eventoId: evento.id }, transaction }),
      Receita.destroy({ where: { eventoId: evento.id }, transaction })
    ]);

    await evento.destroy({ transaction });
    await transaction.commit();
    res.json({ message: 'Evento e registos associados removidos com sucesso' });
  } catch (err) {
    await transaction.rollback();
    res.status(500).json({ error: 'Erro ao remover evento', details: err });
  }
});

export default router;
