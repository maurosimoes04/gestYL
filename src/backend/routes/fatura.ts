/**
 * Projeto: Gestão de Faturas - Backend
 * Versão: 1.0
 * Descrição: Rotas Express para operações CRUD de faturas.
 * Autor: Mauro Simões
 * Data: 21/11/2025
 */

import express from 'express';
import path from 'path';
import { Op } from 'sequelize';
import PDFDocument from 'pdfkit';

const router = express.Router();


import { sequelize } from '../config/database';
import createFaturaModel from '../models/Fatura';
const FaturaModel = createFaturaModel(sequelize);

import upload from '../middleware/upload';


// GET /faturas - Lista faturas com filtros (PT-PT)
router.get('/', async (req, res) => {
  try {
    const { q, departamento, tipo, estado, dateFrom, dateTo, limit, offset, eventoId } = req.query as any;
    const where: any = {};
    if (departamento) where.departamento = departamento;
    if (tipo) where.tipo = tipo;
    if (estado) where.estado = estado;
    if (eventoId) where.eventoId = eventoId;
    if (q) {
      where[Op.or] = [
        { titulo: { [Op.like]: `%${q}%` } },
        { descricao: { [Op.like]: `%${q}%` } }
      ];
    }
    if (dateFrom || dateTo) {
      where.data = {};
      if (dateFrom) where.data[Op.gte] = dateFrom;
      if (dateTo) where.data[Op.lte] = dateTo;
    }

    const opts: any = { where, order: [['data', 'DESC']] };
    if (limit) opts.limit = parseInt(limit, 10);
    if (offset) opts.offset = parseInt(offset, 10);

    const faturas = await FaturaModel.findAll(opts);
    res.json(faturas);
  } catch (error) {
    res.status(500).json({ erro: 'Erro ao obter faturas' });
  }
});


// GET /faturas/:id - Detalhe de uma fatura (PT-PT)
router.get('/:id', async (req, res) => {
  try {
    const fatura: any = await FaturaModel.findByPk(req.params.id) as any;
    if (fatura) res.json(fatura);
    else res.status(404).json({ erro: 'Fatura não encontrada' });
  } catch (error) {
    res.status(500).json({ erro: 'Erro ao obter fatura' });
  }
});


// POST /faturas - Cria nova fatura (PT-PT)
router.post('/', upload.single('anexo'), async (req, res) => {
  try {
    const payload = { ...req.body } as any;
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
    const novaFatura = await FaturaModel.create(payload);
    res.status(201).json(novaFatura);
  } catch (error) {
    console.error('Erro criar fatura:', error.message || error);
    res.status(400).json({ erro: 'Erro ao criar fatura' });
  }
});


router.put('/:id', upload.single('anexo'), async (req, res) => {
  try {
    // Ensure id is a string (handle string[] case)
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const fatura: any = await FaturaModel.findByPk(id) as any;
    if (!fatura) return res.status(404).json({ erro: 'Fatura não encontrada' });
    const payload = { ...req.body } as any;
    if (req.file) {
      payload.anexo = {
        originalName: req.file.originalname,
        storedName: req.file.filename,
        mimeType: req.file.mimetype,
        size: req.file.size,
        path: path.join('uploads', req.file.filename)
      };
    }
    await fatura.update(payload);
    res.json(fatura);
  } catch (error) {
    console.error('Erro atualizar fatura:', error.message || error);
    res.status(400).json({ erro: 'Erro ao atualizar fatura' });
  }
});


router.delete('/:id', async (req, res) => {
  try {
    const fatura: any = await FaturaModel.findByPk(req.params.id) as any;
    if (fatura) {
      await fatura.destroy();
      res.json({ mensagem: 'Fatura eliminada com sucesso' });
    } else res.status(404).json({ erro: 'Fatura não encontrada' });
  } catch (error) {
    res.status(500).json({ erro: 'Erro ao eliminar fatura' });
  }
});


/**
 * Exporta um relatório em PDF com resumo do mês, totais por tipo/estado,
 * lista de faturas e inclui informações de consolidação.
 */
router.get('/export/pdf', async (req, res) => {
  try {
    const faturas: any = await FaturaModel.findAll({ order: [['data', 'DESC']] });

    // Calcular dados do dashboard
    const agora = new Date();
    const mesAtual = agora.getMonth();
    const anoAtual = agora.getFullYear();

    const faturasMesAtual = faturas.filter((f: any) => {
      const d = new Date(f.data);
      return d.getMonth() === mesAtual && d.getFullYear() === anoAtual;
    });

    const totalMesAtual = faturasMesAtual.reduce((sum: number, f: any) => sum + parseFloat(f.valor), 0);
    const totalRecorrentes = faturasMesAtual
      .filter((f: any) => f.tipo?.includes('Recorrente'))
      .reduce((sum: number, f: any) => sum + parseFloat(f.valor), 0);
    const totalExtraordinarias = faturasMesAtual
      .filter((f: any) => f.tipo?.includes('Extraordinária'))
      .reduce((sum: number, f: any) => sum + parseFloat(f.valor), 0);
    const totalPagas = faturasMesAtual
      .filter((f: any) => f.estado === 'Paga')
      .reduce((sum: number, f: any) => sum + parseFloat(f.valor), 0);
    const totalPendentes = faturasMesAtual
      .filter((f: any) => f.estado === 'Pendente')
      .reduce((sum: number, f: any) => sum + parseFloat(f.valor), 0);

    // Departamento com maior gasto
    const departamentosMap: any = {};
    faturasMesAtual.forEach((f: any) => {
      departamentosMap[f.departamento] = (departamentosMap[f.departamento] || 0) + parseFloat(f.valor);
    });
    const departamentoTop = Object.entries(departamentosMap).reduce((a: any, b: any) => 
      (b[1] as number) > (a[1] as number) ? b : a, ['', 0])[0];

    // Criar PDF
    const doc = new PDFDocument({ margin: 40 });
    res.header('Content-Type', 'application/pdf');
    res.attachment('relatorio-despesas.pdf');
    doc.pipe(res);

    // Título
    doc.fontSize(24).font('Helvetica-Bold').text('Relatório de Despesas', { align: 'center' });
    doc.fontSize(10).font('Helvetica').text(`Gerado em: ${new Date().toLocaleDateString('pt-PT')}`, { align: 'center' });
    doc.moveDown(1);

    // Seção Dashboard
    doc.fontSize(16).font('Helvetica-Bold').text('Resumo do Mês Atual');
    doc.moveDown(0.3);

    // Cards info
    const dashboardData = [
      `Total Gasto: ${totalMesAtual.toFixed(2)} €`,
      `Recorrentes: ${totalRecorrentes.toFixed(2)} €`,
      `Extraordinárias: ${totalExtraordinarias.toFixed(2)} €`,
      `Pagas: ${totalPagas.toFixed(2)} €`,
      `Pendentes: ${totalPendentes.toFixed(2)} €`,
      `Departamento Top: ${departamentoTop || 'N/A'} (${departamentosMap[departamentoTop]?.toFixed(2) || '0.00'} € )`
    ];

    doc.fontSize(11).font('Helvetica');
    dashboardData.forEach(item => {
      doc.text(`  ${item}`);
    });

    doc.moveDown(1);

    // Seção Lista de Faturas
    doc.fontSize(16).font('Helvetica-Bold').text('Faturas do Mês');
    doc.moveDown(0.3);

    if (faturasMesAtual.length === 0) {
      doc.fontSize(11).font('Helvetica').text('  Nenhuma fatura registada neste mês.');
    } else {
      // Cabeçalho da tabela
      const tableTop = doc.y;
      const col1 = 40;
      const col2 = 180;
      const col3 = 300;
      const col4 = 400;
      const col5 = 480;
      const rowHeight = 20;

      doc.fontSize(9).font('Helvetica-Bold');
      doc.text('Título', col1, tableTop);
      doc.text('Departamento', col2, tableTop);
      doc.text('Tipo', col3, tableTop);
      doc.text('Valor', col4, tableTop);
      doc.text('Estado', col5, tableTop);

      // Linha separadora
      doc.moveTo(col1 - 10, tableTop + rowHeight - 5).lineTo(550, tableTop + rowHeight - 5).stroke();
      doc.moveDown(1);

      // Linhas de dados
      doc.fontSize(8).font('Helvetica');
      faturasMesAtual.forEach((f: any) => {
        const currentY = doc.y;
        const tipoSimplificado = f.tipo?.replace(/Despesas?\s*/gi, '') || '';
        doc.text(f.titulo.substring(0, 30), col1, currentY, { width: 130 });
        doc.text(f.departamento.substring(0, 20), col2, currentY, { width: 110 });
        doc.text(tipoSimplificado.substring(0, 15), col3, currentY, { width: 90 });
        doc.text(`${parseFloat(f.valor).toFixed(2)} €`, col4, currentY);
        doc.text(f.estado, col5, currentY);
        doc.moveDown(1);
      });
    }

    doc.moveDown(1);

    // Rodapé
    doc.fontSize(8).font('Helvetica').text(
      '---',
      { align: 'center' }
    );
    doc.text('Relatório gerado automaticamente pelo Gestor de Despesas', { align: 'center' });

    doc.end();
  } catch (error) {
    console.error('Erro ao gerar PDF:', error);
    res.status(500).json({ erro: 'Erro ao exportar PDF' });
  }
});


router.get('/:id/anexo', async (req, res) => {
  try {
    const fatura: any = await FaturaModel.findByPk(req.params.id) as any;
    if (!fatura || !fatura.anexo) return res.status(404).json({ erro: 'Anexo não encontrado' });
    const filePath = path.join(__dirname, '..', fatura.anexo.path);
    res.sendFile(path.resolve(filePath));
  } catch (error) {
    console.error('Erro servir anexo:', error.message || error);
    res.status(500).json({ erro: 'Erro ao servir anexo' });
  }
});

export default router;
