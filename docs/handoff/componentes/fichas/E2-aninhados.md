# Ficha E2-aninhados — módulos aninhados (família dentro de família)

Base: branch `feat/familias-interface` (commit do contrato da E2).   Modelo: opencode-go/deepseek-v4.1-flash

## Contexto
Guarda-roupas e cozinhas são famílias que contêm outras famílias, giradas e deslocadas. Esqueleto em `packages/engine/src/componentes/aninhados.ts` com a especificação COMPLETA em comentário (leia devagar, item por item) e aceite em `aninhados.test.ts`. Leia `pecas.ts` (convenção de eixo, tamanho e contorno) e `resolver.ts` (o contexto traz `resolver`: é `resolverFamilia`). A rotação de contorno depende de `./contorno.ts` (`orientarAntiHorario`), que outra ficha implementa em paralelo; importe pelo contrato.

## Faça
1. Implemente `resolverAninhados` conforme a especificação. Separe a matemática de girar uma peça em um arquivo novo `aninhadosGeometria.ts` (função pura `girarPeca(p, graus, dx, dy)` → peça nova), para o arquivo principal não passar de 420 linhas.
2. A conta é exata: só 0, 90, 180 e 270. Use tabelas por ângulo (não trigonometria) para não acumular ruído; arredonde o resultado a 6 casas (`Math.round(v * 1e6) / 1e6`).
3. Leia os testes de contorno com atenção: eles conferem os vértices NO MUNDO, projetados no plano da peça. Convenção: eixo x → (u,v)=(y,z); eixo y → (u,v)=(x,z); eixo z → (u,v)=(x,y), com a face de origem no canto mínimo.
4. Os testes de contorno só passam com a ficha E2-contorno integrada; relate quais dependem dela.

## Arquivos permitidos
`packages/engine/src/componentes/aninhados.ts` e `packages/engine/src/componentes/aninhadosGeometria.ts`.

## Proibido
Todo o resto, em especial os arquivos de teste (`*.test.ts`), `pecas.ts`, `resolver.ts`, `index.ts` da pasta, e tudo de `packages/model`.

## Aceite (o orquestrador roda)
`npx vitest run packages/engine/src/componentes/aninhados.test.ts` verde (com o contorno integrado), `tsc`, `eslint --max-warnings 0`, `check-boundaries`.

## Critério de parada
Teste que pareça contradizer a especificação do esqueleto: PARE e relate qual e por quê. Não altere testes.

## Entrega
Commits pequenos (`feat(familia): …`) e o relatório pedido nas regras.
