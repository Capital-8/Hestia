# Ficha E3-malha — malha triangular das peças resolvidas

Base: branch `feat/familias-interface` (commit do contrato da E3).   Modelo: opencode-go/deepseek-v4.1-flash

## Contexto
O 3D do editor mostra prismas: cada peça é um contorno (retângulo ou polígono) extrudado pela espessura. Esta é a geometria pesada que o Rust vai espelhar (fatia C): só números, sem dependências além de `triangulate` de `@hestia/geom`.
Leia: `packages/engine/src/componentes/malha.ts` (especificação completa em comentário: siga literalmente), `malha.test.ts` (o aceite), `pecas.ts` (convenções de eixo, tamanho e contorno), `medidas.ts` e `contorno.ts` (já prontos) e `packages/geom/src/triangulate.ts` (assinatura de `triangulate`: recebe `Polygon = Vec2[][]`, devolve `positions` x,y e `indices`).

## Faça
1. Implemente `malhaDasPecas` e `volumeDaMalha` em `malha.ts`, mantendo assinaturas e comentários.
2. Dica de método: para cada peça monte os pontos do plano (u,v), calcule cada vértice com o mapeamento de eixo do comentário, e gere (a) tampa inferior, (b) tampa superior, (c) uma parede por aresta. Em vez de acertar o sentido do triângulo por dedução, calcule a normal desejada (por exemplo: tampa inferior = −w, superior = +w, parede = direção da aresta girada para fora do polígono, tudo convertido ao mundo pelo mesmo mapeamento) e, DEPOIS de montar cada triângulo, confira o produto vetorial: se não apontar para a normal desejada, troque dois índices. Isso resolve o eixo y, que inverte a "mão".
3. Cada face tem vértices próprios (sombreamento chapado). `pecaDoTriangulo` tem uma entrada por triângulo.
4. Vazias vão para `vazios`, o resto para `solidas`; o índice é sempre o da lista de entrada.
5. Divida em funções pequenas (por exemplo `pontosDoPlano`, `paraMundo`, `tampas`, `paredes`); nenhum arquivo passa de 420 linhas. Você pode criar `malhaGeometria.ts` com o prefixo `malha`.

## Arquivos permitidos
`packages/engine/src/componentes/malha.ts` e novos `packages/engine/src/componentes/malha*.ts` (sem `.test.ts`).

## Proibido
Todo o resto, em especial `malha.test.ts`, `pecas.ts`, `resolver.ts`, `index.ts` da pasta e `packages/model`.

## Aceite (o orquestrador roda)
`npx vitest run packages/engine/src/componentes/malha.test.ts` verde, `tsc`, `eslint --max-warnings 0`, `check-boundaries`.

## Critério de parada
Teste que pareça contradizer a especificação: PARE e relate qual e por quê. Não altere testes.

## Entrega
Commits pequenos (`feat(familia): …`) e o relatório pedido nas regras.
