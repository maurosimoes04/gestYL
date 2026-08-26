#!/bin/bash
# status.sh — Verifica o estado de todos os serviços do Gestor YL
echo "============================================"
echo "  Gestor YL — Estado dos Serviços"
echo "  $(date '+%Y-%m-%d %H:%M:%S')"
echo "============================================"
echo ""

check_service() {
  local label="$1"
  local name="$2"
  if launchctl list "$label" &>/dev/null 2>&1; then
    echo "  ✅ $name — ativo"
  else
    echo "  ❌ $name — inativo"
  fi
}

echo "Serviços:"
check_service "com.younglink.gestor" "Gestor YL (servidor)"
check_service "com.younglink.caddy" "Caddy (HTTPS proxy)"
check_service "com.younglink.gestor-updater" "Auto-updater"

echo ""
echo "Versão atual:"
cd /Users/young-link/Documents/GESTOR_YL
echo "  Branch: $(git branch --show-current)"
echo "  Commit: $(git log -1 --format='%h — %s (%cr)')"

echo ""
echo "Portas:"
if lsof -i :3000 -sTCP:LISTEN &>/dev/null 2>&1; then
  echo "  ✅ Porta 3000 (Gestor) — a escutar"
else
  echo "  ❌ Porta 3000 (Gestor) — inativa"
fi
if lsof -i :443 -sTCP:LISTEN &>/dev/null 2>&1; then
  echo "  ✅ Porta 443 (HTTPS) — a escutar"
else
  echo "  ❌ Porta 443 (HTTPS) — inativa"
fi
if lsof -i :80 -sTCP:LISTEN &>/dev/null 2>&1; then
  echo "  ✅ Porta 80 (HTTP) — a escutar"
else
  echo "  ❌ Porta 80 (HTTP) — inativa"
fi

echo ""
echo "IP público: $(curl -s --max-time 5 ifconfig.me 2>/dev/null || echo 'indisponível')"

echo ""
echo "Últimas linhas do log do servidor:"
tail -3 /Users/young-link/Documents/GESTOR_YL/logs/gestor-stdout.log 2>/dev/null || echo "  (sem logs)"

echo ""
echo "Últimas linhas do log do Caddy:"
tail -3 /Users/young-link/Documents/GESTOR_YL/logs/caddy-stderr.log 2>/dev/null || echo "  (sem logs)"

echo ""
echo "Último deploy:"
tail -3 /Users/young-link/Documents/GESTOR_YL/logs/deploy.log 2>/dev/null || echo "  (sem logs)"
echo ""
