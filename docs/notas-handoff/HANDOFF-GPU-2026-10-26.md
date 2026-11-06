# Handoff GPU-first — pausa de 2026-10-26

- **Pausa:** 2026-10-26 22:4x (horário local)
- **Retomada prevista:** 2026-10-27
- **Ramo principal:** `ccr-25143eb2-08pwa4`
- **Remoto:** `origin` = https://github.com/engdennylsonsantos-cloud/Hestia.git
- **Plano:** `docs/desempenho/plano-subagentes-2026-10-26.md` (v3)
- **Board vivo:** `docs/desempenho/execucao-subagentes-2026-10-26.md`
- **Regra:** leia este handoff e o board antes de tocar em qualquer arquivo.

## 0. Resumo em 10 linhas

- **G0 fechado:** WebGPU viável na RX 580; instrumentação `?perf=1`; cenários 60×128/256; baseline M0.
- **R1 integrado:** 3D de 251 → **14 draw calls**; frame 3,2 → **1,0 ms**; montagem 60×128 32,5 → **17,8 s**.
- **A1 integrado:** inserção em **20,5–20,8 ms**; abertura de 20 pav em **313 ms** (meta 300).
- **A2 integrado:** harness visual; 43 PASS / 2 FAIL (404 de favicon + realce de linha de detalhe).
- **Em andamento (WIP commitado):** A1b, R2, R3, R5.
- **Falta:** fechar A1b, R2, R3, R5; depois R4 (clipping), W1 (WebGPU), P1/P2 (workers) e H1 (soak/escala).
- **Atenção:** os worktrees WIP partiram de `1914fa0`, **antes de 82 commits de esquadrias** que entraram no ramo.
  A integração exigirá rebase/cherry-pick e resolução de conflitos.
- **Atenção:** há arquivos não commitados no diretório principal que **não são nossos**; não commitar.
- **Ambiente:** servidor de teste na porta 8123 foi parado.
- **Retomada:** comece pelo §5.

## 1. Estado do ramo principal

```
ramo: ccr-25143eb2-08pwa4
HEAD: topo do ramo (commit deste handoff)
origin: https://github.com/engdennylsonsantos-cloud/Hestia.git
```

Arquivos modificados/não rastreados no principal **de outra sessão** (não tocar, não commitar):
```
 M apps/web/src/editor/controller.ts
 M packages/render/src/plan/__snapshots__/sketch.test.ts.snap
?? .claude/
?? apps/web/src/editor/atalhoBufferPreso.test.ts
?? packages/model/src/.edit_room_sep.cjs
```

## 2. Entregas concluídas e integradas

| Agente | Commit no ramo do agente | Integração no principal | Resultado |
|---|---|---|---|
| S0 | `6a87455` | `e19e460` | WebGPU viável; `docs/desempenho/gpu-capacidade.md` |
| S1 | `2a4ec8e` | `240cc3f` | instrumentação `?perf=1`; 26 testes |
| S2 | `f494263` | `50536a8` | cenários 30/60 × 128/256; `medir:gpu` corrigido |
| A1 | `1a7883c`, `16f9658` | `205ef8f`, `7ff8605` | inserção na meta; abertura 313 ms |
| A2 | `763b890` | `5c69717` | harness visual; 1 FAIL real |
| R1 | `ba4b4e6` | `a9f2c56` | 251→14 draws; 1,0 ms |
| M0 | — | `f088f39` | baseline 10/30/60 + interação |

**Números de referência (M0, HTTP, 10 repetições):**

| Medida | 10 pav | 20 pav |
|---|---:|---:|
| Abrir projeto | 284 ms | 313 ms |
| Porta / janela / parede nova | 20,9 / 21,6 / 20,6 ms | 20,8 / 20,8 / 20,5 ms |
| Pan / zoom | 18,7 / 16,6 ms | 18,7 / 16,6 ms |
| Pick 3D | 29,4 ms | 30,0 ms |

**Escala (2 repetições, WebGL2, headed):**

| Cenário | Abertura | 3D estável | Montagem 3D |
|---|---:|---|---:|
| 10×32 | 341 ms | 14 draws / 29 k tris | 4,4 s |
| 30×128 | 1.769 ms | 14 draws / 427 k tris | 12,0 s |
| 60×128 | 2.582 ms | 14 draws / 853 k tris | 29,7 s |

## 3. Trabalho em andamento (WIP commitado)

Todos os WIP estão em commits locais e **não validados por completo**. Não trate como pronto.

| Agente | Ramo | Commit WIP | Worktree | O que já está lá |
|---|---|---|---|---|
| A1b | `gpu/a1b-opening` | `ebd5ea7` | `...\worktree\8fed4c\gpu-a1b-opening` | cache de geometria por nível, avisos adiados, medições A1b |
| R2 | `gpu/r2-visibility` | `95c9917` | `...\worktree\8fed4c\gpu-r2-visibility` | faixas/culling, precisão, sombras; testes novos |
| R3 | `gpu/r3-picking` | `a0416ab` + `30348f1` | `...\worktree\8fed4c\gpu-r3-picking` | ID buffer, índice de elementos, realce; relatório |
| R5 | `gpu/r5-plan` | `783a5c1` | `...\worktree\8fed4c\gpu-r5-plan` | planta, hachura, rótulos, realce de linha de detalhe |

**O que falta em cada um:**
- **A1b:** fechar abertura de 20 pav ≤300 ms; reduzir 60×128; validar inserção/pan/zoom/pick; conferir cache por nível.
- **R2:** validar culling/LOD/sombras/precisão; 1º quadro de 60×256 ≤3 M triângulos; imagem igual.
- **R3:** validar ID buffer/stencil; hover/seleção ≤8 ms; zero cópia de triângulos; fallback BVH.
- **R5:** validar `--item linhas` PASS; pan/zoom ≤8 ms; rebuilds = 0; hachura procedural; texto com LOD.

## 4. Risco de integração (importante)

Os quatro worktrees partiram de `1914fa0`, que é **anterior** aos 82 commits de esquadrias que entraram no ramo
principal depois do M0. Áreas prováveis de conflito:

- `packages/render/src/plan/*` (R5 × esquadrias);
- `packages/render/src/model3d/*` (R2/R3 × esquadrias);
- `apps/web/src/editor/*` (A1b × esquadrias);
- snapshots de `plan/sketch.test.ts`.

**Estratégia recomendada:** criar um ramo de integração a partir do HEAD atual, aplicar um agente por vez
(A1b → R5 → R2 → R3), rodar `typecheck` + testes do pacote após cada um, e só então o M1.

## 5. Como retomar amanhã

```powershell
cd <raiz-do-repositorio>
git fetch
git status --short --branch
git log --oneline -5
```

1. Leia `docs/desempenho/execucao-subagentes-2026-10-26.md` e este handoff.
2. Confira os worktrees WIP:
   ```powershell
   git -C <usuario-local>\.local\share\opencode\worktree\8fed4c\gpu-a1b-opening log --oneline -3
   ```
   Repita para `gpu-r2-visibility`, `gpu-r3-picking`, `gpu-r5-plan`.
3. Se algum agente tiver commitado depois da pausa, faça push do ramo dele antes de rebasear.
4. Integre na ordem **A1b → R5 → R2 → R3**, um de cada vez, com `npm run typecheck` e testes do pacote.
5. Rode o **M1** em janela exclusiva: `medir:gpu` (10/30/60) + `perf-browser` (10 repetições, HTTP).
6. Rode a verificação visual (`node tests/e2e/verificacao-visual.mjs`) e feche o FAIL da linha de detalhe.
7. Só então siga para **R4** (clipping), **W1** (WebGPU), **P1/P2** (workers) e **H1** (soak 1 h).

## 6. Comandos úteis

```powershell
# testes dirigidos (funil L1; não rode a suíte completa por agente)
npm run typecheck
npx vitest run <pacote/arquivo>
npx eslint <arquivos>

# build e medição
npm run build -w @hestia/web
npm run medir:gpu -- --save
$env:APP_URL="http://localhost:<porta>/index.html"; $env:PERF_RUNS="10"; npm run perf:browser -- --save
node tests/e2e/verificacao-visual.mjs

# suíte completa só no release (L3)
npm run test:completo
npm run test:perf
```

## 7. Decisões e armadilhas

- **WebGPU é viável na RX 580**, mas o default continua WebGL2 até W1 (soak + matriz + retry de restore).
- **Não distribuir flags**: `--use-angle=d3d12` derruba a aceleração nesta GPU.
- **Adapter do Chrome é de uso único**: pedir adapter novo por device no W1.
- **Restore do WebGL2** só pega na 2ª tentativa, após um `requestAnimationFrame`.
- **60×256** não estoura memória; o problema é tempo de montagem e 1º quadro (3,41 M triângulos).
- **Cache de geometria** só grava quando todos os níveis ficam prontos; A1b está corrigindo.
- **Não commitar** os arquivos de outra sessão listados no §1.
- **Não fazer push de força**; branches WIP podem ser rebaseados, mas sem `reset --hard` em worktree com trabalho.

## 8. Próximo marco

**M1:** após integrar A1b/R2/R3/R5, medir novamente 10/30/60 e interação. Critérios:

- abertura 20 pav ≤300 ms;
- 60×128 estável ≤14 draws e ≤3 M triângulos;
- 60×256 1º quadro ≤3 M triângulos;
- hover/seleção ≤8 ms; pan/zoom ≤8–16 ms;
- `--item linhas` PASS;
- suíte 2× verde no release.
