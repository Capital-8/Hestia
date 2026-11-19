#!/usr/bin/env bash
# Lança várias fichas em paralelo e espera todas terminarem. Uso: docs/handoff/componentes/rodar-fichas.sh <branch-base> <id> [<id>...]
set -u
BASE="$1"; shift
RAIZ="$(git rev-parse --show-toplevel)"
PAI="$(dirname "$RAIZ")"
for id in "$@"; do
  rm -f "$PAI/logs-run-$id.txt"
  (nohup bash "$RAIZ/docs/handoff/componentes/run-ficha.sh" "$id" "$BASE" > "$PAI/logs-run-$id.txt" 2>&1 &)
done
for _ in $(seq 1 115); do
  n=0
  for id in "$@"; do grep -q "executor terminou" "$PAI/logs-run-$id.txt" 2>/dev/null && n=$((n+1)); done
  [ "$n" -eq "$#" ] && break
  sleep 5
done
echo "terminadas: $n de $#"
