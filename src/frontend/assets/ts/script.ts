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
const API_SHARES = `${API_BASE}/shares`;
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
let removeFaturaAnexo = false;
let removeReceitaAnexo = false;
let editingInventarioId: number | null = null;
let sharingEventoId: number | null = null;
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
  form?.querySelectorAll('.file-drop').forEach(drop => {
    drop.classList.remove('has-file');
    const preview = drop.querySelector('.file-drop-preview') as HTMLElement | null;
    if (preview) preview.setAttribute('hidden', 'true');
  });
}
function showNotification(message: string, type: 'success' | 'error' = 'success') {
  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  const iconSpan = document.createElement('span');
  iconSpan.className = 'notification-icon';
  iconSpan.textContent = type === 'success' ? '✓' : '✗';
  const msgSpan = document.createElement('span');
  msgSpan.className = 'notification-message';
  msgSpan.textContent = message;
  notification.appendChild(iconSpan);
  notification.appendChild(msgSpan);
  document.body.appendChild(notification);
  setTimeout(() => {
    notification.style.animation = 'slideIn 0.3s ease reverse';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

function showLoading(message: string = 'Carregando...') {
  let overlay = document.getElementById('loadingOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'loadingOverlay';
    overlay.className = 'loading-overlay';
    document.body.appendChild(overlay);
  }
  const box = document.createElement('div');
  box.className = 'loading-box';
  const spinner = document.createElement('div');
  spinner.className = 'loader-spinner';
  const p = document.createElement('p');
  p.textContent = message;
  box.appendChild(spinner);
  box.appendChild(p);
  overlay.innerHTML = '';
  overlay.appendChild(box);
  overlay.classList.remove('hidden');
}

function hideLoading() {
  const overlay = document.getElementById('loadingOverlay');
  if (overlay) overlay.classList.add('hidden');
}

function showSkeleton(containerId: string, count: number = 3) {
  const container = document.getElementById(containerId);
  if (!container) return;
  let html = '';
  for (let i = 0; i < count; i++) {
    html += `
      <div class="skeleton-row">
        <div class="skeleton" style="flex: 2; height: 16px;"></div>
        <div class="skeleton" style="width: 80px; height: 16px;"></div>
        <div class="skeleton" style="width: 60px; height: 16px;"></div>
      </div>
    `;
  }
  container.innerHTML = html;
}

function showLoadingInContainer(containerId: string) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = `
    <div class="loading-container">
      <div class="loader-spinner sm"></div>
      <span>Carregando...</span>
    </div>
  `;
}
function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

const ICONS: Record<string, string> = {
  edit: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>',
  trash: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>',
  search: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>',
  share: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" x2="12" y1="2" y2="15"/></svg>',
  plus: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>',
  download: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>',
  file: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/></svg>',
};

function icon(name: string): string {
  return ICONS[name] || '';
}

function estadoBadge(estado: string | null): string {
  if (!estado) return '';
  const s = estado.toLowerCase();
  let cls = 'status-badge';
  if (s === 'paga' || s === 'recebido') cls += ' status-ok';
  else if (s === 'pendente' || s === 'previsto') cls += ' status-pending';
  else cls += ' status-default';
  return `<span class="${cls}">${escapeHtml(estado)}</span>`;
}

const PAGE_SIZE = 15;
let faturaPage = 0;
let receitaPage = 0;

function renderPagination(containerId: string, total: number, currentPage: number, onPageChange: (page: number) => void) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  if (totalPages <= 1) { container.innerHTML = ''; return; }
  container.innerHTML = `
    <button class="pagination-prev" ${currentPage === 0 ? 'disabled' : ''}>← Anterior</button>
    <span class="pagination-info">Página ${currentPage + 1} de ${totalPages} (${total} registos)</span>
    <button class="pagination-next" ${currentPage >= totalPages - 1 ? 'disabled' : ''}>Seguinte →</button>
  `;
  container.querySelector('.pagination-prev')?.addEventListener('click', () => { if (currentPage > 0) onPageChange(currentPage - 1); });
  container.querySelector('.pagination-next')?.addEventListener('click', () => { if (currentPage < totalPages - 1) onPageChange(currentPage + 1); });
}

function paginate<T>(items: T[], page: number): T[] {
  return items.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
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

async function handleExportRelatorio(e: Event) {
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
  try {
    const resp = await fetch(url, { headers: { 'Authorization': `Bearer ${authToken}` } });
    if (!resp.ok) throw new Error('Erro ao gerar PDF');
    const blob = await resp.blob();
    const blobUrl = URL.createObjectURL(blob);
    window.open(blobUrl, '_blank');
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
  } catch { showNotification('Erro ao exportar relatório', 'error'); }
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

const loadedSections = new Set<string>();

function setActiveSection(target: 'resumo' | 'faturas' | 'receitas' | 'eventos' | 'inventario') {
  hideForms();
  const showSet = new Set(SECTION_GROUPS[target]);
  Object.values(SECTION_GROUPS).flat().forEach(id => {
    toggleSection(id, showSet.has(id));
  });
  setActiveNav(target);
  const firstId = SECTION_GROUPS[target][0];
  document.getElementById(firstId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  lazyLoadSection(target);
}

async function lazyLoadSection(target: string) {
  if (loadedSections.has(target)) return;
  loadedSections.add(target);
  switch (target) {
    case 'resumo':
      await Promise.all([carregarFaturas(), carregarReceitas(), carregarMovimentos()]);
      break;
    case 'faturas':
      if (!faturasCache.length) await carregarFaturas();
      break;
    case 'receitas':
      if (!receitasCache.length) await carregarReceitas();
      break;
    case 'eventos':
      await carregarEventosResumo();
      break;
    case 'inventario':
      if (!inventarioCache.length) await carregarInventario();
      break;
  }
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
      const placeholder = id === 'filterDepartamento' ? 'Todos os departamentos' : 'Selecionar...';
      select.innerHTML = `<option value="">${placeholder}</option>`;
      departamentosCache.forEach(dep => {
        const opt = document.createElement('option');
        opt.value = dep;
        opt.textContent = dep;
        select.appendChild(opt);
      });
      if (current) select.value = current;
    });
  } catch {
    console.warn('Erro ao carregar departamentos');
  }
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
    const optsFilter = '<option value="">Todos os eventos</option>' + optsList;
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
    if (btn) btn.textContent = 'Guardar Alterações';
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
  const btn = document.getElementById('eventoSubmitButton') as HTMLButtonElement | null;

  if (btn) {
    btn.classList.add('loading');
    btn.disabled = true;
  }

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
    if (btn) {
      btn.textContent = 'Guardar';
      btn.classList.remove('loading');
      btn.disabled = false;
    }
    await Promise.all([carregarEventosResumo(), carregarEventosSelect()]);
  } catch (err: any) {
    showNotification(`❌ ${err.message || 'Erro ao guardar evento'}`, 'error');
    if (btn) {
      btn.classList.remove('loading');
      btn.disabled = false;
    }
  }
}

async function carregarEventosResumo() {
  const eventosLista = document.getElementById('eventosLista');
  if (!eventosLista) return;
  showLoadingInContainer('eventosLista');
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
      const actions = isReadOnly() ? `
        <div class="evento-actions">
          <button class="btn-detalhe-evento" data-id="${ev.id}" title="Ver detalhes">${icon('search')} Detalhes</button>
        </div>` : `
        <div class="evento-actions">
          <button class="btn-detalhe-evento" data-id="${ev.id}" title="Ver detalhes">${icon('search')} Detalhes</button>
          <button class="btn-partilhar-evento" data-id="${ev.id}" title="Partilhar evento">${icon('share')} Partilhar</button>
          <button class="btn-editar-evento" data-id="${ev.id}" title="Editar evento">${icon('edit')} Editar</button>
          <button class="btn-remover-evento" data-id="${ev.id}" title="Remover evento">${icon('trash')} Remover</button>
        </div>`;
      const total = receitaTotal + gasto;
      const receitaPct = total > 0 ? Math.round((receitaTotal / total) * 100) : 50;
      const saldoClass = saldo >= 0 ? 'saldo-positivo' : 'saldo-negativo';
      return `<div class="evento-card" data-evento-id="${ev.id}">
        <div class="evento-head">
          <div>
            <div class="evento-title">${escapeHtml(ev.nome)}</div>
            <div class="evento-dates">${escapeHtml(intervalo)}</div>
          </div>
          ${ev.departamento ? `<div class="evento-dept">${escapeHtml(ev.departamento)}</div>` : ''}
        </div>
        ${ev.descricao ? `<p class="evento-desc">${escapeHtml(ev.descricao)}</p>` : ''}
        <div class="evento-financeiro">
          <div class="evento-fin-row">
            <div class="evento-fin-item"><span class="evento-fin-label">Receitas</span><span class="evento-fin-value receita-color">${formatCurrency(receitaTotal)}</span><span class="evento-fin-count">${numReceitas} registo(s)</span></div>
            <div class="evento-fin-item"><span class="evento-fin-label">Despesas</span><span class="evento-fin-value despesa-color">${formatCurrency(gasto)}</span><span class="evento-fin-count">${numFaturas} registo(s)</span></div>
          </div>
          <div class="evento-progress-bar"><div class="evento-progress-fill" style="width:${receitaPct}%"></div></div>
          <div class="evento-saldo ${saldoClass}"><span>Saldo</span><strong>${formatCurrency(saldo)}</strong></div>
        </div>
        ${actions}
      </div>`;
    }).join('');
    // Botão detalhes (sempre visível)
    eventosLista.querySelectorAll('.btn-detalhe-evento').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = (e.currentTarget as HTMLElement).getAttribute('data-id');
        if (id) abrirDetalheEvento(parseInt(id));
      });
    });
    if (!isReadOnly()) {
      eventosLista.querySelectorAll('.btn-partilhar-evento').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const id = (e.currentTarget as HTMLElement).getAttribute('data-id');
          if (id) abrirPartilhaEvento(parseInt(id));
        });
      });
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

// --- Detalhes Evento ---
async function abrirDetalheEvento(id: number) {
  try {
    const resp = await fetch(`${API_EVENTOS}/${id}/details`);
    if (!resp.ok) throw new Error('Erro ao obter detalhes');
    const { evento, faturas, receitas, resumo } = await resp.json();

    (document.getElementById('eventoDetailTitle') as HTMLElement).textContent = evento.nome;
    (document.getElementById('eventoDetailDesc') as HTMLElement).textContent = evento.descricao || '';
    const deptEl = document.getElementById('eventoDetailDept') as HTMLElement;
    deptEl.textContent = evento.departamento || '';

    // Dashboard
    const dash = document.getElementById('eventoDetailDashboard') as HTMLElement;
    const saldoClass = resumo.saldo >= 0 ? 'color:#16a34a' : 'color:#dc2626';
    dash.innerHTML = `
      <div class="summary-card"><div class="label">Receitas</div><div class="value" style="color:#16a34a">${formatCurrency(resumo.totalReceitas)}</div></div>
      <div class="summary-card"><div class="label">Despesas</div><div class="value" style="color:#dc2626">${formatCurrency(resumo.totalDespesas)}</div></div>
      <div class="summary-card"><div class="label">Saldo</div><div class="value" style="${saldoClass}">${formatCurrency(resumo.saldo)}</div></div>
    `;

    // Receitas
    const recTbody = document.getElementById('eventoDetailReceitas') as HTMLElement;
    recTbody.innerHTML = receitas.length
      ? receitas.map((r: any) => `<tr><td>${r.titulo}</td><td>${r.categoria}</td><td>${formatDate(r.data)}</td><td>${formatCurrency(r.valor)}</td></tr>`).join('')
      : '<tr><td colspan="4">Sem receitas associadas.</td></tr>';

    // Faturas
    const fatTbody = document.getElementById('eventoDetailFaturas') as HTMLElement;
    fatTbody.innerHTML = faturas.length
      ? faturas.map((f: any) => `<tr><td>${f.titulo}</td><td>${f.departamento}</td><td>${formatDate(f.data)}</td><td>${formatCurrency(f.valor)}</td></tr>`).join('')
      : '<tr><td colspan="4">Sem despesas associadas.</td></tr>';

    // PDF button
    const pdfBtn = document.getElementById('eventoDetailPdf') as HTMLButtonElement;
    pdfBtn.onclick = async () => {
      try {
        const resp = await fetch(`${API_EVENTOS}/${id}/pdf`, { headers: { 'Authorization': `Bearer ${authToken}` } });
        if (!resp.ok) throw new Error();
        const blob = await resp.blob();
        const blobUrl = URL.createObjectURL(blob);
        window.open(blobUrl, '_blank');
        setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
      } catch { showNotification('Erro ao gerar PDF do evento', 'error'); }
    };

    // Show modal
    const modal = document.getElementById('eventoDetailModal') as HTMLElement;
    modal.removeAttribute('hidden');
  } catch {
    showNotification('❌ Erro ao carregar detalhes do evento', 'error');
  }
}

function fecharDetalheEvento() {
  const modal = document.getElementById('eventoDetailModal') as HTMLElement;
  modal.setAttribute('hidden', 'true');
}

function abrirPartilhaEvento(id: number) {
  if (isReadOnly()) { showNotification('Sem permissões para partilhar eventos.', 'error'); return; }
  const modal = document.getElementById('shareEventoModal') as HTMLElement | null;
  if (!modal) return;
  const evento = eventosCache.find((ev: any) => ev.id === id);
  const title = document.getElementById('shareEventoTitle');
  if (title) title.textContent = `Partilhar Evento${evento?.nome ? `: ${evento.nome}` : ''}`;
  const idField = document.getElementById('shareEventoId') as HTMLInputElement | null;
  if (idField) idField.value = String(id);
  sharingEventoId = id;
  setValue('shareEventoDestinatario', '');
  setValue('shareEventoJustificacao', '');
  setValue('shareEventoDias', '30');
  const result = document.getElementById('shareEventoResult');
  if (result) result.setAttribute('hidden', 'true');
  const linkWrap = document.getElementById('shareEventoLinkWrap');
  if (linkWrap) linkWrap.setAttribute('hidden', 'true');
  const passWrap = document.getElementById('shareEventoPassWrap');
  if (passWrap) passWrap.setAttribute('hidden', 'true');
  modal.removeAttribute('hidden');
}

function fecharPartilhaEvento() {
  const modal = document.getElementById('shareEventoModal') as HTMLElement | null;
  if (modal) modal.setAttribute('hidden', 'true');
  sharingEventoId = null;
}

function setPartilhaMensagem(msg: string, type: 'success' | 'error') {
  const result = document.getElementById('shareEventoResult');
  if (!result) return;
  result.textContent = msg;
  result.className = `form-msg ${type}`;
  result.removeAttribute('hidden');
}

async function gerarPartilhaEvento(e: SubmitEvent) {
  e.preventDefault();
  if (isReadOnly()) { showNotification('Sem permissões para partilhar eventos.', 'error'); return; }
  const eventoId = sharingEventoId || Number(getValue('shareEventoId'));
  if (!eventoId) { setPartilhaMensagem('Evento inválido.', 'error'); return; }
  const destinatario = getValue('shareEventoDestinatario').trim();
  const justificacao = getValue('shareEventoJustificacao').trim();
  const dias = parseInt(getValue('shareEventoDias') || '30', 10);

  if (!justificacao) { setPartilhaMensagem('Justificação é obrigatória.', 'error'); return; }

  const btn = document.getElementById('btnGerarPartilha') as HTMLButtonElement | null;
  if (btn) {
    btn.classList.add('loading');
    btn.disabled = true;
  }

  try {
    const resp = await fetch(API_SHARES, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventoId, destinatario, justificacao, expiresInDays: dias })
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data.error || 'Erro ao criar partilha');

    const linkWrap = document.getElementById('shareEventoLinkWrap');
    const linkInput = document.getElementById('shareEventoLink') as HTMLInputElement | null;
    if (linkWrap) linkWrap.removeAttribute('hidden');
    if (linkInput) linkInput.value = data.link || '';
    const passWrap = document.getElementById('shareEventoPassWrap');
    const passInput = document.getElementById('shareEventoPass') as HTMLInputElement | null;
    if (passWrap) passWrap.removeAttribute('hidden');
    if (passInput) passInput.value = data.password || '';
    setPartilhaMensagem('Link gerado com sucesso.', 'success');
    if (btn) {
      btn.classList.remove('loading');
      btn.disabled = false;
    }
  } catch (err: any) {
    setPartilhaMensagem(err.message || 'Erro ao criar partilha.', 'error');
    if (btn) {
      btn.classList.remove('loading');
      btn.disabled = false;
    }
  }
}

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

  showSkeleton('listaFaturas', 5);
  try {
    const resp = await fetch(`${API_FATURAS}?${params.toString()}`);
    if (!resp.ok) throw new Error('Erro ao listar faturas');
    faturasCache = await resp.json();
    faturaPage = 0;
    renderFaturasPage();
    atualizarDashboards(faturasCache, movimentosCache, receitasCache);
    atualizarSelectFaturaInventario();
  } catch {
    const container = document.getElementById('listaFaturas');
    if (container) container.innerHTML = '<p class="text-muted">Erro ao carregar despesas.</p>';
    atualizarDashboards([], movimentosCache, receitasCache);
    atualizarSelectFaturaInventario();
  }
}

function renderFaturasPage() {
  const container = document.getElementById('listaFaturas');
  if (!container) return;
  if (!Array.isArray(faturasCache) || faturasCache.length === 0) {
    container.innerHTML = '<p class="text-muted">Nenhuma despesa encontrada.</p>';
    renderPagination('faturasPagination', 0, 0, () => {});
    return;
  }
  const page = paginate(faturasCache, faturaPage);
  container.innerHTML = page.map((f: any) => {
    const eventoNome = eventosCache.find((ev: any) => ev.id === f.eventoId)?.nome || '';
    const anexoLink = f.anexo ? `/faturas/${f.id}/anexo` : '';
    const actions = isReadOnly() ? '' : `
      <div class="record-actions">
        <button class="btn-acao btn-editar-fatura" data-id="${f.id}" title="Editar">${icon('edit')}</button>
        <button class="btn-acao btn-remover-fatura" data-id="${f.id}" title="Remover">${icon('trash')}</button>
      </div>`;
    return `<div class="record-row">
      <div class="record-main">
        <div class="record-title">${escapeHtml(f.titulo || '-')}</div>
        <div class="record-meta">
          <span>${escapeHtml(f.tipo || 'Fatura')}</span>
          ${f.numero ? `<span>Nº ${escapeHtml(f.numero)}</span>` : ''}
          <span>${escapeHtml(f.departamento || '-')}</span>
          ${eventoNome ? `<span class="record-tag">${escapeHtml(eventoNome)}</span>` : ''}
        </div>
      </div>
      <div class="record-details">
        <div class="record-amount despesa-color">${formatCurrency(f.valor)}</div>
        <div class="record-date">${formatDate(f.data)}</div>
        ${estadoBadge(f.estado)}
        ${anexoLink ? `<a href="${escapeHtml(anexoLink)}" target="_blank" class="record-anexo">${icon('file')}</a>` : ''}
      </div>
      ${actions}
    </div>`;
  }).join('');
  if (!isReadOnly()) {
    container.querySelectorAll('.btn-editar-fatura').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = (e.currentTarget as HTMLElement).getAttribute('data-id');
        if (id) editarFatura(parseInt(id, 10));
      });
    });
    container.querySelectorAll('.btn-remover-fatura').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = (e.currentTarget as HTMLElement).getAttribute('data-id');
        if (id) removerFatura(parseInt(id, 10));
      });
    });
  }
  renderPagination('faturasPagination', faturasCache.length, faturaPage, (p) => { faturaPage = p; renderFaturasPage(); });
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
  if (removeFaturaAnexo && !anexoFile) formData.append('removeAnexo', 'true');

  const url = editingFaturaId ? `${API_FATURAS}/${editingFaturaId}` : API_FATURAS;
  const method = editingFaturaId ? 'PUT' : 'POST';
  const btn = document.getElementById('btnSalvarFatura') as HTMLButtonElement | null;
  const overlay = document.getElementById('faturaLoadingOverlay');

  if (btn) { btn.classList.add('loading'); btn.disabled = true; }
  if (overlay) { overlay.removeAttribute('hidden'); }

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
    removeFaturaAnexo = false;
    if (btn) { btn.textContent = 'Guardar'; btn.classList.remove('loading'); btn.disabled = false; }
    if (overlay) { overlay.setAttribute('hidden', 'true'); }
    await Promise.all([carregarFaturas(), carregarEventosResumo(), carregarMovimentos()]);
  } catch (err: any) {
    showNotification(`${err.message || 'Erro ao guardar fatura'}`, 'error');
    if (btn) { btn.classList.remove('loading'); btn.disabled = false; }
    if (overlay) { overlay.setAttribute('hidden', 'true'); }
  }
}

// --- Receitas: carregar e criar ---
async function carregarReceitas() {
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

  showSkeleton('listaReceitas', 5);
  try {
    const url = params.toString() ? `${API_RECEITAS}?${params.toString()}` : API_RECEITAS;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error('Erro ao listar receitas');
    receitasCache = await resp.json();
    receitaPage = 0;
    renderReceitasPage();
    atualizarDashboards(faturasCache, movimentosCache, receitasCache);
  } catch {
    const container = document.getElementById('listaReceitas');
    if (container) container.innerHTML = '<p class="text-muted">Erro ao carregar receitas.</p>';
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

function renderReceitasPage() {
  const container = document.getElementById('listaReceitas');
  if (!container) return;
  if (!Array.isArray(receitasCache) || receitasCache.length === 0) {
    container.innerHTML = '<p class="text-muted">Nenhuma receita encontrada.</p>';
    renderPagination('receitasPagination', 0, 0, () => {});
    return;
  }
  const page = paginate(receitasCache, receitaPage);
  container.innerHTML = page.map((r: any) => {
    const eventoNome = eventosCache.find((ev: any) => ev.id === r.eventoId)?.nome || '';
    const anexoLink = r.anexo ? `/receitas/${r.id}/anexo` : '';
    const actions = isReadOnly() ? '' : `
      <div class="record-actions">
        <button class="btn-acao btn-editar-receita" data-id="${r.id}" title="Editar">${icon('edit')}</button>
        <button class="btn-acao btn-remover-receita" data-id="${r.id}" title="Remover">${icon('trash')}</button>
      </div>`;
    return `<div class="record-row">
      <div class="record-main">
        <div class="record-title">${escapeHtml(r.titulo || '-')}</div>
        <div class="record-meta">
          <span>${escapeHtml(r.categoria || '-')}</span>
          ${r.financiador ? `<span>${escapeHtml(r.financiador)}</span>` : ''}
          ${eventoNome ? `<span class="record-tag">${escapeHtml(eventoNome)}</span>` : ''}
        </div>
        ${r.observacoes ? `<div class="record-notes">${escapeHtml(r.observacoes)}</div>` : ''}
      </div>
      <div class="record-details">
        <div class="record-amount receita-color">${formatCurrency(r.valor)}</div>
        <div class="record-date">${formatDate(r.data)}</div>
        ${estadoBadge(r.estado)}
        ${anexoLink ? `<a href="${escapeHtml(anexoLink)}" target="_blank" class="record-anexo">${icon('file')}</a>` : ''}
      </div>
      ${actions}
    </div>`;
  }).join('');
  if (!isReadOnly()) {
    container.querySelectorAll('.btn-editar-receita').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = (e.currentTarget as HTMLElement).getAttribute('data-id');
        if (id) editarReceita(parseInt(id, 10));
      });
    });
    container.querySelectorAll('.btn-remover-receita').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = (e.currentTarget as HTMLElement).getAttribute('data-id');
        if (id) removerReceita(parseInt(id, 10));
      });
    });
  }
  renderPagination('receitasPagination', receitasCache.length, receitaPage, (p) => { receitaPage = p; renderReceitasPage(); });
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
  if (removeReceitaAnexo && !anexoFile) formData.append('removeAnexo', 'true');

  const url = editingReceitaId ? `${API_RECEITAS}/${editingReceitaId}` : API_RECEITAS;
  const method = editingReceitaId ? 'PUT' : 'POST';
  const btn = document.getElementById('btnSalvarReceita') as HTMLButtonElement | null;
  const overlay = document.getElementById('receitaLoadingOverlay');

  if (btn) { btn.classList.add('loading'); btn.disabled = true; }
  if (overlay) { overlay.removeAttribute('hidden'); }

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
    removeReceitaAnexo = false;
    if (btn) { btn.textContent = 'Guardar'; btn.classList.remove('loading'); btn.disabled = false; }
    if (overlay) { overlay.setAttribute('hidden', 'true'); }
    await Promise.all([carregarReceitas(), carregarMovimentos()]);
  } catch (err: any) {
    showNotification(`${err.message || 'Erro ao guardar receita'}`, 'error');
    if (btn) { btn.classList.remove('loading'); btn.disabled = false; }
    if (overlay) { overlay.setAttribute('hidden', 'true'); }
  }
}

// --- Inventário ---
function renderInvEstadoBadge(estado: string | null): string {
  if (!estado) return '';
  const s = estado.toLowerCase();
  let cls = 'inv-badge';
  if (s === 'ativo' || s === 'bom' || s === 'novo') cls += ' inv-badge-ok';
  else if (s === 'manutenção' || s === 'avariado' || s === 'danificado') cls += ' inv-badge-warn';
  else if (s === 'abatido' || s === 'expirado') cls += ' inv-badge-danger';
  return `<span class="${cls}">${escapeHtml(estado)}</span>`;
}

function renderInvGrid(items: any[], container: HTMLElement, emptyMsg: string) {
  if (!items || items.length === 0) {
    container.innerHTML = `<p class="text-muted">${emptyMsg}</p>`;
    return;
  }
  container.innerHTML = items.map((item: any) => {
    const low = item.quantidadeMinima && item.quantidade < item.quantidadeMinima;
    const stockClass = low ? 'inv-stock-low' : 'inv-stock-ok';
    const qtdDisplay = item.quantidade != null ? `${item.quantidade}${item.unidade ? ' ' + escapeHtml(item.unidade) : ''}` : '-';
    const actions = isReadOnly() ? '' : `
      <div class="inv-card-actions">
        <button class="btn-acao btn-editar-inv" data-id="${item.id}" title="Editar">${icon('edit')}</button>
        <button class="btn-acao btn-remover-inv" data-id="${item.id}" title="Remover">${icon('trash')}</button>
      </div>`;
    const validade = item.dataValidade ? formatDate(item.dataValidade) : null;
    const now = new Date();
    const expiring = item.dataValidade && new Date(item.dataValidade) < new Date(now.getTime() + 30 * 86400000);
    return `<div class="inv-card">
      <div class="inv-card-head">
        <div class="inv-card-name">${escapeHtml(item.nome)}</div>
        ${actions}
      </div>
      <div class="inv-card-meta">
        ${item.categoria ? `<span class="inv-tag">${escapeHtml(item.categoria)}</span>` : ''}
        ${renderInvEstadoBadge(item.estado)}
      </div>
      <div class="inv-card-body">
        <div class="inv-card-stat">
          <span class="inv-stat-label">Quantidade</span>
          <span class="inv-stat-value ${stockClass}">${qtdDisplay}</span>
          ${low ? '<span class="inv-stock-alert">Stock baixo</span>' : ''}
        </div>
        ${item.custoUnitario ? `<div class="inv-card-stat"><span class="inv-stat-label">Custo unit.</span><span class="inv-stat-value">${formatCurrency(item.custoUnitario)}</span></div>` : ''}
        ${item.localizacao ? `<div class="inv-card-stat"><span class="inv-stat-label">Localização</span><span class="inv-stat-value">${escapeHtml(item.localizacao)}</span></div>` : ''}
        ${validade ? `<div class="inv-card-stat"><span class="inv-stat-label">Validade</span><span class="inv-stat-value ${expiring ? 'inv-expiring' : ''}">${validade}</span></div>` : ''}
      </div>
    </div>`;
  }).join('');

  if (!isReadOnly()) {
    container.querySelectorAll('.btn-editar-inv').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = (e.currentTarget as HTMLElement).getAttribute('data-id');
        if (id) editarInventario(parseInt(id, 10));
      });
    });
    container.querySelectorAll('.btn-remover-inv').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = (e.currentTarget as HTMLElement).getAttribute('data-id');
        if (id) removerInventario(parseInt(id, 10));
      });
    });
  }
}

async function carregarInventario() {
  const gridConsumivel = document.getElementById('invGridConsumivel');
  const gridFixo = document.getElementById('invGridFixo');
  if (!gridConsumivel || !gridFixo) return;

  const params = new URLSearchParams();
  const q = getValue('filterInvQ');
  if (q) params.append('q', q);
  const url = params.toString() ? `${API_INVENTARIO}?${params.toString()}` : API_INVENTARIO;

  showLoadingInContainer('invGridConsumivel');
  showLoadingInContainer('invGridFixo');

  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error('Erro ao listar inventário');
    inventarioCache = await resp.json();
    const consumiveis = Array.isArray(inventarioCache) ? inventarioCache.filter((i: any) => i.tipo === 'consumivel') : [];
    const fixos = Array.isArray(inventarioCache) ? inventarioCache.filter((i: any) => i.tipo === 'fixo') : [];

    renderInvGrid(consumiveis, gridConsumivel, 'Nenhum item consumível encontrado.');
    renderInvGrid(fixos, gridFixo, 'Nenhum item fixo encontrado.');
    const countCons = document.getElementById('invCountConsumivel');
    const countFix = document.getElementById('invCountFixo');
    if (countCons) countCons.textContent = `(${consumiveis.length})`;
    if (countFix) countFix.textContent = `(${fixos.length})`;
  } catch {
    inventarioCache = [];
    gridConsumivel.innerHTML = '<p class="text-muted">Erro ao carregar inventário.</p>';
    gridFixo.innerHTML = '<p class="text-muted">Erro ao carregar inventário.</p>';
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
  const btn = document.getElementById('btnSalvarInventario') as HTMLButtonElement | null;

  if (btn) {
    btn.classList.add('loading');
    btn.disabled = true;
  }

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
    if (btn) {
      btn.classList.remove('loading');
      btn.disabled = false;
    }
    await carregarInventario();
  } catch {
    showNotification('❌ Erro ao guardar item', 'error');
    if (btn) {
      btn.classList.remove('loading');
      btn.disabled = false;
    }
  }
}

// --- Inicialização ---
function setupFileDrop(dropId: string, inputId: string) {
  const drop = document.getElementById(dropId);
  const input = document.getElementById(inputId) as HTMLInputElement | null;
  if (!drop || !input) return;

  const content = drop.querySelector('.file-drop-content') as HTMLElement;
  const preview = drop.querySelector('.file-drop-preview') as HTMLElement;
  const nameEl = drop.querySelector('.file-drop-name') as HTMLElement;
  const removeBtn = drop.querySelector('.file-drop-remove') as HTMLElement;

  function showFile(file: File) {
    if (nameEl) nameEl.textContent = `${file.name} (${(file.size / 1024).toFixed(0)} KB)`;
    drop!.classList.add('has-file');
    if (preview) preview.removeAttribute('hidden');
  }

  function clearFile() {
    input!.value = '';
    drop!.classList.remove('has-file');
    if (preview) preview.setAttribute('hidden', 'true');
  }

  input.addEventListener('change', () => {
    if (input.files?.length) showFile(input.files[0]);
  });

  if (removeBtn) removeBtn.addEventListener('click', (e) => { e.stopPropagation(); clearFile(); });

  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('dragover'); });
  drop.addEventListener('dragleave', () => { drop.classList.remove('dragover'); });
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('dragover');
    const files = (e as DragEvent).dataTransfer?.files;
    if (files?.length) {
      const dt = new DataTransfer();
      dt.items.add(files[0]);
      input.files = dt.files;
      showFile(files[0]);
    }
  });
}

function setupEventListeners() {
  if (listenersBound) return;
  listenersBound = true;

  setupFileDrop('dropFatura', 'anexoFatura');
  setupFileDrop('dropReceita', 'anexoReceita');

  document.getElementById('existingAnexoFaturaReplace')?.addEventListener('click', () => {
    const existing = document.getElementById('existingAnexoFatura');
    const drop = document.getElementById('dropFatura');
    if (existing) existing.setAttribute('hidden', 'true');
    if (drop) drop.removeAttribute('hidden');
  });
  document.getElementById('existingAnexoFaturaRemove')?.addEventListener('click', () => {
    removeFaturaAnexo = true;
    const existing = document.getElementById('existingAnexoFatura');
    if (existing) existing.setAttribute('hidden', 'true');
    const drop = document.getElementById('dropFatura');
    if (drop) drop.removeAttribute('hidden');
  });
  document.getElementById('existingAnexoReceitaReplace')?.addEventListener('click', () => {
    const existing = document.getElementById('existingAnexoReceita');
    const drop = document.getElementById('dropReceita');
    if (existing) existing.setAttribute('hidden', 'true');
    if (drop) drop.removeAttribute('hidden');
  });
  document.getElementById('existingAnexoReceitaRemove')?.addEventListener('click', () => {
    removeReceitaAnexo = true;
    const existing = document.getElementById('existingAnexoReceita');
    if (existing) existing.setAttribute('hidden', 'true');
    const drop = document.getElementById('dropReceita');
    if (drop) drop.removeAttribute('hidden');
  });

  ['formularioFatura', 'formularioReceita', 'formularioEvento', 'formularioInventario'].forEach(id => {
    const modal = document.getElementById(id);
    if (modal) modal.addEventListener('click', (e) => {
      if (e.target === modal) toggleSection(id, false);
    });
  });

  // Modal detalhes evento
  document.getElementById('eventoDetailClose')?.addEventListener('click', fecharDetalheEvento);
  document.getElementById('eventoDetailCloseBtn')?.addEventListener('click', fecharDetalheEvento);
  document.getElementById('eventoDetailModal')?.addEventListener('click', (e) => {
    if (e.target === document.getElementById('eventoDetailModal')) fecharDetalheEvento();
  });

  // Modal partilha evento
  document.getElementById('shareEventoClose')?.addEventListener('click', fecharPartilhaEvento);
  document.getElementById('shareEventoCancel')?.addEventListener('click', fecharPartilhaEvento);
  document.getElementById('shareEventoModal')?.addEventListener('click', (e) => {
    if (e.target === document.getElementById('shareEventoModal')) fecharPartilhaEvento();
  });
  document.getElementById('shareEventoForm')?.addEventListener('submit', gerarPartilhaEvento as any);
  document.getElementById('shareEventoCopy')?.addEventListener('click', () => {
    const input = document.getElementById('shareEventoLink') as HTMLInputElement | null;
    if (!input?.value) return;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(input.value).then(() => {
        setPartilhaMensagem('Link copiado.', 'success');
      }).catch(() => {
        setPartilhaMensagem('Não foi possível copiar o link.', 'error');
      });
    } else {
      input.select();
      document.execCommand('copy');
      setPartilhaMensagem('Link copiado.', 'success');
    }
  });
  document.getElementById('shareEventoCopyPass')?.addEventListener('click', () => {
    const input = document.getElementById('shareEventoPass') as HTMLInputElement | null;
    if (!input?.value) return;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(input.value).then(() => {
        setPartilhaMensagem('Password copiada.', 'success');
      }).catch(() => {
        setPartilhaMensagem('Não foi possível copiar a password.', 'error');
      });
    } else {
      input.select();
      document.execCommand('copy');
      setPartilhaMensagem('Password copiada.', 'success');
    }
  });

  setupExportRelatorio();
  const btnNovoEvento = document.getElementById('btnEscolherEvento');
  if (btnNovoEvento) {
    btnNovoEvento.addEventListener('click', () => {
      if (isReadOnly()) { showNotification('Sem permissões para criar eventos.', 'error'); return; }
      setActiveSection('eventos');
      editingEventoId = null;
      resetForm('eventoForm');
      const btn = document.getElementById('eventoSubmitButton') as HTMLButtonElement | null;
      if (btn) btn.textContent = 'Guardar';
      toggleSection('formularioEvento', true);
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
      if (btn) btn.textContent = 'Guardar';
      toggleSection('formularioEvento', true);
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
      removeFaturaAnexo = false;
      const ea = document.getElementById('existingAnexoFatura');
      if (ea) ea.setAttribute('hidden', 'true');
      const df = document.getElementById('dropFatura');
      if (df) df.removeAttribute('hidden');
      const btn = document.getElementById('btnSalvarFatura') as HTMLButtonElement | null;
      if (btn) btn.textContent = 'Guardar';
      carregarEventosSelect();
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
      removeFaturaAnexo = false;
      const ea = document.getElementById('existingAnexoFatura');
      if (ea) ea.setAttribute('hidden', 'true');
      const df = document.getElementById('dropFatura');
      if (df) df.removeAttribute('hidden');
      const btn = document.getElementById('btnSalvarFatura') as HTMLButtonElement | null;
      if (btn) btn.textContent = 'Guardar';
      carregarEventosSelect();
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
      if (btn) btn.textContent = 'Guardar';
      toggleSection('formularioEvento', true);
    });
  }

  const btnCancelarFatura = document.getElementById('btnCancelarFatura');
  if (btnCancelarFatura) {
    btnCancelarFatura.addEventListener('click', () => {
      toggleSection('formularioFatura', false);
      resetForm('faturaForm');
      editingFaturaId = null;
      const btn = document.getElementById('btnSalvarFatura') as HTMLButtonElement | null;
      if (btn) btn.textContent = 'Guardar';
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
      removeReceitaAnexo = false;
      const ea = document.getElementById('existingAnexoReceita');
      if (ea) ea.setAttribute('hidden', 'true');
      const dr = document.getElementById('dropReceita');
      if (dr) dr.removeAttribute('hidden');
      const btn = document.getElementById('btnSalvarReceita') as HTMLButtonElement | null;
      if (btn) btn.textContent = 'Guardar';
      carregarEventosSelect();
    });
  }

  const btnCancelarReceita = document.getElementById('btnCancelarReceita');
  if (btnCancelarReceita) {
    btnCancelarReceita.addEventListener('click', () => {
      toggleSection('formularioReceita', false);
      resetForm('receitaForm');
      editingReceitaId = null;
      const btn = document.getElementById('btnSalvarReceita') as HTMLButtonElement | null;
      if (btn) btn.textContent = 'Guardar';
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
      removeReceitaAnexo = false;
      const ea = document.getElementById('existingAnexoReceita');
      if (ea) ea.setAttribute('hidden', 'true');
      const dr = document.getElementById('dropReceita');
      if (dr) dr.removeAttribute('hidden');
      const btn = document.getElementById('btnSalvarReceita') as HTMLButtonElement | null;
      if (btn) btn.textContent = 'Guardar';
      carregarEventosSelect();
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

  document.querySelectorAll('.inv-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.getAttribute('data-inv-tab');
      document.querySelectorAll('.inv-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      document.querySelectorAll('.inv-panel').forEach(p => (p as HTMLElement).setAttribute('hidden', 'true'));
      const panel = document.getElementById(`invPanel${target === 'consumivel' ? 'Consumivel' : 'Fixo'}`);
      if (panel) panel.removeAttribute('hidden');
    });
  });

  const qaNovoInventario = document.getElementById('qaNovoInventario');
  if (qaNovoInventario) {
    qaNovoInventario.addEventListener('click', () => {
      if (isReadOnly()) { showNotification('Sem permissões para criar itens.', 'error'); return; }
      setActiveSection('inventario');
      resetForm('inventarioForm');
      toggleSection('formularioInventario', true);
      editingInventarioId = null;
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
  const saldoClass = fluxo.saldoMes >= 0 ? 'kpi-positive' : 'kpi-negative';

  container.innerHTML = `
    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-label">Despesas do mês</div>
        <div class="kpi-value kpi-negative">${formatCurrency(r.total)}</div>
        <div class="kpi-detail">${r.count} fatura(s)</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Receitas do mês</div>
        <div class="kpi-value kpi-positive">${formatCurrency(fluxo.entradas)}</div>
      </div>
      <div class="kpi-card kpi-card-highlight ${saldoClass}-bg">
        <div class="kpi-label">Saldo do mês</div>
        <div class="kpi-value ${saldoClass}">${formatCurrency(fluxo.saldoMes)}</div>
      </div>
    </div>
    <div class="kpi-grid kpi-grid-secondary">
      <div class="kpi-card-sm">
        <div class="kpi-label">Pagas</div>
        <div class="kpi-value-sm">${formatCurrency(r.pagas)}</div>
      </div>
      <div class="kpi-card-sm">
        <div class="kpi-label">Pendentes</div>
        <div class="kpi-value-sm kpi-warning">${formatCurrency(r.pendentes)}</div>
      </div>
      <div class="kpi-card-sm">
        <div class="kpi-label">Recorrentes</div>
        <div class="kpi-value-sm">${formatCurrency(r.recorrentes)}</div>
      </div>
      <div class="kpi-card-sm">
        <div class="kpi-label">Saídas (mês)</div>
        <div class="kpi-value-sm">${formatCurrency(fluxo.saidas)}</div>
      </div>
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
  const maxVal = Math.max(...dados.map(d => Math.max(d.desp, d.rec)), 1);
  const renderRow = (d: { mes: string; desp: number; rec: number; saldo: number }) => {
    const despPct = Math.round((d.desp / maxVal) * 100);
    const recPct = Math.round((d.rec / maxVal) * 100);
    const saldoClass = d.saldo >= 0 ? 'kpi-positive' : 'kpi-negative';
    return `<div class="ano-row">
      <div class="ano-row-label">${d.mes}</div>
      <div class="ano-row-bars">
        <div class="ano-bar-track"><div class="ano-bar ano-bar-desp" style="width:${despPct}%"></div></div>
        <div class="ano-bar-track"><div class="ano-bar ano-bar-rec" style="width:${recPct}%"></div></div>
      </div>
      <div class="ano-row-values">
        <span class="kpi-negative">${formatCurrency(d.desp)}</span>
        <span class="kpi-positive">${formatCurrency(d.rec)}</span>
        <span class="${saldoClass}">${formatCurrency(d.saldo)}</span>
      </div>
    </div>`;
  };

  container.innerHTML = `
    <div class="ano-table">
      <div class="ano-header">
        <span>Mês</span><span></span><span class="kpi-negative">Despesas</span><span class="kpi-positive">Receitas</span><span>Saldo</span>
      </div>
      ${dados.map(renderRow).join('')}
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
        backgroundColor: 'rgba(37, 99, 235, 0.7)',
        borderRadius: 6,
        borderSkipped: false,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: 8 },
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, grid: { color: '#f1f5f9' } }, x: { grid: { display: false } } }
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
        { label: 'Despesas', data: despesas, backgroundColor: 'rgba(220, 38, 38, 0.65)', borderRadius: 4, borderSkipped: false },
        { label: 'Receitas', data: recs, backgroundColor: 'rgba(22, 163, 74, 0.65)', borderRadius: 4, borderSkipped: false }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, usePointStyle: true, pointStyle: 'circle' } } },
      scales: { y: { beginAtZero: true, grid: { color: '#f1f5f9' } }, x: { grid: { display: false } } }
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
      datasets: [{ label: 'Despesas', data, backgroundColor: 'rgba(37, 99, 235, 0.6)', borderRadius: 4, borderSkipped: false }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { x: { beginAtZero: true, grid: { color: '#f1f5f9' } }, y: { grid: { display: false } } }
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
    removeReceitaAnexo = false;
    const existingAnexo = document.getElementById('existingAnexoReceita');
    const existingLink = document.getElementById('existingAnexoReceitaLink') as HTMLAnchorElement | null;
    const dropReceita = document.getElementById('dropReceita');
    if (r.anexo && r.anexo.originalName) {
      if (existingLink) {
        existingLink.textContent = r.anexo.originalName;
        existingLink.href = `/receitas/${id}/anexo`;
      }
      if (existingAnexo) existingAnexo.removeAttribute('hidden');
      if (dropReceita) dropReceita.setAttribute('hidden', 'true');
    } else {
      if (existingAnexo) existingAnexo.setAttribute('hidden', 'true');
      if (dropReceita) dropReceita.removeAttribute('hidden');
    }
    const btn = document.getElementById('btnSalvarReceita') as HTMLButtonElement | null;
    if (btn) btn.textContent = 'Guardar Alterações';
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
    removeFaturaAnexo = false;
    const existingAnexo = document.getElementById('existingAnexoFatura');
    const existingLink = document.getElementById('existingAnexoFaturaLink') as HTMLAnchorElement | null;
    const dropFatura = document.getElementById('dropFatura');
    if (f.anexo && f.anexo.originalName) {
      if (existingLink) {
        existingLink.textContent = f.anexo.originalName;
        existingLink.href = `/faturas/${id}/anexo`;
      }
      if (existingAnexo) existingAnexo.removeAttribute('hidden');
      if (dropFatura) dropFatura.setAttribute('hidden', 'true');
    } else {
      if (existingAnexo) existingAnexo.setAttribute('hidden', 'true');
      if (dropFatura) dropFatura.removeAttribute('hidden');
    }
    const btn = document.getElementById('btnSalvarFatura') as HTMLButtonElement | null;
    if (btn) btn.textContent = 'Guardar Alterações';
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
  showLoading('Carregando aplicação...');
  setupEventListeners();
  setActiveSection('resumo');
  await Promise.all([carregarDepartamentos(), carregarEventosSelect()]);
  aplicarDepartamentosFiltro();
  aplicarCategoriasFiltroReceita();
  atualizarSelectFaturaInventario();
  hideLoading();
}

document.addEventListener('DOMContentLoaded', () => { void bootstrapAuth(); });
