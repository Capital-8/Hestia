# Ficha E6-lista — lista de peças, resumo, custo, CSV e etiqueta

Base: branch `feat/familias-interface`.   Modelo: opencode-go/deepseek-v4.1-flash

## Contexto
A saída que a fábrica usa é a lista de peças: uma linha por peça distinta, com chapa, medidas (comprimento × largura × espessura), veio, fita por lado, usinagens e quantidade, mais o resumo (m² por chapa, metros de fita), o custo estimado e o CSV para o otimizador de corte. Leia: `packages/engine/src/componentes/listaPecas.ts` (cada função tem a especificação completa em comentário, inclusive a regra de orientação c1/c2/l1/l2: siga literalmente), `listaPecas.test.ts` (aceite, com números exatos do armário), `pecas.ts` (`PecaResolvida`, `FerragemResolvida`), `medidas.ts` (`areaFace`) e `packages/model/src/familia/catalogo.ts` (tipo `Catalogo`).

## Faça
1. Implemente `listaDePecas`, `resumirLista`, `custoEstimado`, `listaPecasCsv` e `etiquetaDaLinha` em `listaPecas.ts` mantendo assinaturas, tipos e comentários. Divida em arquivos de apoio com prefixo `listaPecas` se passar de 420 linhas (por exemplo `listaPecasAgrupar.ts`, `listaPecasCsv.ts`).
2. Medidas da lista em MILÍMETROS arredondadas a 3 casas (`Math.round(m * 1e6) / 1e3` a partir de metros); evite ruído de ponto flutuante nas chaves de agrupamento (use as medidas já arredondadas).
3. Formatação de número no CSV e na etiqueta: função própria `numeroSemZeros(v, casas)` (ex.: 764 → "764", 12.5 → "12,5" no CSV com vírgula decimal e "12.5"? NÃO: na etiqueta use também vírgula), sem `toFixed`+`replace` soltos fora dessa função. Se o portão `node scripts/check-units.mjs` reclamar de uma linha, acrescente `// units-ok: <motivo>` nela.
4. Não altere a entrada. Funções puras.

## Arquivos permitidos
`packages/engine/src/componentes/listaPecas.ts` e novos `packages/engine/src/componentes/listaPecas*.ts` (sem `.test.ts`).

## Proibido
Todo o resto, em especial `listaPecas.test.ts`, `pecas.ts`, `resolver.ts`, `medidas.ts`.

## Aceite (o orquestrador roda)
`npx vitest run packages/engine/src/componentes/listaPecas.test.ts` verde, `tsc`, `eslint --max-warnings 0`, `node scripts/check-units.mjs`, `check-boundaries`.

## Critério de parada
Teste que pareça contradizer a especificação: PARE e relate qual e por quê. Não altere testes.

## Entrega
Commits pequenos (`feat(familia): …`) e o relatório pedido nas regras.
