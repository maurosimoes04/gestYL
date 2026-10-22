import express from 'express';
import crypto from 'crypto';

const { prisma } = require('../config/prisma');

function todayDate(): Date {
  const now = new Date();
  const pt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' }).format(now);
  return new Date(pt + 'T00:00:00.000Z');
}

// Router público (quiosque — sem login, autenticado por PIN)
export const pontoPublicRouter = express.Router();

// Listar pessoas internas ativas (nome + id, sem dados sensíveis)
pontoPublicRouter.get('/pessoas', async (_req, res) => {
  const pessoas = await prisma.entidade.findMany({
    where: {
      ativo: true,
      tipos: { hasSome: ['pessoa-interna'] },
      pin: { not: null },
    },
    select: { id: true, nome: true, funcao: true },
    orderBy: { nome: 'asc' },
  });
  return res.json(pessoas);
});

// Marcar ponto (entrada ou saída)
pontoPublicRouter.post('/marcar', async (req, res) => {
  const { entidadeId, pin } = req.body || {};
  if (!entidadeId || !pin) {
    return res.status(400).json({ error: 'entidadeId e pin são obrigatórios' });
  }

  const pessoa = await prisma.entidade.findFirst({
    where: { id: entidadeId, ativo: true, tipos: { hasSome: ['pessoa-interna'] } },
    select: { id: true, nome: true, pin: true },
  });

  if (!pessoa || !pessoa.pin) {
    return res.status(404).json({ error: 'Pessoa não encontrada' });
  }

  const pinStr = String(pin).slice(0, 4);
  if (pinStr.length !== pessoa.pin.length || !crypto.timingSafeEqual(Buffer.from(pinStr), Buffer.from(pessoa.pin))) {
    return res.status(401).json({ error: 'PIN incorreto' });
  }

  const hoje = todayDate();
  const agora = new Date();

  let registo = await prisma.registoPonto.findUnique({
    where: { entidadeId_data: { entidadeId: pessoa.id, data: hoje } },
  });

  if (!registo) {
    registo = await prisma.registoPonto.create({
      data: { entidadeId: pessoa.id, data: hoje, horaEntrada: agora },
    });
    return res.json({ tipo: 'entrada', nome: pessoa.nome, hora: agora, registo });
  }

  if (!registo.horaSaida) {
    registo = await prisma.registoPonto.update({
      where: { id: registo.id },
      data: { horaSaida: agora },
    });
    return res.json({ tipo: 'saida', nome: pessoa.nome, hora: agora, registo });
  }

  return res.json({ tipo: 'ja-registado', nome: pessoa.nome, message: 'Entrada e saída já registadas hoje', registo });
});

// Status do dia para uma pessoa (sem PIN — usado pelo quiosque para mostrar estado)
pontoPublicRouter.get('/status/:entidadeId', async (req, res) => {
  const entidadeId = parseInt(req.params.entidadeId);
  const hoje = todayDate();

  const registo = await prisma.registoPonto.findUnique({
    where: { entidadeId_data: { entidadeId, data: hoje } },
  });

  if (!registo) return res.json({ estado: 'sem-registo' });
  if (!registo.horaSaida) return res.json({ estado: 'entrada', horaEntrada: registo.horaEntrada });
  return res.json({ estado: 'completo', horaEntrada: registo.horaEntrada, horaSaida: registo.horaSaida });
});

// Alterar PIN (autenticado pelo PIN atual)
pontoPublicRouter.post('/alterar-pin', async (req, res) => {
  const { entidadeId, pinAtual, pinNovo } = req.body || {};
  if (!entidadeId || !pinAtual || !pinNovo) {
    return res.status(400).json({ error: 'entidadeId, pinAtual e pinNovo são obrigatórios' });
  }

  const pinNovoStr = String(pinNovo).slice(0, 4);
  if (!/^\d{4}$/.test(pinNovoStr)) {
    return res.status(400).json({ error: 'O novo PIN deve ter exactamente 4 dígitos' });
  }

  const pessoa = await prisma.entidade.findFirst({
    where: { id: entidadeId, ativo: true, tipos: { hasSome: ['pessoa-interna'] } },
    select: { id: true, nome: true, pin: true },
  });

  if (!pessoa || !pessoa.pin) {
    return res.status(404).json({ error: 'Pessoa não encontrada' });
  }

  const pinAtualStr = String(pinAtual).slice(0, 4);
  if (pinAtualStr.length !== pessoa.pin.length || !crypto.timingSafeEqual(Buffer.from(pinAtualStr), Buffer.from(pessoa.pin))) {
    return res.status(401).json({ error: 'PIN atual incorreto' });
  }

  await prisma.entidade.update({ where: { id: pessoa.id }, data: { pin: pinNovoStr } });
  return res.json({ ok: true, message: 'PIN alterado com sucesso' });
});

// Router protegido (admin — consulta e gestão)
const router = express.Router();

// Listar registos (com filtros)
router.get('/', async (req, res) => {
  const { entidadeId, mes, ano } = req.query as any;
  const where: any = {};

  if (entidadeId) where.entidadeId = parseInt(entidadeId);

  if (mes && ano) {
    const start = new Date(parseInt(ano), parseInt(mes) - 1, 1);
    const end = new Date(parseInt(ano), parseInt(mes), 0);
    where.data = { gte: start, lte: end };
  } else if (ano) {
    where.data = { gte: new Date(parseInt(ano), 0, 1), lte: new Date(parseInt(ano), 11, 31) };
  }

  const registos = await prisma.registoPonto.findMany({
    where,
    include: { entidade: { select: { id: true, nome: true, funcao: true, tipoVinculo: true } } },
    orderBy: [{ data: 'desc' }, { entidade: { nome: 'asc' } }],
  });
  return res.json(registos);
});

// Criar/editar registo manualmente (admin)
router.put('/:id', async (req, res) => {
  const { horaEntrada, horaSaida, observacoes } = req.body || {};
  const registo = await prisma.registoPonto.update({
    where: { id: parseInt(req.params.id) },
    data: {
      ...(horaEntrada !== undefined && { horaEntrada: horaEntrada ? new Date(horaEntrada) : null }),
      ...(horaSaida !== undefined && { horaSaida: horaSaida ? new Date(horaSaida) : null }),
      ...(observacoes !== undefined && { observacoes }),
    },
  });
  return res.json(registo);
});

// Apagar registo
router.delete('/:id', async (req, res) => {
  await prisma.registoPonto.delete({ where: { id: parseInt(req.params.id) } });
  return res.json({ ok: true });
});

// Mapa mensal (resumo por pessoa para um mês)
router.get('/mapa-mensal', async (req, res) => {
  const { mes, ano } = req.query as any;
  if (!mes || !ano) return res.status(400).json({ error: 'mes e ano são obrigatórios' });

  const m = parseInt(mes);
  const a = parseInt(ano);
  const start = new Date(a, m - 1, 1);
  const end = new Date(a, m, 0);
  const diasNoMes = end.getDate();

  const pessoas = await prisma.entidade.findMany({
    where: { ativo: true, tipos: { hasSome: ['pessoa-interna'] } },
    select: { id: true, nome: true, funcao: true, tipoVinculo: true },
    orderBy: { nome: 'asc' },
  });

  const registos = await prisma.registoPonto.findMany({
    where: { data: { gte: start, lte: end } },
    orderBy: { data: 'asc' },
  });

  const mapaByPessoa = new Map<number, any[]>();
  for (const r of registos) {
    if (!mapaByPessoa.has(r.entidadeId)) mapaByPessoa.set(r.entidadeId, []);
    mapaByPessoa.get(r.entidadeId)!.push(r);
  }

  const mapa = pessoas.map((p) => {
    const regs = mapaByPessoa.get(p.id) || [];
    let totalMinutos = 0;
    let diasPresente = 0;

    const dias = Array.from({ length: diasNoMes }, (_, i) => {
      const dia = i + 1;
      const reg = regs.find((r) => new Date(r.data).getDate() === dia);
      if (reg?.horaEntrada && reg?.horaSaida) {
        const mins = Math.round((new Date(reg.horaSaida).getTime() - new Date(reg.horaEntrada).getTime()) / 60000);
        totalMinutos += mins;
        diasPresente++;
        return { dia, entrada: reg.horaEntrada, saida: reg.horaSaida, minutos: mins, obs: reg.observacoes };
      }
      if (reg?.horaEntrada) {
        diasPresente++;
        return { dia, entrada: reg.horaEntrada, saida: null, minutos: 0, obs: reg.observacoes };
      }
      return { dia, entrada: null, saida: null, minutos: 0, obs: reg?.observacoes || null };
    });

    return {
      ...p,
      dias,
      totalMinutos,
      totalHoras: `${Math.floor(totalMinutos / 60)}h${String(totalMinutos % 60).padStart(2, '0')}`,
      diasPresente,
    };
  });

  return res.json({ mes: m, ano: a, diasNoMes, mapa });
});

export default router;
