/**
 * Rotas: /documentos (dossiê documental)
 *
 * Documentos ligados a Processo (ex: dossiê IEFP, contratos de evento) e/ou
 * a Entidade (pessoa — ex: certificado habilitações). Upload para Google Drive.
 */

import express from 'express';
import { prisma } from '../config/prisma';
import { Readable } from 'stream';

const upload = require('../middleware/upload').default;
const RH_FOLDER_ID = process.env.GDRIVE_RH_FOLDER_ID || process.env.GDRIVE_DESPESAS_FOLDER_ID || '';

const router = express.Router();

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of stream as any) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
  return Buffer.concat(chunks);
}

const TIPOS = ['Contrato', 'Plano Individual', 'Apólice Seguro', 'Declaração SS',
               'Declaração NEET', 'Certificado Habilitações', 'Certificado Final',
               'Documento Identificação', 'Protocolo', 'Outro'] as const;

function sanitize(body: any) {
  const payload: any = {};
  const fields = ['tipo', 'descricao', 'processoId', 'entidadeId', 'estado',
                  'dataLimite', 'dataConclusao', 'notas'];
  for (const k of fields) {
    const v = body[k];
    if (v === '' || v === null || v === undefined) continue;
    payload[k] = v;
  }
  if (payload.dataLimite) payload.dataLimite = new Date(payload.dataLimite);
  if (payload.dataConclusao) payload.dataConclusao = new Date(payload.dataConclusao);
  if (payload.processoId) payload.processoId = Number(payload.processoId);
  if (payload.entidadeId) payload.entidadeId = Number(payload.entidadeId);
  return payload;
}

async function uploadAnexo(file: Express.Multer.File) {
  if (!RH_FOLDER_ID) return null;
  try {
    const { uploadBufferToDrive } = await import('../services/googleDrive');
    const drive = await uploadBufferToDrive({
      buffer: file.buffer,
      filename: file.originalname,
      mimeType: file.mimetype,
      folderId: RH_FOLDER_ID,
    });
    return {
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      driveFileId: drive.id,
      driveWebViewLink: drive.webViewLink,
      driveWebContentLink: drive.webContentLink,
    };
  } catch (e: any) {
    console.error('Upload documento:', e.message || e);
    return null;
  }
}

router.get('/catalogo', (_req, res) => res.json({ tipos: TIPOS }));

/** GET /documentos — lista com filtros */
router.get('/', async (req, res) => {
  try {
    const where: any = {};
    if (req.query.processoId) where.processoId = Number(req.query.processoId);
    if (req.query.entidadeId) where.entidadeId = Number(req.query.entidadeId);
    if (req.query.estado) where.estado = String(req.query.estado);
    const docs = await prisma.documento.findMany({
      where,
      orderBy: [{ dataLimite: 'asc' }],
      include: {
        processo: { select: { id: true, nome: true, tipo: true } },
        entidade: { select: { id: true, nome: true } },
      },
    });

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const withSev = docs.map(d => {
      const dias = d.dataLimite ? Math.ceil((d.dataLimite.getTime() - hoje.getTime()) / 86400000) : null;
      let sev: 'ok' | 'aviso' | 'critico' | 'vencido' = 'ok';
      if (d.estado !== 'Enviado' && dias !== null) {
        if (dias < 0) sev = 'vencido';
        else if (dias <= 5) sev = 'critico';
        else if (dias <= 15) sev = 'aviso';
      }
      return { ...d, _dias: dias, _severidade: sev };
    });
    res.json(withSev);
  } catch (err) {
    console.error('Erro listar documentos:', err);
    res.status(500).json({ error: 'Erro ao listar documentos' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const doc = await prisma.documento.findUnique({
      where: { id: Number(req.params.id) },
      include: { processo: true, entidade: true },
    });
    if (!doc) return res.status(404).json({ error: 'Documento não encontrado' });
    res.json(doc);
  } catch { res.status(500).json({ error: 'Erro' }); }
});

router.post('/', upload.single('anexo'), async (req, res) => {
  try {
    const payload = sanitize(req.body);
    if (!payload.tipo) return res.status(400).json({ error: 'tipo obrigatório' });
    if (!payload.processoId && !payload.entidadeId) {
      return res.status(400).json({ error: 'tem de pertencer a um processo ou a uma entidade (pessoa)' });
    }
    if (req.file) {
      const anexo = await uploadAnexo(req.file);
      if (anexo) {
        payload.anexo = anexo;
        if (!payload.estado || payload.estado === 'Pendente') payload.estado = 'Anexado';
      }
    }
    const doc = await prisma.documento.create({ data: payload });
    res.status(201).json(doc);
  } catch (err: any) {
    console.error('Erro criar documento:', err.message || err);
    res.status(400).json({ error: err.message || 'Erro' });
  }
});

router.put('/:id', upload.single('anexo'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = await prisma.documento.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Documento não encontrado' });

    const payload = sanitize(req.body);
    if (!req.file && req.body.removeAnexo === 'true') {
      const old = existing.anexo as any;
      if (old?.driveFileId) {
        try {
          const { deleteFromDrive } = await import('../services/googleDrive');
          await deleteFromDrive(old.driveFileId);
        } catch {}
      }
      payload.anexo = null;
    }
    if (req.file) {
      const old = existing.anexo as any;
      if (old?.driveFileId) {
        try {
          const { deleteFromDrive } = await import('../services/googleDrive');
          await deleteFromDrive(old.driveFileId);
        } catch {}
      }
      const anexo = await uploadAnexo(req.file);
      if (anexo) {
        payload.anexo = anexo;
        if (!payload.estado || payload.estado === 'Pendente') payload.estado = 'Anexado';
      }
    }
    if (payload.estado === 'Enviado' && !payload.dataConclusao) {
      payload.dataConclusao = new Date();
    }
    const updated = await prisma.documento.update({ where: { id }, data: payload });
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Erro' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const doc = await prisma.documento.findUnique({ where: { id } });
    if (!doc) return res.status(404).json({ error: 'Documento não encontrado' });
    const anexo = doc.anexo as any;
    if (anexo?.driveFileId) {
      try {
        const { deleteFromDrive } = await import('../services/googleDrive');
        await deleteFromDrive(anexo.driveFileId);
      } catch {}
    }
    await prisma.documento.delete({ where: { id } });
    res.json({ message: 'Documento eliminado' });
  } catch (err: any) { res.status(500).json({ error: err.message || 'Erro' }); }
});

router.get('/:id/anexo', async (req, res) => {
  try {
    const doc = await prisma.documento.findUnique({ where: { id: Number(req.params.id) } });
    if (!doc?.anexo) return res.status(404).json({ error: 'Sem anexo' });
    const anexo = doc.anexo as any;
    if (!anexo.driveFileId) return res.status(404).json({ error: 'Sem ligação ao Drive' });
    const { streamFromDrive } = await import('../services/googleDrive');
    const stream = await streamFromDrive(anexo.driveFileId);
    const buffer = await streamToBuffer(stream);
    res.setHeader('Content-Type', anexo.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${anexo.originalName || 'documento'}"`);
    res.send(buffer);
  } catch (err: any) { res.status(500).json({ error: 'Erro ao obter anexo' }); }
});

export default router;
