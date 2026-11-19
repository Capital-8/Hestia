# Ficha T-F3-core — testes CEGOS de `posarArrastado, facesDasParedes, corposDoNivel e caixaLocalDoComponente`

Base: `feat/familias-interface`.   Modelo: definido pelo orquestrador

## O que você faz
Outro executor está implementando `posarArrastado, facesDasParedes, corposDoNivel e caixaLocalDoComponente` em `packages/engine/src/componentes/encaixeArrasto.ts` e escrevendo os testes dele. VOCÊ escreve testes INDEPENDENTES, só a partir da especificação abaixo, para o orquestrador cruzar os dois. NÃO leia, NÃO implemente e NÃO altere `encaixeArrasto.ts` (neste worktree ele só lança "não implementado": os seus testes vão falhar aqui, e isso é esperado). Seus testes são validados depois, contra a implementação do outro.

## Regras
1. Escreva UM arquivo: `packages/engine/src/componentes/encaixeArrasto.cego.test.ts` (vitest; importe de `./encaixeArrasto.ts` e de `./encaixeTipos.ts`; para geometria pode usar `retanguloNoMundo` de `./encaixeColisao.ts`, que já está pronta).
2. Cubra TODOS os casos numéricos da especificação e acrescente pelo menos 6 casos seus: bordas, simetria (espelhar a cena deve espelhar o resultado), idempotência, determinismo, entradas vazias, valores no limite da tolerância. Calcule os valores esperados À MÃO a partir da especificação e das convenções de `encaixeTipos.ts`, com a conta escrita num comentário curto ao lado de cada `expect`. Não calcule o esperado chamando a função testada.
3. Se a especificação for ambígua num ponto, NÃO invente: escreva o teste com `it.skip` e o motivo no nome, e liste a ambiguidade no relatório.
4. Rode `npx tsc -p tsconfig.json --noEmit` e `npx eslint --max-warnings 0 <seu arquivo>` e deixe verdes (o vitest vai falhar com "não implementado": diga isso no relatório e não tente "consertar").
5. Não altere nenhum outro arquivo. Textos em português. Máximo 420 linhas (se passar, divida em `encaixeArrasto.cego2.test.ts`).

## Especificação (copiada da ficha do implementador; ignore as partes sobre implementar e sobre arquivos permitidos)

## Contexto
As funções de encaixe (`encaixarNaParede`, `encaixarNoVizinho`, `guiasDeAlinhamento`, `colisoes`, `retanguloNoMundo`) estão prontas em `packages/engine/src/componentes/encaixe*.ts`. Faltam: ler o projeto e compor o encaixe de um arrasto. Os esqueletos (com a especificação em comentário) são `encaixeArrasto.ts` (`posarArrastado`) e `encaixeProjeto.ts` (`caixaLocalDoComponente`, `corposDoNivel`, `facesDasParedes`). Leia: `encaixeTipos.ts` (convenções e tipos: LEIA INTEIRO), esses dois esqueletos, `instancia.ts` (`resolverComponente`, a transformação local→mundo) e como o motor acha a espessura de uma parede e a elevação do nível (`packages/model/src/` procure `wallThickness`/`wallTypeThickness` e `levelElevation`; paredes: `wallsOnLevel`).

## Faça
1. **`caixaLocalDoComponente`**: envolvente (m) das peças NÃO vazias de `resolverComponente(p, c).pecas` no sistema local (`origem` a `origem + extensao` em cada eixo; use o mesmo formato de `PecaResolvida`). `null` sem peças.
2. **`corposDoNivel`**: um `Corpo` por componente do nível (ordem de `order`), `id` = id do componente, `pose` = `{ x, y, rotation, mirrored, z: levelElevation(p, levelId) + c.z }`, `caixa` = a local; sem peças fica de fora; `excluir` retira ids.
3. **`facesDasParedes`**: para cada parede RETA do nível (ordem de criação), duas faces: a do lado esquerdo do eixo a→b (deslocada `espessura/2` para a esquerda) orientada de a' para b', e a do lado direito (deslocada `espessura/2` para a direita) orientada de b'' para a'' (invertida), de modo que o lado LIVRE fique sempre à esquerda. Paredes curvas (com arco/raio) ficam de fora.
4. **`posarArrastado`**: conforme o comentário do esqueleto: (a) `semEncaixe`: pose = a do alvo, colisões calculadas, sem guias; (b) senão `encaixarNaParede(alvo.pose, alvo.caixa, faces, distanciaParede)`; se encaixou, o alvo passa a ter essa pose e `parede` = índice; (c) `encaixarNoVizinho` sobre a pose atual com `distanciaVizinho`; se encaixou e houve parede antes, o vizinho só pode deslizar o móvel ao longo da parede: depois de aplicar, reencoste na parede (rode `encaixarNaParede` de novo e use só o resultado se a rotação continuar a mesma, senão descarte o encaixe de vizinho); (d) `colisoes` na pose final; (e) `guiasDeAlinhamento` na pose final. Nunca lança.
5. Testes (arquivo NOVO `encaixeProjeto.test.ts` e `encaixeArrasto.test.ts`, tolerância 1e-9), à mão:
   - `facesDasParedes`: parede de (0,0) a (4,0) com espessura 0,2: face 0 de (0; 0,1) a (4; 0,1); face 1 de (4; −0,1) a (0; −0,1). Parede curva: nenhuma face. Duas paredes: ordem [parede1-esquerda, parede1-direita, parede2-esquerda, parede2-direita].
   - `corposDoNivel`: pose com `z` = elevação do nível + `z` do componente; exclui ids; componente de família ausente fica de fora.
   - `caixaLocalDoComponente` do armário A80 do `FAMILIA_ARMARIO`: confira min/max com a envolvente das peças de `resolverComponente` (calcule no teste a partir de `pecas`, não repita a função).
   - `posarArrastado`: face a=(0,0)→b=(4,0) (livre y>0); vizinho colado à parede com pose {x 0.6, y 0.56, rotation π} caixa 0.6×0.56×0.72 (ocupa x de 0 a 0.6); alvo com a mesma caixa na pose desejada (0.75, 0.3, rotation 0.02): com `distanciaVizinho` 0.2 o resultado tem rotation π, y 0.56, x 1.2 (box de 0.6 a 1.2), `parede` 0, `vizinho` = id do vizinho, sem colisões; sem `distanciaVizinho` (0,10 padrão): encaixa só na parede (x ≈ 1.0944, vizinho indefinido); `semEncaixe: true`: pose igual à desejada e `parede`/`vizinho` indefinidos; alvo longe de tudo: pose igual à desejada; alvo que invade o vizinho e não encaixa (fora do alcance de parede e de vizinho): `colisoes.moveis` contém o vizinho.
6. Gates: `npx tsc -p tsconfig.json --noEmit`, `npx eslint --max-warnings 0` nos arquivos tocados, `node scripts/check-boundaries.mjs`, `node scripts/check-units.mjs`, `npx vitest run packages/engine/src/componentes` sem regressão. Nada acima de 420 linhas; textos em português; sem `any`/`eslint-disable`.


## Arquivos permitidos
`packages/engine/src/componentes/encaixeArrasto.cego.test.ts` (NOVO) e, se passar de 420 linhas, `encaixeArrasto.cego2.test.ts` (NOVO).

## Proibido
Qualquer outro arquivo, `crates/**`, `docs/**`, snapshots.

## Critério de parada
Contradição na especificação: PARE e relate.

## Entrega
Um commit (`test(componentes): testes cegos de posarArrastado, facesDasParedes, corposDoNivel e caixaLocalDoComponente`) e o relatório pedido nas regras, mais a lista de ambiguidades.
