# Ficha T-F2-colisao — testes CEGOS de `colisoes e retanguloNoMundo`

Base: `feat/familias-interface`.   Modelo: definido pelo orquestrador

## O que você faz
Outro executor está implementando `colisoes e retanguloNoMundo` em `packages/engine/src/componentes/encaixeColisao.ts` e escrevendo os testes dele. VOCÊ escreve testes INDEPENDENTES, só a partir da especificação abaixo, para o orquestrador cruzar os dois. NÃO leia, NÃO implemente e NÃO altere `encaixeColisao.ts` (neste worktree ele só lança "não implementado": os seus testes vão falhar aqui, e isso é esperado). Seus testes são validados depois, contra a implementação do outro.

## Regras
1. Escreva UM arquivo: `packages/engine/src/componentes/encaixeColisao.cego.test.ts` (vitest; importe de `./encaixeColisao.ts` e de `./encaixeTipos.ts`; para geometria pode usar `retanguloNoMundo` de `./encaixeColisao.ts`, que já está pronta).
2. Cubra TODOS os casos numéricos da especificação e acrescente pelo menos 6 casos seus: bordas, simetria (espelhar a cena deve espelhar o resultado), idempotência, determinismo, entradas vazias, valores no limite da tolerância. Calcule os valores esperados À MÃO a partir da especificação e das convenções de `encaixeTipos.ts`, com a conta escrita num comentário curto ao lado de cada `expect`. Não calcule o esperado chamando a função testada.
3. Se a especificação for ambígua num ponto, NÃO invente: escreva o teste com `it.skip` e o motivo no nome, e liste a ambiguidade no relatório.
4. Rode `npx tsc -p tsconfig.json --noEmit` e `npx eslint --max-warnings 0 <seu arquivo>` e deixe verdes (o vitest vai falhar com "não implementado": diga isso no relatório e não tente "consertar").
5. Não altere nenhum outro arquivo. Textos em português. Máximo 420 linhas (se passar, divida em `encaixeColisao.cego2.test.ts`).

## Especificação (copiada da ficha do implementador; ignore as partes sobre implementar e sobre arquivos permitidos)

## Contexto
Leia: `packages/engine/src/componentes/encaixeTipos.ts` (contrato e convenções: LEIA INTEIRO), o esqueleto do seu arquivo, `instancia.ts` (a mesma transformação local→mundo) e `docs/handoff/componentes/PLANO-MODELAGEM-FLUIDA.md` (F2). Implemente `colisoes` em `encaixeColisao.ts`. A função `retanguloNoMundo` desse arquivo já está pronta: NÃO mude o comportamento dela.

## Faça
1. `colisoes` conforme o comentário do esqueleto: sobreposição em planta por teste de eixos separadores entre retângulos orientados (penetração > 1 mm em todos os eixos; encostar não conta) E sobreposição em altura (z base + caixa.min[2] até z base + caixa.max[2], penetração > 1 mm). Com paredes: algum canto do retângulo mais de 1 mm no lado sólido (direita de a→b) da face e com a projeção dentro do comprimento da face. Ordem: `moveis` por id, `paredes` por índice crescente; sem repetição; o próprio id ignorado.
2. Testes em `encaixeColisao.test.ts` (NOVO; `retanguloNoMundo` também ganha testes: pose sem giro, girada 90°, espelhada), tolerância 1e-9:
   - Dois móveis 0,6×0,56 com origens (0,0) e (0,3, 0,2) (sobrepõem): colide. Com origem (0,6, 0): encostados, não colide. (0,6005, 0): não. (0,598, 0): colide.
   - Caixa girada 45° com o canto entrando na lateral do outro por 1 cm: colide; recuada 1 cm: não.
   - Aéreo acima da base (z base 1,4, altura 0,7 sobre móvel de 0,72 a partir de 0): não colide; descendo o aéreo para z 0,6: colide.
   - Mesmo id ignorado.
   - Paredes: face a=(0,0)→b=(4,0) (sólido em y<0): móvel com um canto em y = −0,05 e x dentro de [0,4]: `paredes` = [0]; móvel todo em y ≥ 0: []; móvel fora do comprimento da face (x > 4,2): [].
   - Ordem determinística com três móveis em ordem embaralhada.
3. Gates: `npx tsc -p tsconfig.json --noEmit`, `npx eslint --max-warnings 0` nos arquivos tocados, `node scripts/check-boundaries.mjs`, `node scripts/check-units.mjs`, e os testes da ficha. Nada acima de 420 linhas; textos em português; sem `any`/`eslint-disable`; sem dependência nova.


## Arquivos permitidos
`packages/engine/src/componentes/encaixeColisao.cego.test.ts` (NOVO) e, se passar de 420 linhas, `encaixeColisao.cego2.test.ts` (NOVO).

## Proibido
Qualquer outro arquivo, `crates/**`, `docs/**`, snapshots.

## Critério de parada
Contradição na especificação: PARE e relate.

## Entrega
Um commit (`test(componentes): testes cegos de colisoes e retanguloNoMundo`) e o relatório pedido nas regras, mais a lista de ambiguidades.
