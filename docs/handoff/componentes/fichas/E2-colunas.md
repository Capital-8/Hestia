# Ficha E2-colunas — peças resolvidas em colunas (fronteira do Rust)

Base: branch `feat/familias-interface` (commit do contrato da E2).   Modelo: opencode-go/deepseek-v4.1-flash

## Contexto
Forma em que o núcleo Rust recebe as peças: um array tipado por campo, ids internados, só números (mesma ideia da decisão 0046 §2.1 da branch do Rust; você não precisa ler). Esqueleto em `packages/engine/src/componentes/colunas.ts` (especificação em comentário) e aceite em `colunas.test.ts`.

## Faça
1. Implemente `paraColunas`, `metaDasPecas`, `deColunas` e `validarColunas` mantendo as tabelas `PAPEIS` e `EIXOS` exatamente como estão (a ordem é o código u8 e não pode mudar).
2. `paraColunas`: copie os dados (nada de compartilhar memória com as peças); `ids` interna na ordem da primeira aparição; `contornoIni` é índice em NÚMEROS no array `contornoDados`; peça sem contorno tem `contornoN = 0` e `contornoIni = 0`.
3. `deColunas` devolve objetos planos (arrays comuns, não typed arrays) e restaura `contorno: null` quando `contornoN = 0`.

## Arquivos permitidos
`packages/engine/src/componentes/colunas.ts` (e nenhum outro).

## Proibido
Todo o resto, em especial os arquivos de teste (`*.test.ts`), `pecas.ts`, `resolver.ts`, `index.ts` da pasta, e tudo de `packages/model`.

## Aceite (o orquestrador roda)
`npx vitest run packages/engine/src/componentes/colunas.test.ts` verde, `tsc`, `eslint --max-warnings 0`, `check-boundaries`.

## Critério de parada
Teste que pareça contradizer a especificação do esqueleto: PARE e relate qual e por quê. Não altere testes.

## Entrega
Commits pequenos (`feat(familia): …`) e o relatório pedido nas regras.
