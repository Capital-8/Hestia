# Terreno e lote: estado

**Passo 0 pendente.** O plano (`docs/terreno/PLANO.md`) foi escrito em 2026-11-13 e nada foi implementado. O fiscal começa por B.2.

Linha de base (data, commit): a medir no passo 0.
Modo de execução: a definir no passo 0 (A = subagentes, B = o próprio fiscal).

| Ficha | Estado | Commit de mescla | Devoluções | Observações |
|---|---|---|---|---|
| M1 | pendente | | 0 | |
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
- Pendente: confirmar D1 a D11 de A.0 (em especial D1, dependência `spade`, e D10, não esperar a massa).
- Pendente: autorizar subagentes e escolher o modelo das fichas R1, R2, R3 e V3.
- Pendente: executar tudo em sequência ou parar ao fim de cada fase.

## Sincronizações com a main (data, commit da main, conflitos, o que foi renumerado)
- 2026-11-13: branch criada a partir da `main` em `236aa298`. Massa ausente da `main` nesta data.

## Pendências conhecidas
(nenhuma)

## Tempos medidos (A.8 item 5)
(a medir em R1, R3 e Q1)

## Lições de processo
- Herdadas da massa: `isolation: "worktree"` parte da `main` local e não serve; criar o worktree à mão e rodar `npm ci` dentro dele (nunca symlink de `node_modules`). `npm run build:wasm` regrava `packages/geom/assets/`; em ficha que não é de Rust, desfazer com `git checkout packages/geom/assets`.
- Conferido em 2026-11-13: `spade 2.15.1` compila para `wasm32-unknown-unknown` com o toolchain do repositório (1.97.1). Um crate de teste fora do repositório precisa de uma cópia de `rust-toolchain.toml`, senão usa outro toolchain sem o alvo WASM.
