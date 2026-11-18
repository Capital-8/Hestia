# Ficha F2-vizinho — colar no vizinho e guias de alinhamento

Base: `feat/familias-interface`.   Modelo: opencode-go/deepseek-v4.1-flash

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
`packages/engine/src/componentes/encaixeVizinho.ts`, `packages/engine/src/componentes/encaixeVizinho.test.ts` (NOVO).

## Proibido
Qualquer outro arquivo, `crates/**`, `docs/**`, snapshots.

## Critério de parada
Teste contraditório com a especificação, ou necessidade de mudar arquivo fora da lista: PARE e relate.

## Entrega
Commits pequenos (`feat(componentes): …`) e o relatório pedido nas regras (últimas linhas dos comandos, decisões, o que ficou de fora).
