// script.ts - Gestão de Faturas e Eventos

// --- Constantes e estado global ---
const API_EVENTOS = 'http://localhost:3000/eventos';
const API_FATURAS = 'http://localhost:3000/faturas';
const ALLOWED_DEPARTAMENTOS = [
  'Cultural',
  'Marketing e Multimédia',
  'Desporto',
  'Parcerias e Colaborações',
  'Educação',
  'Despesas Extraordinárias'
];

const SECTION_GROUPS: Record<string, string[]> = {
  resumo: ['dashboard', 'dashboardAno'],
  faturas: ['acoesRapidas', 'faturas'],
  eventos: ['eventos']
};

let chartInstance: any = null;
let editingEventoId: number | null = null;
let eventosCache: any[] = [];
let faturasCache: any[] = [];

// --- Helpers DOM ---
function getValue(id: string): string {
  const el = document.getElementById(id) as (HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement) | null;
  return el ? (el as any).value : '';
}
function setValue(id: string, value: string) {
  const el = document.getElementById(id) as (HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement) | null;
  if (el) (el as any).value = value;
}
function toggleSection(id: string, visible: boolean) {
  const el = document.getElementById(id);
  if (!el) return;
  el.toggleAttribute('hidden', !visible);
}
function resetForm(id: string) {
  const form = document.getElementById(id) as HTMLFormElement | null;
  if (form) form.reset();
}
function showNotification(message: string, type: 'success' | 'error' = 'success') {
  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  notification.innerHTML = `<span class="notification-icon">${type === 'success' ? '✅' : '❌'}</span><span class="notification-message">${message}</span>`;
  document.body.appendChild(notification);
  setTimeout(() => {
    notification.style.animation = 'slideIn 0.3s ease reverse';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}
function formatCurrency(value: any) {
  const num = Number(value || 0);
  return `€ ${num.toFixed(2)}`;
}
function formatDate(value: string | null) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('pt-PT');
}
function monthName(idx: number) {
  return ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'][idx] || '';
}

function hideForms() {
  toggleSection('formularioFatura', false);
  toggleSection('formularioEvento', false);
}

function setActiveNav(target: string) {
  document.querySelectorAll('.main-nav .nav-link').forEach(link => {
    link.classList.toggle('active', (link as HTMLElement).dataset.target === target);
  });
}

function setActiveSection(target: 'resumo' | 'faturas' | 'eventos') {
  hideForms();
  const showSet = new Set(SECTION_GROUPS[target]);
  Object.values(SECTION_GROUPS).flat().forEach(id => {
    toggleSection(id, showSet.has(id));
  });
  setActiveNav(target);
  // Scroll to the first section of the group for context
  const firstId = SECTION_GROUPS[target][0];
  document.getElementById(firstId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// --- Eventos: carregar, criar, editar e remover ---
async function carregarEventosSelect() {
  try {
    const resp = await fetch(API_EVENTOS);
    eventosCache = await resp.json();
    const select = document.getElementById('eventoFatura') as HTMLSelectElement | null;
    if (select) {
      select.innerHTML = '<option value="">Nenhum evento</option>' + eventosCache
        .map((ev: any) => `<option value="${ev.id}">${ev.nome}</option>`)
        .join('');
    }
  } catch {
    // Silencia erros neste ponto para não bloquear o fluxo principal
  }
}

async function editarEvento(id: number) {
  try {
    const resp = await fetch(`${API_EVENTOS}/${id}`);
    if (!resp.ok) throw new Error('Evento não encontrado');
    const evento = await resp.json();
    toggleSection('formularioEvento', true);
    setValue('eventoNome', evento.nome || '');
    setValue('eventoDataInicio', (evento.data_inicio || evento.dataInicio || '').slice(0, 10));
    setValue('eventoDataFim', (evento.data_fim || evento.dataFim || '').slice(0, 10));
    setValue('eventoDescricao', evento.descricao || '');
    setValue('eventoDepartamento', evento.departamento || '');
    editingEventoId = id;
    const btn = document.getElementById('eventoSubmitButton') as HTMLButtonElement | null;
    if (btn) btn.textContent = '💾 Guardar Alterações';
    document.getElementById('formularioEvento')?.scrollIntoView({ behavior: 'smooth' });
  } catch {
    showNotification('❌ Erro ao carregar evento para edição', 'error');
  }
}

async function removerEvento(id: number) {
  if (!confirm('Tem a certeza que deseja remover este evento? Esta ação não pode ser desfeita.')) return;
  try {
    const resp = await fetch(`${API_EVENTOS}/${id}`, { method: 'DELETE' });
    if (!resp.ok) throw new Error('Erro ao remover evento');
    showNotification('Evento removido com sucesso!', 'success');
    await Promise.all([carregarEventosResumo(), carregarEventosSelect()]);
  } catch {
    showNotification('❌ Erro ao remover evento', 'error');
  }
}

async function guardarEvento(e: SubmitEvent) {
  e.preventDefault();
  const payload: any = {
    nome: getValue('eventoNome').trim(),
    descricao: getValue('eventoDescricao').trim() || undefined,
    data_inicio: getValue('eventoDataInicio') || undefined,
    data_fim: getValue('eventoDataFim') || undefined,
    departamento: getValue('eventoDepartamento') || undefined
  };

  if (!payload.nome) {
    showNotification('O nome do evento é obrigatório.', 'error');
    return;
  }

  const url = editingEventoId ? `${API_EVENTOS}/${editingEventoId}` : API_EVENTOS;
  const method = editingEventoId ? 'PUT' : 'POST';

  try {
    const resp = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!resp.ok) throw new Error('Falha ao guardar');
    showNotification(editingEventoId ? 'Evento atualizado com sucesso!' : 'Evento criado com sucesso!', 'success');
    resetForm('eventoForm');
    toggleSection('formularioEvento', false);
    editingEventoId = null;
    const btn = document.getElementById('eventoSubmitButton') as HTMLButtonElement | null;
    if (btn) btn.textContent = '💾 Guardar';
    await Promise.all([carregarEventosResumo(), carregarEventosSelect()]);
  } catch {
    showNotification('❌ Erro ao guardar evento', 'error');
  }
}

async function carregarEventosResumo() {
  const eventosLista = document.getElementById('eventosLista');
  if (!eventosLista) return;
  try {
    const resp = await fetch(API_EVENTOS);
    const eventos = await resp.json();
    eventosCache = eventos;
    if (!Array.isArray(eventos) || eventos.length === 0) {
      eventosLista.innerHTML = '<p>Nenhum evento registado.</p>';
      return;
    }
    const respFaturas = await fetch(API_FATURAS);
    const faturas = await respFaturas.json();
    faturasCache = faturas;
    const gastosPorEvento: Record<string, number> = {};
    faturas.forEach((f: any) => {
      if (f.eventoId) {
        gastosPorEvento[f.eventoId] = (gastosPorEvento[f.eventoId] || 0) + parseFloat(f.valor || 0);
      }
    });
    eventosLista.innerHTML = eventos.map((ev: any) => {
      const gasto = gastosPorEvento[ev.id] || 0;
      const numFaturas = faturas.filter((f: any) => f.eventoId === ev.id).length;
      return `<div class="dashboard-card" data-evento-id="${ev.id}">
        <div class="card-label">${ev.nome} <span style=\"color:#888;font-size:0.95em; font-weight:400;\">${ev.data_inicio || ev.dataInicio || ''}${(ev.data_fim || ev.dataFim) ? ' a ' + (ev.data_fim || ev.dataFim) : ''}</span></div>
        <div class="card-value">${formatCurrency(gasto)}</div>
        <div class="card-subtitle">${numFaturas} fatura(s) registada(s)</div>
        <div class="card-subtitle" style="margin-top:0.3em;">${ev.descricao || ''}</div>
        <div class="card-actions" style="margin-top:0.7em; display:flex; gap:0.5em;">
          <button class="btn-editar-evento" data-id="${ev.id}" title="Editar evento">✏️</button>
          <button class="btn-remover-evento" data-id="${ev.id}" title="Remover evento">🗑️</button>
        </div>
      </div>`;
    }).join('');
    eventosLista.querySelectorAll('.btn-editar-evento').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = (e.currentTarget as HTMLElement).getAttribute('data-id');
        if (id) editarEvento(parseInt(id));
      });
    });
    eventosLista.querySelectorAll('.btn-remover-evento').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = (e.currentTarget as HTMLElement).getAttribute('data-id');
        if (id) removerEvento(parseInt(id));
      });
    });
  } catch {
    eventosLista.innerHTML = '<p>Erro ao carregar eventos.</p>';
  }
}
(window as any).carregarEventosResumo = carregarEventosResumo;

// --- Faturas: carregar e criar ---
function aplicarDepartamentosFiltro() {
  const select = document.getElementById('filterDepartamento') as HTMLSelectElement | null;
  if (!select) return;
  if (select.options.length > 1) return; // já preenchido
  ALLOWED_DEPARTAMENTOS.forEach(dep => {
    const opt = document.createElement('option');
    opt.value = dep;
    opt.textContent = dep;
    select.appendChild(opt);
  });
}

async function carregarFaturas() {
  const tbody = document.getElementById('tabelaFaturas');
  if (!tbody) return;
  const params = new URLSearchParams();
  const from = getValue('filterFrom');
  const to = getValue('filterTo');
  const q = getValue('filterQ');
  const departamento = getValue('filterDepartamento');
  const estado = getValue('filterEstado');
  if (from) params.append('dateFrom', from);
  if (to) params.append('dateTo', to);
  if (q) params.append('q', q);
  if (departamento) params.append('departamento', departamento);
  if (estado) params.append('estado', estado);

  try {
    const resp = await fetch(`${API_FATURAS}?${params.toString()}`);
    if (!resp.ok) throw new Error('Erro ao listar faturas');
    faturasCache = await resp.json();
    if (!Array.isArray(faturasCache) || faturasCache.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9">Nenhuma fatura encontrada.</td></tr>';
      atualizarDashboards([]);
      return;
    }
    tbody.innerHTML = faturasCache.map((f: any) => {
      const eventoNome = eventosCache.find((ev: any) => ev.id === f.eventoId)?.nome || '-';
      return `<tr>
        <td>${f.titulo || '-'}</td>
        <td>${f.tipo || 'Fatura'}</td>
        <td>${f.numero || '-'}</td>
        <td>${formatCurrency(f.valor)}</td>
        <td>${formatDate(f.data)}</td>
        <td>${f.departamento || '-'}</td>
        <td>${eventoNome}</td>
        <td>${f.estado || '-'}</td>
        <td></td>
      </tr>`;
    }).join('');
    atualizarDashboards(faturasCache);
  } catch {
    tbody.innerHTML = '<tr><td colspan="9">Erro ao carregar faturas.</td></tr>';
    atualizarDashboards([]);
  }
}

async function guardarFatura(e: SubmitEvent) {
  e.preventDefault();
  const titulo = getValue('nomeFatura').trim();
  const valor = parseFloat(getValue('valorFatura'));
  const data = getValue('dataFatura');
  const departamento = getValue('departamento');
  if (!titulo || !data || !departamento || Number.isNaN(valor)) {
    showNotification('Preencha todos os campos obrigatórios da fatura.', 'error');
    return;
  }
  const eventoIdStr = getValue('eventoFatura');
  const payload: any = {
    titulo,
    valor,
    data,
    departamento,
    tipo: 'Fatura',
    numero: getValue('numeroFatura').trim() || undefined,
    estado: getValue('estadoFatura') || 'Pendente',
    descricao: getValue('observacoesFatura').trim() || undefined
  };
  if (eventoIdStr) payload.eventoId = parseInt(eventoIdStr, 10);

  try {
    const resp = await fetch(API_FATURAS, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!resp.ok) throw new Error('Erro ao criar fatura');
    showNotification('Fatura criada com sucesso!', 'success');
    resetForm('faturaForm');
    toggleSection('formularioFatura', false);
    await Promise.all([carregarFaturas(), carregarEventosResumo()]);
  } catch {
    showNotification('❌ Erro ao guardar fatura', 'error');
  }
}

// --- Inicialização ---
function setupEventListeners() {
  const btnNovoEvento = document.getElementById('btnEscolherEvento');
  if (btnNovoEvento) {
    btnNovoEvento.addEventListener('click', () => {
      setActiveSection('eventos');
      editingEventoId = null;
      resetForm('eventoForm');
      const btn = document.getElementById('eventoSubmitButton') as HTMLButtonElement | null;
      if (btn) btn.textContent = '💾 Guardar';
      toggleSection('formularioEvento', true);
      document.getElementById('formularioEvento')?.scrollIntoView({ behavior: 'smooth' });
    });
  }

  const btnCancelarEvento = document.getElementById('btnCancelarEvento');
  if (btnCancelarEvento) {
    btnCancelarEvento.addEventListener('click', () => {
      toggleSection('formularioEvento', false);
      editingEventoId = null;
      resetForm('eventoForm');
    });
  }

  const eventoForm = document.getElementById('eventoForm');
  if (eventoForm) eventoForm.addEventListener('submit', guardarEvento);

  const btnNovoFatura = document.getElementById('btnEscolherFatura');
  if (btnNovoFatura) {
    btnNovoFatura.addEventListener('click', () => {
      setActiveSection('faturas');
      toggleSection('formularioFatura', true);
      setValue('tipoFatura', 'Fatura');
      carregarEventosSelect();
      document.getElementById('formularioFatura')?.scrollIntoView({ behavior: 'smooth' });
    });
  }

  const qaNovaFatura = document.getElementById('qaNovaFatura');
  if (qaNovaFatura) {
    qaNovaFatura.addEventListener('click', () => {
      setActiveSection('faturas');
      toggleSection('formularioFatura', true);
      setValue('tipoFatura', 'Fatura');
      carregarEventosSelect();
      document.getElementById('formularioFatura')?.scrollIntoView({ behavior: 'smooth' });
    });
  }

  const qaNovoEvento = document.getElementById('qaNovoEvento');
  if (qaNovoEvento) {
    qaNovoEvento.addEventListener('click', () => {
      setActiveSection('eventos');
      editingEventoId = null;
      resetForm('eventoForm');
      const btn = document.getElementById('eventoSubmitButton') as HTMLButtonElement | null;
      if (btn) btn.textContent = '💾 Guardar';
      toggleSection('formularioEvento', true);
      document.getElementById('formularioEvento')?.scrollIntoView({ behavior: 'smooth' });
    });
  }

  const btnCancelarFatura = document.getElementById('btnCancelarFatura');
  if (btnCancelarFatura) {
    btnCancelarFatura.addEventListener('click', () => {
      toggleSection('formularioFatura', false);
      resetForm('faturaForm');
    });
  }

  const faturaForm = document.getElementById('faturaForm');
  if (faturaForm) faturaForm.addEventListener('submit', guardarFatura);

  const btnFiltros = document.getElementById('btnAplicarFiltros');
  if (btnFiltros) btnFiltros.addEventListener('click', () => carregarFaturas());

  document.querySelectorAll('.main-nav .nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const target = (e.currentTarget as HTMLElement).dataset.target as 'resumo' | 'faturas' | 'eventos' | undefined;
      if (!target) return;
      setActiveSection(target);
    });
  });
}

// --- Dashboards (Resumo Geral e Ano) ---
function calcularResumoMesAtual(faturas: any[]) {
  const agora = new Date();
  const mes = agora.getMonth();
  const ano = agora.getFullYear();
  const doMes = faturas.filter(f => {
    const d = new Date(f.data);
    return d.getMonth() === mes && d.getFullYear() === ano;
  });
  const total = doMes.reduce((s, f) => s + Number(f.valor || 0), 0);
  const pagas = doMes.filter(f => f.estado === 'Paga').reduce((s, f) => s + Number(f.valor || 0), 0);
  const pendentes = doMes.filter(f => f.estado === 'Pendente').reduce((s, f) => s + Number(f.valor || 0), 0);
  const recorrentes = doMes.filter(f => (f.tipo || '').toLowerCase().includes('recorrente')).reduce((s, f) => s + Number(f.valor || 0), 0);
  return { total, pagas, pendentes, recorrentes, count: doMes.length };
}

function renderDashboard(faturas: any[]) {
  const container = document.getElementById('dashboardContent');
  if (!container) return;
  const r = calcularResumoMesAtual(faturas);
  const blocoTotais = [
    { label: 'Total do mês', value: formatCurrency(r.total) },
    { label: 'Pagas', value: formatCurrency(r.pagas) },
    { label: 'Pendentes', value: formatCurrency(r.pendentes) }
  ];
  const blocoRecorr = [
    { label: 'Recorrentes', value: formatCurrency(r.recorrentes) },
    { label: 'Nº de faturas', value: r.count.toString() }
  ];

  const renderCards = (cards: { label: string; value: string; }[]) => cards.map(c => `
    <div class="summary-card">
      <div class="label">${c.label}</div>
      <div class="value">${c.value}</div>
    </div>
  `).join('');

  container.innerHTML = `
    <div class="summary-block">
      <div class="summary-title">Totais do mês</div>
      <div class="summary-grid">${renderCards(blocoTotais)}</div>
    </div>
    <div class="summary-block">
      <div class="summary-title">Recorrência e contagem</div>
      <div class="summary-grid">${renderCards(blocoRecorr)}</div>
    </div>
  `;
}

function calcularResumoAno(faturas: any[]) {
  const ano = new Date().getFullYear();
  const porMes = new Array(12).fill(0);
  faturas.forEach(f => {
    const d = new Date(f.data);
    if (d.getFullYear() === ano) porMes[d.getMonth()] += Number(f.valor || 0);
  });
  return porMes.map((valor, idx) => ({ mes: monthName(idx), valor }));
}

function renderDashboardAno(faturas: any[]) {
  const container = document.getElementById('dashboardAnoContent');
  if (!container) return;
  const dados = calcularResumoAno(faturas);
  const temDados = dados.some(d => d.valor > 0);
  if (!temDados) {
    container.innerHTML = '<p class="text-muted">Ainda sem dados para este ano.</p>';
    return;
  }
  const renderCards = (lista: { mes: string; valor: number; }[]) => lista.map(d => `
    <div class="summary-card">
      <div class="label">${d.mes}</div>
      <div class="value">${formatCurrency(d.valor)}</div>
    </div>
  `).join('');

  const primeiroSemestre = dados.slice(0, 6);
  const segundoSemestre = dados.slice(6, 12);

  container.innerHTML = `
    <div class="summary-block">
      <div class="summary-title">1.º Semestre</div>
      <div class="summary-grid">${renderCards(primeiroSemestre)}</div>
    </div>
    <div class="summary-block">
      <div class="summary-title">2.º Semestre</div>
      <div class="summary-grid">${renderCards(segundoSemestre)}</div>
    </div>
  `;
}

function renderChartDepartamentos(faturas: any[]) {
  const ctx = document.getElementById('chartDespesas') as HTMLCanvasElement | null;
  if (!ctx) return;
  const map: Record<string, number> = {};
  faturas.forEach(f => {
    if (!f.departamento) return;
    map[f.departamento] = (map[f.departamento] || 0) + Number(f.valor || 0);
  });
  const labels = Object.keys(map);
  const data = labels.map(l => map[l]);
  if (chartInstance) chartInstance.destroy();
  chartInstance = new (window as any).Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Gasto por departamento',
        data,
        backgroundColor: '#22c55e'
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true } }
    }
  });
}

function atualizarDashboards(faturas: any[]) {
  renderDashboard(faturas);
  renderDashboardAno(faturas);
  renderChartDepartamentos(faturas);
}

function init() {
  aplicarDepartamentosFiltro();
  setupEventListeners();
  carregarEventosSelect();
  carregarEventosResumo();
  carregarFaturas();
  setActiveSection('resumo');
}

document.addEventListener('DOMContentLoaded', init);
