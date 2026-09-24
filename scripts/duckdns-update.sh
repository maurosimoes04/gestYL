#!/bin/bash
# duckdns-update.sh — Atualiza o IP no DuckDNS (DNS dinâmico).
# Corre periodicamente via LaunchDaemon. Só faz um pedido HTTP de saída,
# por isso não tem problemas de TCC (não acede a ~/Documents).
#
# Token e domínio vêm de variáveis de ambiente (definidas no plist),
# para não ficarem hardcoded no repositório.

set -u

DOMAIN="${DUCKDNS_DOMAIN:-}"
TOKEN="${DUCKDNS_TOKEN:-}"
LOG_FILE="${DUCKDNS_LOG:-/Users/young-link/Library/Logs/gestor/duckdns.log}"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG_FILE"; }

if [ -z "$DOMAIN" ] || [ -z "$TOKEN" ]; then
  log "ERRO: DUCKDNS_DOMAIN ou DUCKDNS_TOKEN não definidos."
  exit 1
fi

# ip= vazio → o DuckDNS deteta o IP público a partir do pedido.
RESP=$(curl -s --max-time 20 \
  "https://www.duckdns.org/update?domains=${DOMAIN}&token=${TOKEN}&ip=")

if [ "$RESP" = "OK" ]; then
  log "OK — IP atualizado no DuckDNS (${DOMAIN}.duckdns.org)."
else
  log "FALHA — resposta do DuckDNS: '${RESP}'"
  exit 1
fi
