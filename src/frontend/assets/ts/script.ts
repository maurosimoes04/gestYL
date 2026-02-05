// script.ts - Gestão de Faturas e Eventos

// --- Constantes e estado global ---
const API_EVENTOS = 'http://localhost:3000/eventos';
const API_FATURAS = 'http://localhost:3000/faturas';
const API_RECEITAS = 'http://localhost:3000/receitas';
const API_MOVIMENTOS = 'http://localhost:3000/movimentos';
const RECEITA_CATEGORIAS = [
  'Quotas',
  'Patrocínios/Doações',
  'Cofinanciamentos',
  'Vendas/Serviços',
  'Reembolsos',
  'Outros'
];
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
  receitas: ['acoesRapidasReceitas', 'receitas'],
  eventos: ['eventos']
};

let chartInstance: any = null;
let chartReceitasInstance: any = null;
let editingEventoId: number | null = null;
let editingFaturaId: number | null = null;
let editingReceitaId: number | null = null;
let eventosCache: any[] = [];
let faturasCache: any[] = [];
let receitasCache: any[] = [];
let movimentosCache: any[] = [];

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

function setDefaultExportPeriodo() {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  setValue('exportFrom', first.toISOString().slice(0, 10));
  setValue('exportTo', last.toISOString().slice(0, 10));
  setValue('exportAno', String(now.getFullYear()));
}

function toggleExportPeriodoFields(periodo: string) {
  const datasWrap = document.getElementById('exportDatas');
  const anoWrap = document.getElementById('exportAnoWrap');
  const now = new Date();
  if (periodo === 'anual') {
    const anoEl = document.getElementById('exportAno') as HTMLInputElement | null;
    if (anoEl && !anoEl.value) anoEl.value = String(now.getFullYear());
    if (datasWrap) { datasWrap.setAttribute('hidden', 'true'); datasWrap.style.display = 'none'; }
    if (anoWrap) { anoWrap.removeAttribute('hidden'); anoWrap.style.display = 'flex'; }
  } else if (periodo === 'custom') {
    const fromEl = document.getElementById('exportFrom') as HTMLInputElement | null;
    const toEl = document.getElementById('exportTo') as HTMLInputElement | null;
    if (fromEl && !fromEl.value) {
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      fromEl.value = first.toISOString().slice(0, 10);
    }
    if (toEl && !toEl.value) {
      const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      toEl.value = last.toISOString().slice(0, 10);
    }
    if (anoWrap) { anoWrap.setAttribute('hidden', 'true'); anoWrap.style.display = 'none'; }
    if (datasWrap) { datasWrap.removeAttribute('hidden'); datasWrap.style.display = 'flex'; }
  } else {
    // Nenhuma seleção: esconder ambos
    if (anoWrap) { anoWrap.setAttribute('hidden', 'true'); anoWrap.style.display = 'none'; }
    if (datasWrap) { datasWrap.setAttribute('hidden', 'true'); datasWrap.style.display = 'none'; }
  }
}

function openExportModal() {
  const periodoSelect = document.getElementById('exportPeriodo') as HTMLSelectElement | null;
  if (periodoSelect) periodoSelect.value = '';
  toggleExportPeriodoFields(periodoSelect?.value || '');
  // Garantir ocultação inicial
  const datasWrap = document.getElementById('exportDatas');
  const anoWrap = document.getElementById('exportAnoWrap');
  datasWrap?.setAttribute('hidden', 'true');
  anoWrap?.setAttribute('hidden', 'true');
  const modal = document.getElementById('exportModal');
  if (modal) modal.removeAttribute('hidden');
  const tipoSel = document.getElementById('exportTipo') as HTMLSelectElement | null;
  if (tipoSel) tipoSel.focus();
}

function closeExportModal() {
  const modal = document.getElementById('exportModal');
  if (modal) modal.setAttribute('hidden', 'true');
}

function handleExportRelatorio(e: Event) {
  e.preventDefault();
  const tipo = getValue('exportTipo') || 'ambos';
  const periodo = getValue('exportPeriodo') || 'custom';
  const params = new URLSearchParams({ tipo, periodo });

  if (periodo === 'anual') {
    const ano = getValue('exportAno') || String(new Date().getFullYear());
    params.append('ano', ano);
  } else {
    const from = getValue('exportFrom');
    const to = getValue('exportTo');
    if (from) params.append('dateFrom', from);
    if (to) params.append('dateTo', to);
  }

  const url = `/relatorios/pdf?${params.toString()}`;
  window.open(url, '_blank');
  closeExportModal();
}

function setupExportRelatorio() {
  const form = document.getElementById('exportRelatorioForm') as HTMLFormElement | null;
  const periodoSelect = document.getElementById('exportPeriodo') as HTMLSelectElement | null;
  closeExportModal();
  if (form) {
    if (periodoSelect) periodoSelect.addEventListener('change', () => toggleExportPeriodoFields(periodoSelect.value));
    form.addEventListener('submit', handleExportRelatorio);
  }

  const headerBtn = document.getElementById('btnExportRelatorioHeader');
  const quickBtn = document.getElementById('qaExportRelatorio');
  const quickBtnReceitas = document.getElementById('qaExportRelatorioReceitas');
  if (headerBtn) headerBtn.addEventListener('click', openExportModal);
  if (quickBtn) quickBtn.addEventListener('click', openExportModal);
  if (quickBtnReceitas) quickBtnReceitas.addEventListener('click', openExportModal);

  const closeBtn = document.getElementById('exportModalClose');
  const cancelBtn = document.getElementById('exportModalCancel');
  const modal = document.getElementById('exportModal');
  if (closeBtn) closeBtn.addEventListener('click', closeExportModal);
  if (cancelBtn) cancelBtn.addEventListener('click', closeExportModal);
  if (modal) {
    modal.addEventListener('click', (ev) => {
      if (ev.target === modal) closeExportModal();
    });
  }
}

function hideForms() {
  toggleSection('formularioFatura', false);
  toggleSection('formularioEvento', false);
  toggleSection('formularioReceita', false);
}

function setActiveNav(target: string) {
  document.querySelectorAll('.main-nav .nav-link').forEach(link => {
    link.classList.toggle('active', (link as HTMLElement).dataset.target === target);
  });
}

function setActiveSection(target: 'resumo' | 'faturas' | 'receitas' | 'eventos') {
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
    const selectFatura = document.getElementById('eventoFatura') as HTMLSelectElement | null;
    const selectReceita = document.getElementById('eventoReceita') as HTMLSelectElement | null;
    const selectFiltroReceita = document.getElementById('filterReceitaEvento') as HTMLSelectElement | null;
    const optsList = eventosCache
      .map((ev: any) => `<option value="${ev.id}">${ev.nome}</option>`)
      .join('');
    const opts = '<option value="">Nenhum evento</option>' + optsList;
    if (selectFatura) selectFatura.innerHTML = opts;
    if (selectReceita) selectReceita.innerHTML = opts;
    if (selectFiltroReceita) selectFiltroReceita.innerHTML = '<option value="">🎉 Todos os eventos</option>' + optsList;
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
    await Promise.all([
      carregarEventosResumo(),
      carregarEventosSelect(),
      carregarFaturas(),
      carregarReceitas(),
      carregarMovimentos()
    ]);
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
    const respReceitas = await fetch(API_RECEITAS);
    const receitas = await respReceitas.json();
    receitasCache = receitas;
    const gastosPorEvento: Record<string, number> = {};
    faturas.forEach((f: any) => {
      if (f.eventoId) {
        gastosPorEvento[f.eventoId] = (gastosPorEvento[f.eventoId] || 0) + parseFloat(f.valor || 0);
      }
    });
    const receitasPorEvento: Record<string, number> = {};
    receitas.forEach((r: any) => {
      if (r.eventoId) {
        receitasPorEvento[r.eventoId] = (receitasPorEvento[r.eventoId] || 0) + parseFloat(r.valor || 0);
      }
    });
    eventosLista.className = 'eventos-grid';
    eventosLista.innerHTML = eventos.map((ev: any) => {
      const gasto = gastosPorEvento[ev.id] || 0;
      const numFaturas = faturas.filter((f: any) => f.eventoId === ev.id).length;
      const receitaTotal = receitasPorEvento[ev.id] || 0;
      const numReceitas = receitas.filter((r: any) => r.eventoId === ev.id).length;
      const saldo = receitaTotal - gasto;
      const dataInicioRaw = ev.data_inicio || ev.dataInicio || '';
      const dataFimRaw = ev.data_fim || ev.dataFim || '';
      const formatDia = (d: string) => d ? new Date(d).toLocaleDateString('pt-PT') : '';
      const dataInicio = formatDia(dataInicioRaw);
      const dataFim = formatDia(dataFimRaw);
      const intervalo = dataInicio && dataFim ? `${dataInicio} a ${dataFim}` : (dataInicio || dataFim || 'Sem data');
      return `<div class="evento-card" data-evento-id="${ev.id}">
        <div class="evento-head">
          <div>
            <div class="evento-title">${ev.nome}</div>
            <div class="evento-dates">${intervalo}</div>
          </div>
          <div class="evento-dept">${ev.departamento || 'Sem depto'}</div>
        </div>
        <div class="evento-body">
          <div class="evento-metric"><span>Entradas (receitas)</span><strong>${formatCurrency(receitaTotal)}</strong><span>${numReceitas} receita(s)</span></div>
          <div class="evento-metric"><span>Saídas (despesas)</span><strong>${formatCurrency(gasto)}</strong><span>${numFaturas} despesa(s)</span></div>
          <div class="evento-metric"><span>Saldo do evento</span><strong>${formatCurrency(saldo)}</strong></div>
        </div>
        <p class="evento-desc">${ev.descricao || 'Sem descrição.'}</p>
        <div class="evento-actions">
          <button class="btn-editar-evento" data-id="${ev.id}" title="Editar evento">✏️ Editar</button>
          <button class="btn-remover-evento" data-id="${ev.id}" title="Remover evento">🗑️ Remover</button>
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

function aplicarCategoriasFiltroReceita() {
  const selectCat = document.getElementById('filterReceitaCategoria') as HTMLSelectElement | null;
  if (selectCat && selectCat.options.length <= 1) {
    RECEITA_CATEGORIAS.forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat;
      opt.textContent = cat;
      selectCat.appendChild(opt);
    });
  }
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
      atualizarDashboards([], movimentosCache, receitasCache);
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
        <td class="table-actions">
          <button class="btn-acao btn-editar-fatura" data-id="${f.id}" title="Editar">✏️</button>
          <button class="btn-acao btn-remover-fatura" data-id="${f.id}" title="Remover">🗑️</button>
        </td>
      </tr>`;
    }).join('');
    tbody.querySelectorAll('.btn-editar-fatura').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = (e.currentTarget as HTMLElement).getAttribute('data-id');
        if (id) editarFatura(parseInt(id, 10));
      });
    });
    tbody.querySelectorAll('.btn-remover-fatura').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = (e.currentTarget as HTMLElement).getAttribute('data-id');
        if (id) removerFatura(parseInt(id, 10));
      });
    });
    atualizarDashboards(faturasCache, movimentosCache, receitasCache);
  } catch {
    tbody.innerHTML = '<tr><td colspan="9">Erro ao carregar faturas.</td></tr>';
    atualizarDashboards([], movimentosCache, receitasCache);
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

  const url = editingFaturaId ? `${API_FATURAS}/${editingFaturaId}` : API_FATURAS;
  const method = editingFaturaId ? 'PUT' : 'POST';

  try {
    const resp = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!resp.ok) throw new Error('Erro ao guardar fatura');
    showNotification(editingFaturaId ? 'Fatura atualizada com sucesso!' : 'Fatura criada com sucesso!', 'success');
    resetForm('faturaForm');
    toggleSection('formularioFatura', false);
    editingFaturaId = null;
    const btn = document.getElementById('btnSalvarFatura') as HTMLButtonElement | null;
    if (btn) btn.textContent = '💾 Guardar';
    await Promise.all([carregarFaturas(), carregarEventosResumo(), carregarMovimentos()]);
  } catch {
    showNotification('❌ Erro ao guardar fatura', 'error');
  }
}

// --- Receitas: carregar e criar ---
async function carregarReceitas() {
  const tbody = document.getElementById('tabelaReceitas');
  if (!tbody) return;
  const params = new URLSearchParams();
  const from = getValue('filterReceitaFrom');
  const to = getValue('filterReceitaTo');
  const q = getValue('filterReceitaQ');
  const categoria = getValue('filterReceitaCategoria');
  const estado = getValue('filterReceitaEstado');
  const eventoId = getValue('filterReceitaEvento');
  if (from) params.append('dateFrom', from);
  if (to) params.append('dateTo', to);
  if (q) params.append('q', q);
  if (categoria) params.append('categoria', categoria);
  if (estado) params.append('estado', estado);
  if (eventoId) params.append('eventoId', eventoId);
  try {
    const url = params.toString() ? `${API_RECEITAS}?${params.toString()}` : API_RECEITAS;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error('Erro ao listar receitas');
    receitasCache = await resp.json();
    if (!Array.isArray(receitasCache) || receitasCache.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9">Nenhuma receita encontrada.</td></tr>';
      atualizarDashboards(faturasCache, movimentosCache, receitasCache);
      return;
    }
    tbody.innerHTML = receitasCache.map((r: any) => {
      const eventoNome = eventosCache.find((ev: any) => ev.id === r.eventoId)?.nome || '-';
      return `<tr>
        <td>${r.titulo || '-'}</td>
        <td>${r.categoria || '-'}</td>
        <td>${r.estado || '-'}</td>
        <td>${r.financiador || '-'}</td>
        <td>${eventoNome}</td>
        <td>${formatCurrency(r.valor)}</td>
        <td>${formatDate(r.data)}</td>
        <td>${r.observacoes || '-'}</td>
        <td class="table-actions">
          <button class="btn-acao btn-editar-receita" data-id="${r.id}" title="Editar">✏️</button>
          <button class="btn-acao btn-remover-receita" data-id="${r.id}" title="Remover">🗑️</button>
        </td>
      </tr>`;
    }).join('');
    tbody.querySelectorAll('.btn-editar-receita').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = (e.currentTarget as HTMLElement).getAttribute('data-id');
        if (id) editarReceita(parseInt(id, 10));
      });
    });
    tbody.querySelectorAll('.btn-remover-receita').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = (e.currentTarget as HTMLElement).getAttribute('data-id');
        if (id) removerReceita(parseInt(id, 10));
      });
    });
    atualizarDashboards(faturasCache, movimentosCache, receitasCache);
  } catch {
    tbody.innerHTML = '<tr><td colspan="9">Erro ao carregar receitas.</td></tr>';
    atualizarDashboards(faturasCache, movimentosCache, receitasCache);
  }
}

async function carregarMovimentos() {
  try {
    const resp = await fetch(API_MOVIMENTOS);
    if (!resp.ok) throw new Error('Erro ao listar movimentos');
    movimentosCache = await resp.json();
  } catch {
    movimentosCache = [];
  }
}

async function guardarReceita(e: SubmitEvent) {
  e.preventDefault();
  const payload: any = {
    titulo: getValue('tituloReceita').trim(),
    categoria: getValue('categoriaReceita'),
    estado: getValue('estadoReceita') || 'Previsto',
    financiador: getValue('financiadorReceita').trim() || undefined,
    valor: parseFloat(getValue('valorReceita')),
    data: getValue('dataReceita'),
    observacoes: getValue('observacoesReceita').trim() || undefined
  };

  const eventoIdStr = getValue('eventoReceita');
  if (eventoIdStr) payload.eventoId = parseInt(eventoIdStr, 10);

  if (!payload.titulo || !payload.categoria || !payload.data || Number.isNaN(payload.valor)) {
    showNotification('Preencha os campos obrigatórios da receita.', 'error');
    return;
  }

  const url = editingReceitaId ? `${API_RECEITAS}/${editingReceitaId}` : API_RECEITAS;
  const method = editingReceitaId ? 'PUT' : 'POST';

  try {
    const resp = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!resp.ok) throw new Error('Erro ao guardar receita');
    showNotification(editingReceitaId ? 'Receita atualizada com sucesso!' : 'Receita criada com sucesso!', 'success');
    resetForm('receitaForm');
    toggleSection('formularioReceita', false);
    editingReceitaId = null;
    const btn = document.getElementById('btnSalvarReceita') as HTMLButtonElement | null;
    if (btn) btn.textContent = '💾 Guardar';
    await Promise.all([carregarReceitas(), carregarMovimentos()]);
  } catch {
    showNotification('❌ Erro ao guardar receita', 'error');
  }
}

// --- Inicialização ---
function setupEventListeners() {
  setupExportRelatorio();
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

  const qaNovoEventoReceitas = document.getElementById('qaNovoEventoReceitas');
  if (qaNovoEventoReceitas) {
    qaNovoEventoReceitas.addEventListener('click', () => {
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
      editingFaturaId = null;
      const btn = document.getElementById('btnSalvarFatura') as HTMLButtonElement | null;
      if (btn) btn.textContent = '💾 Guardar';
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
      editingFaturaId = null;
      const btn = document.getElementById('btnSalvarFatura') as HTMLButtonElement | null;
      if (btn) btn.textContent = '💾 Guardar';
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
      editingFaturaId = null;
      const btn = document.getElementById('btnSalvarFatura') as HTMLButtonElement | null;
      if (btn) btn.textContent = '💾 Guardar';
    });
  }

  const faturaForm = document.getElementById('faturaForm');
  if (faturaForm) faturaForm.addEventListener('submit', guardarFatura);

  const btnNovaReceita = document.getElementById('btnNovaReceita');
  if (btnNovaReceita) {
    btnNovaReceita.addEventListener('click', () => {
      setActiveSection('receitas');
      resetForm('receitaForm');
      toggleSection('formularioReceita', true);
      editingReceitaId = null;
      const btn = document.getElementById('btnSalvarReceita') as HTMLButtonElement | null;
      if (btn) btn.textContent = '💾 Guardar';
      carregarEventosSelect();
      document.getElementById('formularioReceita')?.scrollIntoView({ behavior: 'smooth' });
    });
  }

  const btnCancelarReceita = document.getElementById('btnCancelarReceita');
  if (btnCancelarReceita) {
    btnCancelarReceita.addEventListener('click', () => {
      toggleSection('formularioReceita', false);
      resetForm('receitaForm');
      editingReceitaId = null;
      const btn = document.getElementById('btnSalvarReceita') as HTMLButtonElement | null;
      if (btn) btn.textContent = '💾 Guardar';
    });
  }

  const receitaForm = document.getElementById('receitaForm');
  if (receitaForm) receitaForm.addEventListener('submit', guardarReceita);

  const btnFiltros = document.getElementById('btnAplicarFiltros');
  if (btnFiltros) btnFiltros.addEventListener('click', () => carregarFaturas());

  const btnFiltrosReceita = document.getElementById('btnAplicarFiltrosReceita');
  if (btnFiltrosReceita) btnFiltrosReceita.addEventListener('click', () => carregarReceitas());

  const qaNovaReceita = document.getElementById('qaNovaReceita');
  if (qaNovaReceita) {
    qaNovaReceita.addEventListener('click', () => {
      setActiveSection('receitas');
      resetForm('receitaForm');
      toggleSection('formularioReceita', true);
      editingReceitaId = null;
      const btn = document.getElementById('btnSalvarReceita') as HTMLButtonElement | null;
      if (btn) btn.textContent = '💾 Guardar';
      carregarEventosSelect();
      document.getElementById('formularioReceita')?.scrollIntoView({ behavior: 'smooth' });
    });
  }

  document.querySelectorAll('.main-nav .nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const target = (e.currentTarget as HTMLElement).dataset.target as 'resumo' | 'faturas' | 'receitas' | 'eventos' | undefined;
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

function calcularFluxoMesAtual(movimentos: any[], faturas: any[] = faturasCache, receitas: any[] = receitasCache) {
  const agora = new Date();
  const mes = agora.getMonth();
  const ano = agora.getFullYear();
  const movimentosMes = movimentos.filter(m => {
    const d = new Date(m.data);
    return d.getMonth() === mes && d.getFullYear() === ano;
  });
  if (movimentosMes.length > 0) {
    const entradas = movimentosMes.filter(m => m.tipo === 'entrada').reduce((s, m) => s + Number(m.valor || 0), 0);
    const saidas = movimentosMes.filter(m => m.tipo === 'saida').reduce((s, m) => s + Number(m.valor || 0), 0);
    return { entradas, saidas, saldoMes: entradas - saidas };
  }

  const receitasMes = receitas.filter(r => {
    const d = new Date(r.data);
    return d.getMonth() === mes && d.getFullYear() === ano;
  });
  const faturasMes = faturas.filter(f => {
    const d = new Date(f.data);
    return d.getMonth() === mes && d.getFullYear() === ano;
  });
  const entradasFallback = receitasMes.reduce((s, r) => s + Number(r.valor || 0), 0);
  const saidasFallback = faturasMes.reduce((s, f) => s + Number(f.valor || 0), 0);
  return { entradas: entradasFallback, saidas: saidasFallback, saldoMes: entradasFallback - saidasFallback };
}

function renderDashboard(faturas: any[], movimentos: any[], receitas: any[]) {
  const container = document.getElementById('dashboardContent');
  if (!container) return;
  const r = calcularResumoMesAtual(faturas);
  const fluxo = calcularFluxoMesAtual(movimentos, faturas, receitas);
  const blocoTotais = [
    { label: 'Total do mês (faturas)', value: formatCurrency(r.total) },
    { label: 'Pagas', value: formatCurrency(r.pagas) },
    { label: 'Pendentes', value: formatCurrency(r.pendentes) }
  ];
  const blocoRecorr = [
    { label: 'Recorrentes', value: formatCurrency(r.recorrentes) },
    { label: 'Nº de faturas', value: r.count.toString() }
  ];
  const blocoFluxo = [
    { label: 'Entradas (mês)', value: formatCurrency(fluxo.entradas) },
    { label: 'Saídas (mês)', value: formatCurrency(fluxo.saidas) },
    { label: 'Saldo do mês', value: formatCurrency(fluxo.saldoMes) }
  ];

  const renderCards = (cards: { label: string; value: string; }[]) => cards.map(c => `
    <div class="summary-card">
      <div class="label">${c.label}</div>
      <div class="value">${c.value}</div>
    </div>
  `).join('');

  container.innerHTML = `
    <div class="summary-block">
      <div class="summary-title">Totais do mês (despesas)</div>
      <div class="summary-grid">${renderCards(blocoTotais)}</div>
    </div>
    <div class="summary-block">
      <div class="summary-title">Recorrência e contagem</div>
      <div class="summary-grid">${renderCards(blocoRecorr)}</div>
    </div>
    <div class="summary-block">
      <div class="summary-title">Fluxo de caixa do mês</div>
      <div class="summary-grid">${renderCards(blocoFluxo)}</div>
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
      maintainAspectRatio: false,
      layout: { padding: 8 },
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true } }
    }
  });
}

function renderChartReceitas(receitas: any[]) {
  const ctx = document.getElementById('chartReceitas') as HTMLCanvasElement | null;
  if (!ctx) return;
  const map: Record<string, number> = {};
  receitas.forEach(r => {
    if (!r.categoria) return;
    map[r.categoria] = (map[r.categoria] || 0) + Number(r.valor || 0);
  });
  const labels = Object.keys(map);
  const data = labels.map(l => map[l]);
  if (chartReceitasInstance) {
    chartReceitasInstance.destroy();
    chartReceitasInstance = null;
  }
  if (labels.length === 0) {
    const context = ctx.getContext('2d');
    if (context) context.clearRect(0, 0, ctx.width, ctx.height);
    return;
  }
  chartReceitasInstance = new (window as any).Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        label: 'Receitas por categoria',
        data,
        backgroundColor: ['#22c55e', '#0ea5e9', '#f59e0b', '#f43f5e', '#a855f7', '#14b8a6']
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: 8 },
      cutout: '58%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: { boxWidth: 12, font: { size: 12 } }
        }
      }
    }
  });
}


async function editarReceita(id: number) {
  try {
    const resp = await fetch(`${API_RECEITAS}/${id}`);
    if (!resp.ok) throw new Error('Receita não encontrada');
    const r = await resp.json();
    await carregarEventosSelect();
    setActiveSection('receitas');
    toggleSection('formularioReceita', true);
    setValue('tituloReceita', r.titulo || '');
    setValue('categoriaReceita', r.categoria || '');
    setValue('estadoReceita', r.estado || 'Previsto');
    setValue('financiadorReceita', r.financiador || '');
    setValue('valorReceita', r.valor?.toString() || '');
    setValue('dataReceita', (r.data || '').slice(0, 10));
    setValue('observacoesReceita', r.observacoes || '');
    if (r.eventoId) setValue('eventoReceita', String(r.eventoId)); else setValue('eventoReceita', '');
    editingReceitaId = id;
    const btn = document.getElementById('btnSalvarReceita') as HTMLButtonElement | null;
    if (btn) btn.textContent = '💾 Guardar Alterações';
    document.getElementById('formularioReceita')?.scrollIntoView({ behavior: 'smooth' });
  } catch {
    showNotification('❌ Erro ao carregar receita para edição', 'error');
  }
}

async function removerReceita(id: number) {
  if (!confirm('Tem a certeza que deseja remover esta receita?')) return;
  try {
    const resp = await fetch(`${API_RECEITAS}/${id}`, { method: 'DELETE' });
    if (!resp.ok) throw new Error('Erro ao remover receita');
    showNotification('Receita removida com sucesso!', 'success');
    await Promise.all([carregarReceitas(), carregarMovimentos()]);
  } catch {
    showNotification('❌ Erro ao remover receita', 'error');
  }
}

async function editarFatura(id: number) {
  try {
    const resp = await fetch(`${API_FATURAS}/${id}`);
    if (!resp.ok) throw new Error('Fatura não encontrada');
    const f = await resp.json();
    await carregarEventosSelect();
    setActiveSection('faturas');
    toggleSection('formularioFatura', true);
    setValue('nomeFatura', f.titulo || '');
    setValue('valorFatura', f.valor?.toString() || '');
    setValue('dataFatura', (f.data || '').slice(0, 10));
    setValue('departamento', f.departamento || '');
    setValue('numeroFatura', f.numero || '');
    setValue('estadoFatura', f.estado || 'Pendente');
    setValue('observacoesFatura', f.descricao || '');
    setValue('tipoFatura', f.tipo || 'Fatura');
    if (f.eventoId) setValue('eventoFatura', String(f.eventoId)); else setValue('eventoFatura', '');
    editingFaturaId = id;
    const btn = document.getElementById('btnSalvarFatura') as HTMLButtonElement | null;
    if (btn) btn.textContent = '💾 Guardar Alterações';
    document.getElementById('formularioFatura')?.scrollIntoView({ behavior: 'smooth' });
  } catch {
    showNotification('❌ Erro ao carregar fatura para edição', 'error');
  }
}

async function removerFatura(id: number) {
  if (!confirm('Tem a certeza que deseja remover esta fatura?')) return;
  try {
    const resp = await fetch(`${API_FATURAS}/${id}`, { method: 'DELETE' });
    if (!resp.ok) throw new Error('Erro ao remover fatura');
    showNotification('Fatura removida com sucesso!', 'success');
    await Promise.all([carregarFaturas(), carregarEventosResumo(), carregarMovimentos()]);
  } catch {
    showNotification('❌ Erro ao remover fatura', 'error');
  }
}

function atualizarDashboards(faturas: any[], movimentos: any[] = movimentosCache, receitas: any[] = receitasCache) {
  renderDashboard(faturas, movimentos, receitas);
  renderDashboardAno(faturas);
  renderChartDepartamentos(faturas);
  renderChartReceitas(receitas);
}

async function init() {
  aplicarDepartamentosFiltro();
  aplicarCategoriasFiltroReceita();
  setupEventListeners();
  await Promise.all([carregarMovimentos(), carregarEventosSelect(), carregarEventosResumo()]);
  await Promise.all([carregarFaturas(), carregarReceitas()]);
  setActiveSection('resumo');
}

document.addEventListener('DOMContentLoaded', () => { void init(); });
