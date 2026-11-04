# Ficha F2-colisao — colisões entre móveis e com paredes

Base: `feat/familias-interface`.   Modelo: opencode-go/deepseek-v4.1-flash

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
`packages/engine/src/componentes/encaixeColisao.ts`, `packages/engine/src/componentes/encaixeColisao.test.ts` (NOVO).

## Proibido
Qualquer outro arquivo, `crates/**`, `docs/**`, snapshots.

## Critério de parada
Teste contraditório com a especificação, ou necessidade de mudar arquivo fora da lista: PARE e relate.

## Entrega
Commits pequenos (`feat(componentes): …`) e o relatório pedido nas regras (últimas linhas dos comandos, decisões, o que ficou de fora).
