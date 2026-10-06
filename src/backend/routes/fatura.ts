import express from 'express';
import path from 'path';
import { Prisma } from '@prisma/client';
import { syncMovimentoParaFatura } from '../services/movimentoSync';
import { analisarFatura, definirValidacaoIA, recompararFatura } from '../services/documentAnalysis';
import { backfillFaturasAntigas } from '../services/backfillFaturasAntigas';
import { streamToBuffer } from '../utils/streamToBuffer';

const bootLog = (...args: any[]) => {
  if (process.env.BOOT_DEBUG === 'true') console.log(...args);
};

bootLog('Fatura: carregar prisma');
const { prisma } = require('../config/prisma');
bootLog('Fatura: prisma carregado');
bootLog('Fatura: carregar upload');
const upload = require('../middleware/upload').default;
bootLog('Fatura: upload carregado');

// Multer configurado para aceitar dois campos distintos: `anexo` (documento da
// despesa — fatura/recibo) e `comprovativo` (comprovativo de pagamento).
const uploadDespesa = upload.fields([
  { name: 'anexo', maxCount: 1 },
  { name: 'comprovativo', maxCount: 1 },
]);

// Helpers: extrai o File do multipart .fields() (array por campo) e faz o
// upload para o Drive, devolvendo o shape JSON uniforme para guardar em DB.
async function uploadAnexoParaDrive(
  file: Express.Multer.File | undefined,
  folderId: string,
): Promise<{ anexo: any; erro: string }> {
  if (!file) return { anexo: null, erro: '' };
  if (!folderId) return { anexo: null, erro: 'Pasta do Google Drive não configurada (GDRIVE_DESPESAS_FOLDER_ID)' };
  try {
    const { uploadBufferToDrive } = await import('../services/googleDrive');
    const driveFile = await uploadBufferToDrive({
      buffer: file.buffer,
      filename: file.originalname,
      mimeType: file.mimetype,
      folderId,
    });
    return {
      anexo: {
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        driveFileId: driveFile.id,
        driveWebViewLink: driveFile.webViewLink,
        driveWebContentLink: driveFile.webContentLink,
      },
      erro: '',
    };
  } catch (driveErr: any) {
    const msg = driveErr?.message || 'Erro desconhecido';
    console.error('Erro upload Drive:', msg);
    return { anexo: null, erro: msg };
  }
}

async function apagarAnexoDoDrive(oldAnexo: any): Promise<void> {
  if (!oldAnexo?.driveFileId) return;
  try {
    const { deleteFromDrive } = await import('../services/googleDrive');
    await deleteFromDrive(oldAnexo.driveFileId);
  } catch (e) {
    console.error('Falha ao apagar anexo no Drive:', e);
  }
}

const router = express.Router();
const DESPESAS_FOLDER_ID = process.env.GDRIVE_DESPESAS_FOLDER_ID!;

// GET /faturas
router.get('/', async (req, res) => {
  try {
    const { q, departamento, tipo, estado, dateFrom, dateTo, limit, offset, eventoId, inventarioId } = req.query as any;
    const where: Prisma.FaturaWhereInput = {};
    if (departamento) where.departamento = departamento;
    if (tipo) where.tipo = tipo;
    if (estado) where.estado = estado;
    if (eventoId) {
      where.faturaEventos = { some: { eventoId: Number(eventoId) } };
    }
    if (inventarioId) where.inventarioId = Number(inventarioId);
    if (q) {
      where.OR = [
        { titulo: { contains: q, mode: 'insensitive' } },
        { descricao: { contains: q, mode: 'insensitive' } },
        { departamento: { contains: q, mode: 'insensitive' } },
        { tipo: { contains: q, mode: 'insensitive' } },
        { numero: { contains: q, mode: 'insensitive' } },
        { estado: { contains: q, mode: 'insensitive' } },
        { fornecedor: { contains: q, mode: 'insensitive' } },
      ];
    }
    if (dateFrom || dateTo) {
      where.data = {};
      if (dateFrom) where.data.gte = new Date(dateFrom);
      if (dateTo) where.data.lte = new Date(dateTo);
    }
    if (req.query.vencidas === 'true') {
      where.estado = 'Pendente';
      where.dataVencimento = { lt: new Date() };
    }

    const faturas = await prisma.fatura.findMany({
      where,
      orderBy: { data: 'desc' },
      include: { faturaEventos: { include: { evento: { select: { id: true, nome: true } } } }, contaSnc: { select: { id: true, codigo: true, nome: true } }, entidade: { select: { id: true, nome: true, nif: true } } },
      ...(limit && { take: parseInt(limit, 10) }),
      ...(offset && { skip: parseInt(offset, 10) }),
    });
    res.json(faturas);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao obter faturas' });
  }
});

// GET /faturas/export/pdf
router.get('/export/pdf', async (_req, res) => {
  try {
    const { default: PDFDocument } = await import('pdfkit');
    const faturas = await prisma.fatura.findMany({ orderBy: { data: 'desc' } });
    const agora = new Date();
    const mesAtual = agora.getMonth();
    const anoAtual = agora.getFullYear();

    const faturasMesAtual = faturas.filter((f) => {
      const d = new Date(f.data);
      return d.getMonth() === mesAtual && d.getFullYear() === anoAtual;
    });

    const toNum = (v: any) => Number(v) || 0;
    const totalMesAtual = faturasMesAtual.reduce((s, f) => s + toNum(f.valor), 0);
    const totalRecorrentes = faturasMesAtual.filter((f) => f.tipo?.includes('Recorrente')).reduce((s, f) => s + toNum(f.valor), 0);
    const totalExtraordinarias = faturasMesAtual.filter((f) => f.tipo?.includes('Extraordinária')).reduce((s, f) => s + toNum(f.valor), 0);
    const totalPagas = faturasMesAtual.filter((f) => f.estado === 'Paga').reduce((s, f) => s + toNum(f.valor), 0);
    const totalPendentes = faturasMesAtual.filter((f) => f.estado === 'Pendente').reduce((s, f) => s + toNum(f.valor), 0);

    const departamentosMap: Record<string, number> = {};
    faturasMesAtual.forEach((f) => {
      departamentosMap[f.departamento] = (departamentosMap[f.departamento] || 0) + toNum(f.valor);
    });
    const departamentoTop = Object.entries(departamentosMap).reduce((a, b) => (b[1] > a[1] ? b : a), ['', 0])[0];

    const doc = new PDFDocument({ margin: 40 });
    res.header('Content-Type', 'application/pdf');
    res.attachment('relatorio-despesas.pdf');
    doc.pipe(res);

    doc.fontSize(24).font('Helvetica-Bold').text('Relatório de Despesas', { align: 'center' });
    doc.fontSize(10).font('Helvetica').text(`Gerado em: ${new Date().toLocaleDateString('pt-PT')}`, { align: 'center' });
    doc.moveDown(1);
    doc.fontSize(16).font('Helvetica-Bold').text('Resumo do Mês Atual');
    doc.moveDown(0.3);

    const dashboardData = [
      `Total Gasto: ${totalMesAtual.toFixed(2)} €`,
      `Recorrentes: ${totalRecorrentes.toFixed(2)} €`,
      `Extraordinárias: ${totalExtraordinarias.toFixed(2)} €`,
      `Pagas: ${totalPagas.toFixed(2)} €`,
      `Pendentes: ${totalPendentes.toFixed(2)} €`,
      `Departamento Top: ${departamentoTop || 'N/A'} (${(departamentosMap[departamentoTop] ?? 0).toFixed(2)} €)`,
    ];
    doc.fontSize(11).font('Helvetica');
    dashboardData.forEach((item) => doc.text(`  ${item}`));
    doc.moveDown(1);
    doc.fontSize(8).font('Helvetica').text('Relatório gerado automaticamente pelo Gestor de Despesas', { align: 'center' });
    doc.end();
  } catch (error) {
    console.error('Erro ao gerar PDF:', error.message || error);
    res.status(500).json({ error: 'Erro ao exportar PDF' });
  }
});

// POST /faturas/backfill-antigas
router.post('/backfill-antigas', async (_req, res) => {
  try {
    const resultado = await backfillFaturasAntigas();
    res.json(resultado);
  } catch (error: any) {
    console.error('Erro ao executar backfill de despesas antigas:', error.message || error);
    res.status(500).json({ error: 'Erro ao executar backfill de despesas antigas' });
  }
});

// GET /faturas/:id
router.get('/:id', async (req, res) => {
  try {
    const fatura = await prisma.fatura.findUnique({
      where: { id: Number(req.params.id) },
      include: {
        faturaEventos: { include: { evento: { select: { id: true, nome: true } } } },
        movimento: { select: { conta: true } },
      },
    });
    if (fatura) res.json(fatura);
    else res.status(404).json({ error: 'Fatura não encontrada' });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao obter fatura' });
  }
});

// POST /faturas
router.post('/', uploadDespesa, async (req, res) => {
  try {
    const files = (req as any).files as Record<string, Express.Multer.File[]> | undefined;
    const anexoFile = files?.anexo?.[0];
    const comprovativoFile = files?.comprovativo?.[0];

    const ALLOWED_FIELDS = ['titulo', 'valor', 'data', 'departamento', 'tipo', 'numero', 'estado', 'descricao', 'detalhes', 'inventarioId', 'fornecedor', 'fornecedorNif', 'dataVencimento', 'contaSncId', 'entidadeId'];
    const payload: any = {};
    for (const k of ALLOWED_FIELDS) {
      const v = req.body[k];
      if (v !== '' && v !== null && v !== undefined) payload[k] = v;
    }
    if (payload.valor) payload.valor = parseFloat(payload.valor);
    if (payload.data) payload.data = new Date(payload.data);
    if (payload.dataVencimento) payload.dataVencimento = new Date(payload.dataVencimento);
    if (payload.inventarioId) payload.inventarioId = Number(payload.inventarioId);
    else delete payload.inventarioId;
    if (payload.contaSncId) payload.contaSncId = Number(payload.contaSncId);
    if (payload.entidadeId) payload.entidadeId = Number(payload.entidadeId);

    let eventosInput: { eventoId: number; valor: number }[] = [];
    try {
      const raw = req.body.eventos;
      if (raw) eventosInput = JSON.parse(typeof raw === 'string' ? raw : JSON.stringify(raw));
    } catch { /* ignore */ }
    if (!eventosInput.length && req.body.eventoId) {
      eventosInput = [{ eventoId: Number(req.body.eventoId), valor: payload.valor || 0 }];
    }

    const warnings: string[] = [];
    const anexoRes = await uploadAnexoParaDrive(anexoFile, DESPESAS_FOLDER_ID);
    if (anexoRes.anexo) payload.anexo = anexoRes.anexo;
    if (anexoFile && !anexoRes.anexo) warnings.push(`Documento não guardado: ${anexoRes.erro}`);

    const compRes = await uploadAnexoParaDrive(comprovativoFile, DESPESAS_FOLDER_ID);
    if (compRes.anexo) payload.comprovativo = compRes.anexo;
    if (comprovativoFile && !compRes.anexo) warnings.push(`Comprovativo não guardado: ${compRes.erro}`);

    const novaFatura = await prisma.fatura.create({
      data: {
        ...payload,
        ...(eventosInput.length > 0 && {
          faturaEventos: {
            create: eventosInput.map(e => ({ eventoId: e.eventoId, valor: e.valor })),
          },
        }),
      },
      include: { faturaEventos: { include: { evento: { select: { id: true, nome: true } } } }, contaSnc: { select: { id: true, codigo: true, nome: true } }, entidade: { select: { id: true, nome: true, nif: true } } },
    });
    await syncMovimentoParaFatura(novaFatura, req.body.conta);
    if (anexoFile) {
      analisarFatura(novaFatura.id, anexoFile.buffer, anexoFile.mimetype, true).catch((e) => console.error('Análise IA (POST fatura):', e));
    }
    res.status(201).json({ ...novaFatura, _warnings: warnings.length ? warnings : undefined });
  } catch (error: any) {
    console.error('Erro criar fatura:', error.message || error);
    const msg = error.code === 'P2002' ? 'Já existe uma fatura com estes dados'
      : error.code === 'P2003' ? 'Evento ou inventário referenciado não existe'
      : error.message?.includes('Argument') ? 'Campos obrigatórios em falta (título, valor, data, departamento, estado)'
      : error.message || 'Erro desconhecido ao criar fatura';
    res.status(400).json({ error: msg });
  }
});

// PUT /faturas/:id
router.put('/:id', uploadDespesa, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const fatura = await prisma.fatura.findUnique({ where: { id } });
    if (!fatura) return res.status(404).json({ error: 'Fatura não encontrada' });

    const files = (req as any).files as Record<string, Express.Multer.File[]> | undefined;
    const anexoFile = files?.anexo?.[0];
    const comprovativoFile = files?.comprovativo?.[0];

    const ALLOWED_FIELDS = ['titulo', 'valor', 'data', 'departamento', 'tipo', 'numero', 'estado', 'descricao', 'detalhes', 'inventarioId', 'fornecedor', 'fornecedorNif', 'dataVencimento', 'contaSncId', 'entidadeId'];
    const payload: any = {};
    for (const k of ALLOWED_FIELDS) {
      const v = req.body[k];
      if (v !== '' && v !== null && v !== undefined) payload[k] = v;
    }
    if (payload.valor) payload.valor = parseFloat(payload.valor);
    if (payload.data) payload.data = new Date(payload.data);
    if (payload.dataVencimento) payload.dataVencimento = new Date(payload.dataVencimento);
    if (payload.inventarioId) payload.inventarioId = Number(payload.inventarioId);
    else delete payload.inventarioId;
    if (payload.contaSncId) payload.contaSncId = Number(payload.contaSncId);
    if (payload.entidadeId) payload.entidadeId = Number(payload.entidadeId);

    let eventosInput: { eventoId: number; valor: number }[] | null = null;
    try {
      const raw = req.body.eventos;
      if (raw !== undefined) eventosInput = JSON.parse(typeof raw === 'string' ? raw : JSON.stringify(raw));
    } catch { /* ignore */ }
    if (eventosInput === null && req.body.eventoId !== undefined) {
      const eid = req.body.eventoId;
      eventosInput = eid ? [{ eventoId: Number(eid), valor: payload.valor || Number(fatura.valor) }] : [];
    }

    // Remoção explícita (sem upload novo)
    if (!anexoFile && req.body.removeAnexo === 'true') {
      await apagarAnexoDoDrive(fatura.anexo as any);
      payload.anexo = null;
    }
    if (!comprovativoFile && req.body.removeComprovativo === 'true') {
      await apagarAnexoDoDrive((fatura as any).comprovativo);
      payload.comprovativo = null;
    }

    // Substituição ou criação (upload novo)
    const warnings: string[] = [];
    if (anexoFile) {
      await apagarAnexoDoDrive(fatura.anexo as any);
      const r = await uploadAnexoParaDrive(anexoFile, DESPESAS_FOLDER_ID);
      if (r.anexo) payload.anexo = r.anexo;
      else warnings.push(`Documento não guardado: ${r.erro}`);
    }
    if (comprovativoFile) {
      await apagarAnexoDoDrive((fatura as any).comprovativo);
      const r = await uploadAnexoParaDrive(comprovativoFile, DESPESAS_FOLDER_ID);
      if (r.anexo) payload.comprovativo = r.anexo;
      else warnings.push(`Comprovativo não guardado: ${r.erro}`);
    }

    if (eventosInput !== null) {
      await prisma.faturaEvento.deleteMany({ where: { faturaId: id } });
      if (eventosInput.length > 0) {
        await prisma.faturaEvento.createMany({
          data: eventosInput.map(e => ({ faturaId: id, eventoId: e.eventoId, valor: e.valor })),
        });
      }
    }

    const updated = await prisma.fatura.update({
      where: { id },
      data: payload,
      include: { faturaEventos: { include: { evento: { select: { id: true, nome: true } } } }, contaSnc: { select: { id: true, codigo: true, nome: true } }, entidade: { select: { id: true, nome: true, nif: true } } },
    });
    await syncMovimentoParaFatura(updated, req.body.conta);
    if (anexoFile) {
      analisarFatura(updated.id, anexoFile.buffer, anexoFile.mimetype, true).catch((e) => console.error('Análise IA (PUT fatura):', e));
    } else {
      await recompararFatura(updated.id);
    }
    res.json({ ...updated, _warnings: warnings.length ? warnings : undefined });
  } catch (error: any) {
    console.error('Erro atualizar fatura:', error.message || error);
    const msg = error.code === 'P2003' ? 'Evento ou inventário referenciado não existe'
      : error.message?.includes('Argument') ? 'Campos inválidos no pedido'
      : error.message || 'Erro desconhecido ao atualizar fatura';
    res.status(400).json({ error: msg });
  }
});

// DELETE /faturas/:id
router.delete('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const fatura = await prisma.fatura.findUnique({ where: { id } });
    if (!fatura) return res.status(404).json({ error: 'Fatura não encontrada' });

    await apagarAnexoDoDrive(fatura.anexo as any);
    await apagarAnexoDoDrive((fatura as any).comprovativo);

    await prisma.fatura.delete({ where: { id } });
    res.json({ message: 'Fatura eliminada com sucesso' });
  } catch (error) {
    console.error('Erro ao eliminar fatura:', error.message || error);
    res.status(500).json({ error: 'Erro ao eliminar fatura' });
  }
});

// POST /faturas/:id/analisar
router.post('/:id/analisar', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const fatura = await prisma.fatura.findUnique({ where: { id } });
    if (!fatura) return res.status(404).json({ error: 'Fatura não encontrada' });
    const anexo = fatura.anexo as any;
    if (!anexo?.driveFileId) return res.status(400).json({ error: 'Fatura sem anexo para analisar' });

    const { streamFromDrive } = await import('../services/googleDrive');
    const stream = await streamFromDrive(anexo.driveFileId);
    const buffer = await streamToBuffer(stream);
    await analisarFatura(id, buffer, anexo.mimeType || 'application/pdf', true);

    const atualizada = await prisma.fatura.findUnique({
      where: { id },
      include: { faturaEventos: { include: { evento: { select: { id: true, nome: true } } } }, contaSnc: { select: { id: true, codigo: true, nome: true } }, entidade: { select: { id: true, nome: true, nif: true } } },
    });
    res.json(atualizada);
  } catch (error: any) {
    console.error('Erro ao reanalisar fatura:', error.message || error);
    res.status(500).json({ error: 'Erro ao reanalisar fatura' });
  }
});

// POST /faturas/:id/validar-ia
router.post('/:id/validar-ia', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const validada = req.body?.validada !== false;
    const atualizada = await definirValidacaoIA('fatura', id, validada);
    if (!atualizada) return res.status(404).json({ error: 'Fatura não encontrada' });
    res.json(atualizada);
  } catch (error: any) {
    console.error('Erro ao validar IA da fatura:', error.message || error);
    res.status(500).json({ error: 'Erro ao validar IA da fatura' });
  }
});

// Helper partilhado por /anexo e /comprovativo (mesmo shape, campos distintos)
async function servirAnexo(res: express.Response, anexo: any): Promise<any> {
  if (!anexo?.driveFileId) return res.status(404).json({ error: 'Anexo indisponível' });
  const { streamFromDrive } = await import('../services/googleDrive');
  const stream = await streamFromDrive(anexo.driveFileId);
  res.setHeader('Content-Type', anexo.mimeType || 'application/octet-stream');
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(anexo.originalName || 'anexo')}"`);
  return stream.pipe(res);
}

// GET /faturas/:id/anexo — documento da despesa
router.get('/:id/anexo', async (req, res) => {
  try {
    const fatura = await prisma.fatura.findUnique({ where: { id: Number(req.params.id) } });
    if (!fatura || !fatura.anexo) return res.status(404).json({ error: 'Anexo não encontrado' });
    return servirAnexo(res, fatura.anexo as any);
  } catch (error: any) {
    console.error('Erro servir anexo:', error.message || error);
    res.status(500).json({ error: 'Erro ao servir anexo' });
  }
});

// GET /faturas/:id/comprovativo — comprovativo de pagamento
router.get('/:id/comprovativo', async (req, res) => {
  try {
    const fatura = await prisma.fatura.findUnique({ where: { id: Number(req.params.id) } });
    const comp = (fatura as any)?.comprovativo;
    if (!fatura || !comp) return res.status(404).json({ error: 'Comprovativo não encontrado' });
    return servirAnexo(res, comp);
  } catch (error: any) {
    console.error('Erro servir comprovativo:', error.message || error);
    res.status(500).json({ error: 'Erro ao servir comprovativo' });
  }
});

export default router;
