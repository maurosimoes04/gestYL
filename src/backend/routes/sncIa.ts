/**
 * Rotas: /ia-snc — sugestão de conta SNC via Gemini.
 *   POST /ia-snc/sugerir/:tipo/:id  — sugere para um registo específico (fatura|receita)
 *   GET  /ia-snc/auditoria?limit=…  — auditoria batch (compara atual vs sugerido)
 */

import express from 'express';
import { prisma } from '../config/prisma';
import { sugerirSncParaRegisto, SugestaoSncError } from '../services/sncSugestao';

const router = express.Router();

/** POST /ia-snc/sugerir/:tipo/:id — tempo real (botão nos formulários) */
router.post('/sugerir/:tipo/:id', async (req, res) => {
  try {
    const tipo = req.params.tipo as 'fatura' | 'receita';
    if (tipo !== 'fatura' && tipo !== 'receita') {
      return res.status(400).json({ error: 'tipo tem de ser fatura ou receita' });
    }
    const id = Number(req.params.id);
    const registo = tipo === 'fatura'
      ? await prisma.fatura.findUnique({ where: { id }, include: { entidade: { select: { nome: true } } } })
      : await prisma.receita.findUnique({ where: { id }, include: { entidade: { select: { nome: true } } } });
    if (!registo) return res.status(404).json({ error: 'Não encontrado' });

    const r: any = registo;
    let sug;
    try {
      sug = await sugerirSncParaRegisto({
        tipo,
        titulo: r.titulo,
        valor: Number(r.valor),
        data: r.data,
        fornecedor: tipo === 'fatura' ? r.fornecedor : r.financiador,
        entidadeNome: r.entidade?.nome,
        departamento: tipo === 'fatura' ? r.departamento : null,
        numero: r.numero,
        descricao: r.descricao || r.observacoes,
      });
    } catch (err: any) {
      if (err instanceof SugestaoSncError) {
        const status = err.kind === 'overloaded' ? 503 : err.kind === 'no-key' ? 500 : 502;
        return res.status(status).json({ error: err.message, kind: err.kind });
      }
      throw err;
    }
    if (!sug) return res.status(502).json({ error: 'IA sem resposta' });

    const atual = r.contaSncId
      ? await prisma.contaSNC.findUnique({ where: { id: r.contaSncId }, select: { codigo: true, nome: true } })
      : null;
    const sugerida = sug.codigo
      ? await prisma.contaSNC.findUnique({ where: { codigo: sug.codigo }, select: { id: true, codigo: true, nome: true } })
      : null;

    res.json({
      atual, sugerida,
      confianca: sug.confianca,
      motivo: sug.motivo,
      avisos: sug.avisos || [],
      diverge: atual && sugerida && atual.codigo !== sugerida.codigo,
    });
  } catch (err: any) {
    console.error('Erro sugerir SNC:', err);
    res.status(500).json({ error: err.message || 'Erro' });
  }
});

/** POST /ia-snc/aplicar/:tipo/:id — aplica a conta SNC sugerida ao registo */
router.post('/aplicar/:tipo/:id', async (req, res) => {
  try {
    const tipo = req.params.tipo as 'fatura' | 'receita';
    const id = Number(req.params.id);
    const contaSncId = Number(req.body?.contaSncId);
    if (!contaSncId) return res.status(400).json({ error: 'contaSncId obrigatório' });
    const upd = tipo === 'fatura'
      ? await prisma.fatura.update({ where: { id }, data: { contaSncId } })
      : await prisma.receita.update({ where: { id }, data: { contaSncId } });
    res.json(upd);
  } catch (err: any) {
    console.error('Erro aplicar SNC:', err);
    res.status(400).json({ error: err.message || 'Erro' });
  }
});

/**
 * GET /ia-snc/auditoria?limit=50&soDivergentes=true
 * Corre a IA sobre faturas+receitas até ao limite e devolve lista com atual vs sugerido.
 * É pesado (chamada IA por registo) — frontend deve mostrar progresso.
 */
router.get('/auditoria', async (req, res) => {
  try {
    const role = (req as any).authRole;
    if (!['admin', 'direcao'].includes(role)) return res.status(403).json({ error: 'Só admin/direção' });

    const limit = Math.min(100, Math.max(5, Number(req.query.limit || 20)));
    const soSemClass = req.query.soSemClass === 'true';

    const whereFat: any = soSemClass ? { contaSncId: null } : {};
    const whereRec: any = soSemClass ? { contaSncId: null } : {};
    const [faturas, receitas] = await Promise.all([
      prisma.fatura.findMany({ where: whereFat, take: Math.floor(limit / 2), orderBy: { data: 'desc' },
        include: { entidade: { select: { nome: true } }, contaSnc: { select: { codigo: true, nome: true } } } }),
      prisma.receita.findMany({ where: whereRec, take: Math.ceil(limit / 2), orderBy: { data: 'desc' },
        include: { entidade: { select: { nome: true } }, contaSnc: { select: { codigo: true, nome: true } } } }),
    ]);

    const todos = [
      ...faturas.map((f: any) => ({ tipo: 'fatura' as const, r: f })),
      ...receitas.map((r: any) => ({ tipo: 'receita' as const, r })),
    ];

    const resultados = await Promise.all(todos.map(async ({ tipo, r }) => {
      let sug: any = null;
      try {
        sug = await sugerirSncParaRegisto({
          tipo,
          titulo: r.titulo,
          valor: Number(r.valor),
          data: r.data,
          fornecedor: tipo === 'fatura' ? r.fornecedor : r.financiador,
          entidadeNome: r.entidade?.nome,
          departamento: tipo === 'fatura' ? r.departamento : null,
          numero: r.numero,
          descricao: r.descricao || r.observacoes,
        });
      } catch { /* no batch, falhas individuais são toleradas */ }
      let sugContaSncId: number | null = null;
      if (sug?.codigo) {
        const c = await prisma.contaSNC.findUnique({ where: { codigo: sug.codigo }, select: { id: true } });
        sugContaSncId = c?.id || null;
      }
      const atualCod = r.contaSnc?.codigo || null;
      const sugCod = sug?.codigo || null;
      return {
        tipo,
        id: r.id,
        titulo: r.titulo,
        valor: Number(r.valor),
        data: r.data,
        entidade: r.entidade?.nome || r.fornecedor || r.financiador || null,
        atual: r.contaSnc ? { codigo: r.contaSnc.codigo, nome: r.contaSnc.nome } : null,
        sugerida: sug?.codigo ? { codigo: sug.codigo, id: sugContaSncId, motivo: sug.motivo, confianca: sug.confianca } : null,
        diverge: !!(atualCod && sugCod && atualCod !== sugCod),
        semClass: !atualCod,
        avisos: sug?.avisos || [],
      };
    }));

    res.json({ total: resultados.length, resultados });
  } catch (err: any) {
    console.error('Erro auditoria SNC:', err);
    res.status(500).json({ error: err.message || 'Erro' });
  }
});

export default router;
