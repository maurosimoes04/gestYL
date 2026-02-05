const EVENTO_API_URL = 'http://localhost:3000/eventos';

export async function listarEventos() {
  const res = await fetch(EVENTO_API_URL);
  if (!res.ok) throw new Error('Erro ao listar eventos');
  return res.json();
}

export async function criarEvento(evento: {
  nome: string;
  descricao?: string;
  data_inicio?: string;
  data_fim?: string;
  departamento?: string;
}) {
  const res = await fetch(EVENTO_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(evento)
  });
  if (!res.ok) throw new Error('Erro ao criar evento');
  return res.json();
}
