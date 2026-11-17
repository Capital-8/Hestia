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

### S1-A (sonnet) — arco real na linha de detalhe
- `DetailLine.sag?` (m; positivo abaula à esquerda de a→b; ausente = reta). Comandos `addDetailLine`/`updateDetailLine` já espalham o objeto: o campo é preservado (patch parcial de `b` mantém o `sag`); cópia/clone de anotações usa spread.
- Nomes públicos novos (`@hestia/model`, `packages/model/src/detailLineGeom.ts`): `detailLineSegments(l, maxSegLen?)` => `Array<[Vec2, Vec2]>` (S1-B usa este), `detailLinePoints(l, maxSegLen?)` (polilinha a..b, usada nos traços), `detailLineLength(l)`, `detailLineSag(l)` (flecha efetiva, clamp |sag| <= corda/2), `DETAIL_ARC_SEGMENTS_PER_HALF_TURN = 8`.
- Arco via `arcFromSagitta`/`arcPointAt` de `@hestia/geom`; segmentos = ceil(|varredura|/π · 8), mínimo 2; `maxSegLen` só aumenta o número.
- Render: `plan/notes.ts` (planta e corte compartilham; tracejado contínuo por polilinha) e realce em `planOverlay.ts`. Hit: `section/handles.ts` e `annotationPick.ts` (`detailItemAt`). DXF: `dxfNotes.ts`, `dxfSectionNotes.ts` (1 LINE por segmento).
- Cotas/ângulo (`angularDimension.ts`, `dims/providers/line.ts`): usam a CORDA a→b; documentado em comentário, comportamento inalterado. Pendente: caixa de seleção por área (`annotationIdsInBoxOf`) segue pela corda.
- Testes literais: semicírculo (corda 2, sag ±1): meio (1, ±1), 8 segmentos, comprimento π; sag 0,5: raio 1,25, centro (1, -0,75), comprimento 2,3182; sag 5 clampado = π.

### S1-B (sonnet) — DetailLineTool sobre o núcleo de formas
- `detailLineTool.ts` reescrito no molde da viga: `ShapeStep`/`buildShape`/`anchorOf`; removidos `shapeSegments`/`arcThreePt`. Novo `detailLineToolShapes.ts` (`DETAIL_SHAPE_KIND`, `normalizeDetailSegs`, `buildDetailShapeSegs`, `previewDetailShapeStep`, `initDetailShapeStep`, `detailPolygonSides`; prompt/parse reaproveitam os genéricos da viga).
- Arco/círculo = linhas com `sag` (círculo = 2 arcos de 180°); elipse = cordas, juntadas até >= 0,05 m (`ROOM_SEPARATOR_MIN_LENGTH`, mínimo do comando `addDetailLine`, que lança abaixo disso; por isso o filtro é 0,05 e não 0,01).
- Polígono: `ToolOptions.detailLinePolygonSides` (3..64, padrão 6; sem default em `state.ts`, ausente = 6). Lados vêm da opção, o passo "Lados" é pulado.
- Mantidos: sem encadeamento, Esc, comprimento digitado, `tempDims`, prévia de ângulo na forma `line`, uma transação 'Linha de detalhe' (planta e corte). Orto/Polar: `contextoDeTraco(anchorOf(step))` (S1-C só testa).
- Tab alterna o sentido (flag `ccw`) em arco centro-extremidades. S1-C liga na UI: campo de lados (`detailLinePolygonSides`) quando a forma é polígono; retângulo girado ainda não mapeado em `WallDrawShape`.
- Testes: `detailLineToolShapes.test.ts` (12, valores literais); nenhum teste existente alterado.

### S1-C (haiku) — campo de lados, Orto/Polar e pendências da galeria
- Campo "Lados" (`pro_poly_sides`, já existente pt/en; nenhuma chave nova) só com `poly-inscribed`/`poly-circumscribed`: `DetailShapeFields` em `ShapeOptionFields.tsx` (barra, `opt-dl-sides`) e `Row` em `PlacementProperties.tsx` (`place-dl-sides`). Clamp 3..64 no `onCommit`, padrão 6 sem default em `state.ts`.
- `WallShapeFields` foi movido para `ShapeOptionFields.tsx` e reexportado por `OptionsBar.tsx` (o limite `max-lines` 420 da OptionsBar estourava com o campo novo). Teste da parede inalterado.
- Galeria (`DrawGalleryPanel.tsx`): sem campo de lados. A barra de opções já mostra o campo na mesma tela; igual à Parede, que também não o põe na galeria.
- Retângulo girado: NÃO mapeado. `ShapeKindId` 'rotatedRectangle' existe no núcleo (`sketchShapes.ts`, `perimeterToolShape.ts`), mas `PERIMETER_SHAPES` não tem ícone para ele, `WallDrawShape`/`BeamDrawShape` não têm id e a viga não o usa. Pendência: desenhar ícone e decidir o id (`rect-rotated`) antes de incluir na galeria.
- Orto/Polar testados em `detailLineOrtoPolar.test.ts` (5, valores literais): linha Orto (3; 0,4) -> (3; 0) e (0,4; 3) -> (0; 3); polar 45 graus, (2; 2,1) -> (2,05; 2,05); polígono inscrito, vértice (2; 0,3) -> (2; 0), raio 2; círculo, ponto do raio (1,5; 0,2) -> (1,5; 0).
- Retângulo com F8: como na viga, o 2º canto recebe Orto a partir do 1º (`contextoDeTraco(anchorOf(step))`, beamTool: `startPt`). Pelo código, com F8 ou Shift o canto cai sobre o eixo e o retângulo fica degenerado. NÃO testado em execução; pendência para decidir junto com a viga.
- Gate: typecheck passou (exit 0, antes de mover `WallShapeFields`); eslint passou nos arquivos finais; vitest 9 arquivos, 87 testes, todos passaram.
- Novos: `detailLineOrtoPolar.test.ts`, `DetailShapeFields.test.ts`. Nenhum teste existente alterado.
