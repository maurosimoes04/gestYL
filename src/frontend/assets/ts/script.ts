// script.ts - Gestão de Faturas e Eventos

// --- Constantes e estado global ---
const API_BASE = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  ? 'http://localhost:3000'
  : 'https://gestor.younglink.net';
const API_EVENTOS = `${API_BASE}/eventos`;
const API_FATURAS = `${API_BASE}/faturas`;
const API_RECEITAS = `${API_BASE}/receitas`; 
const API_MOVIMENTOS = `${API_BASE}/movimentos`; 
const API_AUTH = `${API_BASE}/auth`; 
const API_INVENTARIO = `${API_BASE}/inventario`; 
const API_DEPARTAMENTOS = `${API_BASE}/departamentos`;
const RECEITA_CATEGORIAS = [
  'Quotas',
  'Patrocínios/Doações',
  'Cofinanciamentos',
  'Vendas/Serviços',
  'Reembolsos',
  'Outros'
];
let departamentosCache: string[] = [];

const SECTION_GROUPS: Record<string, string[]> = {
  resumo: ['dashboard', 'dashboardAno', 'insights'],
  faturas: ['acoesRapidas', 'faturas'],
  receitas: ['acoesRapidasReceitas', 'receitas'],
  eventos: ['eventos'],
  inventario: ['acoesRapidasInventario', 'inventario']
};

let chartInstance: any = null;
let chartReceitasInstance: any = null;
let chartComparativoInstance: any = null;
let chartTopDeptInstance: any = null;
let chartForecastInstance: any = null;
let editingEventoId: number | null = null;
let editingFaturaId: number | null = null;
let editingReceitaId: number | null = null;
let editingInventarioId: number | null = null;
let eventosCache: any[] = [];
let faturasCache: any[] = [];
let receitasCache: any[] = [];
let movimentosCache: any[] = [];
let inventarioCache: any[] = [];
let authToken = localStorage.getItem('authToken') || '';
let authRole: 'admin' | 'direcao' | 'fiscal' | '' = (localStorage.getItem('authRole') as any) || '';
let isAuthenticated = false;
let listenersBound = false;

const nativeFetch = window.fetch.bind(window);
(window as any).fetch = (input: RequestInfo | URL, init: RequestInit = {}) => {
  const headers = new Headers(init.headers || {});
  if (authToken) headers.set('Authorization', `Bearer ${authToken}`);
  const nextInit = { ...init, headers } as RequestInit;
  return nativeFetch(input, nextInit).then((resp) => {
    if (resp.status === 401 && isAuthenticated) handleLogout(false);
    return resp;
  });
};

function showAuthScreen() {
  window.location.href = '/login';
}

function hideAuthScreen() {
  // Nada a fazer — já estamos na página correta
}

function setAuthToken(token: string) {
  authToken = token;
  localStorage.setItem('authToken', token);
}

function setAuthRole(role: 'admin' | 'direcao' | 'fiscal') {
  authRole = role;
  localStorage.setItem('authRole', role);
}

function updateAuthUI() {
  const btnLogout = document.getElementById('btnLogout');
  if (btnLogout) {
    if (isAuthenticated) btnLogout.removeAttribute('hidden');
    else btnLogout.setAttribute('hidden', 'true');
  }
  const hasWrite = authRole === 'direcao' || authRole === 'admin';
  const writeButtons = [
    'btnEscolherEvento', 'btnEscolherFatura', 'qaNovaFatura', 'qaNovoEvento',
    'qaNovoEventoReceitas', 'qaNovaReceita', 'btnNovaReceita', 'qaNovoInventario'
  ];
  writeButtons.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (hasWrite) el.removeAttribute('hidden'); else el.setAttribute('hidden', 'true');
  });

  const readOnlyBanner = document.getElementById('readonlyBanner');
  if (readOnlyBanner) {
    if (isAuthenticated && isReadOnly()) readOnlyBanner.removeAttribute('hidden');
    else readOnlyBanner.setAttribute('hidden', 'true');
  }
}

function isReadOnly() {
  return authRole === 'fiscal';
}

async function handleLogin(e: SubmitEvent) {
  // Login é feito na página /login
  e.preventDefault();
}

function handleLogout(showMessage = true) {
  if (authToken) void fetch(`${API_AUTH}/logout`, { method: 'POST' });
  authToken = '';
  authRole = '' as any;
  isAuthenticated = false;
  localStorage.removeItem('authToken');
  localStorage.removeItem('authRole');
  window.location.href = '/login';
}

async function validateSession(): Promise<boolean> {
  if (!authToken) return false;
  try {
    const resp = await fetch(`${API_AUTH}/status`);
    if (!resp.ok) return false;
    const data = await resp.json();
    if (data.role) setAuthRole(data.role);
    return true;
  } catch {
    return false;
  }
}

function setupAuthUI() {
  const loginForm = document.getElementById('loginForm');
  if (loginForm) loginForm.addEventListener('submit', handleLogin);

  const logoutBtn = document.getElementById('btnLogout');
  if (logoutBtn) logoutBtn.addEventListener('click', () => handleLogout(true));
}

async function bootstrapAuth() {
  setupAuthUI();
  const valid = await validateSession();
  if (valid) {
    isAuthenticated = true;
    if (authRole === 'admin') {
      window.location.href = '/admin';
      return;
    }
    updateAuthUI();
    await startApp();
  } else {
    window.location.href = '/login';
  }
}

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

function monthShortLabel(dateObj: Date) {
  return `${monthName(dateObj.getMonth())}/${String(dateObj.getFullYear()).slice(-2)}`;
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

  if (authToken) params.append('token', authToken);

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
  toggleSection('formularioInventario', false);
}

function setActiveNav(target: string) {
  document.querySelectorAll('.main-nav .nav-link').forEach(link => {
    link.classList.toggle('active', (link as HTMLElement).dataset.target === target);
  });
}

function setActiveSection(target: 'resumo' | 'faturas' | 'receitas' | 'eventos' | 'inventario') {
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

// --- Departamentos: carregar da API ---
async function carregarDepartamentos() {
  try {
    const resp = await fetch(API_DEPARTAMENTOS);
    const deps = await resp.json();
    departamentosCache = (deps as any[]).filter((d: any) => d.ativo).map((d: any) => d.nome);

    // Preencher selects de departamento
    const selects = ['departamento', 'eventoDepartamento', 'filterDepartamento'];
    selects.forEach(id => {
      const select = document.getElementById(id) as HTMLSelectElement | null;
      if (!select) return;
      const current = select.value;
      const placeholder = id === 'filterDepartamento' ? '🏢 Todos' : 'Selecionar...';
      select.innerHTML = `<option value="">${placeholder}</option>`;
      departamentosCache.forEach(dep => {
        const opt = document.createElement('option');
        opt.value = dep;
        opt.textContent = dep;
        select.appendChild(opt);
      });
      if (current) select.value = current;
    });
  } catch {}
}

// --- Eventos: carregar, criar, editar e remover ---
async function carregarEventosSelect() {
  try {
    const resp = await fetch(API_EVENTOS);
    eventosCache = await resp.json();
    const selectFatura = document.getElementById('eventoFatura') as HTMLSelectElement | null;
    const selectReceita = document.getElementById('eventoReceita') as HTMLSelectElement | null;
    const selectFiltroReceita = document.getElementById('filterReceitaEvento') as HTMLSelectElement | null;
    const selectFiltroDespesa = document.getElementById('filterEvento') as HTMLSelectElement | null;
    const optsList = eventosCache
      .map((ev: any) => `<option value="${ev.id}">${ev.nome}</option>`)
      .join('');
    const opts = '<option value="">Nenhum evento</option>' + optsList;
    const optsFilter = '<option value="">🎉 Todos os eventos</option>' + optsList;
    if (selectFatura) selectFatura.innerHTML = opts;
    if (selectReceita) selectReceita.innerHTML = opts;
    if (selectFiltroReceita) selectFiltroReceita.innerHTML = optsFilter;
    if (selectFiltroDespesa) selectFiltroDespesa.innerHTML = optsFilter;
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
  if (isReadOnly()) { showNotification('Sem permissões para remover eventos.', 'error'); return; }
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
  if (isReadOnly()) { showNotification('Sem permissões para alterar eventos.', 'error'); return; }
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
    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      throw new Error(errData.details || errData.error || 'Erro ao guardar evento');
    }
    showNotification(editingEventoId ? 'Evento atualizado com sucesso!' : 'Evento criado com sucesso!', 'success');
    resetForm('eventoForm');
    toggleSection('formularioEvento', false);
    editingEventoId = null;
    const btn = document.getElementById('eventoSubmitButton') as HTMLButtonElement | null;
    if (btn) btn.textContent = '💾 Guardar';
    await Promise.all([carregarEventosResumo(), carregarEventosSelect()]);
  } catch (err: any) {
    showNotification(`❌ ${err.message || 'Erro ao guardar evento'}`, 'error');
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
      const actions = isReadOnly() ? '' : `
        <div class="evento-actions">
          <button class="btn-editar-evento" data-id="${ev.id}" title="Editar evento">✏️ Editar</button>
          <button class="btn-remover-evento" data-id="${ev.id}" title="Remover evento">🗑️ Remover</button>
        </div>`;
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
        ${actions}
      </div>`;
    }).join('');
    if (!isReadOnly()) {
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
    }
  } catch {
    eventosLista.innerHTML = '<p>Erro ao carregar eventos.</p>';
  }
}
(window as any).carregarEventosResumo = carregarEventosResumo;

// --- Faturas: carregar e criar ---
function aplicarDepartamentosFiltro() {
  // Departamentos são carregados dinamicamente via carregarDepartamentos()
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

function atualizarSelectFaturaInventario() {
  const select = document.getElementById('invFatura') as HTMLSelectElement | null;
  if (!select) return;
  const current = select.value;
  select.innerHTML = '<option value="">Sem associação</option>';
  faturasCache.forEach((f: any) => {
    const label = f.numero ? `${f.numero} — ${f.titulo || 'Fatura'}` : (f.titulo || `Fatura #${f.id}`);
    const opt = document.createElement('option');
    opt.value = String(f.id);
    opt.textContent = label;
    select.appendChild(opt);
  });
  if (current) select.value = current;
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
  const eventoId = getValue('filterEvento');
  if (from) params.append('dateFrom', from);
  if (to) params.append('dateTo', to);
  if (q) params.append('q', q);
  if (departamento) params.append('departamento', departamento);
  if (estado) params.append('estado', estado);
  if (eventoId) params.append('eventoId', eventoId);

  try {
    const resp = await fetch(`${API_FATURAS}?${params.toString()}`);
    if (!resp.ok) throw new Error('Erro ao listar faturas');
    faturasCache = await resp.json();
    if (!Array.isArray(faturasCache) || faturasCache.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10">Nenhuma fatura encontrada.</td></tr>';
      atualizarDashboards([], movimentosCache, receitasCache);
      atualizarSelectFaturaInventario();
      return;
    }
    tbody.innerHTML = faturasCache.map((f: any) => {
      const eventoNome = eventosCache.find((ev: any) => ev.id === f.eventoId)?.nome || '-';
      const anexoLink = f.anexo?.driveWebViewLink
        ? f.anexo.driveWebViewLink
        : (f.anexo ? `/faturas/${f.id}/anexo${authToken ? `?token=${authToken}` : ''}` : '');
      const actions = isReadOnly()
        ? '-'
        : `<button class="btn-acao btn-editar-fatura" data-id="${f.id}" title="Editar">✏️</button>
           <button class="btn-acao btn-remover-fatura" data-id="${f.id}" title="Remover">🗑️</button>`;
      return `<tr>
        <td>${f.titulo || '-'}</td>
        <td>${f.tipo || 'Fatura'}</td>
        <td>${f.numero || '-'}</td>
        <td>${formatCurrency(f.valor)}</td>
        <td>${formatDate(f.data)}</td>
        <td>${f.departamento || '-'}</td>
        <td>${eventoNome}</td>
        <td>${f.estado || '-'}</td>
        <td>${anexoLink ? `<a href="${anexoLink}" target="_blank">Abrir</a>` : '-'}</td>
        <td class="table-actions">${actions}</td>
      </tr>`;
    }).join('');
    if (!isReadOnly()) {
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
    }
    atualizarDashboards(faturasCache, movimentosCache, receitasCache);
    atualizarSelectFaturaInventario();
  } catch {
    tbody.innerHTML = '<tr><td colspan="10">Erro ao carregar faturas.</td></tr>';
    atualizarDashboards([], movimentosCache, receitasCache);
    atualizarSelectFaturaInventario();
  }
}

async function guardarFatura(e: SubmitEvent) {
  e.preventDefault();
  if (isReadOnly()) { showNotification('Sem permissões para alterar despesas.', 'error'); return; }
  const titulo = getValue('nomeFatura').trim();
  const valor = parseFloat(getValue('valorFatura'));
  const data = getValue('dataFatura');
  const departamento = getValue('departamento');
  if (!titulo || !data || !departamento || Number.isNaN(valor)) {
    showNotification('Preencha todos os campos obrigatórios da fatura.', 'error');
    return;
  }
  const eventoIdStr = getValue('eventoFatura');
  const formData = new FormData();
  formData.append('titulo', titulo);
  formData.append('valor', String(valor));
  formData.append('data', data);
  formData.append('departamento', departamento);
  formData.append('tipo', 'Fatura');
  formData.append('numero', getValue('numeroFatura').trim());
  formData.append('estado', getValue('estadoFatura') || 'Pendente');
  formData.append('descricao', getValue('observacoesFatura').trim());
  if (eventoIdStr) formData.append('eventoId', eventoIdStr);

  const anexoInput = document.getElementById('anexoFatura') as HTMLInputElement | null;
  const anexoFile = anexoInput?.files?.[0];
  if (anexoFile) formData.append('anexo', anexoFile);

  const url = editingFaturaId ? `${API_FATURAS}/${editingFaturaId}` : API_FATURAS;
  const method = editingFaturaId ? 'PUT' : 'POST';

  try {
    const resp = await fetch(url, {
      method,
      body: formData
    });
    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      throw new Error(errData.details || errData.erro || 'Erro ao guardar fatura');
    }
    const result = await resp.json();
    showNotification(editingFaturaId ? 'Fatura atualizada com sucesso!' : 'Fatura criada com sucesso!', 'success');
    if (result._warnings?.length) {
      result._warnings.forEach((w: string) => showNotification(`⚠️ ${w}`, 'error'));
    }
    resetForm('faturaForm');
    toggleSection('formularioFatura', false);
    editingFaturaId = null;
    const btn = document.getElementById('btnSalvarFatura') as HTMLButtonElement | null;
    if (btn) btn.textContent = '💾 Guardar';
    await Promise.all([carregarFaturas(), carregarEventosResumo(), carregarMovimentos()]);
  } catch (err: any) {
    showNotification(`❌ ${err.message || 'Erro ao guardar fatura'}`, 'error');
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
      tbody.innerHTML = '<tr><td colspan="10">Nenhuma receita encontrada.</td></tr>';
      atualizarDashboards(faturasCache, movimentosCache, receitasCache);
      return;
    }
    tbody.innerHTML = receitasCache.map((r: any) => {
      const eventoNome = eventosCache.find((ev: any) => ev.id === r.eventoId)?.nome || '-';
      const anexoLink = r.anexo?.driveWebViewLink
        ? r.anexo.driveWebViewLink
        : (r.anexo ? `/receitas/${r.id}/anexo${authToken ? `?token=${authToken}` : ''}` : '');
      const actions = isReadOnly()
        ? '-'
        : `<button class="btn-acao btn-editar-receita" data-id="${r.id}" title="Editar">✏️</button>
           <button class="btn-acao btn-remover-receita" data-id="${r.id}" title="Remover">🗑️</button>`;
      return `<tr>
        <td>${r.titulo || '-'}</td>
        <td>${r.categoria || '-'}</td>
        <td>${r.estado || '-'}</td>
        <td>${r.financiador || '-'}</td>
        <td>${eventoNome}</td>
        <td>${formatCurrency(r.valor)}</td>
        <td>${formatDate(r.data)}</td>
        <td>${r.observacoes || '-'}</td>
        <td>${anexoLink ? `<a href="${anexoLink}" target="_blank">Abrir</a>` : '-'}</td>
        <td class="table-actions">${actions}</td>
      </tr>`;
    }).join('');
    if (!isReadOnly()) {
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
    }
    atualizarDashboards(faturasCache, movimentosCache, receitasCache);
  } catch {
    tbody.innerHTML = '<tr><td colspan="10">Erro ao carregar receitas.</td></tr>';
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
  if (isReadOnly()) { showNotification('Sem permissões para alterar receitas.', 'error'); return; }
  const valor = parseFloat(getValue('valorReceita'));
  const titulo = getValue('tituloReceita').trim();
  const categoria = getValue('categoriaReceita');
  const data = getValue('dataReceita');
  if (!titulo || !categoria || !data || Number.isNaN(valor)) {
    showNotification('Preencha os campos obrigatórios da receita.', 'error');
    return;
  }

  const formData = new FormData();
  formData.append('titulo', titulo);
  formData.append('categoria', categoria);
  formData.append('estado', getValue('estadoReceita') || 'Previsto');
  formData.append('financiador', getValue('financiadorReceita').trim());
  formData.append('valor', String(valor));
  formData.append('data', data);
  formData.append('observacoes', getValue('observacoesReceita').trim());

  const eventoIdStr = getValue('eventoReceita');
  if (eventoIdStr) formData.append('eventoId', eventoIdStr);

  const anexoInput = document.getElementById('anexoReceita') as HTMLInputElement | null;
  const anexoFile = anexoInput?.files?.[0];
  if (anexoFile) formData.append('anexo', anexoFile);

  const url = editingReceitaId ? `${API_RECEITAS}/${editingReceitaId}` : API_RECEITAS;
  const method = editingReceitaId ? 'PUT' : 'POST';

  try {
    const resp = await fetch(url, {
      method,
      body: formData
    });
    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      throw new Error(errData.details || errData.error || 'Erro ao guardar receita');
    }
    const result = await resp.json();
    showNotification(editingReceitaId ? 'Receita atualizada com sucesso!' : 'Receita criada com sucesso!', 'success');
    if (result._warnings?.length) {
      result._warnings.forEach((w: string) => showNotification(`⚠️ ${w}`, 'error'));
    }
    resetForm('receitaForm');
    toggleSection('formularioReceita', false);
    editingReceitaId = null;
    const btn = document.getElementById('btnSalvarReceita') as HTMLButtonElement | null;
    if (btn) btn.textContent = '💾 Guardar';
    await Promise.all([carregarReceitas(), carregarMovimentos()]);
  } catch (err: any) {
    showNotification(`❌ ${err.message || 'Erro ao guardar receita'}`, 'error');
  }
}

// --- Inventário ---
async function carregarInventario() {
  const tbodyConsumivel = document.getElementById('tabelaInventarioConsumivel');
  const tbodyFixo = document.getElementById('tabelaInventarioFixo');
  if (!tbodyConsumivel || !tbodyFixo) return;

  const params = new URLSearchParams();
  const tipo = getValue('filterInvTipo');
  const q = getValue('filterInvQ');
  if (tipo) params.append('tipo', tipo);
  if (q) params.append('q', q);
  const url = params.toString() ? `${API_INVENTARIO}?${params.toString()}` : API_INVENTARIO;

  const renderTabela = (items: any[], tbody: HTMLElement, emptyMsg: string) => {
    if (!items || items.length === 0) {
      tbody.innerHTML = `<tr><td colspan="11">${emptyMsg}</td></tr>`;
      return;
    }
    tbody.innerHTML = items.map((item: any) => {
      const low = item.quantidadeMinima && item.quantidade < item.quantidadeMinima;
      const actions = isReadOnly()
        ? '-'
        : `<button class="btn-acao btn-editar-inv" data-id="${item.id}" title="Editar">✏️</button>
           <button class="btn-acao btn-remover-inv" data-id="${item.id}" title="Remover">🗑️</button>`;
      const faturaNome = faturasCache.find((f: any) => f.id === item.faturaId)?.numero || faturasCache.find((f: any) => f.id === item.faturaId)?.titulo || '-';
      return `<tr>
        <td>${item.tipo || '-'}</td>
        <td>${item.nome || '-'}</td>
        <td>${item.categoria || '-'}</td>
        <td class="${low ? 'low-stock' : ''}">${item.quantidade ?? '-'}</td>
        <td>${item.unidade || '-'}</td>
        <td>${item.localizacao || '-'}</td>
        <td>${formatDate(item.dataValidade)}</td>
        <td>${item.estado || '-'}</td>
        <td>${item.custoUnitario ? formatCurrency(item.custoUnitario) : '-'}</td>
        <td>${faturaNome || '-'}</td>
        <td class="table-actions">${actions}</td>
      </tr>`;
    }).join('');

    if (!isReadOnly()) {
      tbody.querySelectorAll('.btn-editar-inv').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const id = (e.currentTarget as HTMLElement).getAttribute('data-id');
          if (id) editarInventario(parseInt(id, 10));
        });
      });
      tbody.querySelectorAll('.btn-remover-inv').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const id = (e.currentTarget as HTMLElement).getAttribute('data-id');
          if (id) removerInventario(parseInt(id, 10));
        });
      });
    }
  };

  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error('Erro ao listar inventário');
    inventarioCache = await resp.json();
    const consumiveis = Array.isArray(inventarioCache) ? inventarioCache.filter((i: any) => i.tipo === 'consumivel') : [];
    const fixos = Array.isArray(inventarioCache) ? inventarioCache.filter((i: any) => i.tipo === 'fixo') : [];

    renderTabela(consumiveis, tbodyConsumivel, 'Nenhum item consumível encontrado.');
    renderTabela(fixos, tbodyFixo, 'Nenhum item fixo encontrado.');
  } catch {
    inventarioCache = [];
    tbodyConsumivel.innerHTML = '<tr><td colspan="11">Erro ao carregar inventário.</td></tr>';
    tbodyFixo.innerHTML = '<tr><td colspan="11">Erro ao carregar inventário.</td></tr>';
  }
}

async function exportarInventarioPdf() {
  try {
    const resp = await fetch(`${API_INVENTARIO}/export/pdf`);
    if (!resp.ok) throw new Error('Erro no download');
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'inventario.pdf';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch {
    showNotification('Erro ao exportar PDF do inventário.', 'error');
  }
}

async function editarInventario(id: number) {
  try {
    const item = inventarioCache.find((i: any) => i.id === id) || await (await fetch(`${API_INVENTARIO}/${id}`)).json();
    if (!item) throw new Error('Item não encontrado');
    setActiveSection('inventario');
    toggleSection('formularioInventario', true);
    atualizarSelectFaturaInventario();
    setValue('invTipo', item.tipo || '');
    setValue('invNome', item.nome || '');
    setValue('invCategoria', item.categoria || '');
    setValue('invQuantidade', item.quantidade?.toString() || '');
    setValue('invUnidade', item.unidade || '');
    setValue('invLocalizacao', item.localizacao || '');
    setValue('invEstado', item.estado || '');
    setValue('invCusto', item.custoUnitario?.toString() || '');
    if (item.faturaId) setValue('invFatura', String(item.faturaId)); else setValue('invFatura', '');
    setValue('invDataAquisicao', (item.dataAquisicao || '').slice(0, 10));
    setValue('invDataValidade', (item.dataValidade || '').slice(0, 10));
    setValue('invNotas', item.notas || '');
    editingInventarioId = id;
  } catch {
    showNotification('❌ Erro ao carregar item', 'error');
  }
}

async function removerInventario(id: number) {
  if (!confirm('Remover este item?')) return;
  if (isReadOnly()) { showNotification('Sem permissões para remover itens.', 'error'); return; }
  try {
    const resp = await fetch(`${API_INVENTARIO}/${id}`, { method: 'DELETE' });
    if (!resp.ok) throw new Error('Erro ao remover');
    showNotification('Item removido com sucesso!', 'success');
    await carregarInventario();
  } catch {
    showNotification('❌ Erro ao remover item', 'error');
  }
}

async function guardarInventario(e: SubmitEvent) {
  e.preventDefault();
  if (isReadOnly()) { showNotification('Sem permissões para alterar inventário.', 'error'); return; }
  const payload: any = {
    tipo: getValue('invTipo'),
    nome: getValue('invNome').trim(),
    categoria: getValue('invCategoria').trim() || undefined,
    quantidade: parseFloat(getValue('invQuantidade') || '0'),
    unidade: getValue('invUnidade').trim() || undefined,
    localizacao: getValue('invLocalizacao').trim() || undefined,
    estado: getValue('invEstado').trim() || undefined,
    custoUnitario: getValue('invCusto') ? parseFloat(getValue('invCusto')) : undefined,
    faturaId: getValue('invFatura') || undefined,
    dataAquisicao: getValue('invDataAquisicao') || undefined,
    dataValidade: getValue('invDataValidade') || undefined,
    notas: getValue('invNotas').trim() || undefined
  };

  if (!payload.tipo || !payload.nome) {
    showNotification('Tipo e nome são obrigatórios.', 'error');
    return;
  }

  const url = editingInventarioId ? `${API_INVENTARIO}/${editingInventarioId}` : API_INVENTARIO;
  const method = editingInventarioId ? 'PUT' : 'POST';

  try {
    const resp = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!resp.ok) throw new Error('Erro ao guardar item');
    showNotification(editingInventarioId ? 'Item atualizado com sucesso!' : 'Item criado com sucesso!', 'success');
    resetForm('inventarioForm');
    toggleSection('formularioInventario', false);
    editingInventarioId = null;
    await carregarInventario();
  } catch {
    showNotification('❌ Erro ao guardar item', 'error');
  }
}

// --- Inicialização ---
function setupEventListeners() {
  if (listenersBound) return;
  listenersBound = true;

  setupExportRelatorio();
  const btnNovoEvento = document.getElementById('btnEscolherEvento');
  if (btnNovoEvento) {
    btnNovoEvento.addEventListener('click', () => {
      if (isReadOnly()) { showNotification('Sem permissões para criar eventos.', 'error'); return; }
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
      if (isReadOnly()) { showNotification('Sem permissões para criar eventos.', 'error'); return; }
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
      if (isReadOnly()) { showNotification('Sem permissões para criar despesas.', 'error'); return; }
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
      if (isReadOnly()) { showNotification('Sem permissões para criar despesas.', 'error'); return; }
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
      if (isReadOnly()) { showNotification('Sem permissões para criar eventos.', 'error'); return; }
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
      if (isReadOnly()) { showNotification('Sem permissões para criar receitas.', 'error'); return; }
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
      if (isReadOnly()) { showNotification('Sem permissões para criar receitas.', 'error'); return; }
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

  const btnCancelarInventario = document.getElementById('btnCancelarInventario');
  if (btnCancelarInventario) {
    btnCancelarInventario.addEventListener('click', () => {
      toggleSection('formularioInventario', false);
      resetForm('inventarioForm');
      editingInventarioId = null;
    });
  }

  const inventarioForm = document.getElementById('inventarioForm');
  if (inventarioForm) inventarioForm.addEventListener('submit', guardarInventario);

  const btnAplicarFiltrosInv = document.getElementById('btnAplicarFiltrosInv');
  if (btnAplicarFiltrosInv) btnAplicarFiltrosInv.addEventListener('click', () => carregarInventario());

  const qaNovoInventario = document.getElementById('qaNovoInventario');
  if (qaNovoInventario) {
    qaNovoInventario.addEventListener('click', () => {
      if (isReadOnly()) { showNotification('Sem permissões para criar itens.', 'error'); return; }
      setActiveSection('inventario');
      resetForm('inventarioForm');
      toggleSection('formularioInventario', true);
      editingInventarioId = null;
      document.getElementById('formularioInventario')?.scrollIntoView({ behavior: 'smooth' });
    });
  }

  const qaExportInventario = document.getElementById('qaExportInventario');
  if (qaExportInventario) {
    qaExportInventario.addEventListener('click', () => {
      void exportarInventarioPdf();
    });
  }

  document.querySelectorAll('.main-nav .nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const target = (e.currentTarget as HTMLElement).dataset.target as 'resumo' | 'faturas' | 'receitas' | 'eventos' | 'inventario' | undefined;
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

function calcularResumoAno(faturas: any[], receitas: any[]) {
  const ano = new Date().getFullYear();
  const despesasMes = new Array(12).fill(0);
  const receitasMes = new Array(12).fill(0);

  faturas.forEach(f => {
    const d = new Date(f.data);
    if (d.getFullYear() === ano) despesasMes[d.getMonth()] += Number(f.valor || 0);
  });

  receitas.forEach(r => {
    const d = new Date(r.data);
    if (d.getFullYear() === ano) receitasMes[d.getMonth()] += Number(r.valor || 0);
  });

  return despesasMes.map((desp, idx) => {
    const rec = receitasMes[idx];
    const saldo = rec - desp;
    return { mes: monthName(idx), desp, rec, saldo };
  });
}

function renderDashboardAno(faturas: any[], receitas: any[]) {
  const container = document.getElementById('dashboardAnoContent');
  if (!container) return;
  const dados = calcularResumoAno(faturas, receitas);
  const temDados = dados.some(d => d.desp > 0 || d.rec > 0);
  if (!temDados) {
    container.innerHTML = '<p class="text-muted">Ainda sem dados para este ano.</p>';
    return;
  }
  const renderCards = (lista: { mes: string; desp: number; rec: number; saldo: number; }[]) => lista.map(d => `
    <div class="summary-card summary-card-ano">
      <div class="label">${d.mes}</div>
      <div class="ano-metrics">
        <div class="ano-metric"><span>Despesas</span><strong>${formatCurrency(d.desp)}</strong></div>
        <div class="ano-metric"><span>Receitas</span><strong>${formatCurrency(d.rec)}</strong></div>
        <div class="ano-metric ${d.saldo >= 0 ? 'saldo-positivo' : 'saldo-negativo'}"><span>Saldo</span><strong>${formatCurrency(d.saldo)}</strong></div>
      </div>
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

function getLast12Months() {
  const months: { label: string; year: number; month: number; }[] = [];
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ label: monthShortLabel(d), year: d.getFullYear(), month: d.getMonth() });
  }
  return months;
}

function renderChartComparativo(faturas: any[], receitas: any[]) {
  const ctx = document.getElementById('chartComparativo') as HTMLCanvasElement | null;
  if (!ctx) return;
  const months = getLast12Months();
  const despesas = months.map(m => {
    return faturas
      .filter((f: any) => {
        const d = new Date(f.data);
        return d.getFullYear() === m.year && d.getMonth() === m.month;
      })
      .reduce((s: number, f: any) => s + Number(f.valor || 0), 0);
  });
  const recs = months.map(m => {
    return receitas
      .filter((r: any) => {
        const d = new Date(r.data);
        return d.getFullYear() === m.year && d.getMonth() === m.month;
      })
      .reduce((s: number, r: any) => s + Number(r.valor || 0), 0);
  });

  if (chartComparativoInstance) chartComparativoInstance.destroy();
  chartComparativoInstance = new (window as any).Chart(ctx, {
    type: 'bar',
    data: {
      labels: months.map(m => m.label),
      datasets: [
        { label: 'Despesas', data: despesas, backgroundColor: '#ef4444' },
        { label: 'Receitas', data: recs, backgroundColor: '#22c55e' }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom' } },
      scales: { y: { beginAtZero: true } }
    }
  });
}

function renderChartTopDept(faturas: any[]) {
  const ctx = document.getElementById('chartTopDept') as HTMLCanvasElement | null;
  if (!ctx) return;
  const map: Record<string, number> = {};
  faturas.forEach((f: any) => {
    if (!f.departamento) return;
    map[f.departamento] = (map[f.departamento] || 0) + Number(f.valor || 0);
  });
  const sorted = Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const labels = sorted.map(([dep]) => dep);
  const data = sorted.map(([, val]) => val as number);
  if (chartTopDeptInstance) chartTopDeptInstance.destroy();
  chartTopDeptInstance = new (window as any).Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{ label: 'Despesas', data, backgroundColor: '#3b82f6' }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { x: { beginAtZero: true } }
    }
  });
}

function renderChartForecast(faturas: any[], receitas: any[]) {
  const ctx = document.getElementById('chartForecast') as HTMLCanvasElement | null;
  if (!ctx) return;
  const months = getLast12Months();
  const net = months.map(m => {
    const desp = faturas
      .filter((f: any) => {
        const d = new Date(f.data);
        return d.getFullYear() === m.year && d.getMonth() === m.month;
      })
      .reduce((s: number, f: any) => s + Number(f.valor || 0), 0);
    const rec = receitas
      .filter((r: any) => {
        const d = new Date(r.data);
        return d.getFullYear() === m.year && d.getMonth() === m.month;
      })
      .reduce((s: number, r: any) => s + Number(r.valor || 0), 0);
    return rec - desp;
  });

  const actualLabels = months.slice(-6);
  const actualNet = net.slice(-6);

  const windowSize = 3;
  const forecastPoints: number[] = [];
  const last6 = net.slice(-6);
  for (let i = 0; i < 3; i++) {
    const start = Math.max(0, last6.length - windowSize + i);
    const windowVals = last6.slice(start, start + windowSize);
    const avg = windowVals.reduce((s, v) => s + v, 0) / (windowVals.length || 1);
    forecastPoints.push(avg);
    last6.push(avg);
  }

  const forecastLabels = [] as string[];
  const base = months[months.length - 1];
  for (let i = 1; i <= 3; i++) {
    const d = new Date(base.year, base.month + i, 1);
    forecastLabels.push(monthShortLabel(d));
  }

  if (chartForecastInstance) chartForecastInstance.destroy();
  chartForecastInstance = new (window as any).Chart(ctx, {
    type: 'line',
    data: {
      labels: [...actualLabels.map(l => l.label), ...forecastLabels],
      datasets: [
        {
          label: 'Saldo mensal',
          data: [...actualNet, ...Array(forecastPoints.length).fill(null)],
          borderColor: '#2563eb',
          backgroundColor: 'rgba(37,99,235,0.15)',
          tension: 0.25,
          spanGaps: true
        },
        {
          label: 'Previsão (média móvel)',
          data: [...Array(actualNet.length).fill(null), ...forecastPoints],
          borderColor: '#f59e0b',
          backgroundColor: 'rgba(245,158,11,0.2)',
          borderDash: [6, 6],
          tension: 0.25,
          spanGaps: true
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom' } },
      scales: { y: { beginAtZero: false } }
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
  if (isReadOnly()) { showNotification('Sem permissões para remover receitas.', 'error'); return; }
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
  if (isReadOnly()) { showNotification('Sem permissões para remover despesas.', 'error'); return; }
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
  renderDashboardAno(faturas, receitas);
  renderChartDepartamentos(faturas);
  renderChartReceitas(receitas);
  renderChartComparativo(faturas, receitas);
  renderChartTopDept(faturas);
  renderChartForecast(faturas, receitas);
}

async function startApp() {
  await carregarDepartamentos();
  aplicarDepartamentosFiltro();
  aplicarCategoriasFiltroReceita();
  setupEventListeners();
  await Promise.all([carregarMovimentos(), carregarEventosSelect(), carregarEventosResumo(), carregarInventario()]);
  await Promise.all([carregarFaturas(), carregarReceitas()]);
  atualizarSelectFaturaInventario();
  setActiveSection('resumo');
}

document.addEventListener('DOMContentLoaded', () => { void bootstrapAuth(); });
