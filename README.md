# Gestor YL

Sistema de gestão financeira da **Young-Link — Associação Juvenil de Castro Marim**.
Faz o controlo de despesas, receitas, inventário, RH / dossiês e processos (eventos,
projetos anuais, investimentos e subsídios), com classificação legal segundo o SNC
português (isento de IVA pelo artigo 9.º).

## Arquitetura

- **Backend** — Node.js + Express + TypeScript, Prisma ORM com PostgreSQL (Supabase),
  autenticação Supabase (JWT), uploads via Multer, PDFs com PDFKit, IA de
  classificação SNC via Google Gemini.
- **Frontend novo (`/app`)** — React 18 + Vite + TypeScript + TailwindCSS, servido em
  `/` e `/app/*`. Design system próprio (Button/Input/Card/Modal/Table/Badge/...).
- **Páginas públicas** — `set-password.html`, `reset-password.html`, `item.html` (QR
  do inventário) e a rota React `/share/evento/:token` (partilha de processo).

## Estrutura

```
src/
  backend/
    app.ts                — servidor Express (CORS, Helmet, rate-limit, estáticos)
    routes/               — faturas, receitas, eventos (processos), inventário,
                            entidades, documentos, contas SNC, IA SNC, relatórios,
                            tesouraria, partilhas públicas, admin
    services/             — Supabase, email, sugestão SNC via Gemini
    middleware/           — auth, guardWrite, audit
    utils/                — depreciação (DR 25/2009) e helpers
  frontend/
    app/                  — build Vite do novo frontend (gerado)
    item.html             — página pública do QR do inventário
    set-password.html     — primeira password (fluxo Supabase)
    reset-password.html   — recuperação de password
app/                       — código-fonte do frontend React (Vite)
  src/
    pages/                — Resumo, Despesas, Receitas, Processos, RH, Inventário,
                            Tesouraria, Relatórios, Entidades, Partilhas, IA, Admin
    components/           — layout, forms, ui (design system YL)
    contexts/             — AuthContext (Supabase), ToastContext
    hooks/, lib/          — fetch client com Bearer, catalogos cache
prisma/
  schema.prisma           — modelos (ContaSNC, Entidade, Documento, Processo,
                            StockMovimento, Fatura, Receita, Inventario, ...)
  seeds/plano_snc.ts      — plano de contas YL (23 contas base + 6388)
  migrations/             — migrações manuais e Prisma
scripts/
  reestruturar_snc.ts     — seed + desduplicação por NIF + reclassificação SNC
  migrateToSupabase.ts    — migração histórica SQLite → Supabase
  deploy.sh, status.sh, run-server.sh, install-agents.sh — self-host (LaunchAgent)
docs/
  MANUAL_RH_DOSSIES.md    — manual prático de RH (caso Ilza, estagiária IEFP)
```

## Comandos principais

```bash
# instalar
npm install
cd app && npm install && cd ..

# desenvolvimento (dois processos)
npm run dev            # backend em :3000
npm run dev:app        # frontend Vite em :5174 (proxy para o backend)

# produção
npm run build          # gera dist/backend e src/frontend/app
npm start              # arranca a app em :3000
```

A aplicação em produção fica disponível em `http://localhost:3000`. As rotas
protegidas são servidas pelo React app; as rotas públicas (`/share/evento/...`,
`/item/...`, `/set-password`, `/reset-password`) são servidas pelo Express.

## Requisitos

- Node.js 20+
- Base de dados Postgres (Supabase recomendado); credenciais em `.env`
- Chave de API Google Gemini para a classificação SNC por IA (opcional)

## Self-host (macOS LaunchAgent)

Os scripts em `scripts/` instalam o backend + DuckDNS como `LaunchAgent`:

```bash
scripts/setup-selfhost.sh    # setup inicial
scripts/install-agents.sh    # instala/atualiza LaunchAgents
scripts/status.sh            # verifica estado
```

Ver `scripts/README-selfhost.md` para detalhes.

## Notas

- IVA — a Young-Link é **isenta pelo artigo 9.º do CIVA**; o sistema não calcula
  IVA e os relatórios refletem essa condição.
- SNC — classificação por **ContaSNC** (72, 75, 76, 622, 6262, 6251, 6263, 6266,
  612, 631, 635, 6388, 68, 43x, 59, 22, 232, 11, 12 e variantes).
- Inventário — ligação a despesa de origem para capitalização, depreciação anual
  segundo o DR 25/2009 e stock movimentado (entradas / consumos / ajustes / perdas).
- Partilha — processos (ex-eventos) podem ser partilhados publicamente por token
  com password, acesso via `/share/evento/<token>` (cookie válido 12 h).
