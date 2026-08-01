const token = window.location.pathname.split('/').pop();

function escapeHtml(text) {
  return String(text || '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
}

function formatCurrency(value) {
  const num = Number(value || 0);
  return `${num.toFixed(2)} €`;
}

function formatDate(value) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('pt-PT');
}

function estadoBadge(estado) {
  const map = {
    Paga: 'status-ok',
    Recebido: 'status-ok',
    Pendente: 'status-pending',
    Previsto: 'status-pending',
  };
  const cls = map[estado] || 'status-default';
  return `<span class="status-badge ${cls}">${escapeHtml(estado || '-')}</span>`;
}

function setAccessMsg(message, type) {
  const el = document.getElementById('shareAccessMsg');
  if (!el) return;
  el.textContent = message;
  el.className = `form-msg ${type}`;
  el.removeAttribute('hidden');
}

function renderResumo(resumo) {
  const wrap = document.getElementById('shareEventoResumo');
  if (!wrap) return;
  const saldoClass = resumo.saldo >= 0 ? 'color:#16a34a' : 'color:#dc2626';
  wrap.innerHTML = `
    <div class="summary-card"><div class="label">Receitas</div><div class="value" style="color:#16a34a">${formatCurrency(resumo.totalReceitas)}</div></div>
    <div class="summary-card"><div class="label">Despesas</div><div class="value" style="color:#dc2626">${formatCurrency(resumo.totalDespesas)}</div></div>
    <div class="summary-card"><div class="label">Saldo</div><div class="value" style="${saldoClass}">${formatCurrency(resumo.saldo)}</div></div>
  `;
}

function renderTable(rows, targetId, cols, anexoLabel) {
  const tbody = document.getElementById(targetId);
  if (!tbody) return;
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="${cols}">Sem registos.</td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map((row) => {
    const safeLink = row.anexoLink && row.anexoLink.startsWith('/') ? escapeHtml(row.anexoLink) : '';
    const anexo = safeLink ? `<a href="${safeLink}" target="_blank">${escapeHtml(anexoLabel)}</a>` : '-';
    const displayVal = row.valorEvento != null ? row.valorEvento : row.valor;
    return row.__tipo === 'receita'
      ? `<tr>
          <td>${escapeHtml(row.titulo) || '-'}</td>
          <td>${escapeHtml(row.categoria) || '-'}</td>
          <td>${escapeHtml(row.financiador) || '-'}</td>
          <td>${formatDate(row.data)}</td>
          <td>${estadoBadge(row.estado)}</td>
          <td>${formatCurrency(displayVal)}</td>
          <td>${anexo}</td>
        </tr>`
      : `<tr>
          <td>${escapeHtml(row.titulo) || '-'}</td>
          <td>${escapeHtml(row.departamento) || '-'}</td>
          <td>${escapeHtml(row.fornecedor) || '-'}</td>
          <td>${escapeHtml(row.numero) || '-'}</td>
          <td>${formatDate(row.data)}</td>
          <td>${estadoBadge(row.estado)}</td>
          <td>${formatCurrency(displayVal)}</td>
          <td>${anexo}</td>
        </tr>`;
  }).join('');
}

function showExpired() {
  document.body.classList.add('share-auth');
  document.getElementById('shareHeader')?.setAttribute('hidden', 'true');
  document.getElementById('shareAccessSection')?.setAttribute('hidden', 'true');
  document.getElementById('shareEventoWrap')?.setAttribute('hidden', 'true');
  document.getElementById('shareExpiredSection')?.removeAttribute('hidden');
}

function showLogin() {
  document.body.classList.add('share-auth');
  document.getElementById('shareHeader')?.setAttribute('hidden', 'true');
  document.getElementById('shareExpiredSection')?.setAttribute('hidden', 'true');
  document.getElementById('shareEventoWrap')?.setAttribute('hidden', 'true');
  document.getElementById('shareAccessSection')?.removeAttribute('hidden');
  document.getElementById('sharePassword').value = '';
  document.getElementById('shareAccessMsg')?.setAttribute('hidden', 'true');
}

function renderEvento(data) {
  document.body.classList.remove('share-auth');
  document.getElementById('shareHeader')?.removeAttribute('hidden');
  document.getElementById('shareAccessSection')?.setAttribute('hidden', 'true');
  document.getElementById('shareExpiredSection')?.setAttribute('hidden', 'true');
  document.getElementById('shareEventoWrap')?.removeAttribute('hidden');

  document.getElementById('shareEventoNome').textContent = data.evento?.nome || 'Evento';
  document.getElementById('shareEventoDesc').textContent = data.evento?.descricao || '';

  const periodoEl = document.getElementById('shareEventoPeriodo');
  if (periodoEl && (data.evento?.dataInicio || data.evento?.dataFim)) {
    const inicio = data.evento?.dataInicio ? formatDate(data.evento.dataInicio) : '?';
    const fim = data.evento?.dataFim ? formatDate(data.evento.dataFim) : '?';
    periodoEl.textContent = inicio === fim ? inicio : `${inicio} — ${fim}`;
    periodoEl.removeAttribute('hidden');
  }

  const deptEl = document.getElementById('shareEventoDept');
  if (data.evento?.departamento) {
    deptEl.textContent = data.evento.departamento;
    deptEl.removeAttribute('hidden');
  }

  const infoEl = document.getElementById('shareSessionInfo');
  if (infoEl && data.shareExpiresAt) {
    infoEl.textContent = `Partilha válida até ${new Date(data.shareExpiresAt).toLocaleString('pt-PT')}`;
  }

  const downloadBtn = document.getElementById('shareDownloadBtn');
  if (downloadBtn) {
    if (data.downloadLink) {
      downloadBtn.removeAttribute('hidden');
      downloadBtn.onclick = () => { window.location.href = data.downloadLink; };
    } else {
      downloadBtn.setAttribute('hidden', 'true');
    }
  }

  const relatorioBtn = document.getElementById('shareRelatorioBtn');
  if (relatorioBtn && data.relatorioLink) {
    relatorioBtn.removeAttribute('hidden');
    relatorioBtn.onclick = () => { window.open(data.relatorioLink, '_blank'); };
  }

  renderResumo(data.resumo || { totalReceitas: 0, totalDespesas: 0, saldo: 0 });

  const receitas = (data.receitas || []).map((r) => ({ ...r, __tipo: 'receita' }));
  const faturas = (data.faturas || []).map((f) => ({ ...f, __tipo: 'fatura' }));

  renderTable(receitas, 'shareReceitas', 7, 'Abrir');
  renderTable(faturas, 'shareDespesas', 8, 'Abrir');
}

document.getElementById('shareReauthBtn')?.addEventListener('click', showLogin);

document.getElementById('shareAccessForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const password = document.getElementById('sharePassword').value;
  if (!password) { setAccessMsg('Password obrigatoria.', 'error'); return; }

  const btn = document.getElementById('shareAccessBtn');
  const originalText = btn?.textContent;
  if (btn) { btn.textContent = 'A validar...'; btn.disabled = true; }

  try {
    const resp = await fetch(`/share/evento/${token}/access`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });
    const data = await resp.json().catch(() => ({}));

    if (resp.status === 401 && data.expired) {
      showExpired();
      return;
    }
    if (!resp.ok) throw new Error(data.error || 'Erro ao validar partilha');

    renderEvento(data);
  } catch (err) {
    setAccessMsg(err.message || 'Erro ao validar partilha.', 'error');
  } finally {
    if (btn) { btn.textContent = originalText; btn.disabled = false; }
  }
});

// Ao carregar a página, tenta restaurar a sessão sem pedir a password de novo
// (o cookie de acesso emitido em /access continua válido durante 12h).
(async () => {
  try {
    const resp = await fetch(`/share/evento/${token}/session`);
    if (!resp.ok) return;
    const data = await resp.json();
    renderEvento(data);
  } catch {
    // Sem sessão válida — mantém o ecrã de login visível.
  }
})();
