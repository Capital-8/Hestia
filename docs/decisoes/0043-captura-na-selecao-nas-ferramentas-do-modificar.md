# Decisão 0043 — Captura na própria seleção nas ferramentas do Modificar

Decidido em 2026-10-31. Corrige a captura das ferramentas do Modificar: o ponto de referência (base, centro,
eixo do espelho) passa a enxergar também os elementos selecionados; o ponto de destino continua ignorando o que
se move. Complementa a [0037](0037-cotas-dinamicas-e-referencias.md) no uso das referências e a
[0042](0042-espelho-de-aberturas.md) no padrão antes/depois. Fontes: `packages/tools/src/transformTools.ts`,
`packages/tools/src/arrayTool.ts`, `packages/tools/src/infer.ts` (`InferContext.ignore`, ranking de `WEIGHT`).

## 1 — Contexto

As ferramentas do Modificar (Mover/Copiar, Rotacionar, Espelhar, Matriz) passavam `ignore: new Set(movables())` em
**todos** os cliques. `InferContext.ignore` não filtra só pontos: tira a parede de `wallsOnLevel` e as faces de
`facesIn`, então a própria seleção desaparecia de qualquer captura — sem ponta, sem face, sem alinhamento. O efeito
prático: com uma parede selecionada, não se conseguia pegar o canto dela como ponto-base, nem girar em torno de um
canto, nem espelhar em torno da face dela. Só elementos não selecionados capturavam.

## 2 — Decisões

| # | Decisão | Motivo |
|---|---|---|
| 1 | **O ponto de referência captura na seleção.** Mover/Copiar: 1º clique (base). Rotacionar: centro e direção de referência. Espelhar: os dois pontos do eixo. Matriz: base/centro | É o ponto em que o usuário mira a geometria do próprio elemento: pegar o canto da parede que vai mover, girar em torno de um canto, espelhar em torno da face da parede. Revit e AutoCAD capturam no modelo inteiro nesse passo |
| 2 | **O ponto de destino continua ignorando o que se move.** Mover/Copiar: 2º clique. Rotacionar: direção final. Matriz: direção | A captura é da geometria **original**, parada: no destino o cursor quase sempre passa perto dela e o fantasma colaria na posição de origem (`nearest` = 0,7 e `face` = 0,1 vencem qualquer alvo ao lado). O delta ficaria travado justamente em deslocamentos pequenos |
| 3 | **O Espelhar não ignora em nenhum dos dois cliques** | Os dois cliques definem o eixo, não um destino: nada se move até o segundo clique, e espelhar em torno da própria face/linha de centro é o uso corrente |
| 4 | **A regra é lida do estado do passo, não de uma opção de UI** (`this.base`, `this.ref`): sem referência ainda, captura tudo; com referência, ignora o que se move | Uma opção a mais ("capturar na seleção") duplicaria o mesmo conceito em cada ferramenta e deixaria o padrão errado para quem não a descobrisse. O estado já diz se o clique é referência ou destino |
| 5 | **Deslocar (paralelo) mantém o `ignore` da linha de base** | Ali `base` é a linha de origem do deslocamento, e a medida é a distância até ela: capturar nela daria sempre distância zero |
| 6 | **Arrastar alça (`selectGrips`) mantém o `ignore` do elemento arrastado**, com os vértices do anel passados explicitamente em `extraPoints` | O arrasto precisa dos vértices do próprio elemento, mas não das faces dele: capturar a face parada anularia o arrasto |

## 3 — Consequências

- **Parede selecionada + Mover:** o 1º clique pega pontas, pontos médios, faces e alinhamentos da própria parede;
  o 2º clique continua vendo só o resto do modelo (mais grade/orto), sem grude na posição de origem.
- **Rotacionar:** centro e direção de referência capturam na seleção; a direção final não é puxada pela geometria de
  origem (o ângulo continua digitável, como antes).
- **Espelhar:** eixo pode ser a face, a linha de centro ou a diagonal de dois cantos da própria parede.
- **Matriz:** base/centro capturam na seleção; a direção (delta) não.
- **Nada muda** para elementos não selecionados, para as ferramentas de criação (Parede, Porta, Cota etc.) nem para
  as ferramentas de edição que já capturavam tudo.

## 4 — Arquivos

- `packages/tools/src/transformTools.ts` — `MoveTool` (`move`/`click`), `RotateTool` (`move`/`click`) e
  `MirrorTool` (`move`/`click`): `ignore` condicional ao passo.
- `packages/tools/src/arrayTool.ts` — `move`, `moveRadial` e `click`: mesma regra base vs direção.
- `packages/tools/src/snapNaSelecao.test.ts` — base do Mover, centro do Rotacionar, os dois pontos do Espelhar e a
  base da Matriz capturam o canto da parede selecionada; o destino do Mover não captura nela.
