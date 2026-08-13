const codigo = decodeURIComponent(window.location.pathname.split('/').pop() || '');

function escapeHtml(text) {
  return String(text == null ? '' : text).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
}

function formatDate(value) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('pt-PT');
}

function tipoLabel(t) {
  return t === 'fixo' ? 'Bem fixo' : t === 'consumivel' ? 'Consumível' : (t || '-');
}

function row(k, v) {
  if (!v) return '';
  return `<div class="item-row"><span class="k">${escapeHtml(k)}</span><span class="v">${escapeHtml(v)}</span></div>`;
}

(async () => {
  const body = document.getElementById('itemBody');
  try {
    const resp = await fetch(`/item-info/${encodeURIComponent(codigo)}`);
    if (!resp.ok) {
      body.innerHTML = '<p class="item-msg">Item não encontrado.</p>';
      return;
    }
    const item = await resp.json();
    body.innerHTML = `
      <div class="item-codigo">${escapeHtml(item.codigoPatrimonio || codigo)}</div>
      <div class="item-nome">${escapeHtml(item.nome || 'Item')}</div>
      <div class="item-badges">
        <span class="item-chip">${escapeHtml(tipoLabel(item.tipo))}</span>
        ${item.categoria ? `<span class="item-chip">${escapeHtml(item.categoria)}</span>` : ''}
        ${item.estado ? `<span class="item-chip">${escapeHtml(item.estado)}</span>` : ''}
      </div>
      <div class="item-rows">
        ${row('Localização', item.localizacao)}
        ${row('Data de aquisição', item.dataAquisicao ? formatDate(item.dataAquisicao) : '')}
      </div>
    `;
  } catch {
    body.innerHTML = '<p class="item-msg">Erro ao carregar o item.</p>';
  }
})();
