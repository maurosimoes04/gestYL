import { Router, Request, Response } from 'express';
import { prisma } from '../config/prisma';
import { syncMovimentoParaReceita, syncMovimentoParaFatura } from '../services/movimentoSync';
import { logAudit } from '../services/audit';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import upload from '../middleware/upload';
import { uploadBufferToDrive } from '../services/googleDrive';

const RECEITAS_FOLDER_ID = process.env.GDRIVE_RECEITAS_FOLDER_ID || '';

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
    let eventoData: any = null;
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
      eventoData = evento;
    }

    // Validar que o evento existe e guardar dados
    if (eventoId && !eventoData) {
      eventoData = await prisma.evento.findUnique({ where: { id: eventoId } });
      if (!eventoData) {
        return res.status(400).json({ ok: false, error: `Evento #${eventoId} não encontrado` });
      }
    }

    // Resolver contaSncId: payload > evento > null
    let contaSncId: number | null = body.contaSncId ? Number(body.contaSncId) : null;
    if (!contaSncId && eventoData?.contaSncReceitaId) {
      contaSncId = eventoData.contaSncReceitaId;
    }

    if (contaSncId) {
      const conta = await prisma.contaSNC.findUnique({ where: { id: contaSncId } });
      if (!conta) {
        return res.status(400).json({ ok: false, error: `Conta SNC #${contaSncId} não encontrada` });
      }
    }

    // Resolver método de pagamento → conta do movimento
    const contaMovimento = PAYMENT_METHOD_MAP[paymentMethodRaw] || 'Banco';

    // Normalizar estado
    const estado = 'Recebido';

    // Resolver ou criar Entidade a partir dos dados do cliente
    let entidadeId: number | null = body.entidadeId ? Number(body.entidadeId) : null;
    if (!entidadeId && body.customer) {
      const c = body.customer;
      let entidade = null;

      // Procurar por NIF (mais fiável)
      if (c.nif) {
        entidade = await prisma.entidade.findUnique({ where: { nif: c.nif } });
      }
      // Procurar por email se não encontrou por NIF
      if (!entidade && c.email) {
        entidade = await prisma.entidade.findFirst({ where: { email: c.email } });
      }
      // Procurar por nome exato como último recurso
      if (!entidade && c.name) {
        entidade = await prisma.entidade.findFirst({ where: { nome: c.name } });
      }

      if (entidade) {
        entidadeId = entidade.id;
        // Garantir que tem tipo "cliente"
        if (!entidade.tipos.includes('cliente')) {
          await prisma.entidade.update({
            where: { id: entidade.id },
            data: { tipos: [...entidade.tipos, 'cliente'] },
          });
        }
      } else if (c.name) {
        // Criar nova entidade do tipo cliente
        const nova = await prisma.entidade.create({
          data: {
            nome: c.name,
            nif: c.nif || null,
            email: c.email || null,
            telefone: c.phone || null,
            tipos: ['cliente'],
          },
        });
        entidadeId = nova.id;
      }
    }

    // Construir observações com dados do cliente e itens
    const obsLines: string[] = [];
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
          contaSncId,
          entidadeId,
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
      entidadeId,
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
// Devoluções criam uma DESPESA (Fatura), não uma receita negativa.
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

    // Idempotência via campo numero da Fatura
    const existing = await prisma.fatura.findFirst({
      where: { numero: body.externalId },
      include: { movimento: { select: { id: true } } },
    });
    if (existing) {
      return res.status(200).json({
        ok: true,
        created: false,
        externalId: body.externalId,
        faturaId: existing.id,
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

    const descLines = [
      `Devolução referente a receita: ${body.originalExternalId}`,
      body.reason ? `Motivo: ${body.reason}` : null,
      body.items ? `Itens devolvidos: ${JSON.stringify(body.items)}` : null,
    ].filter(Boolean).join('\n');

    const contaMovimento = PAYMENT_METHOD_MAP[body.paymentMethod?.toUpperCase() || ''] || 'Banco';

    const result = await prisma.$transaction(async (tx) => {
      const fatura = await tx.fatura.create({
        data: {
          titulo: body.title || `Devolução de bilhete — ${body.originalExternalId}`,
          valor: Math.abs(body.amount),
          data: dataDevolucao,
          departamento: 'Young-Link',
          tipo: 'Nota de crédito',
          numero: body.externalId,
          estado: 'Paga',
          descricao: descLines,
          fornecedor: 'Young-Link',
          contaSncId: original.contaSncId,
          faturaEventos: eventoId ? {
            create: [{ eventoId, valor: Math.abs(body.amount) }],
          } : undefined,
        },
      });
      return fatura;
    });

    // Sincronizar movimento de saída
    await syncMovimentoParaFatura(
      { id: result.id, valor: result.valor, data: dataDevolucao, estado: 'Paga', titulo: result.titulo },
      contaMovimento,
    );

    const movimento = await prisma.movimento.findUnique({ where: { faturaId: result.id } });

    await logAudit({
      action: 'CREATE',
      entity: 'fatura',
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
      faturaId: result.id,
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

// --- GET /integrations/younglink/events ---
// Lista de processos/eventos em curso para a Young-Link popular dropdowns
router.get('/events', async (_req: Request, res: Response) => {
  try {
    const eventos = await prisma.evento.findMany({
      where: { estado: 'Em curso' },
      select: {
        id: true,
        nome: true,
        tipo: true,
        numeroProcesso: true,
        data_inicio: true,
        data_fim: true,
        departamento: true,
        contaSncReceitaId: true,
      },
      orderBy: { nome: 'asc' },
    });

    return res.json({
      ok: true,
      events: eventos.map(e => ({
        id: e.id,
        name: e.nome,
        type: e.tipo,
        projectKey: e.numeroProcesso,
        startDate: e.data_inicio,
        endDate: e.data_fim,
        department: e.departamento,
        defaultContaSncId: e.contaSncReceitaId,
      })),
    });
  } catch (err: any) {
    console.error('[Integração YL] Erro events:', err);
    return res.status(500).json({ ok: false, error: 'Erro ao listar eventos' });
  }
});

// --- POST /integrations/younglink/invoice-attachment ---
// Anexar fatura Moloni (PDF) a uma receita existente via externalId
router.post('/invoice-attachment', upload.single('file'), async (req: Request, res: Response) => {
  try {
    const { externalId } = req.body;

    if (!externalId) {
      return res.status(400).json({ ok: false, error: 'externalId é obrigatório' });
    }
    if (!req.file) {
      return res.status(400).json({ ok: false, error: 'Ficheiro (file) é obrigatório' });
    }

    const receita = await prisma.receita.findUnique({
      where: { externalId },
    });
    if (!receita) {
      return res.status(404).json({ ok: false, error: `Receita com externalId "${externalId}" não encontrada` });
    }

    if (!RECEITAS_FOLDER_ID) {
      return res.status(500).json({ ok: false, error: 'Pasta do Google Drive não configurada (GDRIVE_RECEITAS_FOLDER_ID)' });
    }

    const driveFile = await uploadBufferToDrive({
      buffer: req.file.buffer,
      filename: req.file.originalname || `fatura-${externalId}.pdf`,
      mimeType: req.file.mimetype || 'application/pdf',
      folderId: RECEITAS_FOLDER_ID,
    });

    const anexoData = {
      driveFileId: driveFile.id,
      driveWebViewLink: driveFile.webViewLink,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
      uploadedAt: new Date().toISOString(),
      source: 'YOUNGLINK_MOLONI',
    };

    await prisma.receita.update({
      where: { id: receita.id },
      data: { anexo: anexoData },
    });

    await logAudit({
      action: 'UPDATE',
      entity: 'receita',
      entityId: String(receita.id),
      details: {
        source: 'YOUNGLINK',
        type: 'INVOICE_ATTACHMENT',
        externalId,
        driveFileId: driveFile.id,
        filename: req.file.originalname,
      },
      req,
    });

    return res.status(200).json({
      ok: true,
      receitaId: receita.id,
      externalId,
      anexo: {
        driveFileId: driveFile.id,
        driveWebViewLink: driveFile.webViewLink,
        filename: req.file.originalname,
      },
    });
  } catch (err: any) {
    console.error('[Integração YL] Erro invoice-attachment:', err);
    await logAudit({
      action: 'ERROR',
      entity: 'integracao-younglink',
      details: { error: err.message, externalId: req.body?.externalId },
      req,
    });
    return res.status(500).json({ ok: false, error: 'Erro ao anexar fatura' });
  }
});

export default router;
