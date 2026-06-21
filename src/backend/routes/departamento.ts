import express from 'express';
import { prisma } from '../config/prisma';

const router = express.Router();

// Listar departamentos
router.get('/', async (_req, res) => {
  try {
    const departamentos = await prisma.departamento.findMany({ orderBy: { nome: 'asc' } });
    res.json(departamentos);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao listar departamentos' });
  }
});

// Criar departamento (admin)
router.post('/', async (req, res) => {
  if ((req as any).authRole !== 'admin') {
    return res.status(403).json({ error: 'Apenas administradores' });
  }
  try {
    const { nome } = req.body;
    if (!nome?.trim()) return res.status(400).json({ error: 'Nome é obrigatório' });
    const dep = await prisma.departamento.create({ data: { nome: nome.trim() } });
    res.status(201).json(dep);
  } catch (err: any) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Departamento já existe' });
    res.status(400).json({ error: 'Erro ao criar departamento' });
  }
});

// Atualizar departamento (admin)
router.put('/:id', async (req, res) => {
  if ((req as any).authRole !== 'admin') {
    return res.status(403).json({ error: 'Apenas administradores' });
  }
  try {
    const { nome, ativo } = req.body;
    const dep = await prisma.departamento.update({
      where: { id: Number(req.params.id) },
      data: {
        ...(nome !== undefined && { nome: nome.trim() }),
        ...(ativo !== undefined && { ativo }),
      },
    });
    res.json(dep);
  } catch (err) {
    res.status(400).json({ error: 'Erro ao atualizar departamento' });
  }
});

// Remover departamento (admin)
router.delete('/:id', async (req, res) => {
  if ((req as any).authRole !== 'admin') {
    return res.status(403).json({ error: 'Apenas administradores' });
  }
  try {
    await prisma.departamento.delete({ where: { id: Number(req.params.id) } });
    res.json({ message: 'Departamento removido' });
  } catch (err) {
    res.status(400).json({ error: 'Erro ao remover departamento' });
  }
});

export default router;
