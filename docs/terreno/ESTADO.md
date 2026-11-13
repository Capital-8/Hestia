# Terreno e lote: estado

Passo 0 concluído em 2026-11-13. Execução em andamento; retome da primeira ficha não mesclada.

Linha de base (2026-11-13, commit 159184a7, `main` em 236aa298): typecheck ✔ | lint ✔ (avisos de base antigos de rampTool/stairRun*, já existentes) | test:rapido 969 arquivos / 11316 testes (1 todo) | cargo test geom-wasm 468+6 testes | **clippy ✘ já na base: 39 avisos em código existente** | build:wasm ✔ | wasm:check ✔ | test:wasm 1334 testes (5 ignorados).
Portão do clippy adaptado (emenda E1 do PLANO): o total de avisos não pode passar de 39 e arquivo novo ou alterado por esta frente não pode ter nenhum aviso. O componente clippy teve de ser instalado: `rustup component add --toolchain 1.97.1-x86_64-unknown-linux-gnu clippy`.
Modo de execução: A (subagentes). Modelo: padrão nas fichas comuns; o mais forte disponível em R1, R2, R3 e V3.

| Ficha | Estado | Commit de mescla | Devoluções | Observações |
|---|---|---|---|---|
| M1 | mesclada | merge de terreno/M1 | 0 | typecheck ✔, lint ✔ (8 avisos de base), test:rapido 976 arq / 11422 testes; escopo e atalhos conferidos pelo fiscal; SCHEMA_VERSION 26. Pendências para outras fichas: copiar/mover terreno leva as regiões (T1, em edit.ts); traço-dois-pontos do lote (P2); estilo `lot` gravado com cutWeight 1 |
| M2 | pendente | | 0 | |
| R1 | pendente | | 0 | exige a decisão D1 confirmada |
| R2 | pendente | | 0 | |
| R3 | pendente | | 0 | |
| E1 | pendente | | 0 | |
| V1 | pendente | | 0 | |
| V2 | pendente | | 0 | |
| V3 | pendente | | 0 | |
| I1 | pendente | | 0 | |
| T1 | pendente | | 0 | |
| T2 | pendente | | 0 | |
| U1 | pendente | | 0 | |
| T3 | pendente | | 0 | |
| U2 | pendente | | 0 | |
| P1 | pendente | | 0 | |
| P2 | pendente | | 0 | |
| P3 | pendente | | 0 | |
| P4 | pendente | | 0 | |
| P5 | pendente | | 0 | condicional: só com a massa na branch |
| G1 | pendente | | 0 | |
| X1 | pendente | | 0 | |
| Q1 | pendente | | 0 | |
| F1 | pendente | | 0 | opcional: só com o "pode" do dono (D9) |
| F2 | pendente | | 0 | opcional |

## Decisões do dono (data, pergunta, resposta)
- 2026-11-13, "agora implemente! utilize subagentes para concluir mais rápido": o dono mandou executar o plano com subagentes. Registrado como confirmação de D1 a D11 (incluída a `spade`) e autorização de subagentes. A resposta sobre modelo e sobre parar por fase não foi dada: assumido o modelo mais forte em R1, R2, R3 e V3, e execução contínua, parando só em bloqueio ou na Fase 7 (que exige o "pode" do dono, D9).

## Sincronizações com a main (data, commit da main, conflitos, o que foi renumerado)
- 2026-11-13: branch criada a partir da `main` em `236aa298`. Massa ausente da `main` nesta data.

## Pendências conhecidas
(nenhuma)

## Tempos medidos (A.8 item 5)
(a medir em R1, R3 e Q1)

## Lições de processo
- Herdadas da massa: `isolation: "worktree"` parte da `main` local e não serve; criar o worktree à mão e rodar `npm ci` dentro dele (nunca symlink de `node_modules`). `npm run build:wasm` regrava `packages/geom/assets/`; em ficha que não é de Rust, desfazer com `git checkout packages/geom/assets`.
- Conferido em 2026-11-13: `spade 2.15.1` compila para `wasm32-unknown-unknown` com o toolchain do repositório (1.97.1). Um crate de teste fora do repositório precisa de uma cópia de `rust-toolchain.toml`, senão usa outro toolchain sem o alvo WASM.
