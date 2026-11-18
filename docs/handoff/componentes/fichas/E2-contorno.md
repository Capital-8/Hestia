# Ficha E2-contorno — geometria 2D de contornos de peça

Base: branch `feat/familias-interface` (commit do contrato da E2).   Modelo: opencode-go/deepseek-v4.1-flash

## Contexto
Peças podem ter contorno poligonal (L, recorte). O esqueleto `packages/engine/src/componentes/contorno.ts` traz a especificação de cada função em comentário e `contorno.test.ts` é o aceite. Leia também `pecas.ts` (convenção do plano) e `resolver.ts` (que usa `validarContorno` e `orientarAntiHorario`). Esta é geometria que o Rust vai espelhar: funções pequenas, só números, sem dependências.

## Faça
1. Implemente as 6 funções de `contorno.ts` trocando os `throw new Error('não implementado…')`, mantendo assinaturas, constantes e comentários.
2. `validarContorno`: respeite a ORDEM das 6 verificações. Cruzamento e toque entre arestas NÃO vizinhas (inclusive vértice sobre aresta) e sobreposição colinear de arestas vizinhas reprovam, com tolerância de 1e-9 m. Para o toque use um teste de segmento com orientação (produto vetorial) e caixas, tratando colinear.
3. `pontoDentro`: par-ímpar, com a borda contando como dentro (teste primeiro se o ponto está sobre alguma aresta).

## Arquivos permitidos
`packages/engine/src/componentes/contorno.ts` (e nenhum outro).

## Proibido
Todo o resto, em especial os arquivos de teste (`*.test.ts`), `pecas.ts`, `resolver.ts`, `index.ts` da pasta, e tudo de `packages/model`.

## Aceite (o orquestrador roda)
`npx vitest run packages/engine/src/componentes/contorno.test.ts` verde, `tsc`, `eslint --max-warnings 0` no arquivo, `check-boundaries`.

## Critério de parada
Teste que pareça contradizer a especificação do esqueleto: PARE e relate qual e por quê. Não altere testes.

## Entrega
Commits pequenos (`feat(familia): …`) e o relatório pedido nas regras.
