/**
 * Rotas: /contas-snc (catálogo SNC).
 *
 * Catálogo imutável (gerido via seed). Expomos apenas leitura + ativação/desativação.
 * O frontend usa isto para popular dropdowns.
 */

import express from 'express';
import { prisma } from '../config/prisma';

const router = express.Router();

/** GET /contas-snc — lista agrupada por família */
router.get('/', async (req, res) => {
  try {
    const todas = req.query.todas === 'true';
    const contas = await prisma.contaSNC.findMany({
      where: todas ? {} : { ativaPorOmissao: true },
      orderBy: [{ familia: 'asc' }, { codigo: 'asc' }],
    });
    res.json(contas);
  } catch (err) {
    console.error('Erro listar ContaSNC:', err);
    res.status(500).json({ error: 'Erro ao listar contas SNC' });
  }
});

/** GET /contas-snc/:id */
router.get('/:id', async (req, res) => {
  try {
    const c = await prisma.contaSNC.findUnique({ where: { id: Number(req.params.id) } });
    if (!c) return res.status(404).json({ error: 'Conta não encontrada' });
    res.json(c);
  } catch { res.status(500).json({ error: 'Erro ao obter conta' }); }
});

/** PATCH /contas-snc/:id — permitir ativar/desativar e editar notas (admin) */
router.patch('/:id', async (req, res) => {
  try {
    const role = (req as any).authRole;
    if (role !== 'admin') return res.status(403).json({ error: 'Só admin' });
    const patch: any = {};
    if (req.body.ativaPorOmissao !== undefined) patch.ativaPorOmissao = !!req.body.ativaPorOmissao;
    if (req.body.notas !== undefined) patch.notas = req.body.notas || null;
    if (req.body.pergunta !== undefined) patch.pergunta = req.body.pergunta || null;
    const updated = await prisma.contaSNC.update({ where: { id: Number(req.params.id) }, data: patch });
    res.json(updated);
  } catch (err: any) { res.status(400).json({ error: err.message || 'Erro ao atualizar' }); }
});

export default router;
