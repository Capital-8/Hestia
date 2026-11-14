# Terreno e lote: estado

Passo 0 concluído em 2026-11-13. Execução em andamento; retome da primeira ficha não mesclada.

Linha de base (2026-11-13, commit 159184a7, `main` em 236aa298): typecheck ✔ | lint ✔ (avisos de base antigos de rampTool/stairRun*, já existentes) | test:rapido 969 arquivos / 11316 testes (1 todo) | cargo test geom-wasm 468+6 testes | **clippy ✘ já na base: 39 avisos em código existente** | build:wasm ✔ | wasm:check ✔ | test:wasm 1334 testes (5 ignorados).
Portão do clippy adaptado (emenda E1 do PLANO): o total de avisos não pode passar de 39 e arquivo novo ou alterado por esta frente não pode ter nenhum aviso. O componente clippy teve de ser instalado: `rustup component add --toolchain 1.97.1-x86_64-unknown-linux-gnu clippy`.
Modo de execução: A (subagentes). Modelo: padrão nas fichas comuns; o mais forte disponível em R1, R2, R3 e V3.

| Ficha | Estado | Commit de mescla | Devoluções | Observações |
|---|---|---|---|---|
| M1 | mesclada | merge de terreno/M1 | 0 | typecheck ✔, lint ✔ (8 avisos de base), test:rapido 976 arq / 11422 testes; escopo e atalhos conferidos pelo fiscal; SCHEMA_VERSION 26. Pendências para outras fichas: copiar/mover terreno leva as regiões (T1, em edit.ts); traço-dois-pontos do lote (P2); estilo `lot` gravado com cutWeight 1 |
| M2 | mesclada | merge de terreno/M2 | 0 | contrato versao 19; cargo test 473; clippy 39 (= base), nenhum aviso em secoes_terreno.rs; binario WASM reproduzivel; test:wasm 1335; test:rapido 976 arq / 11423. Emenda de escopo: quadros.test.ts (lista exata de secoes) e a asserção de versao em abi2.rs, ambos testes de contrato |
| R1 | mesclada | merge de terreno/R1 | 0 | spade 2.15.1; cargo test 510; clippy 39 (= base), 0 em terreno_*; binario reproduzivel; test:wasm 55 arq / 1339; test:rapido 980 / 11441. Retomada apos limite de uso (trabalho refeito do zero). Tempos Rust nativo, 50 mil pontos: 1a malha 0,54 s; com cache 16 ms; cota de 1 sonda 16 µs |
| R2 | mesclada | merge de terreno/R2 | 0 | cargo test 537; clippy 39 (= base), 0 em terreno_*; binario reproduzivel; test:wasm 56 arq / 1345; test:rapido 980 / 11441. Interrompida duas vezes por limite de uso e retomada do trabalho em disco. Decisoes do agente aceitas: linha fechada nao repete o 1o ponto (coluna `fechada`); saidas nao arredondadas a 1 µm; curvas com lado alto a esquerda; corte papel 0 em sentido horario; silhueta 1 ponto por faixa. Tempos de curvas/corte ainda nao medidos (Q1) |
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
| P1 | mesclada | merge de terreno/P1 | 0 | engine: loteGeometria/Indices/Rumos/Issues e fixture; test:rapido do agente 980 arq / 11440 (uma rodada com falha sob carga concorrente, a seguinte limpa; nome do teste nao identificado). PENDENCIA: sinal do norte verdadeiro, ver abaixo |
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
- Avisos 1, 2 e 5 da R1 ficam guardados mas a consulta 168 ainda é NAO_IMPLEMENTADO (R2). `declividade` da consulta 163 = módulo do gradiente em fração; e o JSON ainda descreve 160/163 como sem implementação (texto do $comentario, contrato congelado). Confirmar em R2/Q1.
- **Sinal do norte verdadeiro (A.4 regra 19) — decisão do dono.** O plano diz "direção no projeto = azimute − norteVerdadeiro", e `loteRumos.ts` implementa isso. Mas o texto de `Localizacao.norteVerdadeiro` ("ângulo medido do eixo +y do projeto, sentido horário") sugere que o norte verdadeiro está a θ graus horário de +y, o que daria direção = azimute **+** norteVerdadeiro. Hoje, com norte a 30°, um lado de azimute 0° sai 30° anti-horário. Uma das duas frases está invertida; a correção é de um sinal em `rumosParaPoligono`/`poligonoParaRumos` e no teste `rumos_com_norte_verdadeiro`. Não alterado sem o dono (B.1 item 3). Precisa ser resolvido antes da ficha P3.
- Teste instável possível: uma rodada de `test:rapido` da P1 falhou sob carga concorrente e a repetição passou. Não rodar duas suítes vitest ao mesmo tempo.

## Tempos medidos (A.8 item 5)
(a medir em R1, R3 e Q1)

## Lições de processo
- Herdadas da massa: `isolation: "worktree"` parte da `main` local e não serve; criar o worktree à mão e rodar `npm ci` dentro dele (nunca symlink de `node_modules`). `npm run build:wasm` regrava `packages/geom/assets/`; em ficha que não é de Rust, desfazer com `git checkout packages/geom/assets`.
- Conferido em 2026-11-13: `spade 2.15.1` compila para `wasm32-unknown-unknown` com o toolchain do repositório (1.97.1). Um crate de teste fora do repositório precisa de uma cópia de `rust-toolchain.toml`, senão usa outro toolchain sem o alvo WASM.
