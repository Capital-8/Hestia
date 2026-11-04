# Ficha T-F2-vizinho — testes CEGOS de `encaixarNoVizinho e guiasDeAlinhamento`

Base: `feat/familias-interface`.   Modelo: definido pelo orquestrador

## O que você faz
Outro executor está implementando `encaixarNoVizinho e guiasDeAlinhamento` em `packages/engine/src/componentes/encaixeVizinho.ts` e escrevendo os testes dele. VOCÊ escreve testes INDEPENDENTES, só a partir da especificação abaixo, para o orquestrador cruzar os dois. NÃO leia, NÃO implemente e NÃO altere `encaixeVizinho.ts` (neste worktree ele só lança "não implementado": os seus testes vão falhar aqui, e isso é esperado). Seus testes são validados depois, contra a implementação do outro.

## Regras
1. Escreva UM arquivo: `packages/engine/src/componentes/encaixeVizinho.cego.test.ts` (vitest; importe de `./encaixeVizinho.ts` e de `./encaixeTipos.ts`; para geometria pode usar `retanguloNoMundo` de `./encaixeColisao.ts`, que já está pronta).
2. Cubra TODOS os casos numéricos da especificação e acrescente pelo menos 6 casos seus: bordas, simetria (espelhar a cena deve espelhar o resultado), idempotência, determinismo, entradas vazias, valores no limite da tolerância. Calcule os valores esperados À MÃO a partir da especificação e das convenções de `encaixeTipos.ts`, com a conta escrita num comentário curto ao lado de cada `expect`. Não calcule o esperado chamando a função testada.
3. Se a especificação for ambígua num ponto, NÃO invente: escreva o teste com `it.skip` e o motivo no nome, e liste a ambiguidade no relatório.
4. Rode `npx tsc -p tsconfig.json --noEmit` e `npx eslint --max-warnings 0 <seu arquivo>` e deixe verdes (o vitest vai falhar com "não implementado": diga isso no relatório e não tente "consertar").
5. Não altere nenhum outro arquivo. Textos em português. Máximo 420 linhas (se passar, divida em `encaixeVizinho.cego2.test.ts`).

## Especificação (copiada da ficha do implementador; ignore as partes sobre implementar e sobre arquivos permitidos)

## Contexto
Leia: `packages/engine/src/componentes/encaixeTipos.ts` (contrato e convenções: LEIA INTEIRO), o esqueleto do seu arquivo, `instancia.ts` (a mesma transformação local→mundo) e `docs/handoff/componentes/PLANO-MODELAGEM-FLUIDA.md` (F2). Implemente `encaixarNoVizinho` e `guiasDeAlinhamento` em `encaixeVizinho.ts`. Use `retanguloNoMundo` de `encaixeColisao.ts`.

## Faça
1. `encaixarNoVizinho` conforme o comentário do esqueleto. Detalhe do encosto: trabalhe no sistema LOCAL DO VIZINHO (gire os pontos pelo inverso da rotação dele): depois de alinhar a rotação do móvel à do vizinho (a rotação resultante é a do vizinho mais k·90°, escolhido o k mais próximo da rotação atual do móvel; `mirrored` do móvel não muda), o móvel fica à direita ou à esquerda do vizinho; a lateral 'esquerda' do PRÓPRIO móvel é a de x local mínimo quando não espelhado e a de x local máximo quando espelhado (e vice-versa). Escolha o lado de menor distância entre laterais. Alinhe a frente: o y local mínimo da caixa do móvel coincide com o do vizinho no sistema do vizinho. Alinhar a rotação só quando a diferença ao múltiplo de 90° mais próximo for ≤ `anguloMax`; senão null.
2. `guiasDeAlinhamento` conforme o esqueleto. Cada guia é um segmento na reta de alinhamento, estendido para cobrir as duas caixas (use os retângulos no mundo). `frente` = a linha da frente (y local mínimo) de cada móvel, `fundo` = y máximo, `esquerda`/`direita` = arestas de x local mínimo/máximo (ignore `mirrored` nas guias: use as arestas do retângulo no mundo), `centro-x`/`centro-y` = linhas pelo centro em cada eixo local. Só compara móveis com rotações paralelas (diferença múltipla de 90° dentro de 1e-6).
3. Testes em `encaixeVizinho.test.ts` (NOVO), tolerância 1e-9:
   - Vizinho A: pose (0,0,rot 0), caixa min [0,0,0] max [0.6,0.56,0.72]. Móvel B, mesma caixa, pose (0.63, 0.02, rot 0.05): encaixa com rotation 0, x 0.6, y 0, `lado` 'esquerda', `folga` 0, `vizinho` o id de A.
   - B à esquerda de A (pose (−0.63, 0.02, rot −0.05)): x −0.6, `lado` 'direita'.
   - B com `folga: 0.002`: afastado 2 mm.
   - Distância entre laterais 0,2 (> 0,10 padrão): null; com `distanciaMax` 0,25: encaixa.
   - Vizinho girado π/2 (pose (0,0,π/2)): B próximo de um dos lados dele, com rotação de B perto de π/2 (diferença 0,05): encaixa alinhando rotação a π/2 e frente alinhada.
   - Diferença de 30° ao múltiplo de 90°: null.
   - Vizinho em altura diferente sem sobreposição (z base 1,5 e altura 0,72 vs z 0): ignorado (null); com sobreposição em altura: considerado.
   - Vários vizinhos: escolhe o de menor distância; empate: o de menor id.
   - `guiasDeAlinhamento`: dois móveis com frentes na mesma linha (±0,005) geram uma guia 'frente' que cobre ambos; com ±0,02 (tolerância padrão 0,01) não geram; rotação não paralela (30°): nenhuma; ordem determinística; `com` é o id do outro.
4. Gates: `npx tsc -p tsconfig.json --noEmit`, `npx eslint --max-warnings 0` nos arquivos tocados, `node scripts/check-boundaries.mjs`, `node scripts/check-units.mjs`, e os testes da ficha. Nada acima de 420 linhas; textos em português; sem `any`/`eslint-disable`; sem dependência nova.


## Arquivos permitidos
`packages/engine/src/componentes/encaixeVizinho.cego.test.ts` (NOVO) e, se passar de 420 linhas, `encaixeVizinho.cego2.test.ts` (NOVO).

## Proibido
Qualquer outro arquivo, `crates/**`, `docs/**`, snapshots.

## Critério de parada
Contradição na especificação: PARE e relate.

## Entrega
Um commit (`test(componentes): testes cegos de encaixarNoVizinho e guiasDeAlinhamento`) e o relatório pedido nas regras, mais a lista de ambiguidades.
