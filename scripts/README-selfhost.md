# Self-hosting / Deploy — Gestor YL

O site corre nesta máquina: **Caddy** (HTTPS) faz reverse-proxy de
`gestor.younglink.net` → `localhost:3000`, onde corre `node dist/backend/server.js`.

O frontend é servido de `src/frontend/`; o backend corre de `dist/` (compilado).
**Por isso, depois de cada alteração é preciso compilar (`npm run build`) e reiniciar o
processo** — senão as atualizações não aparecem.

## Deploy manual (recomendado hoje) — a partir do Terminal

```bash
cd ~/Documents/GESTOR_YL
bash scripts/deploy.sh
```

O `deploy.sh` faz: `git fetch` → se houver novidades, `pull` → `npm install` (se preciso)
→ `npm run build` (tsc + esbuild) → reinicia o servidor na porta 3000.
Corre-o **a partir do Terminal**, que tem permissão para aceder a `~/Documents`.

## Automação por launchd (opcional) — requer 1 passo manual

Há dois LaunchAgents em `scripts/launchd/`:
- `com.younglink.gestor` — mantém o servidor a correr (arranca no login, reinicia se cair).
- `com.younglink.gestor-updater` — corre o `deploy.sh` a cada 5 min (auto-deploy).

Instalar (sem sudo):

```bash
bash scripts/install-agents.sh
```

### IMPORTANTE — TCC / permissões do macOS
O projeto está em `~/Documents`, que o macOS **protege por TCC**. Processos lançados
pelo launchd são bloqueados ("Operation not permitted") e os agentes **não funcionam**
enquanto isso não for resolvido. Duas opções:

1. **Dar "Full Disk Access"** a `/bin/bash` (e ao `node`) em
   *Definições do Sistema → Privacidade e Segurança → Acesso Total ao Disco*. Depois
   `bash scripts/install-agents.sh`.
2. **Mover o projeto para fora de `~/Documents`** (ex.: `~/gestor-yl`), que não é
   protegido. É a opção mais limpa (launchd funciona sem mais permissões). É preciso
   atualizar os caminhos absolutos nos plists e no Caddy (a porta mantém-se 3000).

Enquanto não fizeres uma destas, usa o **deploy manual** acima.

## Estado / logs

```bash
bash scripts/status.sh
tail -f ~/Library/Logs/gestor/gestor-stdout.log   # servidor (via launchd)
tail -f ~/gestor-prod.log                          # servidor (via nohup manual)
tail -f logs/deploy.log                            # deploys
```

## Arranque manual do servidor (sem launchd)

```bash
cd ~/Documents/GESTOR_YL
NODE_ENV=production nohup node dist/backend/server.js > ~/gestor-prod.log 2>&1 &
```

> Nota: os ficheiros em `scripts/launchd/` e `setup-selfhost.sh` incluem também a
> variante original para um utilizador dedicado com LaunchDaemons de sistema (arranque
> no boot sem login) — requer `sudo` e resolve o TCC por correr noutro contexto.
