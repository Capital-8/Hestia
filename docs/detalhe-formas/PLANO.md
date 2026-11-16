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
