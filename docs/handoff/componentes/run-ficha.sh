#!/usr/bin/env bash
# Lança uma ficha no DeepSeek v4.1 flash num worktree novo. Uso (da raiz de qualquer worktree do repositório):
#   docs/handoff/componentes/run-ficha.sh <id-da-ficha> <branch-base>
# Cria ../<id>  (worktree) na branch feat/fam-<id> a partir de <branch-base>, instala dependências, copia a ficha e roda o executor.
# Log em <worktree>/../logs-fichas/<id>.log. NUNCA usa o modelo "pro". Não faz push.
set -euo pipefail
ID="$1"; BASE="$2"
RAIZ="$(git rev-parse --show-toplevel)"
PAI="$(dirname "$RAIZ")"
WT="$PAI/fam-$ID"
LOGS="$PAI/logs-fichas"; mkdir -p "$LOGS"
FICHA="$RAIZ/docs/handoff/componentes/fichas/$ID.md"
[ -f "$FICHA" ] || { echo "ficha não existe: $FICHA"; exit 1; }
if [ ! -d "$WT" ]; then git -C "$RAIZ" worktree add "$WT" -b "feat/fam-$ID" "$BASE"; fi
(cd "$WT" && [ -d node_modules ] || npm ci --no-audit --no-fund >/dev/null 2>&1)
cp "$FICHA" "$WT/.ficha.md"  # fora do controle de versão (ver .git/info/exclude do worktree)
echo ".ficha.md" >> "$(git -C "$WT" rev-parse --git-path info/exclude)"
cd "$WT"
opencode run -m opencode-go/deepseek-v4.1-flash --dir "$WT" \
  -f docs/handoff/regras-gerais.md -f docs/handoff/componentes/REGRAS-FLASH.md -f .ficha.md \
  "Execute a ficha anexa (.ficha.md) seguindo as regras anexas. Trabalhe só neste diretório. Termine com tudo commitado e o relatório pedido." \
  > "$LOGS/$ID.log" 2>&1
echo "executor terminou: $ID (log em $LOGS/$ID.log)"
