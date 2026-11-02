# Estado da equipe do editor de famílias

Atualizado em 2026-11-02 pelo orquestrador. Plano: `docs/decisoes/0049-componentes-e-editor-de-familias.md` (rascunho) e `PLANO-DELEGACAO.md`.
Branch de integração local: `feat/familias-interface` (sem push). Decisões do dono: ordem E1→E7, ligação ao projeto só na E8; parser e contrato de peças com o orquestrador; itens "ampliar ADR" (módulo aninhado, gaveta composta, colocar em linha, canto em L, conjunto) entram no escopo.

## Etapas
| Etapa | Estado |
|---|---|
| E1 Fundação | contrato e avaliador prontos (orquestrador); fichas grafo, historico, validar lançadas; arquivo depende de validar |
| E2 Peças e módulos | a fazer |
| E3 3D real | a fazer |
| E4 Criar na vista | a fazer |
| E5 Marcenaria | a fazer |
| E6 Saídas | a fazer |
| E7 Biblioteca | a fazer |
| E8 Ligação ao projeto | a fazer |
| E9 Rust | condicionada à fatia C |

## Fichas
| Ficha | Branch | Estado | Observação |
|---|---|---|---|
| E1-grafo | feat/fam-E1-grafo | lançada | |
| E1-historico | feat/fam-E1-historico | lançada | |
| E1-validar | feat/fam-E1-validar | lançada | teste de ciclo exige o grafo integrado |
| E1-arquivo | — | aguarda validar | depende de `validarFamilia` |

## Ciclo de cada ficha
`run-ficha.sh <id> <base>` → `gate.mjs` (eu rodo) → revisão do diff → aceita, devolve (1 volta) ou assume → atualiza esta tabela.
