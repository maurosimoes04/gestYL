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
  faturas: ['faturas'],
  receitas: ['receitas'],
  eventos: ['eventos'],
  ia: ['ia'],
  inventario: ['inventario'],
  tesouraria: ['tesouraria'],
  relatorios: ['relatorios']
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
let editingMovimentoId: number | null = null;
let movimentoPage = 0;
let sharingEventoId: number | null = null;
let eventosCache: any[] = [];
let faturasCache: any[] = [];      // TODAS as faturas (não filtradas) — resumo/dashboards/IA/selects
let receitasCache: any[] = [];     // TODAS as receitas (não filtradas)
let faturasListaCache: any[] = []; // faturas filtradas — apenas para a lista das Despesas
let receitasListaCache: any[] = [];// receitas filtradas — apenas para a lista das Receitas
let movimentosCache: any[] = [];
let inventarioCache: any[] = [];
let iaTipoAtual: 'faturas' | 'receitas' = 'faturas';
let iaFiltroAtual: 'todas' | 'validadas' | 'analise' | 'alertas' = 'todas';
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
    'qaNovoEventoReceitas', 'qaNovaReceita', 'btnNovaReceita', 'qaNovoInventario', 'btnBackfillIA'
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
async function openAnexo(url: string) {
  showPdfLoading('A abrir documento...');
  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error('Erro ao abrir anexo');
    const blob = await resp.blob();
    const blobUrl = URL.createObjectURL(blob);
    hidePdfLoading();
    window.open(blobUrl, '_blank');
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
  } catch {
    hidePdfLoading();
    showNotification('Erro ao abrir anexo', 'error');
  }
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
  chevronLeft: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>',
  chevronRight: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>',
  tag: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/></svg>',
};

function icon(name: string): string {
  return ICONS[name] || '';
}

function showPdfLoading(msg = 'A gerar PDF...') {
  let overlay = document.getElementById('pdfLoadingOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'pdfLoadingOverlay';
    overlay.className = 'pdf-loading-overlay';
    overlay.innerHTML = `
      <div class="pdf-loading-box">
        <div class="loader-spinner"></div>
        <h4 id="pdfLoadingTitle">${escapeHtml(msg)}</h4>
        <p id="pdfLoadingSubtitle">Aguarde um momento...</p>
        <div class="pdf-progress-track"><div class="pdf-progress-bar indeterminate" id="pdfProgressBar"></div></div>
      </div>
    `;
    document.body.appendChild(overlay);
  } else {
    (document.getElementById('pdfLoadingTitle') as HTMLElement).textContent = msg;
    overlay.style.display = 'flex';
  }
}

function hidePdfLoading() {
  const overlay = document.getElementById('pdfLoadingOverlay');
  if (overlay) overlay.style.display = 'none';
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

function isFaturaVencida(f: any): boolean {
  return f.estado === 'Pendente' && !!f.dataVencimento && new Date(f.dataVencimento) < new Date();
}

function vencidaBadge(f: any): string {
  return isFaturaVencida(f) ? '<span class="status-badge status-overdue">Vencida</span>' : '';
}

function renderAnaliseIA(item: any, tipo: 'fatura' | 'receita'): string {
  if (!item.anexo) return '';
  const btnClass = tipo === 'fatura' ? 'btn-reanalisar-fatura' : 'btn-reanalisar-receita';
  const reanalisarBtn = isReadOnly() ? '' : `<button type="button" class="ghost-action ${btnClass}" data-id="${item.id}">Reanalisar</button>`;
  if (!item.analiseIA) {
    const tentativas = item.analiseTentativas || 0;
    const label = tentativas >= 3 ? 'Não foi possível analisar (3 tentativas)' : `A analisar... (tentativa ${tentativas}/3)`;
    return `<div class="analise-ia"><span class="status-badge status-default">${label}</span>${reanalisarBtn}</div>`;
  }
  const validacaoManual = item.analiseIA.validacaoManual?.validada === true;
  if (validacaoManual) {
    return `<div class="analise-ia"><span class="status-badge status-ok">✓ Validada manualmente</span>${reanalisarBtn}</div>`;
  }
  const divergencias: string[] = item.analiseIA.divergencias || [];
  if (divergencias.length > 0) {
    const lista = divergencias.map((d: string) => `<div class="analise-divergencia">${escapeHtml(d)}</div>`).join('');
    return `<div class="analise-ia"><span class="status-badge status-overdue">⚠ ${divergencias.length} divergência(s)</span>${reanalisarBtn}${lista}</div>`;
  }
  return `<div class="analise-ia"><span class="status-badge status-ok">✓ Verificado</span>${reanalisarBtn}</div>`;
}

type IAItem = {
  id: number;
  tipo: 'fatura' | 'receita';
  titulo: string;
  subtitulo: string;
  data: string | null;
  valor: any;
  anexo: any;
  analiseIA: any;
  analiseTentativas?: number;
  estadoLabel: string;
  status: 'validadas' | 'analise' | 'alertas';
  statusLabel: string;
  manualValidada: boolean;
};

function getIAStatus(item: any): 'validadas' | 'analise' | 'alertas' {
  const manualValidada = item.analiseIA?.validacaoManual?.validada === true;
  if (manualValidada) return 'validadas';
  if (!item.analiseIA) {
    return (item.analiseTentativas || 0) >= 3 ? 'alertas' : 'analise';
  }
  const divergencias: string[] = item.analiseIA.divergencias || [];
  if (divergencias.length > 0) return 'alertas';
  return 'validadas';
}

function getIAStatusLabel(item: any, status: 'validadas' | 'analise' | 'alertas') {
  const tentativas = item.analiseTentativas || 0;
  if (item.analiseIA?.validacaoManual?.validada === true) return 'Validada manualmente';
  if (status === 'analise') return tentativas >= 3 ? 'Em erro' : 'Em análise';
  if (status === 'alertas') {
    if (!item.analiseIA) return 'Sem resposta da IA';
    const divergencias: string[] = item.analiseIA.divergencias || [];
    return divergencias.length ? `${divergencias.length} alerta(s)` : 'Erro na análise';
  }
  return item.analiseIA ? 'Verificada' : 'Sem análise';
}

function getIAItems(): IAItem[] {
  const items: IAItem[] = [
    ...faturasCache.map((f: any) => {
      const status = getIAStatus(f);
      return {
        id: f.id,
        tipo: 'fatura' as const,
        titulo: f.titulo || '-',
        subtitulo: f.fornecedor || f.departamento || 'Despesa',
        data: f.data || null,
        valor: f.valor,
        anexo: f.anexo,
        analiseIA: f.analiseIA,
        analiseTentativas: f.analiseTentativas || 0,
        estadoLabel: f.estado || 'Despesa',
        status,
        statusLabel: getIAStatusLabel(f, status),
        manualValidada: f.analiseIA?.validacaoManual?.validada === true,
      };
    }),
    ...receitasCache.map((r: any) => {
      const status = getIAStatus(r);
      return {
        id: r.id,
        tipo: 'receita' as const,
        titulo: r.titulo || '-',
        subtitulo: r.financiador || r.categoria || 'Receita',
        data: r.data || null,
        valor: r.valor,
        anexo: r.anexo,
        analiseIA: r.analiseIA,
        analiseTentativas: r.analiseTentativas || 0,
        estadoLabel: r.estado || 'Receita',
        status,
        statusLabel: getIAStatusLabel(r, status),
        manualValidada: r.analiseIA?.validacaoManual?.validada === true,
      };
    }),
  ];
  return items
    .filter((item) => item.anexo)
    .sort((a, b) => {
      const da = a.analiseIA?.analisadoEm || a.data || '';
      const db = b.analiseIA?.analisadoEm || b.data || '';
      return String(db).localeCompare(String(da));
    });
}

function getIAItemsByTipo(tipo: 'faturas' | 'receitas'): IAItem[] {
  const items = getIAItems();
  return items.filter((item) => (tipo === 'faturas' ? item.tipo === 'fatura' : item.tipo === 'receita'));
}

function renderIASection() {
  const container = document.getElementById('iaLista');
  if (!container) return;

  const items = getIAItemsByTipo(iaTipoAtual);
  const validadas = items.filter((item) => item.status === 'validadas').length;
  const analise = items.filter((item) => item.status === 'analise').length;
  const alertas = items.filter((item) => item.status === 'alertas').length;
  const totalAlertas = getIAItems().filter((item) => item.status === 'alertas').length;

  const countValidada = document.getElementById('iaCountValidada');
  const countAnalise = document.getElementById('iaCountAnalise');
  const countAlerta = document.getElementById('iaCountAlerta');
  const badge = document.getElementById('iaAlertBadge');
  if (countValidada) countValidada.textContent = String(validadas);
  if (countAnalise) countAnalise.textContent = String(analise);
  if (countAlerta) countAlerta.textContent = String(alertas);
  if (badge) {
    if (totalAlertas > 0) {
      badge.textContent = String(totalAlertas);
      badge.removeAttribute('hidden');
    } else {
      badge.setAttribute('hidden', 'true');
    }
  }

  const filtrados = iaFiltroAtual === 'todas' ? items : items.filter((item) => item.status === iaFiltroAtual);
  if (filtrados.length === 0) {
    container.innerHTML = '<p class="text-muted">Sem itens nesta categoria.</p>';
    return;
  }

  container.innerHTML = filtrados.map((item) => {
    const tipoBadge = item.tipo === 'fatura' ? 'Despesa' : 'Receita';
    const statusBadgeClass = item.status === 'validadas' ? 'status-ok' : item.status === 'analise' ? 'status-default' : 'status-overdue';
    const statusBadge = `<span class="status-badge ${statusBadgeClass}">${escapeHtml(item.statusLabel)}</span>`;
    const acaoValidacao = isReadOnly() ? '' : `
      <button type="button" class="ghost-action btn-ia-validar" data-tipo="${item.tipo}" data-id="${item.id}" data-validada="${item.manualValidada ? 'false' : 'true'}">
        ${item.manualValidada ? 'Remover validação' : 'Marcar validada'}
      </button>`;
    const divergencias = item.analiseIA?.divergencias || [];
    const divergenciasHtml = divergencias.length
      ? `<div class="ia-item-warnings">${divergencias.map((d: string) => `<div class="analise-divergencia">${escapeHtml(d)}</div>`).join('')}</div>`
      : '';
    return `
      <article class="ia-card">
        <div class="ia-card-top">
          <div>
            <div class="ia-card-title">${escapeHtml(item.titulo)}</div>
            <div class="ia-card-meta">
              <span class="record-tag">${tipoBadge}</span>
              <span class="record-tag">${escapeHtml(item.subtitulo)}</span>
              <span class="record-tag">${formatDate(item.data)}</span>
            </div>
          </div>
          <div class="ia-card-statuses">
            ${statusBadge}
          </div>
        </div>
        <div class="ia-card-body">
          <div class="ia-card-value ${item.tipo === 'fatura' ? 'despesa-color' : 'receita-color'}">${formatCurrency(item.valor)}</div>
          <div class="ia-card-submeta">
            ${item.anexo ? '<span class="record-tag">Com anexo</span>' : ''}
            <span class="record-tag">${escapeHtml(item.estadoLabel)}</span>
          </div>
          ${divergenciasHtml}
        </div>
        <div class="ia-card-actions">
          ${acaoValidacao}
          <button type="button" class="ghost-action btn-ia-ir-item" data-tipo="${item.tipo}" data-id="${item.id}">Abrir registo</button>
        </div>
      </article>
    `;
  }).join('');

  document.querySelectorAll('.ia-doc-tab').forEach((btn) => {
    btn.classList.toggle('active', (btn as HTMLElement).dataset.iaTipo === iaTipoAtual);
  });
  document.querySelectorAll('.ia-tab').forEach((btn) => {
    btn.classList.toggle('active', (btn as HTMLElement).dataset.iaFilter === iaFiltroAtual);
  });
  document.querySelectorAll('.nav-link[data-target="ia"]').forEach((btn) => {
    btn.classList.toggle('has-alerts', totalAlertas > 0);
  });

  container.querySelectorAll('.btn-ia-validar').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const el = e.currentTarget as HTMLElement;
      const tipo = el.getAttribute('data-tipo') as 'fatura' | 'receita' | null;
      const id = Number(el.getAttribute('data-id'));
      const validada = el.getAttribute('data-validada') === 'true';
      if (!tipo || Number.isNaN(id)) return;
      void alterarValidacaoIA(tipo, id, validada);
    });
  });

  container.querySelectorAll('.btn-ia-ir-item').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const el = e.currentTarget as HTMLElement;
      const tipo = el.getAttribute('data-tipo') as 'fatura' | 'receita' | null;
      const id = Number(el.getAttribute('data-id'));
      if (!tipo || Number.isNaN(id)) return;
      setActiveSection(tipo === 'fatura' ? 'faturas' : 'receitas');
      if (tipo === 'fatura') void editarFatura(id);
      else void editarReceita(id);
    });
  });
}

async function alterarValidacaoIA(tipo: 'fatura' | 'receita', id: number, validada: boolean) {
  if (isReadOnly()) {
    showNotification('Sem permissões para validar IA.', 'error');
    return;
  }
  try {
    const url = tipo === 'fatura' ? `${API_FATURAS}/${id}/validar-ia` : `${API_RECEITAS}/${id}/validar-ia`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ validada }),
    });
    if (!resp.ok) throw new Error('Erro ao atualizar validação da IA');
    showNotification(validada ? 'Item marcado como validado.' : 'Validação removida.', 'success');
    await Promise.all([carregarFaturas(), carregarReceitas()]);
    renderIASection();
  } catch (error: any) {
    showNotification(error.message || 'Erro ao atualizar validação da IA', 'error');
  }
}

async function refreshIAPanel() {
  await Promise.all([carregarFaturas(), carregarReceitas()]);
  renderIASection();
}

async function executarBackfillFaturasAntigas() {
  if (isReadOnly()) {
    showNotification('Sem permissões para preencher despesas antigas.', 'error');
    return;
  }
  if (!confirm('Isto vai analisar PDFs antigos, preencher campos em falta e sincronizar tesouraria de despesas pagas. Continuar?')) return;

  showLoading('A preencher despesas antigas...');
  try {
    const resp = await fetch(`${API_FATURAS}/backfill-antigas`, { method: 'POST' });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data.error || 'Erro ao preencher despesas antigas');
    showNotification(`Backfill concluído: ${data.atualizadas || 0} despesas atualizadas e ${data.movimentosSincronizados || 0} movimentos sincronizados.`, 'success');
    await Promise.all([carregarFaturas(), carregarReceitas()]);
    renderIASection();
  } catch (error: any) {
    showNotification(error.message || 'Erro ao preencher despesas antigas', 'error');
  } finally {
    hideLoading();
  }
}

async function reanalisarFatura(id: number) {
  try {
    const resp = await fetch(`${API_FATURAS}/${id}/analisar`, { method: 'POST' });
    if (!resp.ok) throw new Error('Erro ao reanalisar despesa');
    showNotification('Despesa reanalisada com sucesso!', 'success');
    await carregarFaturas();
  } catch {
    showNotification('Erro ao reanalisar despesa', 'error');
  }
}

async function reanalisarReceita(id: number) {
  try {
    const resp = await fetch(`${API_RECEITAS}/${id}/analisar`, { method: 'POST' });
    if (!resp.ok) throw new Error('Erro ao reanalisar receita');
    showNotification('Receita reanalisada com sucesso!', 'success');
    await carregarReceitas();
  } catch {
    showNotification('Erro ao reanalisar receita', 'error');
  }
}

const PAGE_SIZE = 15;
let faturaPage = 0;
let receitaPage = 0;

function renderPagination(containerId: string, total: number, currentPage: number, onPageChange: (page: number) => void) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  if (totalPages <= 1) { container.innerHTML = ''; return; }
  const start = currentPage * PAGE_SIZE + 1;
  const end = Math.min(total, (currentPage + 1) * PAGE_SIZE);
  container.innerHTML = `
    <span class="pagination-info">A mostrar <strong>${start}–${end}</strong> de ${total}</span>
    <div class="pagination-controls">
      <button type="button" class="pagination-prev btn-acao" ${currentPage === 0 ? 'disabled' : ''} aria-label="Página anterior">${icon('chevronLeft')}</button>
      <button type="button" class="pagination-next btn-acao" ${currentPage >= totalPages - 1 ? 'disabled' : ''} aria-label="Página seguinte">${icon('chevronRight')}</button>
    </div>
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
function debounce<T extends (...args: any[]) => void>(fn: T, ms: number): (...args: Parameters<T>) => void {
  let t: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<T>) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
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

function toggleContaField(estadoValue: string, wrapId: string, condicao: string) {
  const wrap = document.getElementById(wrapId);
  if (!wrap) return;
  wrap.toggleAttribute('hidden', estadoValue !== condicao);
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
  closeExportModal();
  showPdfLoading('A gerar relatório PDF...');
  try {
    const resp = await fetch(url, { headers: { 'Authorization': `Bearer ${authToken}` } });
    if (!resp.ok) throw new Error('Erro ao gerar PDF');
    const blob = await resp.blob();
    const blobUrl = URL.createObjectURL(blob);
    hidePdfLoading();
    window.open(blobUrl, '_blank');
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
  } catch {
    hidePdfLoading();
    showNotification('Erro ao exportar relatório', 'error');
  }
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

// --- Relatório e Contas (IA) ---
function setupRelatorioContas() {
  const openBtn = document.getElementById('qaRelatorioContas');
  const closeBtn = document.getElementById('racClose');
  const gerarBtn = document.getElementById('racGerarBtn') as HTMLButtonElement | null;
  const voltarBtn = document.getElementById('racVoltarBtn');
  const exportarBtn = document.getElementById('racExportarBtn') as HTMLButtonElement | null;

  const showPasso = (n: 1 | 2) => {
    document.getElementById('racPasso1')?.toggleAttribute('hidden', n !== 1);
    document.getElementById('racPasso2')?.toggleAttribute('hidden', n !== 2);
  };

  if (openBtn) openBtn.addEventListener('click', () => {
    if (isReadOnly()) { showNotification('Sem permissões para gerar relatórios.', 'error'); return; }
    setValue('racAno', String(new Date().getFullYear()));
    ['racNotaIntroducao', 'racGestaoInterna', 'racParcerias', 'racTransparencia', 'racDesafios', 'racAtividadesRealizadas', 'racAtividadesNaoRealizadas', 'racConclusao'].forEach((id) => setValue(id, ''));
    const aviso = document.getElementById('racAviso'); if (aviso) aviso.setAttribute('hidden', 'true');
    const planoInput = document.getElementById('planoFile') as HTMLInputElement | null; if (planoInput) planoInput.value = '';
    document.getElementById('dropPlano')?.classList.remove('has-file');
    document.querySelector('#dropPlano .file-drop-preview')?.setAttribute('hidden', 'true');
    showPasso(1);
    toggleSection('racDrawer', true);
  });

  if (closeBtn) closeBtn.addEventListener('click', () => toggleSection('racDrawer', false));
  if (voltarBtn) voltarBtn.addEventListener('click', () => showPasso(1));

  if (gerarBtn) gerarBtn.addEventListener('click', async () => {
    const ano = getValue('racAno') || String(new Date().getFullYear());
    const planoInput = document.getElementById('planoFile') as HTMLInputElement | null;
    const file = planoInput?.files?.[0];
    const fd = new FormData();
    fd.append('ano', ano);
    if (file) fd.append('plano', file);
    gerarBtn.disabled = true;
    showPdfLoading('A gerar rascunho com IA...');
    try {
      const resp = await fetch('/relatorios/anual/analise', { method: 'POST', body: fd });
      if (!resp.ok) throw new Error('Falha ao gerar análise');
      const data = await resp.json();
      const n = data.narrativa || {};
      const adm = n.administracao || {};
      setValue('racNotaIntroducao', n.notaIntroducao || '');
      setValue('racGestaoInterna', adm.gestaoInterna || '');
      setValue('racParcerias', adm.parcerias || '');
      setValue('racTransparencia', adm.transparencia || '');
      setValue('racDesafios', adm.desafios || '');
      setValue('racAtividadesRealizadas', n.atividadesRealizadas || '');
      setValue('racAtividadesNaoRealizadas', n.atividadesNaoRealizadas || '');
      setValue('racConclusao', n.conclusao || '');
      const fin = data.financeiro?.totais;
      const resumoEl = document.getElementById('racResumoFin');
      if (resumoEl && fin) resumoEl.innerHTML = `
        <div class="rac-stat receitas"><span class="k">Receitas</span><span class="v">${formatCurrency(fin.receitas)}</span></div>
        <div class="rac-stat custos"><span class="k">Custos</span><span class="v">${formatCurrency(fin.despesas)}</span></div>
        <div class="rac-stat resultado"><span class="k">Resultado</span><span class="v">${formatCurrency(fin.resultadoDoExercicio)}</span></div>`;
      const aviso = document.getElementById('racAviso');
      if (aviso) { if (data.aviso) { aviso.textContent = data.aviso; aviso.removeAttribute('hidden'); } else aviso.setAttribute('hidden', 'true'); }
      showPasso(2);
    } catch {
      showNotification('Erro ao gerar o rascunho.', 'error');
    } finally {
      gerarBtn.disabled = false;
      hidePdfLoading();
    }
  });

  if (exportarBtn) exportarBtn.addEventListener('click', async () => {
    const ano = getValue('racAno') || String(new Date().getFullYear());
    const narrativa = {
      notaIntroducao: getValue('racNotaIntroducao'),
      administracao: {
        gestaoInterna: getValue('racGestaoInterna'),
        parcerias: getValue('racParcerias'),
        transparencia: getValue('racTransparencia'),
        desafios: getValue('racDesafios'),
      },
      atividadesRealizadas: getValue('racAtividadesRealizadas'),
      atividadesNaoRealizadas: getValue('racAtividadesNaoRealizadas'),
      conclusao: getValue('racConclusao'),
    };
    exportarBtn.disabled = true;
    showPdfLoading('A gerar o PDF final...');
    try {
      const resp = await fetch('/relatorios/anual/pdf', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ano, narrativa }) });
      if (!resp.ok) throw new Error('Falha ao gerar PDF');
      const blob = await resp.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objUrl; a.download = `relatorio-e-contas-${ano}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(objUrl);
      hidePdfLoading();
    } catch {
      hidePdfLoading();
      showNotification('Erro ao gerar o PDF final.', 'error');
    } finally {
      exportarBtn.disabled = false;
    }
  });
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

function setActiveSection(target: 'resumo' | 'faturas' | 'receitas' | 'eventos' | 'ia' | 'inventario' | 'tesouraria' | 'relatorios') {
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
    case 'ia':
      if (!faturasCache.length || !receitasCache.length) await Promise.all([carregarFaturas(), carregarReceitas()]);
      renderIASection();
      break;
    case 'inventario':
      if (!inventarioCache.length) await carregarInventario();
      break;
    case 'tesouraria':
      if (!movimentosCache.length) await carregarMovimentos();
      else renderMovimentosPage();
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
    const optsList = eventosCache
      .map((ev: any) => `<option value="${ev.id}">${ev.nome}</option>`)
      .join('');
    const optsAdd = '<option value="">Adicionar evento...</option>' + optsList;
    const optsFilter = '<option value="">Todos os eventos</option>' + optsList;
    ['faturaEventoSelect', 'receitaEventoSelect'].forEach(id => {
      const el = document.getElementById(id) as HTMLSelectElement | null;
      if (el) el.innerHTML = optsAdd;
    });
    ['filterReceitaEvento', 'filterEvento'].forEach(id => {
      const el = document.getElementById(id) as HTMLSelectElement | null;
      if (el) el.innerHTML = optsFilter;
    });
  } catch {
    // Silencia erros neste ponto para não bloquear o fluxo principal
  }
}

// --- Multi-evento helpers ---
function getEventoRows(listId: string): { eventoId: number; valor: number }[] {
  const list = document.getElementById(listId);
  if (!list) return [];
  const rows = list.querySelectorAll('.multi-evento-row');
  return Array.from(rows).map(row => ({
    eventoId: Number(row.getAttribute('data-evento-id')),
    valor: parseFloat((row.querySelector('.me-valor') as HTMLInputElement)?.value || '0'),
  })).filter(e => e.eventoId > 0);
}

function addEventoRow(listId: string, eventoId: number, eventoNome: string, valor: number | string) {
  const list = document.getElementById(listId);
  if (!list) return;
  if (list.querySelector(`[data-evento-id="${eventoId}"]`)) return;
  const row = document.createElement('div');
  row.className = 'multi-evento-row';
  row.setAttribute('data-evento-id', String(eventoId));
  row.innerHTML = `
    <span class="me-nome">${escapeHtml(eventoNome)}</span>
    <input type="number" step="0.01" min="0" class="me-valor" value="${Number(valor || 0).toFixed(2)}" placeholder="Valor €">
    <button type="button" class="me-remove" title="Remover">×</button>
  `;
  row.querySelector('.me-remove')?.addEventListener('click', () => row.remove());
  list.appendChild(row);
}

function clearEventoRows(listId: string) {
  const list = document.getElementById(listId);
  if (list) list.innerHTML = '';
}

function getFormValorForList(listId: string): number {
  const inputId = listId === 'faturaEventosList' ? 'valorFatura' : 'valorReceita';
  return parseFloat((document.getElementById(inputId) as HTMLInputElement)?.value || '0') || 0;
}

function setupMultiEventoAdd(selectId: string, listId: string) {
  const btnId = selectId.replace('Select', 'AddBtn');
  const btn = document.getElementById(btnId);
  const select = document.getElementById(selectId) as HTMLSelectElement | null;
  if (!btn || !select) return;

  const doAdd = () => {
    const eventoId = Number(select.value);
    if (!eventoId) return;
    const evento = eventosCache.find((e: any) => e.id === eventoId);
    if (!evento) return;
    const totalValor = getFormValorForList(listId);
    addEventoRow(listId, eventoId, evento.nome, totalValor);
    select.value = '';
  };

  select.addEventListener('change', doAdd);
  btn.addEventListener('click', doAdd);
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

  if (btn) { btn.disabled = true; }
  showPdfLoading(editingEventoId ? 'A atualizar evento...' : 'A guardar evento...');

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
    if (btn) { btn.textContent = 'Guardar'; btn.disabled = false; }
    await Promise.all([carregarEventosResumo(), carregarEventosSelect()]);
    hidePdfLoading();
  } catch (err: any) {
    showNotification(`❌ ${err.message || 'Erro ao guardar evento'}`, 'error');
    if (btn) { btn.disabled = false; }
    hidePdfLoading();
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
    const faturaCountPorEvento: Record<string, number> = {};
    faturas.forEach((f: any) => {
      (f.faturaEventos || []).forEach((fe: any) => {
        gastosPorEvento[fe.eventoId] = (gastosPorEvento[fe.eventoId] || 0) + parseFloat(fe.valor || 0);
        faturaCountPorEvento[fe.eventoId] = (faturaCountPorEvento[fe.eventoId] || 0) + 1;
      });
    });
    const receitasPorEvento: Record<string, number> = {};
    const receitaCountPorEvento: Record<string, number> = {};
    receitas.forEach((r: any) => {
      (r.receitaEventos || []).forEach((re: any) => {
        receitasPorEvento[re.eventoId] = (receitasPorEvento[re.eventoId] || 0) + parseFloat(re.valor || 0);
        receitaCountPorEvento[re.eventoId] = (receitaCountPorEvento[re.eventoId] || 0) + 1;
      });
    });
    eventosLista.className = 'eventos-grid';
    eventosLista.innerHTML = eventos.map((ev: any) => {
      const gasto = gastosPorEvento[ev.id] || 0;
      const numFaturas = faturaCountPorEvento[ev.id] || 0;
      const receitaTotal = receitasPorEvento[ev.id] || 0;
      const numReceitas = receitaCountPorEvento[ev.id] || 0;
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

    const descEl = document.getElementById('eventoDetailDesc') as HTMLElement;
    descEl.textContent = evento.descricao || '';
    descEl.style.display = evento.descricao ? '' : 'none';

    const deptEl = document.getElementById('eventoDetailDept') as HTMLElement;
    if (evento.departamento) {
      deptEl.textContent = evento.departamento;
      deptEl.removeAttribute('hidden');
    } else {
      deptEl.setAttribute('hidden', 'true');
    }

    const datesEl = document.getElementById('eventoDetailDates') as HTMLElement;
    const di = evento.data_inicio || evento.dataInicio || '';
    const df = evento.data_fim || evento.dataFim || '';
    const fmtD = (d: string) => d ? new Date(d).toLocaleDateString('pt-PT') : '';
    const diStr = fmtD(di);
    const dfStr = fmtD(df);
    datesEl.textContent = diStr && dfStr ? `${diStr} a ${dfStr}` : (diStr || dfStr || '');
    datesEl.style.display = (diStr || dfStr) ? '' : 'none';

    const saldoColor = resumo.saldo >= 0 ? '#16a34a' : '#dc2626';
    const dash = document.getElementById('eventoDetailDashboard') as HTMLElement;
    dash.innerHTML = `
      <div class="detail-stat"><div class="stat-label">Receitas</div><div class="stat-value" style="color:#16a34a">${formatCurrency(resumo.totalReceitas)}</div></div>
      <div class="detail-stat"><div class="stat-label">Despesas</div><div class="stat-value" style="color:#dc2626">${formatCurrency(resumo.totalDespesas)}</div></div>
      <div class="detail-stat"><div class="stat-label">Saldo</div><div class="stat-value" style="color:${saldoColor}">${formatCurrency(resumo.saldo)}</div></div>
    `;

    const recTbody = document.getElementById('eventoDetailReceitas') as HTMLElement;
    recTbody.innerHTML = receitas.length
      ? receitas.map((r: any) => `<tr><td>${escapeHtml(r.titulo)}</td><td>${escapeHtml(r.categoria)}</td><td>${formatDate(r.data)}</td><td>${formatCurrency(r.valorEvento)}</td></tr>`).join('')
      : '<tr><td colspan="4">Sem receitas associadas.</td></tr>';

    const fatTbody = document.getElementById('eventoDetailFaturas') as HTMLElement;
    fatTbody.innerHTML = faturas.length
      ? faturas.map((f: any) => `<tr><td>${escapeHtml(f.titulo)}</td><td>${escapeHtml(f.departamento)}</td><td>${formatDate(f.data)}</td><td>${formatCurrency(f.valorEvento)}</td></tr>`).join('')
      : '<tr><td colspan="4">Sem despesas associadas.</td></tr>';

    const pdfBtn = document.getElementById('eventoDetailPdf') as HTMLButtonElement;
    pdfBtn.onclick = async () => {
      showPdfLoading('A gerar PDF do evento...');
      try {
        const resp = await fetch(`${API_EVENTOS}/${id}/pdf`, { headers: { 'Authorization': `Bearer ${authToken}` } });
        if (!resp.ok) throw new Error();
        const blob = await resp.blob();
        const blobUrl = URL.createObjectURL(blob);
        hidePdfLoading();
        window.open(blobUrl, '_blank');
        setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
      } catch {
        hidePdfLoading();
        showNotification('Erro ao gerar PDF do evento', 'error');
      }
    };

    const modal = document.getElementById('eventoDetailModal') as HTMLElement;
    modal.removeAttribute('hidden');
  } catch {
    showNotification('Erro ao carregar detalhes do evento', 'error');
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

// --- Gerir Partilhas ---
async function carregarPartilhas() {
  const tbody = document.getElementById('gerirPartilhasBody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="7">A carregar...</td></tr>';
  try {
    const resp = await fetch(`${API_SHARES}?limit=100`);
    if (!resp.ok) throw new Error('Erro ao carregar partilhas');
    const data = await resp.json();
    const shares = data.shares || [];
    if (!shares.length) {
      tbody.innerHTML = '<tr><td colspan="7">Nenhuma partilha encontrada.</td></tr>';
      return;
    }
    const now = new Date();
    const baseUrl = window.location.origin;
    tbody.innerHTML = shares.map((s: any) => {
      const expiresAt = new Date(s.expiresAt);
      const revoked = !!s.revokedAt;
      const expired = expiresAt < now;
      const estado = revoked ? '<span style="color:var(--danger)">Revogada</span>'
        : expired ? '<span style="color:var(--text-muted)">Expirada</span>'
        : '<span style="color:var(--success)">Ativa</span>';
      const dataStr = expiresAt.toLocaleString('pt-PT', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
      const link = `${baseUrl}/share/evento/${s.token}`;
      const acoes = revoked ? `
        <button class="ghost-action btn-editar-partilha" data-id="${s.id}" data-destinatario="${escapeHtml(s.destinatario || '')}" data-expires="${expiresAt.toISOString().slice(0,16)}">Reativar</button>
      ` : `
        <button class="ghost-action btn-editar-partilha" data-id="${s.id}" data-destinatario="${escapeHtml(s.destinatario || '')}" data-expires="${expiresAt.toISOString().slice(0,16)}">Editar</button>
        <button class="ghost-action btn-revogar-partilha" data-id="${s.id}" style="color:var(--danger)">Revogar</button>
      `;
      return `<tr>
        <td>${escapeHtml(s.evento?.nome || 'N/A')}</td>
        <td>${escapeHtml(s.destinatario || '-')}</td>
        <td><input type="text" value="${escapeHtml(link)}" readonly style="width:180px;font-size:0.8rem;cursor:pointer;" class="share-link-input" title="Clica para copiar"></td>
        <td style="font-size:0.8rem;color:var(--text-muted)">Gerada na criação<br>(não é armazenada)</td>
        <td>${dataStr}</td>
        <td>${estado}</td>
        <td>${acoes}</td>
      </tr>`;
    }).join('');

    tbody.querySelectorAll('.share-link-input').forEach(input => {
      input.addEventListener('click', () => {
        const el = input as HTMLInputElement;
        el.select();
        if (navigator.clipboard?.writeText) {
          navigator.clipboard.writeText(el.value).then(() => showNotification('Link copiado.', 'success'));
        } else {
          document.execCommand('copy');
          showNotification('Link copiado.', 'success');
        }
      });
    });

    tbody.querySelectorAll('.btn-editar-partilha').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const dest = btn.getAttribute('data-destinatario') || '';
        const exp = btn.getAttribute('data-expires') || '';
        abrirEditarPartilha(Number(id), dest, exp);
      });
    });
    tbody.querySelectorAll('.btn-revogar-partilha').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.getAttribute('data-id'));
        if (!confirm('Revogar esta partilha? O acesso será imediatamente removido.')) return;
        try {
          const resp = await fetch(`${API_SHARES}/${id}/revoke`, { method: 'POST' });
          if (!resp.ok) throw new Error('Erro ao revogar');
          showNotification('Partilha revogada.', 'success');
          carregarPartilhas();
        } catch (err: any) {
          showNotification(err.message || 'Erro ao revogar partilha.', 'error');
        }
      });
    });
  } catch (err: any) {
    tbody.innerHTML = `<tr><td colspan="7">${escapeHtml(err.message)}</td></tr>`;
  }
}

function abrirGerirPartilhas() {
  document.getElementById('gerirPartilhasModal')?.removeAttribute('hidden');
  carregarPartilhas();
}

function fecharGerirPartilhas() {
  document.getElementById('gerirPartilhasModal')?.setAttribute('hidden', 'true');
}

function abrirEditarPartilha(id: number, destinatario: string, expiresAt: string) {
  setValue('editarPartilhaId', String(id));
  setValue('editarPartilhaDestinatario', destinatario);
  setValue('editarPartilhaExpira', expiresAt);
  const msg = document.getElementById('editarPartilhaMsg');
  if (msg) msg.setAttribute('hidden', 'true');
  document.getElementById('editarPartilhaModal')?.removeAttribute('hidden');
}

function fecharEditarPartilha() {
  document.getElementById('editarPartilhaModal')?.setAttribute('hidden', 'true');
}

async function guardarEditarPartilha(e: SubmitEvent) {
  e.preventDefault();
  const id = Number(getValue('editarPartilhaId'));
  const destinatario = getValue('editarPartilhaDestinatario').trim();
  const expiresAt = getValue('editarPartilhaExpira');
  const msg = document.getElementById('editarPartilhaMsg');

  if (!expiresAt) {
    if (msg) { msg.textContent = 'Data de expiração é obrigatória.'; msg.className = 'form-msg error'; msg.removeAttribute('hidden'); }
    return;
  }

  try {
    const resp = await fetch(`${API_SHARES}/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expiresAt: new Date(expiresAt).toISOString(), destinatario }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data.error || 'Erro ao guardar');
    showNotification('Partilha atualizada.', 'success');
    fecharEditarPartilha();
    carregarPartilhas();
  } catch (err: any) {
    if (msg) { msg.textContent = err.message || 'Erro ao guardar.'; msg.className = 'form-msg error'; msg.removeAttribute('hidden'); }
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

// Carrega TODAS as faturas (sem filtros) para o resumo/dashboards, IA e selects.
// Independente dos filtros aplicados na lista das Despesas.
async function carregarFaturasResumo() {
  try {
    const resp = await fetch(API_FATURAS);
    if (!resp.ok) throw new Error('Erro ao listar faturas');
    faturasCache = await resp.json();
  } catch {
    faturasCache = [];
  }
  atualizarDashboards(faturasCache, movimentosCache, receitasCache);
  atualizarSelectFaturaInventario();
  renderIASection();
}

// Carrega a lista das Despesas aplicando os filtros. Por omissão também
// atualiza o resumo (não filtrado); com soLista=true (botão de filtros)
// atualiza APENAS a lista, deixando o resumo intacto.
async function carregarFaturas(soLista = false) {
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
  if (estado === 'vencidas') params.append('vencidas', 'true');
  else if (estado) params.append('estado', estado);
  if (eventoId) params.append('eventoId', eventoId);

  showSkeleton('listaFaturas', 5);
  try {
    const resp = await fetch(`${API_FATURAS}?${params.toString()}`);
    if (!resp.ok) throw new Error('Erro ao listar faturas');
    faturasListaCache = await resp.json();
    faturaPage = 0;
    renderFaturasPage();
  } catch {
    faturasListaCache = [];
    const container = document.getElementById('listaFaturas');
    if (container) container.innerHTML = '<p class="text-muted">Erro ao carregar despesas.</p>';
  }
  if (!soLista) await carregarFaturasResumo();
}

function renderFaturasPage() {
  const container = document.getElementById('listaFaturas');
  if (!container) return;
  if (!Array.isArray(faturasListaCache) || faturasListaCache.length === 0) {
    container.innerHTML = '<p class="text-muted">Nenhuma despesa encontrada.</p>';
    renderPagination('faturasPagination', 0, 0, () => {});
    return;
  }
  const page = paginate(faturasListaCache, faturaPage);
  container.innerHTML = page.map((f: any) => {
    const eventoTags = (f.faturaEventos || []).map((fe: any) => {
      const nome = fe.evento?.nome || eventosCache.find((ev: any) => ev.id === fe.eventoId)?.nome || '';
      return nome ? `<span class="record-tag">${escapeHtml(nome)}</span>` : '';
    }).join('');
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
          ${f.fornecedor ? `<span>${escapeHtml(f.fornecedor)}</span>` : ''}
          ${eventoTags}
        </div>
      </div>
      <div class="record-details">
        <div class="record-amount despesa-color">${formatCurrency(f.valor)}</div>
        <div class="record-date">${formatDate(f.data)}${f.dataVencimento ? ` <span class="text-muted">(vence ${formatDate(f.dataVencimento)})</span>` : ''}</div>
        ${estadoBadge(f.estado)}
        ${vencidaBadge(f)}
        ${anexoLink ? `<button class="btn-anexo-open record-anexo" data-url="${escapeHtml(anexoLink)}">${icon('file')}</button>` : ''}
      </div>
      ${actions}
      ${renderAnaliseIA(f, 'fatura')}
    </div>`;
  }).join('');
  container.querySelectorAll('.btn-anexo-open').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const url = (e.currentTarget as HTMLElement).getAttribute('data-url');
      if (url) openAnexo(url);
    });
  });
  container.querySelectorAll('.btn-reanalisar-fatura').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = (e.currentTarget as HTMLElement).getAttribute('data-id');
      if (id) reanalisarFatura(parseInt(id, 10));
    });
  });
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
  renderPagination('faturasPagination', faturasListaCache.length, faturaPage, (p) => { faturaPage = p; renderFaturasPage(); });
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
  const formData = new FormData();
  formData.append('titulo', titulo);
  formData.append('valor', String(valor));
  formData.append('data', data);
  formData.append('departamento', departamento);
  formData.append('tipo', getValue('tipoFatura') || 'Fatura');
  formData.append('numero', getValue('numeroFatura').trim());
  formData.append('estado', getValue('estadoFatura') || 'Pendente');
  formData.append('descricao', getValue('observacoesFatura').trim());
  formData.append('fornecedor', getValue('fornecedorFatura').trim());
  formData.append('fornecedorNif', getValue('fornecedorNifFatura').trim());
  const dataVencimento = getValue('dataVencimentoFatura');
  if (dataVencimento) formData.append('dataVencimento', dataVencimento);
  const contaFatura = getValue('contaFatura').trim();
  if (contaFatura) formData.append('conta', contaFatura);
  const eventosData = getEventoRows('faturaEventosList');
  formData.append('eventos', JSON.stringify(eventosData));

  const anexoInput = document.getElementById('anexoFatura') as HTMLInputElement | null;
  const anexoFile = anexoInput?.files?.[0];
  if (anexoFile) formData.append('anexo', anexoFile);
  if (removeFaturaAnexo && !anexoFile) formData.append('removeAnexo', 'true');

  const url = editingFaturaId ? `${API_FATURAS}/${editingFaturaId}` : API_FATURAS;
  const method = editingFaturaId ? 'PUT' : 'POST';
  const btn = document.getElementById('btnSalvarFatura') as HTMLButtonElement | null;

  if (btn) { btn.disabled = true; }
  showPdfLoading(editingFaturaId ? 'A atualizar despesa...' : 'A guardar despesa...');

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
    clearEventoRows('faturaEventosList');
    toggleSection('formularioFatura', false);
    editingFaturaId = null;
    removeFaturaAnexo = false;
    if (btn) { btn.textContent = 'Guardar'; btn.disabled = false; }
    await Promise.all([carregarFaturas(), carregarEventosResumo(), carregarMovimentos()]);
    hidePdfLoading();
  } catch (err: any) {
    showNotification(`${err.message || 'Erro ao guardar fatura'}`, 'error');
    if (btn) { btn.disabled = false; }
    hidePdfLoading();
  }
}

// --- Receitas: carregar e criar ---
// Carrega TODAS as receitas (sem filtros) para o resumo/dashboards e IA.
async function carregarReceitasResumo() {
  try {
    const resp = await fetch(API_RECEITAS);
    if (!resp.ok) throw new Error('Erro ao listar receitas');
    receitasCache = await resp.json();
  } catch {
    receitasCache = [];
  }
  atualizarDashboards(faturasCache, movimentosCache, receitasCache);
  renderIASection();
}

async function carregarReceitas(soLista = false) {
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
    receitasListaCache = await resp.json();
    receitaPage = 0;
    renderReceitasPage();
  } catch {
    receitasListaCache = [];
    const container = document.getElementById('listaReceitas');
    if (container) container.innerHTML = '<p class="text-muted">Erro ao carregar receitas.</p>';
  }
  if (!soLista) await carregarReceitasResumo();
}

async function carregarMovimentos() {
  const params = new URLSearchParams();
  const conta = getValue('filterMovConta');
  const tipo = getValue('filterMovTipo');
  const from = getValue('filterMovFrom');
  const to = getValue('filterMovTo');
  if (conta) params.append('conta', conta);
  if (tipo) params.append('tipo', tipo);
  if (from) params.append('dateFrom', from);
  if (to) params.append('dateTo', to);
  try {
    const resp = await fetch(`${API_MOVIMENTOS}?${params.toString()}`);
    if (!resp.ok) throw new Error('Erro ao listar movimentos');
    movimentosCache = await resp.json();
  } catch {
    movimentosCache = [];
  }
  movimentoPage = 0;
  renderMovimentosPage();
}

function renderMovimentosPage() {
  const container = document.getElementById('listaMovimentos');
  if (!container) return;
  if (!Array.isArray(movimentosCache) || movimentosCache.length === 0) {
    container.innerHTML = '<p class="text-muted">Nenhum movimento encontrado.</p>';
    renderPagination('movimentosPagination', 0, 0, () => {});
    return;
  }
  const page = paginate(movimentosCache, movimentoPage);
  container.innerHTML = page.map((m: any) => {
    const tipoLabel = m.tipo === 'entrada' ? 'Entrada' : 'Saída';
    const amountClass = m.tipo === 'entrada' ? 'receita-color' : 'despesa-color';
    const origemTag = m.fatura ? `<span class="record-tag">Despesa: ${escapeHtml(m.fatura.titulo)}</span>`
      : m.receita ? `<span class="record-tag">Receita: ${escapeHtml(m.receita.titulo)}</span>` : '';
    const actions = (isReadOnly() || m.faturaId || m.receitaId) ? '' : `
      <div class="record-actions">
        <button class="btn-acao btn-editar-movimento" data-id="${m.id}" title="Editar">${icon('edit')}</button>
        <button class="btn-acao btn-remover-movimento" data-id="${m.id}" title="Remover">${icon('trash')}</button>
      </div>`;
    return `<div class="record-row">
      <div class="record-main">
        <div class="record-title">${escapeHtml(m.conta || '-')}</div>
        <div class="record-meta">
          <span>${tipoLabel}</span>
          ${m.referencia ? `<span>Ref. ${escapeHtml(m.referencia)}</span>` : ''}
          ${m.descricao ? `<span>${escapeHtml(m.descricao)}</span>` : ''}
          ${origemTag}
        </div>
      </div>
      <div class="record-details">
        <div class="record-amount ${amountClass}">${formatCurrency(m.valor)}</div>
        <div class="record-date">${formatDate(m.data)}</div>
      </div>
      ${actions}
    </div>`;
  }).join('');
  container.querySelectorAll('.btn-editar-movimento').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = (e.currentTarget as HTMLElement).getAttribute('data-id');
      if (id) editarMovimento(parseInt(id, 10));
    });
  });
  container.querySelectorAll('.btn-remover-movimento').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = (e.currentTarget as HTMLElement).getAttribute('data-id');
      if (id) removerMovimento(parseInt(id, 10));
    });
  });
  renderPagination('movimentosPagination', movimentosCache.length, movimentoPage, (p) => { movimentoPage = p; renderMovimentosPage(); });
}

async function guardarMovimento(e: SubmitEvent) {
  e.preventDefault();
  if (isReadOnly()) { showNotification('Sem permissões para alterar movimentos.', 'error'); return; }
  const tipo = getValue('tipoMovimento') || 'entrada';
  const conta = getValue('contaMovimento').trim();
  const valor = parseFloat(getValue('valorMovimento'));
  const data = getValue('dataMovimento');
  if (!conta || !data || Number.isNaN(valor)) {
    showNotification('Preencha todos os campos obrigatórios do movimento.', 'error');
    return;
  }
  const payload = {
    tipo,
    conta,
    valor,
    data,
    referencia: getValue('referenciaMovimento').trim(),
    descricao: getValue('descricaoMovimento').trim(),
  };
  const url = editingMovimentoId ? `${API_MOVIMENTOS}/${editingMovimentoId}` : API_MOVIMENTOS;
  const method = editingMovimentoId ? 'PUT' : 'POST';
  showPdfLoading(editingMovimentoId ? 'A atualizar movimento...' : 'A guardar movimento...');
  try {
    const resp = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) throw new Error('Erro ao guardar movimento');
    showNotification(editingMovimentoId ? 'Movimento atualizado com sucesso!' : 'Movimento criado com sucesso!', 'success');
    resetForm('movimentoForm');
    toggleSection('formularioMovimento', false);
    editingMovimentoId = null;
    await carregarMovimentos();
    atualizarDashboards(faturasCache, movimentosCache, receitasCache);
    hidePdfLoading();
  } catch (err: any) {
    showNotification(err.message || 'Erro ao guardar movimento', 'error');
    hidePdfLoading();
  }
}

async function editarMovimento(id: number) {
  const m = movimentosCache.find((x: any) => x.id === id);
  if (!m) { showNotification('Movimento não encontrado', 'error'); return; }
  toggleSection('formularioMovimento', true);
  setValue('tipoMovimento', m.tipo || 'entrada');
  setValue('contaMovimento', m.conta || '');
  setValue('valorMovimento', m.valor?.toString() || '');
  setValue('dataMovimento', (m.data || '').slice(0, 10));
  setValue('referenciaMovimento', m.referencia || '');
  setValue('descricaoMovimento', m.descricao || '');
  editingMovimentoId = id;
  const btn = document.getElementById('btnSalvarMovimento') as HTMLButtonElement | null;
  if (btn) btn.textContent = 'Guardar Alterações';
}

async function removerMovimento(id: number) {
  if (!confirm('Tem a certeza que deseja remover este movimento?')) return;
  if (isReadOnly()) { showNotification('Sem permissões para remover movimentos.', 'error'); return; }
  try {
    const resp = await fetch(`${API_MOVIMENTOS}/${id}`, { method: 'DELETE' });
    if (!resp.ok) throw new Error('Erro ao remover movimento');
    showNotification('Movimento removido com sucesso!', 'success');
    await carregarMovimentos();
    atualizarDashboards(faturasCache, movimentosCache, receitasCache);
  } catch {
    showNotification('Erro ao remover movimento', 'error');
  }
}

function setupMovimentos() {
  const btnNovo = document.getElementById('btnNovoMovimento');
  if (btnNovo) {
    btnNovo.addEventListener('click', () => {
      if (isReadOnly()) { showNotification('Sem permissões para criar movimentos.', 'error'); return; }
      resetForm('movimentoForm');
      editingMovimentoId = null;
      const btn = document.getElementById('btnSalvarMovimento') as HTMLButtonElement | null;
      if (btn) btn.textContent = 'Guardar';
      toggleSection('formularioMovimento', true);
    });
  }

  const btnCancelar = document.getElementById('btnCancelarMovimento');
  if (btnCancelar) {
    btnCancelar.addEventListener('click', () => {
      toggleSection('formularioMovimento', false);
      resetForm('movimentoForm');
      editingMovimentoId = null;
    });
  }

  const movimentoForm = document.getElementById('movimentoForm');
  if (movimentoForm) movimentoForm.addEventListener('submit', guardarMovimento);

  const btnFiltrosMov = document.getElementById('btnAplicarFiltrosMov');
  if (btnFiltrosMov) btnFiltrosMov.addEventListener('click', () => carregarMovimentos());
}

function renderReceitasPage() {
  const container = document.getElementById('listaReceitas');
  if (!container) return;
  if (!Array.isArray(receitasListaCache) || receitasListaCache.length === 0) {
    container.innerHTML = '<p class="text-muted">Nenhuma receita encontrada.</p>';
    renderPagination('receitasPagination', 0, 0, () => {});
    return;
  }
  const page = paginate(receitasListaCache, receitaPage);
  container.innerHTML = page.map((r: any) => {
    const eventoTags = (r.receitaEventos || []).map((re: any) => {
      const nome = re.evento?.nome || eventosCache.find((ev: any) => ev.id === re.eventoId)?.nome || '';
      return nome ? `<span class="record-tag">${escapeHtml(nome)}</span>` : '';
    }).join('');
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
          ${eventoTags}
        </div>
        ${r.observacoes ? `<div class="record-notes">${escapeHtml(r.observacoes)}</div>` : ''}
      </div>
      <div class="record-details">
        <div class="record-amount receita-color">${formatCurrency(r.valor)}</div>
        <div class="record-date">${formatDate(r.data)}</div>
        ${estadoBadge(r.estado)}
        ${anexoLink ? `<button class="btn-anexo-open record-anexo" data-url="${escapeHtml(anexoLink)}">${icon('file')}</button>` : ''}
      </div>
      ${actions}
      ${renderAnaliseIA(r, 'receita')}
    </div>`;
  }).join('');
  container.querySelectorAll('.btn-anexo-open').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const url = (e.currentTarget as HTMLElement).getAttribute('data-url');
      if (url) openAnexo(url);
    });
  });
  container.querySelectorAll('.btn-reanalisar-receita').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = (e.currentTarget as HTMLElement).getAttribute('data-id');
      if (id) reanalisarReceita(parseInt(id, 10));
    });
  });
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
  renderPagination('receitasPagination', receitasListaCache.length, receitaPage, (p) => { receitaPage = p; renderReceitasPage(); });
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
  const contaReceita = getValue('contaReceita').trim();
  if (contaReceita) formData.append('conta', contaReceita);
  formData.append('valor', String(valor));
  formData.append('data', data);
  formData.append('observacoes', getValue('observacoesReceita').trim());
  const eventosData = getEventoRows('receitaEventosList');
  formData.append('eventos', JSON.stringify(eventosData));

  const anexoInput = document.getElementById('anexoReceita') as HTMLInputElement | null;
  const anexoFile = anexoInput?.files?.[0];
  if (anexoFile) formData.append('anexo', anexoFile);
  if (removeReceitaAnexo && !anexoFile) formData.append('removeAnexo', 'true');

  const url = editingReceitaId ? `${API_RECEITAS}/${editingReceitaId}` : API_RECEITAS;
  const method = editingReceitaId ? 'PUT' : 'POST';
  const btn = document.getElementById('btnSalvarReceita') as HTMLButtonElement | null;

  if (btn) { btn.disabled = true; }
  showPdfLoading(editingReceitaId ? 'A atualizar receita...' : 'A guardar receita...');

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
    clearEventoRows('receitaEventosList');
    toggleSection('formularioReceita', false);
    editingReceitaId = null;
    removeReceitaAnexo = false;
    if (btn) { btn.textContent = 'Guardar'; btn.disabled = false; }
    await Promise.all([carregarReceitas(), carregarMovimentos()]);
    hidePdfLoading();
  } catch (err: any) {
    showNotification(`${err.message || 'Erro ao guardar receita'}`, 'error');
    if (btn) { btn.disabled = false; }
    hidePdfLoading();
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

function invExpiring(item: any): boolean {
  return !!item.dataValidade && new Date(item.dataValidade) < new Date(Date.now() + 30 * 86400000);
}
function invLow(item: any): boolean {
  return !!item.quantidadeMinima && item.quantidade < item.quantidadeMinima;
}

function renderInvGrid(items: any[], container: HTMLElement, emptyMsg: string) {
  if (!items || items.length === 0) {
    container.innerHTML = `<p class="text-muted">${emptyMsg}</p>`;
    return;
  }
  container.innerHTML = items.map((item: any) => {
    const isFixo = item.tipo === 'fixo';
    const low = invLow(item);
    const expiring = invExpiring(item);
    const validade = item.dataValidade ? formatDate(item.dataValidade) : null;
    const qtdNum = Number(item.quantidade) || 0;
    const custo = item.custoUnitario != null ? Number(item.custoUnitario) : null;
    const valorTotal = custo != null ? (isFixo ? custo : custo * (qtdNum || 1)) : null;
    const qtdDisplay = item.quantidade != null ? `${item.quantidade}${item.unidade ? ' ' + escapeHtml(item.unidade) : ''}` : '-';

    const etiquetaBtn = isFixo && item.codigoPatrimonio
      ? `<button class="btn-acao btn-etiqueta-inv" data-id="${item.id}" title="Etiqueta">${icon('tag')}</button>` : '';
    const actions = isReadOnly()
      ? (etiquetaBtn ? `<div class="inv-card-actions">${etiquetaBtn}</div>` : '')
      : `<div class="inv-card-actions">
          ${etiquetaBtn}
          <button class="btn-acao btn-editar-inv" data-id="${item.id}" title="Editar">${icon('edit')}</button>
          <button class="btn-acao btn-remover-inv" data-id="${item.id}" title="Remover">${icon('trash')}</button>
        </div>`;

    const codigoChip = isFixo && item.codigoPatrimonio ? `<span class="inv-codigo-chip">${escapeHtml(item.codigoPatrimonio)}</span>` : '';

    // Corpo do card difere entre fixo e consumível
    let bodyStats = '';
    if (isFixo) {
      bodyStats = `
        ${item.localizacao ? `<div class="inv-card-stat"><span class="inv-stat-label">Localização</span><span class="inv-stat-value">${escapeHtml(item.localizacao)}</span></div>` : ''}
        ${item.dataAquisicao ? `<div class="inv-card-stat"><span class="inv-stat-label">Aquisição</span><span class="inv-stat-value">${formatDate(item.dataAquisicao)}</span></div>` : ''}
        ${valorTotal != null ? `<div class="inv-card-stat"><span class="inv-stat-label">Valor</span><span class="inv-stat-value">${formatCurrency(valorTotal)}</span></div>` : ''}
      `;
    } else {
      bodyStats = `
        <div class="inv-card-stat"><span class="inv-stat-label">Quantidade</span><span class="inv-stat-value ${low ? 'inv-stock-low' : 'inv-stock-ok'}">${qtdDisplay}</span></div>
        ${custo != null ? `<div class="inv-card-stat"><span class="inv-stat-label">Custo unit.</span><span class="inv-stat-value">${formatCurrency(custo)}</span></div>` : ''}
        ${valorTotal != null ? `<div class="inv-card-stat"><span class="inv-stat-label">Valor total</span><span class="inv-stat-value">${formatCurrency(valorTotal)}</span></div>` : ''}
        ${item.localizacao ? `<div class="inv-card-stat"><span class="inv-stat-label">Localização</span><span class="inv-stat-value">${escapeHtml(item.localizacao)}</span></div>` : ''}
        ${validade ? `<div class="inv-card-stat"><span class="inv-stat-label">Validade</span><span class="inv-stat-value ${expiring ? 'inv-expiring' : ''}">${validade}</span></div>` : ''}
      `;
    }

    return `<div class="inv-card">
      <div class="inv-card-head">
        <div class="inv-card-name">${escapeHtml(item.nome)}${low ? '<span class="inv-stock-alert">Stock baixo</span>' : ''}</div>
        ${actions}
      </div>
      <div class="inv-card-meta">
        ${codigoChip}
        ${item.categoria ? `<span class="inv-tag">${escapeHtml(item.categoria)}</span>` : ''}
        ${renderInvEstadoBadge(item.estado)}
      </div>
      <div class="inv-card-body">${bodyStats}</div>
    </div>`;
  }).join('');

  container.querySelectorAll('.btn-etiqueta-inv').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = (e.currentTarget as HTMLElement).getAttribute('data-id');
      if (id) void descarregarPdfAutenticado(`${API_INVENTARIO}/etiquetas/pdf?ids=${id}`, `etiqueta-${id}.pdf`, 'A gerar etiqueta...');
    });
  });
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

function renderInventarioResumo(items: any[]) {
  const wrap = document.getElementById('invResumo');
  if (!wrap) return;
  const total = items.length;
  const valorTotal = items.reduce((s, it) => {
    const custo = it.custoUnitario != null ? Number(it.custoUnitario) : 0;
    const qtd = it.tipo === 'fixo' ? 1 : (Number(it.quantidade) || 1);
    return s + custo * qtd;
  }, 0);
  const stockBaixo = items.filter(invLow).length;
  const aExpirar = items.filter(invExpiring).length;
  wrap.innerHTML = `
    <div class="summary-card"><div class="label">Itens</div><div class="value">${total}</div></div>
    <div class="summary-card"><div class="label">Valor do inventário</div><div class="value">${formatCurrency(valorTotal)}</div></div>
    <div class="summary-card"><div class="label">Stock baixo</div><div class="value ${stockBaixo ? 'inv-stock-low' : ''}">${stockBaixo}</div></div>
    <div class="summary-card"><div class="label">A expirar (30d)</div><div class="value ${aExpirar ? 'inv-expiring' : ''}">${aExpirar}</div></div>
  `;
}

function preencherFiltrosInventario(items: any[]) {
  const estados = Array.from(new Set(items.map((i) => i.estado).filter(Boolean))).sort();
  const categorias = Array.from(new Set(items.map((i) => i.categoria).filter(Boolean))).sort();
  const selEstado = document.getElementById('filterInvEstado') as HTMLSelectElement | null;
  const selCat = document.getElementById('filterInvCategoria') as HTMLSelectElement | null;
  if (selEstado) {
    const cur = selEstado.value;
    selEstado.innerHTML = '<option value="">Todos os estados</option>' + estados.map((e) => `<option>${escapeHtml(e)}</option>`).join('');
    selEstado.value = cur;
  }
  if (selCat) {
    const cur = selCat.value;
    selCat.innerHTML = '<option value="">Todas as categorias</option>' + categorias.map((c) => `<option>${escapeHtml(c)}</option>`).join('');
    selCat.value = cur;
  }
}

function renderInventarioFromCache() {
  const gridConsumivel = document.getElementById('invGridConsumivel');
  const gridFixo = document.getElementById('invGridFixo');
  if (!gridConsumivel || !gridFixo) return;
  const all = Array.isArray(inventarioCache) ? inventarioCache : [];
  preencherFiltrosInventario(all);
  const fEstado = getValue('filterInvEstado');
  const fCat = getValue('filterInvCategoria');
  const filtrado = all.filter((i: any) => (!fEstado || i.estado === fEstado) && (!fCat || i.categoria === fCat));

  renderInventarioResumo(filtrado);
  const consumiveis = filtrado.filter((i: any) => i.tipo === 'consumivel');
  const fixos = filtrado.filter((i: any) => i.tipo === 'fixo');
  renderInvGrid(consumiveis, gridConsumivel, 'Nenhum item consumível encontrado.');
  renderInvGrid(fixos, gridFixo, 'Nenhum item fixo encontrado.');
  const countCons = document.getElementById('invCountConsumivel');
  const countFix = document.getElementById('invCountFixo');
  if (countCons) countCons.textContent = `(${consumiveis.length})`;
  if (countFix) countFix.textContent = `(${fixos.length})`;
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
    renderInventarioFromCache();
  } catch {
    inventarioCache = [];
    gridConsumivel.innerHTML = '<p class="text-muted">Erro ao carregar inventário.</p>';
    gridFixo.innerHTML = '<p class="text-muted">Erro ao carregar inventário.</p>';
  }
}

// Descarrega um PDF de um endpoint protegido, usando o fetch autenticado
// (com Bearer token). window.open não serve porque não envia o header.
async function descarregarPdfAutenticado(url: string, filename: string, loadingMsg = 'A gerar PDF...') {
  showPdfLoading(loadingMsg);
  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error('Erro no download');
    const blob = await resp.blob();
    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objUrl);
    hidePdfLoading();
  } catch {
    hidePdfLoading();
    showNotification('Erro ao gerar o PDF.', 'error');
  }
}

async function exportarInventarioPdf() {
  showPdfLoading('A exportar inventário PDF...');
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
    hidePdfLoading();
  } catch {
    hidePdfLoading();
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
    // Código de património (só leitura, apenas para fixos já com código)
    const codigoWrap = document.getElementById('invCodigoWrap');
    if (item.codigoPatrimonio) {
      setValue('invCodigo', item.codigoPatrimonio);
      codigoWrap?.removeAttribute('hidden');
    } else {
      codigoWrap?.setAttribute('hidden', 'true');
    }
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

  if (btn) { btn.disabled = true; }
  showPdfLoading(editingInventarioId ? 'A atualizar item...' : 'A guardar item...');

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
    if (btn) { btn.disabled = false; }
    await carregarInventario();
    hidePdfLoading();
  } catch {
    showNotification('❌ Erro ao guardar item', 'error');
    if (btn) { btn.disabled = false; }
    hidePdfLoading();
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
  setupFileDrop('dropPlano', 'planoFile');
  setupMultiEventoAdd('faturaEventoSelect', 'faturaEventosList');
  setupMultiEventoAdd('receitaEventoSelect', 'receitaEventosList');

  document.getElementById('existingAnexoFaturaLink')?.addEventListener('click', () => {
    const url = document.getElementById('existingAnexoFaturaLink')?.getAttribute('data-url');
    if (url && url !== '#') openAnexo(url);
  });
  document.getElementById('existingAnexoReceitaLink')?.addEventListener('click', () => {
    const url = document.getElementById('existingAnexoReceitaLink')?.getAttribute('data-url');
    if (url && url !== '#') openAnexo(url);
  });
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

  // Modal gerir partilhas
  document.getElementById('btnGerirPartilhas')?.addEventListener('click', abrirGerirPartilhas);
  document.getElementById('gerirPartilhasClose')?.addEventListener('click', fecharGerirPartilhas);
  document.getElementById('gerirPartilhasCloseBtn')?.addEventListener('click', fecharGerirPartilhas);
  document.getElementById('gerirPartilhasModal')?.addEventListener('click', (e) => {
    if (e.target === document.getElementById('gerirPartilhasModal')) fecharGerirPartilhas();
  });

  // Modal editar partilha
  document.getElementById('editarPartilhaClose')?.addEventListener('click', fecharEditarPartilha);
  document.getElementById('editarPartilhaCancel')?.addEventListener('click', fecharEditarPartilha);
  document.getElementById('editarPartilhaModal')?.addEventListener('click', (e) => {
    if (e.target === document.getElementById('editarPartilhaModal')) fecharEditarPartilha();
  });
  document.getElementById('editarPartilhaForm')?.addEventListener('submit', guardarEditarPartilha as any);

  setupExportRelatorio();
  setupRelatorioContas();
  setupMovimentos();
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

  // Botões "Cancelar" da barra de ação dos formulários: reutilizam o handler do × do próprio drawer.
  document.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('.js-cancel-form');
    if (!btn) return;
    const closeBtn = btn.closest('.modal-card')?.querySelector('.modal-close') as HTMLElement | null;
    closeBtn?.click();
  });

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
      clearEventoRows('faturaEventosList');
      toggleContaField(getValue('estadoFatura') || 'Pendente', 'contaFaturaWrap', 'Paga');
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
      clearEventoRows('faturaEventosList');
      toggleContaField(getValue('estadoFatura') || 'Pendente', 'contaFaturaWrap', 'Paga');
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

  const estadoFaturaSelect = document.getElementById('estadoFatura') as HTMLSelectElement | null;
  if (estadoFaturaSelect) {
    estadoFaturaSelect.addEventListener('change', () => toggleContaField(estadoFaturaSelect.value, 'contaFaturaWrap', 'Paga'));
  }

  const btnNovaReceita = document.getElementById('btnNovaReceita');
  if (btnNovaReceita) {
    btnNovaReceita.addEventListener('click', () => {
      if (isReadOnly()) { showNotification('Sem permissões para criar receitas.', 'error'); return; }
      setActiveSection('receitas');
      resetForm('receitaForm');
      toggleSection('formularioReceita', true);
      editingReceitaId = null;
      removeReceitaAnexo = false;
      clearEventoRows('receitaEventosList');
      toggleContaField(getValue('estadoReceita') || 'Previsto', 'contaReceitaWrap', 'Recebido');
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

  const estadoReceitaSelect = document.getElementById('estadoReceita') as HTMLSelectElement | null;
  if (estadoReceitaSelect) {
    estadoReceitaSelect.addEventListener('change', () => toggleContaField(estadoReceitaSelect.value, 'contaReceitaWrap', 'Recebido'));
  }

  const btnFiltros = document.getElementById('btnAplicarFiltros');
  if (btnFiltros) btnFiltros.addEventListener('click', () => carregarFaturas(true));

  const btnFiltrosReceita = document.getElementById('btnAplicarFiltrosReceita');
  if (btnFiltrosReceita) btnFiltrosReceita.addEventListener('click', () => carregarReceitas(true));

  const qaNovaReceita = document.getElementById('qaNovaReceita');
  if (qaNovaReceita) {
    qaNovaReceita.addEventListener('click', () => {
      if (isReadOnly()) { showNotification('Sem permissões para criar receitas.', 'error'); return; }
      setActiveSection('receitas');
      resetForm('receitaForm');
      toggleSection('formularioReceita', true);
      editingReceitaId = null;
      removeReceitaAnexo = false;
      clearEventoRows('receitaEventosList');
      toggleContaField(getValue('estadoReceita') || 'Previsto', 'contaReceitaWrap', 'Recebido');
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

  // Filtros do inventário: pesquisa automática (debounce) + estado/categoria filtram localmente.
  const filterInvQ = document.getElementById('filterInvQ');
  if (filterInvQ) filterInvQ.addEventListener('input', debounce(() => carregarInventario(), 300));
  ['filterInvEstado', 'filterInvCategoria'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', () => renderInventarioFromCache());
  });

  const qaEtiquetasInventario = document.getElementById('qaEtiquetasInventario');
  if (qaEtiquetasInventario) {
    qaEtiquetasInventario.addEventListener('click', () => {
      const fixos = (inventarioCache || []).filter((i: any) => i.tipo === 'fixo' && i.codigoPatrimonio);
      if (!fixos.length) { showNotification('Não há bens fixos com código para etiquetar.', 'error'); return; }
      void descarregarPdfAutenticado(`${API_INVENTARIO}/etiquetas/pdf`, 'etiquetas-inventario.pdf', 'A gerar etiquetas...');
    });
  }

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
      document.getElementById('invCodigoWrap')?.setAttribute('hidden', 'true');
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

  const btnRecarregarIA = document.getElementById('btnRecarregarIA');
  if (btnRecarregarIA) {
    btnRecarregarIA.addEventListener('click', () => {
      void refreshIAPanel();
    });
  }

  const btnBackfillIA = document.getElementById('btnBackfillIA');
  if (btnBackfillIA) {
    btnBackfillIA.addEventListener('click', () => {
      void executarBackfillFaturasAntigas();
    });
  }

  document.querySelectorAll('.ia-doc-tab').forEach((tab) => {
    tab.addEventListener('click', (e) => {
      const target = (e.currentTarget as HTMLElement).dataset.iaTipo as 'faturas' | 'receitas' | undefined;
      if (!target) return;
      iaTipoAtual = target;
      iaFiltroAtual = 'todas';
      document.querySelectorAll('.ia-doc-tab').forEach((btn) => btn.classList.toggle('active', (btn as HTMLElement).dataset.iaTipo === target));
      document.querySelectorAll('.ia-tab').forEach((btn) => btn.classList.toggle('active', (btn as HTMLElement).dataset.iaFilter === 'todas'));
      renderIASection();
    });
  });

  document.querySelectorAll('.ia-tab').forEach((tab) => {
    tab.addEventListener('click', (e) => {
      const target = (e.currentTarget as HTMLElement).dataset.iaFilter as 'todas' | 'validadas' | 'analise' | 'alertas' | undefined;
      if (!target) return;
      iaFiltroAtual = target;
      document.querySelectorAll('.ia-tab').forEach((btn) => btn.classList.toggle('active', (btn as HTMLElement).dataset.iaFilter === target));
      renderIASection();
    });
  });

  document.querySelectorAll('.main-nav .nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const target = (e.currentTarget as HTMLElement).dataset.target as 'resumo' | 'faturas' | 'receitas' | 'eventos' | 'ia' | 'inventario' | 'tesouraria' | undefined;
      if (!target) return;
      setActiveSection(target);
      closeSidebar();
    });
  });

  const sidebar = document.getElementById('sidebar');
  const sidebarBackdrop = document.getElementById('sidebarBackdrop');
  const btnSidebarToggle = document.getElementById('btnSidebarToggle');
  if (btnSidebarToggle) btnSidebarToggle.addEventListener('click', openSidebar);
  if (sidebarBackdrop) sidebarBackdrop.addEventListener('click', closeSidebar);
}

function openSidebar() {
  document.getElementById('sidebar')?.classList.add('open');
  document.getElementById('sidebarBackdrop')?.removeAttribute('hidden');
}

function closeSidebar() {
  document.getElementById('sidebar')?.classList.remove('open');
  document.getElementById('sidebarBackdrop')?.setAttribute('hidden', 'true');
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
    setValue('contaReceita', r.movimento?.conta || '');
    toggleContaField(r.estado || 'Previsto', 'contaReceitaWrap', 'Recebido');
    clearEventoRows('receitaEventosList');
    if (r.receitaEventos?.length) {
      r.receitaEventos.forEach((re: any) => {
        const nome = re.evento?.nome || `Evento ${re.eventoId}`;
        addEventoRow('receitaEventosList', re.eventoId, nome, re.valor);
      });
    }
    editingReceitaId = id;
    removeReceitaAnexo = false;
    const existingAnexo = document.getElementById('existingAnexoReceita');
    const existingLink = document.getElementById('existingAnexoReceitaLink') as HTMLAnchorElement | null;
    const dropReceita = document.getElementById('dropReceita');
    if (r.anexo && r.anexo.originalName) {
      if (existingLink) {
        existingLink.textContent = r.anexo.originalName;
        existingLink.setAttribute('data-url', `/receitas/${id}/anexo`);
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
    setValue('fornecedorFatura', f.fornecedor || '');
    setValue('fornecedorNifFatura', f.fornecedorNif || '');
    setValue('dataVencimentoFatura', (f.dataVencimento || '').slice(0, 10));
    setValue('contaFatura', f.movimento?.conta || '');
    toggleContaField(f.estado || 'Pendente', 'contaFaturaWrap', 'Paga');
    clearEventoRows('faturaEventosList');
    if (f.faturaEventos?.length) {
      f.faturaEventos.forEach((fe: any) => {
        const nome = fe.evento?.nome || `Evento ${fe.eventoId}`;
        addEventoRow('faturaEventosList', fe.eventoId, nome, fe.valor);
      });
    }
    editingFaturaId = id;
    removeFaturaAnexo = false;
    const existingAnexo = document.getElementById('existingAnexoFatura');
    const existingLink = document.getElementById('existingAnexoFaturaLink') as HTMLAnchorElement | null;
    const dropFatura = document.getElementById('dropFatura');
    if (f.anexo && f.anexo.originalName) {
      if (existingLink) {
        existingLink.textContent = f.anexo.originalName;
        existingLink.setAttribute('data-url', `/faturas/${id}/anexo`);
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
