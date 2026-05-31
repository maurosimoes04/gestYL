const token = window.location.pathname.split('/').pop();

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
    const anexo = row.anexoLink ? `<a href="${row.anexoLink}" target="_blank">${anexoLabel}</a>` : '-';
    return row.__tipo === 'receita'
      ? `<tr>
          <td>${row.titulo || '-'}</td>
          <td>${row.categoria || '-'}</td>
          <td>${formatDate(row.data)}</td>
          <td>${formatCurrency(row.valor)}</td>
          <td>${anexo}</td>
        </tr>`
      : `<tr>
          <td>${row.titulo || '-'}</td>
          <td>${row.departamento || '-'}</td>
          <td>${formatDate(row.data)}</td>
          <td>${formatCurrency(row.valor)}</td>
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

    if (data.sessionExpiresAt) {
      const expDate = new Date(data.sessionExpiresAt).toLocaleString('pt-PT');
      document.getElementById('shareSessionInfo').textContent = `Sessao valida ate ${expDate}`;
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
