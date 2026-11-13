# Massa conceitual: estado

Linha de base (2026-11-13, commit c1d30ac1): typecheck ✔ | lint ✔ | test:rapido 969 arquivos / 11316 testes (1 todo) | cargo test geom-wasm 474 testes | build:wasm ✔ | wasm:check ✔ | test:wasm 1334 testes (5 ignorados).
Observação: `npm run build:wasm` regrava `packages/geom/assets/geom_wasm.{wasm,sha256}`; o fiscal restaura com `git checkout packages/geom/assets` quando a ficha não é de Rust.
Modelo dos subagentes: padrão nas fichas comuns; modelo mais forte (fable) em R1, R2, R3 e V3. Executado sem a pergunta de B.2 passo 4 porque o dono mandou executar.

| Ficha | Estado | Commit de mescla | Devoluções | Observações |
|---|---|---|---|---|
| M1 | mesclada | merge de massa/m1 | 0 | typecheck ✔, lint ✔ (8 avisos já existentes), test:rapido 971 arq / 11358 testes; escopo e atalhos conferidos pelo fiscal; emenda E1 no PLANO |
| M2 | mesclada | merge de massa/m2 | 0 | conferida pelo fiscal: typecheck ✔, lint ✔, test:rapido 971/11359, cargo test 477, test:wasm 1335, clippy sem erro novo; reiniciou o contêiner no meio (agente refeito); emenda E2 |
| R1 | pendente | | 0 | |
| R2 | pendente | | 0 | |
| R3 | pendente | | 0 | |
| E1 | pendente | | 0 | |
| V1 | pendente | | 0 | |
| V2 | pendente | | 0 | |
| V3 | pendente | | 0 | |
| T1 | pendente | | 0 | |
| U1 | pendente | | 0 | |
| U2 | pendente | | 0 | |
| D1 | pendente | | 0 | |
| D2 | pendente | | 0 | |
| X1 | pendente | | 0 | |
| Q1 | pendente | | 0 | |

## Lições de processo
- O worktree de `isolation: "worktree"` nasce do `main` local, não da branch de trabalho. Todo prompt de ficha deve mandar o agente rodar `git merge --ff-only claude/youthful-dirac-l4egd1` antes de qualquer coisa e conferir `SCHEMA_VERSION` (esperado 25 antes da M1).

- Isolamento de worktree: `isolation: "worktree"` não serve (base errada, e o worktree vazio é apagado). Usar worktree manual: `git worktree add /home/user/hestia-wt/<ficha> -b massa/<ficha> claude/youthful-dirac-l4egd1`, `npm ci` dentro dele (NUNCA symlink de node_modules: os pacotes @hestia apontariam para o checkout principal) e dar o caminho ao agente. Para fichas de Rust, o agente usa CARGO_TARGET_DIR=/tmp/hestia-target-massa.

- **Clippy:** o portão `cargo clippy -p geom-wasm -- -D warnings` JÁ FALHA na linha de base (39 erros em código antigo, medido em c1d30ac1+). O portão passa a ser: **nenhum erro novo** (mesmo número, mesmos locais) e **zero erro em arquivo novo ou linha tocada**. O fiscal compara com `/tmp/claude-0/clippy-base.log` (grep `-->`, sem linha/coluna).
- **Artefatos WASM:** todo merge que traz `.rs` exige `npm run build:wasm` depois da última alteração e commit dos 3 arquivos de `packages/geom/assets`; o `hash-fontes.test.ts` (dentro de `test:rapido`) confere. Duas fichas de Rust em paralelo conflitam nesses binários: por isso a fase 1 é sequencial.
- Contrato do kernel: **congelado** desde a M2 (versao 19, ids 140–142 e 140–145).

## Decisões do dono durante a execução
- 2026-11-13: "sempre que possível seguir sem esperar nada" (o fiscal só para para perguntar se uma decisão de projeto bloquear).

## Pendências conhecidas
(nenhuma)

## Tempos medidos (A.8 item 5)
(a medir em R3/Q1)
