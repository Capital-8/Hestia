# Ficha E2-medidas — caixa, áreas e volumes das peças

Base: branch `feat/familias-interface` (commit do contrato da E2).   Modelo: opencode-go/deepseek-v4.1-flash

## Contexto
Medidas sobre as peças resolvidas. Esqueleto em `packages/engine/src/componentes/medidas.ts` (especificação em comentário) e aceite em `medidas.test.ts`. Use `areaContorno` de `./contorno.ts` (outra ficha o implementa em paralelo; importe pelo contrato) e os tipos de `./pecas.ts`.

## Faça
1. Implemente `caixaEnvolvente`, `areaFace`, `volumePeca` e `resumirPecas` em `medidas.ts` mantendo assinaturas e comentários.
2. A chave de `areaPorEspessura` é a espessura em mm como texto limpo: `String(Math.round(espessura * 1e6) / 1e3)` dá "18" e "6.5".
3. Os testes de contorno só passam com a ficha E2-contorno integrada; faça o seu correto pelo contrato e relate.

## Arquivos permitidos
`packages/engine/src/componentes/medidas.ts` (e nenhum outro).

## Proibido
Todo o resto, em especial os arquivos de teste (`*.test.ts`), `pecas.ts`, `resolver.ts`, `index.ts` da pasta, e tudo de `packages/model`.

## Aceite (o orquestrador roda)
`npx vitest run packages/engine/src/componentes/medidas.test.ts` verde (com o contorno integrado), `tsc`, `eslint --max-warnings 0`, `check-boundaries`.

## Critério de parada
Teste que pareça contradizer a especificação do esqueleto: PARE e relate qual e por quê. Não altere testes.

## Entrega
Commits pequenos (`feat(familia): …`) e o relatório pedido nas regras.
