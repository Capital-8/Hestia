# Mapa: quem lê e grava `Level.graphics` (planta por nível)

Escopo: código de produção em `apps/` e `packages/` (sem `*.test.*`). Objetivo: preparar várias plantas por nível (uma por disciplina). Somente leitura do código; nada foi alterado.

Classes: **A** lê o nível (só id/elevação, não muda) · **B** lê a planta/vista (estilo, visibilidade, escala, detalhe; passará a ler a planta ativa) · **C** grava a planta (comando/UI) · **D** outro (projeto, corte, 3D, área, rótulos, persistência).

Cada linha é um ponto (ou grupo de linhas do mesmo arquivo com o mesmo destino). Risco só em B/C: **baixo** = troca mecânica de chave/argumento; **alto** = lógica entrelaçada (cache, chave de estado, cópia de projeto, contrato de dados).

## Resumo

- Total de pontos listados: **92**
- A (lê o nível): **2**
- B (lê a planta/vista): **48** (risco baixo: 33, alto: 15)
- C (grava a planta): **15** (risco baixo: 15, alto: 0)
- D (outro): **27**

Leitura rápida: quase tudo que é B/C por planta passa por três pontos: `levelGraphicsOf` (graphics.ts:271), `planViewOf` (render/plan/view.ts:173) e a chave `plan:${levelId}` de `visibilityOf` (apps/web/src/editor/viewVisibility.ts). Os riscos altos se concentram em cache, chave de visibilidade, cópia de projeto e no estado de UI, que só conhece `levelId` (apps/web/src/editor/state.ts:65-67 tem `planKind` e `areaPlanId`, sem planta por disciplina).

## Tabela

| arquivo:linha | o que faz | classe | risco |
|---|---|---|---|
| packages/model/src/types.ts:223 | campo `Level.graphics?: ViewGraphics` (definição) | D | — |
| packages/model/src/graphics.ts:271 | `levelGraphicsOf`: lê `Level.graphics` e aplica os padrões; é o helper central de leitura da planta | B | alto (ponto único; todos os demais dependem dele) |
| packages/model/src/graphics.ts:240 | `detailOf`: escala para fino/médio/grosso (puro, recebe o `ViewGraphics`) | B | baixo |
| packages/model/src/graphics.ts:257, 276, 282, 364 | `graphicsOf` (projeto), `sectionGraphicsOf`, `view3dOf`, `graphicsIssues` | D | — |
| packages/model/src/graphics.ts:381 | `isDefaultLevelGraphics`: sem uso em produção (só a definição) | D | — |
| packages/model/src/graphicsCommands.ts:73-78 | `applyLevelGraphics`: mescla o patch e grava `l.graphics` (valida antes) | C | baixo |
| packages/model/src/graphicsCommands.ts:80-82 | `resetLevelGraphics`: apaga `l.graphics` | C | baixo |
| packages/model/src/commands.ts:257-258 e 803-807 | contrato e despacho de `setLevelGraphics` / `resetLevelGraphics` | C | baixo (troca mecânica, mas é contrato de histórico e colaboração) |
| packages/model/src/historyRotulos.ts:164-166 | rótulo de desfazer dos comandos de planta | D | — |
| packages/model/src/commands.ts:815-816 e viewHiddenCommands.ts:34-62 | `setViewHidden` → `applyViewHidden`: grava `Level.hidden` / `Level.roofHidden` (Hide in View) | C | baixo (troca do alvo); a chave de estado é alto (ver viewVisibility) |
| packages/model/src/viewHiddenCommands.ts:23-31 | `viewHiddenOf`: lê `Level.hidden` / `roofHidden` pelo alvo | B | baixo |
| packages/model/src/validate.ts:239-247 | `graphicsProblems`: valida `levelGraphicsOf` de cada nível | B | baixo |
| packages/model/src/collabHistory.ts:42, 54 | `graphics` em SETTINGS_KEYS e `levels` em COLLECTION_KEYS (merge colaborativo) | D | alto (nova coleção de plantas sem entrada aqui perde edição concorrente em silêncio) |
| packages/io/src/ifc/ifcHestia.ts:163, 169 | exporta `LevelsJSON` (leva `Level.graphics` junto) e `GraphicsJSON` (só o do projeto) | D | alto (formato IFC: planta nova exige propriedade própria) |
| packages/io/src/ifcImport/hestia.ts:158, 170-171, 212 | importa `LevelsJSON` e `GraphicsJSON` | D | alto (mesmo motivo do export) |
| packages/model/src/migrate.ts:254-259 | migração v21→v22 só para plantas de área; não há migração de `Level.graphics` | D | — (sem migração existente; plantas por disciplina precisarão de uma) |
| packages/model/src/areaPlanCommands.ts:32; areaPlan.ts:126; viewProfile.ts:28-91 | gráficos da planta de área (outra estrutura) | D | — |
| packages/render/src/plan/style.ts:82-92 | `planStyleOf`: estilo, escala, detalhe (com a checagem `saved` do nível) e paint por categoria | B | baixo (trocar a chave nível→planta; manter a checagem `saved` sobre a mesma planta) |
| packages/render/src/plan/planContext.ts:164 | chama `planStyleOf` com a escala do painel | B | baixo |
| packages/render/src/plan/guardaCorpoCamada.ts:29 | chama `planStyleOf` para o guarda-corpo | B | baixo |
| packages/render/src/plan/massaCamada.ts:17 | chama `planStyleOf` para a massa | B | baixo |
| packages/render/src/plan/style.ts:104 | `defaultPaint`: padrão sem planta | D | — |
| packages/render/src/plan/view.ts:173-186 | `planViewOf`: vista memorizada por projeto; lê `partialStructure` e categorias ocultas; chave `levelId + partial + cats` | B | alto (cache por projeto; a chave precisa de planId) |
| packages/render/src/plan/planContext.ts:82, 176 | `planViewOf` para a geometria cheia e a geometria com paredes ocultas | B | baixo (depende de planViewOf) |
| packages/render/src/plan/planOverlay.ts:413 | `hiddenSelectionOps` via `planViewOf` (fantasmas de ocultos) | B | baixo |
| packages/render/src/plan/planOverlay.ts:156, 195, 262, 301, 326, 390 | escala da vista (`style.scale` / `areaPlan.scale`) em anotações e rótulos | B | baixo |
| packages/render/src/plan/build.ts:279, 380, 398, 550 | `style.scale` e paint de ambientes, tetos e CAD | B | baixo |
| packages/render/src/plan/planFrame.ts:99; build.ts:116, 575 | flag `thinLines` vinda do estado (só repassa) | B | baixo |
| packages/render/src/plan/planContext.ts:16 | `underlayIdOf`: nível de baixo (subpavimento); depende do nível, não da planta | A | — |
| packages/render/src/plan/planFrame.ts:136 | `showBelowLevel` do `areaPlan` | D | — |
| packages/render/src/plan/build.ts:376; areaPlan.ts:240-293; plan/types.ts:245; sheet/viewports.ts:78 | gráficos da planta de área (referenceLines, fill, tags) | D | — |
| packages/render/src/sheet/viewports.ts:16-19 | `withSheetScale` (planta): copia o projeto trocando `levels[].graphics` pela escala da prancha | B | alto (substituição em cópia; depende de onde a planta fica) |
| packages/render/src/sheet/viewports.ts:25-26 | mesmo padrão para a planta de área (usa os gráficos do nível) | B | alto (idem) |
| packages/render/src/sheet/viewports.ts:35-37; sheet/build.ts:13 | `planPartsOf(levelId)`: planta na prancha; `SheetViewSource` de `plan` guarda só `levelId` | B | alto (o modelo da prancha precisa de planId) |
| packages/render/src/sheet/viewports.ts:21, 141 | `withSheetScale` para o corte | D | — |
| packages/render/src/sheet/frame.ts:35, 52; sheet/partsCache.ts:40 | escala da vista na prancha e chave de cache | D | — |
| packages/render/src/section/style.ts:49-57; section/build.ts:87; section/frame.ts:33, 102, 128 | estilo do corte (`sectionGraphics`) | D | — |
| packages/render/src/model3d/scene3d.ts:452-1373; model3d/*; plan/roofs.ts:297, 384 | `view3dOf` (3D e sol) | D | — |
| packages/render/src/plan/cenariosZoom.ts:122-124 | fixtures de benchmark em `src/` que chamam `setLevelGraphics` (não é teste) | C | baixo (atualizar junto com o comando) |
| packages/tools/src/annotationExtraTools.ts:216 | escala da planta lida direto de `levels[].graphics`, com default 50 (o padrão do Hestia é 100) | B | baixo (trocar por helper; atenção ao default divergente) |
| packages/tools/src/annotationPick.ts:129, 134 | escala para o pick de anotações | B | baixo |
| packages/tools/src/sectionMarkPick.ts:25, 44-45 | visibilidade `annotation` e escala das marcas de corte, por nível | B | baixo |
| apps/web/src/editor/graphicsActions.ts:31-37 | `editLevelGraphics`: grava `setLevelGraphics` com checagem `alreadyApplied` | C | baixo |
| apps/web/src/editor/graphicsActions.ts:65-71 | `restoreLevelGraphicsDefault`: grava `resetLevelGraphics` | C | baixo |
| apps/web/src/editor/graphicsActions.ts:126-128 | `thinLinesOn(p, {levelId})`: lê linhas finas da planta | B | baixo |
| apps/web/src/editor/graphicsActions.ts:136-139 | `editThinLines`: grava linhas finas da planta ou do corte | C | baixo |
| apps/web/src/editor/graphicsActions.ts:43-47, 88-120, 131-133 | 3D, corte, pesos do projeto e `showLevelsOn` | D | — |
| apps/web/src/editor/aquecerPlanta.ts:25 | `thinLinesOn` para aquecer a geometria da planta | B | baixo |
| apps/web/src/editor/controller.ts:326 | `viewScale` da planta: `levelGraphicsOf(st.levelId).scale`; a UI só conhece `levelId` | B | alto (depende de planId no estado de UI) |
| apps/web/src/editor/controller.ts:319 | `viewScale` do corte | D | — |
| apps/web/src/editor/controller.ts:392 | `ocultosDaPlanta`: overrides `site`/`lot` da planta | B | baixo |
| apps/web/src/editor/controller.ts:268, 274, 1246 | `visibilityOf` para snap, caixa do corte e "visíveis na vista" | B | alto (herda `visibilityOf`) |
| apps/web/src/editor/controller.ts:372-379; apps/web/src/editor/viewKey.ts:13 | `viewKeyOf`: câmera 2D por nível (cada planta tem a sua) | B | baixo (acrescentar planta na chave) |
| apps/web/src/editor/controller.ts:280 | `underlayIdOf` via `levelId` | A | — |
| apps/web/src/editor/viewVisibility.ts:19-27 | `visibilityKeyOf`: chave do estado temporário `plan:${levelId}` (e `roof:`) | B | alto (estado temporário por nível) |
| apps/web/src/editor/viewVisibility.ts:29-37 | `viewHiddenTargetOf`: alvo `{kind:'plan', levelId}` | B | alto (alvo da ocultação permanente) |
| apps/web/src/editor/viewVisibility.ts:39-47 | `permanentHiddenOf`: lê `Level.hidden` / `roofHidden` | B | alto (dados de ocultação por nível) |
| apps/web/src/editor/viewVisibility.ts:123-135 | `ocultosDoSitio`: recebe os overrides da planta | B | baixo |
| apps/web/src/editor/viewVisibility.ts:166-190 | `visibilityOf`: núcleo (permanente + temporário + Reveal) | B | alto (núcleo da visibilidade) |
| apps/web/src/editor/viewVisibility.ts:202-204, 344, 413, 421 | `pruneHiddenSelection`, `isHidden`, `reveal`: passam por `visibilityOf` | B | alto (herda `visibilityOf`) |
| apps/web/src/editor/viewVisibility.ts:217-302 | `setViewHidden`: grava o alvo (plan/roof por `levelId`) | C | baixo (troca de alvo; a chave acima é que é alta) |
| apps/web/src/editor/paneStyle.ts:27-32 | `effectivePlanGraphics`: mescla o estilo do painel (puro) | B | baixo |
| apps/web/src/editor/paneStyle.ts:50-62 | `projetoDoPainel`: cópia do projeto com `levels[].graphics` trocado; usado pela tela | B | alto (cópia em `levels`; depende de onde a planta fica) |
| apps/web/src/editor/paneStyle.ts:79-90 | `descreverEstiloAplicado`: lê a planta por `levelId` (verificação e2e) | B | baixo |
| apps/web/src/editor/paneStyle.ts:85 | `effectiveView3d`: 3D | D | — |
| apps/web/src/ui/ViewportCanvas.tsx:372-373, 485-486, 805 | `projetoDoPainel({kind:'plan', levelId})` e `visibilityOf` no quadro | B | alto (herda os dois pontos acima) |
| apps/web/src/ui/ViewportCanvas.tsx:741 | `thinLinesOn(pEstilo, {levelId: st.levelId})` no desenho | B | baixo |
| apps/web/src/ui/ribbon/actions.ts:165-167 | `thinTarget`: nível ou corte da vista ativa | B | baixo |
| apps/web/src/ui/ribbon/actions.ts:378-388 | ação "Linhas finas": grava via `editThinLines` | C | baixo |
| apps/web/src/ui/ribbon/actions.ts:412-419 | ação "Visibilidade/Gráficos": abre o diálogo com `levelId` como argumento | C | baixo (troca do argumento) |
| apps/web/src/ui/ViewControlBar.tsx:47 | lê `levelGraphicsOf` para escala, detalhe e estilo da barra | B | baixo |
| apps/web/src/ui/ViewControlBar.tsx:52 | `editPlan`: grava escala, detalhe e estilo via `editLevelGraphics` | C | baixo |
| apps/web/src/ui/ViewControlBar.tsx:131 | `visibilityOf` para a barra de ocultos | B | alto (herda `visibilityOf`) |
| apps/web/src/ui/GraphicsProps.tsx:17 | `LevelGraphicsGroup`: lê `levelGraphicsOf` | B | baixo |
| apps/web/src/ui/GraphicsProps.tsx:19, 22-49 | `edit`: escala, detalhe, estilo, `partialStructure` e linhas finas via `editLevelGraphics` | C | baixo |
| apps/web/src/ui/GraphicsProps.tsx:52-53 | botões "Visibilidade e gráficos" (abre diálogo) e "Restaurar padrão" | C | baixo |
| apps/web/src/ui/Properties.tsx:454 | monta `LevelGraphicsGroup` com `levelId` | B | baixo |
| apps/web/src/ui/dialogs/GraphicsVisibilityDialog.tsx:46, 49 | lê o nível-alvo (`target`) e seus gráficos | B | baixo |
| apps/web/src/ui/dialogs/GraphicsVisibilityDialog.tsx:53 | grava overrides por categoria via `editLevelGraphics` | C | baixo |
| apps/web/src/App.tsx:235-236 | roteia o diálogo `graphicsVisibility` com `arg` = `levelId` | D | — (roteamento; troca de argumento) |
| apps/web/src/editor/sheetInsert.ts:201 | `naturalScaleOf` da planta: escala ao arrastar para a prancha | B | baixo |
| apps/web/src/editor/sheetInsert.ts:203 | `naturalScaleOf` do corte | D | — |
| apps/web/src/editor/dxfBatch.ts:102 | `escalaDe` da planta no DXF em lote | B | baixo |
| apps/web/src/editor/dxfExport.ts:79 | `lineWeightsOf`: pesos e escala da planta | B | baixo |
| apps/web/src/editor/dxfExport.ts:139-141 | `dxfGeometryOf`: `planViewOf` e `levelGraphicsOf` | B | baixo (depende de planViewOf) |
| apps/web/src/editor/dxfExport.ts:258, 297 | `planDxf` e lote: `overrides.generic.visible` da planta | B | baixo |
| apps/web/src/editor/dxfExport.ts:335, 361 | DXF do corte (`sectionGraphicsOf`) | D | — |
| apps/web/src/ui/SectionCanvas.tsx:45 | `thinLinesOn` do corte | D | — |
| apps/web/src/ui/GraphicsProps.tsx:65-158 | gráficos do corte e do 3D no painel de propriedades | D | — |
| apps/web/src/ui/dialogs/LineWeightsDialog.tsx:20-31 | pesos e limites de detalhe do projeto | D | — |
| apps/web/src/editor/areaPlanActions.ts:74, 92-95, 186, 263-308; controller.ts:112; ui/AreaPlanProperties.tsx:19; ui/RoomProperties.tsx:63-65 | gráficos da planta de área | D | — |
| apps/web/src/ui/ribbon/tabsMain.ts:87; ribbon/model.ts:22; editor/state.ts:48; ui/FileMenu.tsx:221; ui/graphicsLabels.ts; i18n | rótulos, tipos de diálogo e textos | D | — |

## Ponto único sugerido

Criar em `packages/model/src/graphics.ts` um resolvedor por planta, por exemplo `planGraphicsOf(p, planId)` e `planOf(p, planId)`, que aplica os padrões sobre o registro da planta (id, levelId, disciplina e gráficos). `levelGraphicsOf` vira um wrapper transitório que resolve a planta padrão do nível, para não quebrar os chamadores de uma vez. Todos os pontos B passam a chamar esse resolvedor (ou `planViewOf`, `visibilityOf` e `viewKeyOf`, que devem receber o `planId`), e as cópias de projeto que trocam `levels[].graphics` (sheet/viewports.ts:16-26 e apps/web/src/editor/paneStyle.ts:50-62) passam a usar um só helper de substituição, `comPlanta(p, planId, g)`. Antes disso, dois pontos de decisão: (1) o estado de UI (apps/web/src/editor/state.ts) precisa carregar `planId`, senão `viewScale`, `visibilityOf` e a barra de vista continuam presos a `levelId`; (2) é preciso decidir se a ocultação (`Level.hidden` / `roofHidden`) também vai para a planta, porque as chaves de visibilidade temporária dependem disso. A prancha (`SheetViewSource` 'plan') também precisará guardar `planId`, e a exportação IFC (`LevelsJSON`) e a colaboração (`collabHistory.ts`) precisam receber a nova coleção.
