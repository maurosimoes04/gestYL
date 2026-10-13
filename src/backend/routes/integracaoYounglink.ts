import { Router, Request, Response } from 'express';
import { prisma } from '../config/prisma';
import { syncMovimentoParaReceita } from '../services/movimentoSync';
import { logAudit } from '../services/audit';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';

const router = Router();

// --- Auth: API key com comparação em tempo constante ---
const INTEGRATION_KEY = process.env.YOUNGLINK_INTEGRATION_KEY || '';

function verifyApiKey(req: Request, res: Response, next: Function) {
  const key = req.headers['x-younglink-key'] as string;
  if (!key || !INTEGRATION_KEY) {
    return res.status(401).json({ ok: false, error: 'Chave de integração ausente ou não configurada' });
  }
  const a = Buffer.from(key);
  const b = Buffer.from(INTEGRATION_KEY);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ ok: false, error: 'Chave de integração inválida' });
  }
  next();
}

// --- Rate limit ---
const integrationLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { ok: false, error: 'Rate limit excedido. Aguarde um momento.' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.use(integrationLimiter);
router.use(verifyApiKey);

// --- Mapeamento método pagamento → conta do movimento ---
const PAYMENT_METHOD_MAP: Record<string, string> = {
  MBWAY: 'MB WAY',
  SUMUP: 'Cartões',
  CARD_TERMINAL: 'Cartões',
  CASH: 'Numerário',
  TRANSFER: 'Transferência bancária',
};

const VALID_ESTADOS = ['Previsto', 'Recebido', 'Cancelado'];

// --- POST /integrations/younglink/revenue ---
router.post('/revenue', async (req: Request, res: Response) => {
  try {
    const body = req.body;

    // Validação básica
    if (!body.externalId || typeof body.externalId !== 'string') {
      return res.status(400).json({ ok: false, error: 'externalId é obrigatório' });
    }
    if (!body.title || typeof body.title !== 'string') {
      return res.status(400).json({ ok: false, error: 'title é obrigatório' });
    }
    // Bilhete gratuito — não criar receita
    const paymentMethodRaw = (body.paymentMethod || '').toUpperCase();
    if (paymentMethodRaw === 'FREE') {
      return res.status(200).json({ ok: true, created: false, skipped: true, reason: 'Bilhete gratuito — sem receita' });
    }

    if (typeof body.amount !== 'number' || body.amount <= 0) {
      return res.status(400).json({ ok: false, error: 'amount deve ser um número positivo' });
    }
    if (!body.paidAt) {
      return res.status(400).json({ ok: false, error: 'paidAt é obrigatório' });
    }
    if (!body.eventoId && !body.projectKey) {
      return res.status(400).json({ ok: false, error: 'eventoId ou projectKey é obrigatório' });
    }

    // Idempotência: verificar se já existe
    const existing = await prisma.receita.findUnique({
      where: { externalId: body.externalId },
      include: { movimento: { select: { id: true } } },
    });

    if (existing) {
      return res.status(200).json({
        ok: true,
        created: false,
        externalId: body.externalId,
        receitaId: existing.id,
        movimentoId: existing.movimento?.id || null,
      });
    }

    // Resolver o evento/processo
    let eventoId: number | null = null;
    if (body.eventoId) {
      eventoId = Number(body.eventoId);
    } else if (body.projectKey) {
      const evento = await prisma.evento.findFirst({
        where: { numeroProcesso: body.projectKey },
      });
      if (!evento) {
        return res.status(400).json({ ok: false, error: `Processo com projectKey "${body.projectKey}" não encontrado` });
      }
      eventoId = evento.id;
    }

    // Validar que o evento existe
    if (eventoId) {
      const evento = await prisma.evento.findUnique({ where: { id: eventoId } });
      if (!evento) {
        return res.status(400).json({ ok: false, error: `Evento #${eventoId} não encontrado` });
      }
    }

    // Validar contaSncId se fornecido
    if (body.contaSncId) {
      const conta = await prisma.contaSNC.findUnique({ where: { id: Number(body.contaSncId) } });
      if (!conta) {
        return res.status(400).json({ ok: false, error: `Conta SNC #${body.contaSncId} não encontrada` });
      }
    }

    // Resolver método de pagamento → conta do movimento
    const contaMovimento = PAYMENT_METHOD_MAP[paymentMethodRaw] || 'Banco';

    // Normalizar estado
    const estado = 'Recebido';

    // Construir observações com dados do cliente e itens
    const obsLines: string[] = [];
    if (body.customer) {
      const c = body.customer;
      obsLines.push(`Cliente: ${c.name || '—'}${c.email ? ' (' + c.email + ')' : ''}${c.nif ? ' NIF: ' + c.nif : ''}`);
    }
    if (body.paymentMethod) {
      obsLines.push(`Pagamento: ${body.paymentMethod}`);
    }
    if (body.items && Array.isArray(body.items)) {
      obsLines.push(`Itens (${body.items.length}):`);
      for (const item of body.items) {
        obsLines.push(`  - ${item.description || item.eventTitle || '?'} × ${item.quantity || 1} = ${item.amount}€`);
        if (item.attendeeName) obsLines.push(`    Participante: ${item.attendeeName}`);
      }
    }

    const dataPagamento = new Date(body.paidAt);

    // Criar receita + ReceitaEvento numa transação
    const result = await prisma.$transaction(async (tx) => {
      const receita = await tx.receita.create({
        data: {
          titulo: body.title,
          valor: body.amount,
          data: dataPagamento,
          categoria: body.categoria || 'Bilhetes',
          estado,
          financiador: body.financiador || 'Young-Link',
          contaSncId: body.contaSncId ? Number(body.contaSncId) : null,
          entidadeId: body.entidadeId ? Number(body.entidadeId) : null,
          observacoes: obsLines.length > 0 ? obsLines.join('\n') : null,
          externalId: body.externalId,
          origem: body.source || 'YOUNGLINK',
          receitaEventos: eventoId ? {
            create: [{ eventoId, valor: body.amount }],
          } : undefined,
        },
        include: { movimento: { select: { id: true } } },
      });

      return receita;
    });

    // Sincronizar movimento (fora da transação para reutilizar a função existente)
    await syncMovimentoParaReceita(
      { id: result.id, valor: result.valor, data: dataPagamento, estado, titulo: result.titulo },
      contaMovimento,
    );

    // Buscar o movimento criado
    const movimento = await prisma.movimento.findUnique({ where: { receitaId: result.id } });

    // Audit log
    await logAudit({
      action: 'CREATE',
      entity: 'receita',
      entityId: String(result.id),
      details: {
        source: 'YOUNGLINK',
        externalId: body.externalId,
        paymentMethod: body.paymentMethod,
        amount: body.amount,
        itemCount: body.items?.length || 0,
        eventoId,
      },
      req,
    });

    return res.status(201).json({
      ok: true,
      created: true,
      externalId: body.externalId,
      receitaId: result.id,
      movimentoId: movimento?.id || null,
      eventoId,
    });
  } catch (err: any) {
    console.error('[Integração YL] Erro revenue:', err);
    await logAudit({
      action: 'ERROR',
      entity: 'integracao-younglink',
      details: {
        error: err.message,
        externalId: req.body?.externalId,
      },
      req,
    });
    return res.status(500).json({ ok: false, error: 'Erro interno ao processar receita' });
  }
});

// --- POST /integrations/younglink/refund ---
router.post('/refund', async (req: Request, res: Response) => {
  try {
    const body = req.body;

    if (!body.externalId || typeof body.externalId !== 'string') {
      return res.status(400).json({ ok: false, error: 'externalId é obrigatório' });
    }
    if (typeof body.amount !== 'number' || body.amount <= 0) {
      return res.status(400).json({ ok: false, error: 'amount deve ser um número positivo' });
    }
    if (!body.originalExternalId) {
      return res.status(400).json({ ok: false, error: 'originalExternalId é obrigatório' });
    }

    // Idempotência
    const existing = await prisma.receita.findUnique({
      where: { externalId: body.externalId },
      include: { movimento: { select: { id: true } } },
    });
    if (existing) {
      return res.status(200).json({
        ok: true,
        created: false,
        externalId: body.externalId,
        receitaId: existing.id,
        movimentoId: existing.movimento?.id || null,
      });
    }

    // Encontrar a receita original
    const original = await prisma.receita.findUnique({
      where: { externalId: body.originalExternalId },
      include: { receitaEventos: true },
    });
    if (!original) {
      return res.status(400).json({ ok: false, error: `Receita original "${body.originalExternalId}" não encontrada` });
    }

    const dataDevolucao = new Date(body.refundedAt || new Date());
    const eventoId = original.receitaEventos[0]?.eventoId || null;

    const obsLines = [
      `Devolução referente a: ${body.originalExternalId}`,
      body.reason ? `Motivo: ${body.reason}` : null,
      body.items ? `Itens devolvidos: ${JSON.stringify(body.items)}` : null,
    ].filter(Boolean).join('\n');

    const contaMovimento = PAYMENT_METHOD_MAP[body.paymentMethod?.toUpperCase() || ''] || 'Banco';

    const result = await prisma.$transaction(async (tx) => {
      const receita = await tx.receita.create({
        data: {
          titulo: body.title || `Devolução de bilhete — ${body.originalExternalId}`,
          valor: -Math.abs(body.amount),
          data: dataDevolucao,
          categoria: 'Devoluções de bilhetes',
          estado: 'Processado',
          financiador: 'Young-Link',
          contaSncId: original.contaSncId,
          observacoes: obsLines,
          externalId: body.externalId,
          origem: body.source || 'YOUNGLINK',
          receitaEventos: eventoId ? {
            create: [{ eventoId, valor: -Math.abs(body.amount) }],
          } : undefined,
        },
      });
      return receita;
    });

    // Criar movimento de saída para o estorno
    await prisma.movimento.create({
      data: {
        tipo: 'saida',
        conta: contaMovimento,
        valor: Math.abs(body.amount),
        data: dataDevolucao,
        referencia: body.externalId,
        descricao: result.titulo,
        receitaId: result.id,
      },
    });

    const movimento = await prisma.movimento.findUnique({ where: { receitaId: result.id } });

    await logAudit({
      action: 'CREATE',
      entity: 'receita',
      entityId: String(result.id),
      details: {
        source: 'YOUNGLINK',
        type: 'REFUND',
        externalId: body.externalId,
        originalExternalId: body.originalExternalId,
        amount: body.amount,
        reason: body.reason,
      },
      req,
    });

    return res.status(201).json({
      ok: true,
      created: true,
      externalId: body.externalId,
      receitaId: result.id,
      movimentoId: movimento?.id || null,
      eventoId,
    });
  } catch (err: any) {
    console.error('[Integração YL] Erro refund:', err);
    await logAudit({
      action: 'ERROR',
      entity: 'integracao-younglink',
      details: { error: err.message, externalId: req.body?.externalId },
      req,
    });
    return res.status(500).json({ ok: false, error: 'Erro interno ao processar devolução' });
  }
});

export default router;
