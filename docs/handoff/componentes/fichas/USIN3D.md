# Ficha USIN3D — mostrar as usinagens no 3D do editor

Base: `feat/familias-interface`.   Modelo: opencode-go/deepseek-v4.1-flash

## Contexto
O 3D do editor de famílias não mostra furos, rasgos e recortes (o QA reportou: acrescentar usinagem não muda o sólido). O motor já entrega `PecaResolvida.usinagens` (veja `packages/engine/src/componentes/pecas.ts`, `colunasUsinagem.ts`, `FACES`, `TIPOS_USINAGEM`). Para o 3D, NÃO faça booleana de malha: desenhe MARCADORES sobre a peça. Leia `packages/render/src/familia/{visualizador.ts,visualizadorApoio*.ts,logica.ts}` e os testes vizinhos.

## Faça
1. Marcadores: para cada usinagem de cada peça, um objeto three.js filho do mesh da peça (assim acompanha a explosão): `furo` = disco escuro fino (cilindro de altura ~0,5 mm) no diâmetro e posição da usinagem sobre a face indicada, com a normal da face; `rasgo`/`canal` = caixa fina escura do comprimento, largura e posição; `recorte`/demais = caixa escura aproximada pela caixa da usinagem; furo passante também aparece na face oposta. Cor escura (0x222222) com leve transparência, `polygonOffset` para não piscar (z-fighting) sobre a face. Posição e orientação vêm de uma função PURA nova `marcadoresDaPeca(peca): Marcador[]` (em arquivo novo `usinagensMarcadores.ts`, sem three.js, só números em metros e vetores) que o visualizador transforma em objetos. Use só os tipos e faces que existem em `pecas.ts` e ignore tipos desconhecidos sem lançar.
2. Visibilidade: ligue por padrão; some quando `detalhe` do visualizador for o mais simples (veja como `pecaVisivel` e o nível de detalhe funcionam). Ao selecionar a peça, os marcadores dela continuam visíveis.
3. Testes (`usinagensMarcadores.test.ts`, NOVO): peça com furo Ø20 na face 'a' em (0,2; 0,2): um marcador de disco com raio 0,01, centro na face (coordenada de profundidade = a face 'a' da peça, calculada à mão no eixo da espessura), normal para fora; face oposta 'b' fica na outra face; furo passante gera 2 marcadores; rasgo gera caixa com as dimensões certas; peça sem usinagens: lista vazia; tipo desconhecido ignorado; valores em metros.
4. Gates: `npx tsc -p tsconfig.json --noEmit`, `npx eslint --max-warnings 0` nos arquivos tocados, `node scripts/check-boundaries.mjs`, `node scripts/check-units.mjs`, e os testes da ficha. Nada acima de 420 linhas; textos em português; sem `any`/`eslint-disable`; sem dependência nova. Mais `npx vitest run packages/render/src/familia` sem regressão.

## Arquivos permitidos
`packages/render/src/familia/usinagensMarcadores.ts` (NOVO), `usinagensMarcadores.test.ts` (NOVO), `visualizador*.ts` e `logica.ts` (mudanças mínimas para plugar os marcadores), `packages/render/src/index.ts` (uma linha se precisar).

## Proibido
`packages/engine/**`, `packages/model/**`, `packages/tools/**`, `apps/**`, `crates/**`, `docs/**`, testes existentes, snapshots.

## Critério de parada
Teste contraditório com a especificação, ou necessidade de mudar arquivo fora da lista: PARE e relate.

## Entrega
Commits pequenos (`feat(componentes): …`) e o relatório pedido nas regras (últimas linhas dos comandos, decisões, o que ficou de fora).
