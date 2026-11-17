# Frente: linha de detalhe com caixa de formas, snaps e cotas arrastáveis

Origem: issue do GitHub (cotas não arrastáveis para outro local; linha de detalhe sem indicação de perpendicular) mais o
pedido do dono: a linha de detalhe deve usar a caixa de formas como parede, laje e piso, além de snaps, Orto e Polar.

Regras dos executores: `~/hestia-tools/REGRAS-EXECUTOR.md` (guarda de recursos, sem suíte inteira, sem subagentes).
Modelos: haiku 5.5 high ou sonnet 5.5 medium. Nunca Fable nem Opus.

## Achados (verificados no código)

1. A linha de detalhe já tem galeria (`apps/web/src/ui/ribbon/DrawGalleryPanel.tsx`, `detailLineShape`), mas o
   `packages/tools/src/detailLineTool.ts` usa um `shapeSegments` próprio, fora do núcleo comum
   (`perimeterToolShape.ts`, `sketchShapes.ts`): polígono fixo de 6 lados, círculo e elipse como 24 retas, arco como 16
   retas, sem valor digitado por forma. O molde correto é `packages/tools/src/beamToolShapes.ts` (viga).
2. `DetailLine = { id, a, b, style }` (`packages/model/src/types.ts`) não tem flecha de arco. Decisão: `sag?: number`
   opcional, como `Wall.sag` (positivo abaula à esquerda de a→b; flecha limitada à metade da corda).
3. Snaps: as linhas de detalhe NÃO são alvo de captura. O contexto de snap (`packages/tools/src/base.ts`, método `ctx`)
   alimenta `extraSegments` só com `floorEdges`, ombreiras de abertura e o que a ferramenta passa. A perpendicular,
   o ponto próximo e o cruzamento já são genéricos sobre `extraSegments` (`snapExtras.ts`, `snapIndexado.ts`): basta
   alimentar. Pontos final e médio pedem `extraPoints`. No corte o contexto é `sectionContext.ts` (índice
   acelerado em `snapAccel.ts`).
4. Cotas: já existem alças (afastamento: `dimGripAt`, raio 6 px; texto: `dimTextGripAt`, raio 9 px) em
   `packages/tools/src/annotationPick.ts`, tratadas em `selectTool.ts` (modos `dimgrip` e `dimtext`) e, no corte, em
   `apps/web/src/editor/sectionHandles.ts`. Só aparecem com UMA cota selecionada e são minúsculas; clicar e arrastar o
   corpo da cota não faz nada.
5. Orto/Polar: hoje `contextoDeTraco(último ponto)`. Nas formas de vários passos, a âncora correta é `anchorOf(step)`.

## Decisões (registradas)

- `sag?` opcional em `DetailLine`; arco é arco de verdade (não 16 retas). Retrocompatível (ausente = reta).
- `DetailLineTool` migra para o núcleo comum no molde da viga. "Escolher face" fica fora desta rodada.
- Arrastar cota: pelo corpo da cota JÁ selecionada (linha muda o afastamento, texto move o texto); alças maiores com
  cursor; novo `textAt` só quando o usuário puxa o texto (o texto acompanha o afastamento enquanto `textAt` ausente).
- Detalhe como alvo de snap: `detailEdges` e `detailPoints` análogos a `floorEdges`; arco entra aproximado em segmentos.
- Marcador de 90° extra: só se faltar depois dos testes (opcional).

## Fluxos

- S1 (worktree `~/hestia-wt/detalhe-formas`, branch `frente/detalhe-formas`): modelo, render, DXF, ferramenta, UI de formas, Orto/Polar.
- S2 (worktree `~/hestia-wt/detalhe-snaps`, branch `frente/detalhe-snaps`): snaps de detalhe (planta e corte), cotas arrastáveis.
- Rodadas: R1 S1-A (sonnet) ‖ S2-A (haiku); R2 S1-B (sonnet) ‖ S2-B (sonnet); R3 S1-C (haiku) ‖ S2-C (haiku); R4 fechamento (haiku).

## Fichas

- **S1-A (sonnet, medium)**: `sag?` em `DetailLine`; helper puro `detailLineSegments(l, tol)` no modelo (aproxima o arco por segmentos);
  comando `updateDetailLine` aceita `sag`; validação (|sag| <= corda/2); render do arco na planta e no corte;
  hit test (`packages/render/src/section/handles.ts` e o da planta em `annotationPick.ts`); exportação DXF
  (`packages/io/src/dxfNotes.ts`, `dxfSectionNotes.ts`); `packages/engine/src/angularDimension.ts` (usa detailLine);
  provider de cota `packages/tools/src/dims/providers/line.ts`. Testes literais.
- **S1-B (sonnet, medium)**: reescrever `detailLineTool.ts` sobre `ShapeStep`/`buildShape`/`stepPreview`, molde `beamToolShapes.ts`.
  Remove `shapeSegments` local. Arco gera `sag`. Polígono com N lados (`detailLinePolygonSides`). Valores digitados.
- **S1-C (haiku, high)**: campos de UI (`OptionsBar.tsx`, `PlacementProperties.tsx`, `DrawGalleryPanel.tsx`), retângulo girado, i18n pt/en,
  Orto/Polar com `anchorOf(step)`, testes de formas e de Orto/Polar (molde `orthoLock.test.ts`).
- **S2-A (haiku, high)**: `detailEdges`/`detailPoints` em `base.ts` (planta, inclui plantas de área); alças de cota maiores com cursor;
  testes.
- **S2-B (sonnet, medium)**: detalhe como alvo de snap no corte (`sectionContext.ts`, respeitando `snapAccel.ts`); arrastar cota pelo
  corpo em `selectTool.ts` com teste de não-regressão do hit test.
- **S2-C (haiku, high)**: texto acompanha o afastamento; paridade no corte (`sectionHandles.ts`); testes de perpendicular, ponto médio e
  cruzamento (molde `snapsCorteCotaMedir.test.ts`); marcador de 90° se faltar.
- **R4 (haiku, high)**: typecheck, lint, testes das pastas tocadas, CHANGELOG, `ESTADO.md`, rascunho (não postado) da resposta da issue.

## Estado (cada executor acrescenta 6 a 8 linhas abaixo, com o id da ficha)

**S2-A (haiku, high)**
- Linhas de detalhe entram na captura da planta: `packages/tools/src/detailSnap.ts` (`detailEdges`, `detailPoints`), ligadas em `ToolBase.ctx` (`base.ts`) com `viewPlanId`; plantas de área usam só as próprias linhas; as ocultas na vista ficam de fora.
- Ponto único para arco: `segmentosDaLinha(l)` (hoje reta a→b); trocar por `detailLineSegments` do modelo quando o S1-A entregar.
- Alças de cota: `DIM_GRIP_PX = 9` (afastamento) e `DIM_TEXT_GRIP_PX = 12` (texto), exportadas de `annotationPick.ts`; testes literais em `annotationPick.test.ts`.
- Desenho: a cota selecionada (uma, linear) ganha quadrado no meio da linha e losango no texto (`render/src/plan/notes.ts`, `annotationHighlightOps`); antes não havia alça desenhada. Teste em `notes.text.test.ts`.
- Gap: o cursor não muda sobre as alças. A Selecionar fixa a seta (`cursor.ts`) e a ferramenta não tem API de cursor; o corte já pede `move` (`ViewportCanvas.tsx`). Não tocado.
- Gap: as alças da cota no corte (`sectionHandles.ts`) não são desenhadas; só o pick. Fica para o S2-B/S2-C.
- Perpendicular de teste com from (1,3) e pé (1,0), não (2,3): com from (2,3) o ponto médio (2,0), de peso menor, vence o pé no mesmo ponto.

**S2-B (sonnet, medium)**
- Corte: `sectionInferContext` aceita `detailLines` (opção); `detailSnapDeLinhas` (detailSnap.ts) devolve pontas, meio e segmentos `nearest`, memoizados pela referência do array de linhas (e pelos ocultos que pertencem a ele), então o `snapAccel` vê as mesmas listas a cada movimento. Ligado em `controller.ts` com `sectionAnnotationsOf(view).detailLines`. Teste: `detailSnapCorte.test.ts` (perpendicular (1,3)->(1,0), meio (2,0), ponta, cruzamento (1,0), oculta).
- Arco: `detailLineSegments` NÃO existe neste ramo (sem `sag` em `DetailLine`); `segmentosDaLinha` segue a corda. Trocar nele quando o S1-A for mesclado (planta e corte mudam juntos).
- Planta: `dimBodyAt` (annotationPick.ts) + `down` do Select: cota já selecionada (única, linear, não `locked`) pressionada no texto entra em `dimtext`, na linha/extensões em `dimgrip`; mesma lógica de commit. Folga de 4 px: clique ou tremor não grava nada. Cota não selecionada segue só selecionando. Teste: `selectDimBody.test.ts`.
- Corte: `pickSectionDimensionGrip` devolve `kind:'offset'` com `body:true` para linha/extensões; `ViewportCanvas.tsx` ignora o `up` sem arrasto (4 px) quando `body`. Teste novo em `render/src/section/handles.test.ts`.
- Gap (cursor): o Select continua sem API de cursor por hover (fixa a seta; só o corte pede `move`); não implementado. Alça da cota no corte segue sem desenho (só pick).

### S1-A (sonnet) — arco real na linha de detalhe
- `DetailLine.sag?` (m; positivo abaula à esquerda de a→b; ausente = reta). Comandos `addDetailLine`/`updateDetailLine` já espalham o objeto: o campo é preservado (patch parcial de `b` mantém o `sag`); cópia/clone de anotações usa spread.
- Nomes públicos novos (`@hestia/model`, `packages/model/src/detailLineGeom.ts`): `detailLineSegments(l, maxSegLen?)` => `Array<[Vec2, Vec2]>` (S1-B usa este), `detailLinePoints(l, maxSegLen?)` (polilinha a..b, usada nos traços), `detailLineLength(l)`, `detailLineSag(l)` (flecha efetiva, clamp |sag| <= corda/2), `DETAIL_ARC_SEGMENTS_PER_HALF_TURN = 8`.
- Arco via `arcFromSagitta`/`arcPointAt` de `@hestia/geom`; segmentos = ceil(|varredura|/π · 8), mínimo 2; `maxSegLen` só aumenta o número.
- Render: `plan/notes.ts` (planta e corte compartilham; tracejado contínuo por polilinha) e realce em `planOverlay.ts`. Hit: `section/handles.ts` e `annotationPick.ts` (`detailItemAt`). DXF: `dxfNotes.ts`, `dxfSectionNotes.ts` (1 LINE por segmento).
- Cotas/ângulo (`angularDimension.ts`, `dims/providers/line.ts`): usam a CORDA a→b; documentado em comentário, comportamento inalterado. Pendente: caixa de seleção por área (`annotationIdsInBoxOf`) segue pela corda.
- Testes literais: semicírculo (corda 2, sag ±1): meio (1, ±1), 8 segmentos, comprimento π; sag 0,5: raio 1,25, centro (1, -0,75), comprimento 2,3182; sag 5 clampado = π.

**S2-C (haiku, high)**
- `textAtAcompanhando(a, b, offsetAntigo, offsetNovo, textAt)` (`packages/tools/src/annotationPick.ts`): o `textAt` desloca pelo delta do afastamento na normal esquerda de a→b (+y para a→b em x, como `dimensionGeometry`); sem `textAt` devolve undefined.
- Planta: commit `dimgrip` de `selectTool.ts` grava `offset` e `textAt` no mesmo `updateDimension`. Corte: `sectionDimensionGripCommand` (`apps/web/src/editor/sectionHandles.ts`) faz o mesmo. Cota angular e cota sem `textAt` inalteradas.
- Alças no corte: `alcasDaCotaSelecionadaOps` (`render/src/plan/notes.ts`), extraída de `annotationHighlightOps` e usada também por `sectionAnnotationOps` (`render/src/section/annotations.ts`). Mesmo desenho da planta: quadrado de 4,5 px e losango de 6 px; os raios de pick seguem `DIM_GRIP_PX` 9 e `DIM_TEXT_GRIP_PX` 12.
- Testes novos: `packages/tools/src/textoAcompanhaAfastamento.test.ts`, `apps/web/src/editor/sectionDimTextAcompanha.test.ts`; acréscimos em `plan/notes.text.test.ts` e `section/annotations.test.ts` (valores binários exatos: linha em y = 0,75, pois 0,2 + 0,4 não é exato em ponto flutuante).
- Gap (cursor): `ui/cursor.ts` fixa Selecionar em seta por política, e a ferramenta não tem API de cursor de hover. O corte já pinta `move` na alça (`ViewportCanvas.tsx`); a planta não. Não implementado.
- Lint: eslint nos 34 .ts/.tsx do diff 96b8d0e5..HEAD, sem erro. Typecheck: 1 erro herdado (`shapeName` não usado em `detailLineTool.ts`), corrigido; tsc verde.
