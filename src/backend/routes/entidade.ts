/**
 * Rotas: /entidades (contrapartes únicas: fornecedores, financiadores, pessoas internas).
 *
 * CRUD + endpoint de pesquisa com autocomplete + endpoint de fusão (merge) para
 * eliminar duplicados que aparecem após o seed inicial.
 */

import express from 'express';
import { prisma } from '../config/prisma';

const router = express.Router();

const ALLOWED = ['nome', 'nif', 'tipos', 'email', 'telefone', 'morada', 'iban', 'ativo', 'notas',
                 'niss', 'tipoVinculo', 'funcao', 'bolsaBase', 'dataNascimento', 'verificado'];

function sanitize(body: any) {
  const payload: any = {};
  for (const k of ALLOWED) {
    const v = body[k];
    if (v === undefined) continue;
    if (v === '' && k !== 'notas') continue;
    payload[k] = v;
  }
  if (payload.nif) payload.nif = String(payload.nif).replace(/\s+/g, '').toUpperCase();
  if (payload.tipos && !Array.isArray(payload.tipos)) payload.tipos = [payload.tipos];
  if (payload.bolsaBase !== undefined) payload.bolsaBase = payload.bolsaBase === null ? null : parseFloat(payload.bolsaBase);
  if (payload.dataNascimento) payload.dataNascimento = new Date(payload.dataNascimento);
  return payload;
}

/** GET /entidades?q=…&tipo=…&ativo=…  — lista com filtros */
router.get('/', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const tipo = req.query.tipo ? String(req.query.tipo) : undefined;
    const ativo = req.query.ativo === 'false' ? false : req.query.ativo === 'true' ? true : undefined;
    const where: any = {};
    if (ativo !== undefined) where.ativo = ativo;
    if (tipo) where.tipos = { has: tipo };
    if (q) {
      where.OR = [
        { nome: { contains: q, mode: 'insensitive' } },
        { nif:  { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
      ];
    }
    const entidades = await prisma.entidade.findMany({
      where,
      orderBy: [{ nome: 'asc' }],
      take: req.query.limit ? Number(req.query.limit) : 500,
    });
    res.json(entidades);
  } catch (err) {
    console.error('Erro listar entidades:', err);
    res.status(500).json({ error: 'Erro ao listar entidades' });
  }
});

/** GET /entidades/:id — detalhes + histórico de movimentos */
router.get('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [entidade, faturas, receitas] = await Promise.all([
      prisma.entidade.findUnique({ where: { id } }),
      prisma.fatura.findMany({ where: { entidadeId: id }, orderBy: { data: 'desc' }, take: 100,
        select: { id: true, titulo: true, data: true, valor: true, estado: true, contaSnc: { select: { codigo: true, nome: true } } } }),
      prisma.receita.findMany({ where: { entidadeId: id }, orderBy: { data: 'desc' }, take: 100,
        select: { id: true, titulo: true, data: true, valor: true, estado: true, contaSnc: { select: { codigo: true, nome: true } } } }),
    ]);
    if (!entidade) return res.status(404).json({ error: 'Entidade não encontrada' });
    const totalDespesas = faturas.reduce((s, f) => s + Number(f.valor), 0);
    const totalReceitas = receitas.reduce((s, r) => s + Number(r.valor), 0);
    res.json({ entidade, faturas, receitas, totais: { despesas: totalDespesas, receitas: totalReceitas } });
  } catch (err) {
    console.error('Erro obter entidade:', err);
    res.status(500).json({ error: 'Erro ao obter entidade' });
  }
});

/** POST /entidades */
router.post('/', async (req, res) => {
  try {
    const payload = sanitize(req.body);
    if (!payload.nome) return res.status(400).json({ error: 'Nome obrigatório' });
    if (!payload.tipos || payload.tipos.length === 0) {
      return res.status(400).json({ error: 'Pelo menos um tipo (fornecedor/financiador/pessoa-interna/sócio/cliente)' });
    }
    const created = await prisma.entidade.create({ data: payload });
    res.status(201).json(created);
  } catch (err: any) {
    if (err.code === 'P2002') return res.status(400).json({ error: 'Já existe entidade com este NIF' });
    console.error('Erro criar entidade:', err);
    res.status(400).json({ error: err.message || 'Erro ao criar entidade' });
  }
});

/** PUT /entidades/:id */
router.put('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const payload = sanitize(req.body);
    const updated = await prisma.entidade.update({ where: { id }, data: payload });
    res.json(updated);
  } catch (err: any) {
    if (err.code === 'P2002') return res.status(400).json({ error: 'Já existe entidade com este NIF' });
    res.status(400).json({ error: err.message || 'Erro ao atualizar entidade' });
  }
});

/** DELETE /entidades/:id — só se não tiver referências */
router.delete('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [nFat, nRec] = await Promise.all([
      prisma.fatura.count({ where: { entidadeId: id } }),
      prisma.receita.count({ where: { entidadeId: id } }),
    ]);
    if (nFat + nRec > 0) {
      return res.status(400).json({
        error: `Entidade tem ${nFat} fatura(s) e ${nRec} receita(s) ligada(s). Use fundir ou desative.`,
      });
    }
    await prisma.entidade.delete({ where: { id } });
    res.json({ message: 'Entidade eliminada' });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Erro ao eliminar' });
  }
});

/**
 * POST /entidades/:id/fundir  { duplicadoIds: [..] }
 * Transfere todas as referências dos IDs duplicados para `:id` e apaga os duplicados.
 * Reutiliza o padrão de "merge" conservador — não copia campos, só repolve FKs.
 */
router.post('/:id/fundir', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const dups: number[] = Array.isArray(req.body.duplicadoIds) ? req.body.duplicadoIds.map(Number) : [];
    if (!dups.length) return res.status(400).json({ error: 'duplicadoIds vazio' });
    if (dups.includes(id)) return res.status(400).json({ error: 'Não pode fundir uma entidade consigo mesma' });

    const destino = await prisma.entidade.findUnique({ where: { id } });
    if (!destino) return res.status(404).json({ error: 'Entidade destino não existe' });

    const resultado = await prisma.$transaction(async (tx) => {
      const fat = await tx.fatura.updateMany({ where: { entidadeId: { in: dups } }, data: { entidadeId: id } });
      const rec = await tx.receita.updateMany({ where: { entidadeId: { in: dups } }, data: { entidadeId: id } });
      const del = await tx.entidade.deleteMany({ where: { id: { in: dups } } });
      return { faturasReapontadas: fat.count, receitasReapontadas: rec.count, entidadesEliminadas: del.count };
    });
    res.json(resultado);
  } catch (err: any) {
    console.error('Erro ao fundir entidades:', err);
    res.status(500).json({ error: err.message || 'Erro ao fundir' });
  }
});

export default router;
