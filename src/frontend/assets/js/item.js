const codigo = decodeURIComponent(window.location.pathname.split('/').pop() || '');

function escapeHtml(text) {
  return String(text == null ? '' : text).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
}

function formatDate(value) {
  if (!value) return null;
  try { return new Date(value).toLocaleDateString('pt-PT'); } catch { return null; }
}

function tipoLabel(t) {
  return t === 'fixo' ? 'Ativo fixo' : t === 'consumivel' ? 'Consumível' : (t || '—');
}

function chipClass(estado) {
  const s = (estado || '').toLowerCase();
  if (['ativo', 'bom'].includes(s)) return 'good';
  if (['avariado', 'abatido'].includes(s)) return 'warn';
  return 'neutral';
}

function row(label, value, iconSvg) {
  if (!value) return '';
  return `
    <div class="row">
      <span class="k">${iconSvg || ''}${escapeHtml(label)}</span>
      <span class="v">${escapeHtml(value)}</span>
    </div>`;
}

const ICONS = {
  loc: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>',
  cal: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
  tag: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41L13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>',
  pkg: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8l-9-5-9 5v8l9 5 9-5z"/></svg>',
};

(async () => {
  const card = document.getElementById('card');
  try {
    const resp = await fetch(`/item-info/${encodeURIComponent(codigo)}`);
    if (!resp.ok) {
      card.innerHTML = `
        <div class="msg-estado">
          <div class="ico">?</div>
          <div class="ttl">Item não encontrado</div>
          <div class="sub">Nenhum item com o código <strong>${escapeHtml(codigo)}</strong> está registado no inventário.</div>
        </div>
        <div class="foot">Associação Young-Link · Castro Marim</div>
      `;
      return;
    }
    const item = await resp.json();
    const chips = [
      `<span class="chip">${escapeHtml(tipoLabel(item.tipo))}</span>`,
      item.categoria ? `<span class="chip neutral">${escapeHtml(item.categoria)}</span>` : '',
      item.estado ? `<span class="chip ${chipClass(item.estado)}">${escapeHtml(item.estado)}</span>` : '',
    ].filter(Boolean).join('');

    const dataAq = formatDate(item.dataAquisicao);
    const dataVl = formatDate(item.dataValidade);

    card.innerHTML = `
      <div class="card-head">
        <span class="label">Código de património</span>
        <div class="codigo">${escapeHtml(item.codigoPatrimonio || codigo)}</div>
        <div class="nome">${escapeHtml(item.nome || '—')}</div>
      </div>
      <div class="card-body">
        <div class="chips">${chips}</div>
        <div class="rows">
          ${row('Localização', item.localizacao, ICONS.loc)}
          ${row('Categoria', item.categoria, ICONS.tag)}
          ${dataAq ? row('Adquirido em', dataAq, ICONS.cal) : ''}
          ${dataVl ? row('Validade', dataVl, ICONS.cal) : ''}
        </div>
      </div>
      <div class="foot">Associação Young-Link · Castro Marim</div>
    `;
  } catch (err) {
    card.innerHTML = `
      <div class="msg-estado">
        <div class="ico">!</div>
        <div class="ttl">Erro ao carregar</div>
        <div class="sub">Tenta recarregar a página. Se persistir, contacta a Young-Link.</div>
      </div>
      <div class="foot">Associação Young-Link · Castro Marim</div>
    `;
  }
})();
