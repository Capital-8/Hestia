#!/usr/bin/env bash
# Roda uma fila de fichas com no máximo N em paralelo. Uso: rodar-fila.sh <branch-base> <N> "<id>|<modelo>" ...
# Cada item: id da ficha e modelo do opencode (ex.: opencode-go/qwen3.8-flash). Espera terminar tudo. Log por ficha em ../logs-run-<id>.txt
BASE="$1"; N="$2"; shift 2
RAIZ="$(git rev-parse --show-toplevel)"; PAI="$(dirname "$RAIZ")"
printf '%s\n' "$@" | xargs -P "$N" -I{} bash -c 'item="{}"; id="${item%%|*}"; mod="${item#*|}"; rm -f "'"$PAI"'/logs-run-$id.txt"; MODELO="$mod" bash "'"$RAIZ"'/docs/handoff/componentes/run-ficha.sh" "$id" "'"$BASE"'" > "'"$PAI"'/logs-run-$id.txt" 2>&1'
echo "fila terminada"
