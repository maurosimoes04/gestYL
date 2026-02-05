// Notificação customizada (evita conflito com Notification do DOM)
function showNotif(message: string, type: 'success' | 'error' = 'success') {
  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  notification.innerHTML = `
    <span class="notification-icon">${type === 'success' ? '✅' : '❌'}</span>
    <span class="notification-message">${message}</span>
  `;
  document.body.appendChild(notification);
  setTimeout(() => {
    notification.style.animation = 'slideIn 0.3s ease reverse';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

import { listarEventos, criarEvento } from './eventoApi';

const API_URL = 'http://localhost:3000/faturas';

declare const Chart: any;
let chartInstance: any = null;

function getValue(id: string): string {
  const el = document.getElementById(id) as (HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement) | null;
  return el ? (el as any).value : '';
}
function setValue(id: string, value: string) {
  const el = document.getElementById(id) as (HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement) | null;
  if (!el) return;
  (el as any).value = value;
}
document.addEventListener('DOMContentLoaded', init);
function getFiltros() {
  return {
    dateFrom: getValue('filterFrom') || undefined,
    dateTo: getValue('filterTo') || undefined,
    q: getValue('filterQ') || undefined,
    departamento: getValue('filterDepartamento') || undefined,
    estado: getValue('filterEstado') || undefined
  };
  }

  declare function init(): void;
  (window as any).showNotification = showNotif;
function buildQueryString(params: {[k: string]: any} = {}) {
  const esc = encodeURIComponent;
  return Object.keys(params)
    .filter(k => params[k] !== undefined && params[k] !== '')
    .map(k => `${esc(k)}=${esc(params[k])}`)
    .join('&');
}
async function carregarFaturas(filtros: any = {}) {
  const tabela = document.getElementById('tabelaFaturas') as HTMLTableSectionElement;
  tabela.innerHTML = '';
  try {
    const qs = buildQueryString(filtros);
    const url = qs ? `${API_URL}?${qs}` : API_URL;
    const resposta = await fetch(url);
    const faturas = await resposta.json();
    if (!Array.isArray(faturas)) return;
    faturas.forEach((f: any) => {
      const linha = document.createElement('tr');
      linha.innerHTML = `
        <td>${f.titulo}</td>
        <td>${f.tipo || ''}</td>
        <td>${f.numero || ''}</td>
        <td>${Number(f.valor).toFixed(2)} €</td>
        <td>${f.data}</td>
        <td>${f.departamento}</td>
        <td>${f.estado}</td>
        <td>
          ${f.anexo ? ('<a href="/faturas/' + f.id + '/anexo" target="_blank">Anexo</a>') : ''}
          <button onclick="eliminarFatura(${f.id})">🗑️</button>
        </td>
      `;
      tabela.appendChild(linha);
    });
    renderChart(faturas);
  } catch (err) {
    console.error(err);
    showNotif('Erro ao carregar faturas', 'error');
  }
}
async function eliminarFatura(id: number) {
  if (confirm('⚠️ Tem a certeza que deseja eliminar esta fatura?')) {
    try {
      await fetch(`${API_URL}/${id}`, { method: 'DELETE' });
      showNotif('🗑️ Fatura eliminada com sucesso!', 'success');
      carregarFaturas(getFiltros());
    } catch (err) {
      console.error(err);
      showNotif('Erro ao eliminar fatura', 'error');
    }
  }
}
(window as any).eliminarFatura = eliminarFatura;
function renderChart(faturas: any[]) {
  try {
    const sums: {[k:string]: number} = {};
    faturas.forEach(f => {
      const dep = f.departamento || 'Sem departamento';
      const val = Number(f.valor) || 0;
      sums[dep] = (sums[dep] || 0) + val;
    });
    const labels = Object.keys(sums);
    const data = labels.map(l => sums[l]);
    const canvas = document.getElementById('chartDespesas') as HTMLCanvasElement | null;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    if (chartInstance) {
      chartInstance.data.labels = labels;
      chartInstance.data.datasets[0].data = data;
      chartInstance.update();
      return;
    }
    chartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Despesa por Departamento (€)',
          data,
          backgroundColor: 'rgba(54, 162, 235, 0.6)'
        }]
      },
      options: {
        responsive: true,
        scales: { y: { beginAtZero: true } }
      }
    });
  } catch (err) {
    console.error('Erro ao renderizar gráfico', err);
  }
}
