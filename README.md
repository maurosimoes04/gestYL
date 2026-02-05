# Gestor de Despesas YL

Aplicação full-stack (Express + SQLite + TypeScript + esbuild) para registar faturas, associá-las a eventos e visualizar resumos/dashboards.

## O que está implementado
- **Faturas**: CRUD básico (backend), filtros por datas, departamento, estado e pesquisa; criação de fatura com associação opcional a evento; exportação de PDF; dashboard com totais do mês, recorrência e gráfico por departamento.
- **Eventos**: CRUD (backend) com criação/edição/remoção; associação de faturas a eventos; cards de eventos mostrando total gasto e nº de faturas por evento.
- **Frontend**: SPA simples com navegação por abas (Resumo, Faturas, Eventos), formulários de fatura e evento, ações rápidas, tabela filtrável de faturas e gráficos (Chart.js).
- **Uploads**: suporte a upload de anexos de fatura (armazenados em `src/backend/uploads`).

## Tecnologias principais
- Backend: Node.js, Express, Sequelize (SQLite), multer (uploads), PDFKit (export PDF), TypeScript.
- Frontend: TypeScript + esbuild, Chart.js, HTML/CSS puro.

## Estrutura (simplificada)
- `src/backend/app.ts` – servidor Express, CORS, estáticos e rotas.
- `src/backend/routes/` – faturas e eventos (CRUD + export PDF).
- `src/backend/models/` – modelos Sequelize `Fatura` e `Evento`.
- `src/frontend/` – `index.html`, assets TS/CSS/JS, ações rápidas, dashboards e formulários.

## Requisitos
- Node.js 18+ e npm
- SQLite 3

## Instalar dependências do sistema (Ubuntu/Debian)
```bash
sudo apt update
sudo apt install nodejs npm sqlite3
```

## Comandos principais
Instalar dependências:
```bash
npm install
```

Desenvolvimento (watch frontend + backend):
```bash
npm run dev
```

Compilar (backend + frontend):
```bash
npm run build
```

Executar aplicação (usa `dist/`):
```bash
npm start
```

A aplicação fica disponível em: http://localhost:3000

## Notas
- Bundles frontend são gerados em `src/frontend/assets/js/` (ignorados no git); use `npm run build:frontend` para regenerar.
- Anexos de fatura ficam em `src/backend/uploads/`; limpe manualmente se for ambiente de dev.

