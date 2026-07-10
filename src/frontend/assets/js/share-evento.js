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
          <td>${formatDate(row.data)}</td>
          <td>${formatCurrency(displayVal)}</td>
          <td>${anexo}</td>
        </tr>`
      : `<tr>
          <td>${escapeHtml(row.titulo) || '-'}</td>
          <td>${escapeHtml(row.departamento) || '-'}</td>
          <td>${formatDate(row.data)}</td>
          <td>${formatCurrency(displayVal)}</td>
          <td>${anexo}</td>
        </tr>`;
  }).join('');
}

function showExpired() {
  document.getElementById('shareAccessSection')?.setAttribute('hidden', 'true');
  document.getElementById('shareEventoWrap')?.setAttribute('hidden', 'true');
  document.getElementById('shareExpiredSection')?.removeAttribute('hidden');
}

function showLogin() {
  document.getElementById('shareExpiredSection')?.setAttribute('hidden', 'true');
  document.getElementById('shareEventoWrap')?.setAttribute('hidden', 'true');
  document.getElementById('shareAccessSection')?.removeAttribute('hidden');
  document.getElementById('sharePassword').value = '';
  document.getElementById('shareAccessMsg')?.setAttribute('hidden', 'true');
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

    document.getElementById('shareAccessSection')?.setAttribute('hidden', 'true');
    document.getElementById('shareEventoWrap')?.removeAttribute('hidden');

    document.getElementById('shareEventoNome').textContent = data.evento?.nome || 'Evento';
    document.getElementById('shareEventoDesc').textContent = data.evento?.descricao || '';

    const deptEl = document.getElementById('shareEventoDept');
    if (data.evento?.departamento) {
      deptEl.textContent = data.evento.departamento;
      deptEl.removeAttribute('hidden');
    }

    const infoEl = document.getElementById('shareSessionInfo');
    if (infoEl) {
      const parts = [];
      if (data.shareExpiresAt) {
        parts.push(`Partilha válida até ${new Date(data.shareExpiresAt).toLocaleString('pt-PT')}`);
      }
      if (data.sessionExpiresAt) {
        parts.push(`Sessão expira às ${new Date(data.sessionExpiresAt).toLocaleString('pt-PT')}`);
      }
      infoEl.textContent = parts.join(' · ');
    }

    renderResumo(data.resumo || { totalReceitas: 0, totalDespesas: 0, saldo: 0 });

    const receitas = (data.receitas || []).map((r) => ({ ...r, __tipo: 'receita' }));
    const faturas = (data.faturas || []).map((f) => ({ ...f, __tipo: 'fatura' }));

    renderTable(receitas, 'shareReceitas', 5, 'Abrir');
    renderTable(faturas, 'shareDespesas', 5, 'Abrir');
  } catch (err) {
    setAccessMsg(err.message || 'Erro ao validar partilha.', 'error');
  } finally {
    if (btn) { btn.textContent = originalText; btn.disabled = false; }
  }
});
