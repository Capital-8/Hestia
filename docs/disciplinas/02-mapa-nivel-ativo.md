# Mapa do nível ativo e da vista ativa (base para plantas por disciplina)

Leitura somente. Caminhos relativos a `apps/web/src/` salvo indicação. Linhas conferidas no worktree `hestia-wt/disc`.

## 1) Estado ativo

### Tipos

| Tipo | Arquivo:linha | Papel |
|---|---|---|
| `ViewKind = 'plan' \| '3d' \| 'section' \| 'sheet' \| 'face'` | `editor/state.ts:17` | Modo de tela. |
| `PlanKind = 'floor' \| 'roof' \| 'area'` | `editor/openViews.ts:7` | Tipo de planta quando `view === 'plan'`. Ausente = piso. |
| `OpenView` (união: `plan` com `levelId`, `planKind?`, `areaPlanId?`; `3d`; `section` com `viewId`; `sheet` com `sheetId`; `face`) | `editor/openViews.ts:13-19` | Aba da barra de vistas. É a identidade "de vista" do app. |
| `ActiveViewFields` | `editor/openViews.ts` (interface logo após `OpenView`) | Subconjunto de `UiState` que define a vista ativa. |
| `PaneView = OpenView` | `editor/panes.ts:20` | Vista de um painel (layout multi-painel). |
| `PaneViewFields` | `editor/paneView.ts:10-18` | Campos de vista de um painel (ativo ou não). |
| `ViewKeyFields` | `editor/viewKey.ts:4-10` | Campos da chave da câmera 2D. |

### Campos de `UiState` (`editor/state.ts`)

Interface em `state.ts:50`. Defaults em `state.ts:398-457`.

| Campo | Tipo | Arquivo:linha | Default | Observação |
|---|---|---|---|---|
| `view` | `ViewKind` | `state.ts:52` | `'plan'` | Fonte da vista ativa. |
| `levelId` | `Id` | `state.ts:53` | `'lv_0'` | Nível ativo. Vale para piso, cobertura e área. |
| `sectionId` | `Id \| null` | `state.ts:55` | `null` | Corte/elevação quando `view === 'section'`. |
| `sheetId` | `Id \| null` | `state.ts:57` | `null` | Prancha quando `view === 'sheet'`. |
| `faceView` | objeto `{elementId, face, layer} \| null` | `state.ts:59` | `null` | Estúdio da face. |
| `planKind` | `PlanKind` | `state.ts:65` | `'floor'` | Tipo de planta (só vale com `view === 'plan'`). |
| `areaPlanId` | `Id \| null` | `state.ts:67` | `null` | Planta de área ativa quando `planKind === 'area'`. |
| `openViews` | `OpenView[]` | `state.ts:151` | `[{kind:'plan', levelId:'lv_0'}]` (`DEFAULT_OPEN_VIEWS`, `state.ts:396`) | Abas. Sincronizada com os campos acima. |
| `selectedLevel` | `Id \| null` | `state.ts:84` | `null` | Nível selecionado no 3D. |
| `viewTemp` | `Record<string, TempViewVisibility>` | `state.ts:75` | `{}` | Ocultação temporária, chaveada por `visibilityKeyOf`. |
| `underlayLevel` | `string \| null` | `state.ts:105` | `null` | Pavimento de referência (planta de baixo). |
| `tagDrag` | `{planId, roomId, at} \| null` | `state.ts` (perto de `areaPlanId`) | `null` | Rótulo em arraste. |

### Como a vista muda (escritores)

- `controller.ts:1300` `selectLevel(id, kind='floor', areaPlanId=null)`: grava `levelId`, `planKind`, `areaPlanId`, `view:'plan'`, `sectionId:null`, zera seleção. É o caminho principal de planta.
- `controller.ts:1306` `setView('plan' | '3d')`.
- `controller.ts:978` `openSection(id)` (`view:'section'`) e `controller.ts:988` `closeSection()`.
- `controller.ts:1347` `load()` reinicia `levelId` no primeiro nível, `view:'plan'`, `planKind:'floor'`, `openViews` padrão.
- `controller.ts:973-974` `pruneSelection` volta para `plan` se o corte sumiu; `controller.ts:970-971` troca o nível ativo se o nível sumiu.
- `controller.ts:1091-1093` `restaurarVistaDeOrigem` (colar alinhado).
- `editor/perimeterMode.ts:363` grava `view:'plan'` direto.
- `editor/viewTabActions.ts:53` `navega(v)` despacha por tipo de aba: plantas via `openAreaPlan` (`areaPlanActions.ts:216`) ou `selectLevel`; `3d` via `setView`; corte via `openSection`; prancha e face via `setState` direto (`viewTabActions.ts:72`, `:76`).
- `viewTabActions.ts:92` `activateView(v)` é o ponto de entrada usado pela árvore (`ui/browser/Views.tsx`), pelas abas, pelo ribbon e pela colaboração (`collab/useCollabIntegration.ts:30-33`).
- `viewTabActions.ts:104` `closeTab` (libera o nível da planta fechada via `levelToRelease`, `openViews.ts:117`).

### Sincronização e persistência

- `state.ts:489-500`: ao mudar `view`, `levelId`, `planKind`, `areaPlanId`, `sectionId`, `sheetId` ou `faceView`, o subscriber chama `addView(openViews, activeViewOf(s))`. Ou seja, qualquer caminho que muda a vista abre a aba.
- `openViews.ts:129` `activeViewOf(ui)` converte os campos em `OpenView` (planta de área sem `areaPlanId` devolve `null`).
- `openViews.ts:45` `viewKey(v)`: chaves `plan:<lvl>`, `roof:<lvl>`, `area:<areaPlanId>`, `section:<viewId>`, `sheet:<id>`, `3d`, `face:...`. É a identidade usada para comparar abas.
- `editor/paneStore.ts:123` `syncActiveView` copia a vista ativa para o painel ativo.
- `editor/layoutTree.ts:301-304` persiste `planKind` e `areaPlanId` dos painéis em `localStorage` (`hestia.panes`, `panes.ts:106`).
- `editor/sessao.ts:19-37` persiste `view`, `levelId`, `planKind`, `areaPlanId` e `openViews` (`AbaDaSessao`) para recarregar.
- `panes.ts:47-49` `followLevel`: o painel acompanha o nível ativo, só em planta.

## 2) Consumidores

Coluna "depende de": `L` = `levelId`, `P` = `planKind`, `A` = `areaPlanId`, `S` = `sectionId`, `V` = `view`, `pid` = parâmetro `planId` explícito.

### 2a. Ferramentas (`packages/tools/src`)

| Arquivo:linha | Depende de |
|---|---|
| `types.ts:63` (`ToolEnv`): `levelId()`, `areaPlanId?()`, `section?()`, `hiddenInView?()`, `underlayLevelId()` | Contrato. Única via de `planId` é `areaPlanId?()`. |
| `base.ts:169` `viewPlanId(env)` = `env.areaPlanId?.()` | A. Usado em `textTool.ts:71`, `tagTool.ts:71`, `openingTool.ts:326`, `angularDimensionTool.ts:100,320`, `annotationExtraTools.ts:120,189,257,353`. |
| `base.ts:106-145` snaps de detalhe (`detailPoints`, `detailEdges`) | L + pid (A). |
| `detailSnap.ts:30`, `:35` | L + pid (linhas de detalhe da vista). |
| `annotationPick.ts:119-146` `viewAnnotationsOf(p, L, pid)` (resolvedor central das anotações da vista) | L + pid. Com pid, usa `plan.annotations` (vazio se ausente); sem pid, usa o nível. |
| `annotationPick.ts:147-446` (`detailItemAt`, `annotationAt`, `dimGripAt`, `textGripAt`, `spotGripAt`, etc.) | L + pid. |
| `annotationPick.ts:449-478` `roomTagAt`, `roomTagIdsInBox`, `roomTagRing` | pid (etiqueta de ambiente só existe em planta de área). |
| `selectTool.ts:141-142`, `:190-191` `planId()` = `env.areaPlanId?.()` | A. |
| `selectTool.ts:244-265`, `:321`, `:363`, `:510-545`, `:567`, `:585-635` | L + pid. |
| `selectTool.ts:693-740` gravações (`updateDimension`, `updateText`, `updateTag`, `updateSpot`, `updateSymbol`, `updateRoomTag`) | L + pid (passam `planId` só se houver). |
| `selectTool.ts:770-789` seleção por caixa | L + pid; `itensDeTerrenoNaJanela` só sem pid (`:788`). |
| `selectTool.ts:834` `ArrastoComponentes(pr, ...)` | L (componente). |
| `transformTools.ts:41`, `:277` (Mover/Copiar) | Só L. `annotationIdsIn(p, L, sel)` e `annotationMoveCommands(p, L, sel, d, copy)` (`annotations.ts:421`) não recebem pid. Ver surpresa 2. |
| `dims/permanent.ts:29` `toPermanent(L, dims, pid)` | L + pid. |
| `dims/customRef.ts:70` | L. |
| `alignFeatures.ts:101`, `:429-444`, `:503` (linhas de referência) | L + pid. |
| `wallTool.ts:333` `draftAngleItemsForConnection(..., env.areaPlanId?.())` | A (só para a prévia de ângulo). |
| `roomSeparatorTool.ts:40`, `:68` | L (separador de ambiente é do nível, não da planta). |
| `infer.ts:319`, `:691`; `pick.ts:18`, `:102`, `:135`, `:148`, `:166`, `:186`, `:246` | L (e nível sob-pavimento). Pick de elementos é todo por `levelId`. |
| `sectionTool.ts:75-76`, `annotationPick.ts:17` (`endRefAt`) | L. |

### 2b. Engine e snaps

| Arquivo:linha | Depende de |
|---|---|
| `packages/engine/src/apoioDeSnap.ts:500`, `:525` (`apoioDoElemento`, `pontoDeApoio`) | Não usa a vista. Usa o `levelId` do próprio elemento (`:327`, `:396`, `:473`). |
| `packages/engine/src/areaPlan.ts:9`, `:20`, `:48`, `:88`, `:119`, `:125` | `AreaPlan` (por `planId`), esquema de cor e tabela. Não depende da vista ativa. |
| `packages/tools/src/base.ts:106-145` (snap de detalhe) | L + pid. |
| `packages/tools/src/infer.ts:319` (sob-pavimento) | L + `underlayLevelId`. |

### 2c. Cotas e anotações (ver também seção 4)

| Arquivo:linha | Depende de |
|---|---|
| `packages/model/src/annotations.ts:6-16` `AnnotationView { levelId, planId?, sectionId? }` | Todos os comandos de anotação carregam `levelId`, com `planId` ou `sectionId` opcionais. |
| `packages/model/src/annotations.ts:198-201` despacho do escopo | `sectionId` tem prioridade; depois `planId`; senão o nível. |
| `packages/model/src/annotations.ts:94-112` `levelDimensions`, `levelTexts`, `levelRoomSeparators` | L. |
| `packages/model/src/annotations.ts:391` `annotationIdsIn(p, L, ids)` | L (só anotações do nível). |
| `packages/model/src/annotations.ts:400` `annotationIdsInView(p, L, pid)` | L + pid. |
| `packages/model/src/annotations.ts:421` `annotationMoveCommands(p, L, ids, d, copy)` | Só L (ver surpresa 2). |
| `apps/web/src/editor/viewAnnotations.ts:19-50` `annotationsOfActiveView(p, st)` | V, P, L, A, S. |
| `apps/web/src/editor/viewAnnotations.ts:74-103` (ids, tipos, filtros) | Mesmos campos de `ViewState` (`viewAnnotations.ts:13`). |
| `apps/web/src/editor/controller.ts:45-55` `activeViewTagContext` | L, P/A, S. Decide onde a etiqueta nova cai. |
| `apps/web/src/editor/controller.ts:61-90` `tagAll`/`tagRooms` | L (`levelOf(p,e)`), pid, sid. |
| `apps/web/src/editor/controller.ts:90-101` `PLAN_ANNOTATION_TYPES` | Lista de comandos que recebem `planId`/`sectionId` automaticamente. |
| `apps/web/src/editor/controller.ts:104-107` `activeSectionId()` | V, S. |
| `apps/web/src/editor/controller.ts:307-309` `areaPlanIdNow()` | V, P, A. |
| `apps/web/src/editor/controller.ts:354-366` `exec1` (injeta `sectionId`, depois `planId`) | S, depois A. Rede de segurança do roteamento. |
| `apps/web/src/editor/controller.ts:964-966` apagar seleção | L + `planAnnotationIds` da planta atual (A). |
| `apps/web/src/editor/controller.ts:698-740` arraste de rótulo do ambiente | P, A, L. A posição do ambiente grava em `setRoomLabel` (`controller.ts:725`, sem pid). |
| `apps/web/src/editor/controller.ts:563` `pickRefCommands(p, L, ...)` | L. |
| `packages/model/src/commands.ts:262-263` `setSectionAnnotations`, `setSectionLevelExtent` | S (corte). |
| `packages/model/src/commands.ts:304-306` `addRoomTag`/`updateRoomTag`/`removeRoomTag` | pid (etiqueta de ambiente). |
| `packages/model/src/commands.ts:308` `setRoomLabel` | Sem vista: o ambiente (`Room`, `types.ts:772-775`, com `levelId`) guarda a posição. |
| `packages/model/src/areaPlanCommands.ts:51-75` | pid (com validação de planta). |
| `apps/web/src/editor/tagActions.ts:45-90` (`activeViewTagContext`, etiquetar) | L, P, A, S (ver `controller.ts:45-55`). |
| `apps/web/src/editor/controller.ts:1067` `guardarOrigemDoColar` e `controller.ts:1130-1136` | V, L, S, P, A. |

### 2d. Navegador de projeto (`apps/web/src/ui/browser/Views.tsx`)

| Arquivo:linha | Depende de |
|---|---|
| `Views.tsx:151-155` | `view`, `levelId`, `planKind`, `areaPlanId` do `useUi`. |
| `Views.tsx:172-179` plantas de piso | `levelId` (`activateView({kind:'plan', levelId})`). Destaque em negrito: `view==='plan' && planKind==='floor' && levelId===l.id`. |
| `Views.tsx:184-194` plantas de cobertura | `levelId` + `planKind:'roof'`. |
| `Views.tsx:221-232` plantas de área | `areaPlans` (`areaPlansOf`), `planKind:'area'`, `areaPlanId`. Arrasto usa `dragView({kind:'areaPlan', planId})`. |
| `Views.tsx:36`, `:31` cortes | `sectionId`. |
| `Views.tsx:239` 3D | `view`. |
| `Views.tsx:287` prancha | `activateView({kind:'sheet', sheetId})`. |

Ver também `ui/ViewTabs.tsx:31` (chave da aba) e `ui/PaneGrid.tsx:134-156` (seletor de vista do painel por `viewKey`).

### 2e. Pranchas (`packages/model/src/sheet.ts`)

| Arquivo:linha | Depende de |
|---|---|
| `packages/model/src/sheet.ts:57-63` `SheetViewSource` | `{kind:'plan', levelId}` (`:58`) sem `planKind`: planta de cobertura e de disciplina não cabem. `{kind:'areaPlan', planId}` (`:59`). `{kind:'section', sectionId}` (`:61`). |
| `packages/model/src/sheet.ts:91-96` `SheetViewport` | `view: SheetViewSource` (`:91`). Nenhum `levelId` direto. |
| `packages/model/src/sheet.ts:243-249` `sectionSheetNumberOf` | `sectionId`. |
| `apps/web/src/editor/sheetInsertSources.ts:31` | Chave `plan:${l.id}`. Lista só níveis. |
| `apps/web/src/editor/sheetInsert.ts:181` | `{kind:'plan', levelId}`. |
| `apps/web/src/ui/sheet/useSheetPrefetch.ts:15` | `{kind:'plan', levelId}` para todos os níveis. |
| `apps/web/src/editor/sheetActions.ts:105-126` `areaPlanSheetSize` | `planId` (escala e caixa da planta de área). |
| `apps/web/src/editor/sheetActions.ts:159-164` | `levelBox(p, view.levelId)` e `levelBox(p, plan.levelId)`. |
| `apps/web/src/editor/sheetActions.ts:346-351` `pranchaDaPlantaAtual(store, levelId)` | L. Cria prancha com `{kind:'plan', levelId}`. |
| `apps/web/src/editor/fileActions.ts:33` | L (`useUi.levelId`). |
| `packages/render/src/sheet/build.ts:12-20` (`switch` por `kind`) | `planPartsOf(p, levelId)`, `areaPlanPartsOf(p, planId)`, `sectionPartsOf(p, sectionId)`. |
| `packages/render/src/sheet/viewports.ts:18-19`, `:25-26` `withSheetScale` | Grava a escala da vista como `levelGraphicsOf(p, levelId).scale` numa cópia do projeto. A escala da planta na prancha é, assim, a escala do nível. |
| `packages/render/src/sheet/viewports.ts:35-45` `planPartsOf(p, levelId, vp)` | L. |
| `packages/render/src/sheet/viewports.ts:66-78` `areaPlanPartsOf(p, planId, vp)` | pid (e `plan.levelId`). |
| `packages/render/src/sheet/viewports.ts:138-141` `sectionPartsOf` | S. |

### 2f. Exportação DXF e PDF

| Arquivo:linha | Depende de |
|---|---|
| `apps/web/src/editor/dxfBatch.ts:30-33` alvos da exportação em lote | Chaves `plan:${levelId}`, `area:${planId}`, `section:${viewId}`. Cobertura não aparece. |
| `apps/web/src/editor/dxfBatch.types.ts:15-18` `DxfBatchTarget` | `levelId` (plan), `planId` (area), `viewId` (section). |
| `apps/web/src/editor/dxfBatchRenderers.ts:11-13` | `planDxf(levelId)`, `areaPlanDxf(planId)`, `sectionDxf(viewId)`. |
| `apps/web/src/editor/dxfExport.ts:138` `dxfGeometryOf(p, levelId, ...)` | L. Usa `levelGraphicsOf(p, levelId)` (`:141`) e `planViewOf(p, levelId)` (`:139`). |
| `apps/web/src/editor/dxfExport.ts:256` `planDxf(p, levelId, ...)` | L. |
| `apps/web/src/editor/dxfExport.ts:275-277` união `{kind:'plan'|'section'|'area'}` e `:291`, `:320` | L, viewId, planId. |
| `apps/web/src/editor/dxfExport.ts:404-413` `PlanViewRef` e `viewDxf` | `areaPlanId` (se houver, planta de área; senão `planDxf(levelId)`). |
| `apps/web/src/editor/dxfExportDialogModel.ts:56-71` `DxfActiveView` e `activeDxfTargetKey` | V, L, P, A, S. |
| `apps/web/src/editor/dxfAreaPlan.ts:109-172` `areaPlanDxf(p, planId)` | pid. Usa `plan.levelId` e `drawnAnnotations(p, plan.levelId, plan)` (`:65`). |
| `apps/web/src/editor/savePdf.ts`, `entregarArquivo.ts`, `fileActions.ts` | Não encontrei dependência de `levelId`/`planKind` no PDF. Ele sai pelas pranchas (`sheet.ts`). |

### 2g. Renderização da planta (`packages/render/src`)

| Arquivo:linha | Depende de |
|---|---|
| `packages/render/src/plan/build.ts:55` `PlanInput.levelId` | L. Campo central da entrada. |
| `packages/render/src/plan/build.ts:77` `areaPlan?: AreaPlan` | pid (presença liga o perfil de área). |
| `packages/render/src/plan/build.ts:263-266` `buildPlanGeometry` (perfil `areaPlanProfile` ou `FLOOR_PLAN_PROFILE`) | pid (ou ausência). |
| `packages/render/src/plan/build.ts:276` `semAnotacoesOcultas(p, L, hidden)` | L. |
| `packages/render/src/plan/build.ts:162-172` `planGeometrySelection(p, L, selection, areaPlan)` | L + pid (ids das anotações). |
| `packages/render/src/plan/build.ts:370-390` (`if (!areaPlan)` para terreno, lote, ambientes) | Presença de pid. |
| `packages/render/src/plan/build.ts:302` (telhados acima só na planta de piso) | pid (`areaPlan ? []`). |
| `packages/render/src/plan/planContext.ts:16-24` `underlayIdOf`, `planBelowOf` | L + escolha de sob-pavimento. |
| `packages/render/src/plan/planContext.ts:41-45` `semAnotacoesOcultas(p, L, hidden)` | L. Remove anotações ocultas do nível. |
| `packages/render/src/plan/planContext.ts:164` `planStyleOf(p, L, zoom, areaPlan?.scale)` | L + escala da área. |
| `packages/render/src/plan/planContext.ts:173-184` | L. |
| `packages/render/src/plan/style.ts:82` `planStyleOf(p, levelId, zoom, scaleOverride)` | L (`levelGraphicsOf`). |
| `packages/render/src/plan/planFrame.ts:140` | L (`resolvido()`). |
| `packages/render/src/plan/areaPlan.ts:231`, `:272`, `:358` (ambientes, etiquetas, legenda da área) | `AreaPlan` (pid). |
| `apps/web/src/ui/ViewportCanvas.tsx:485` `projetoDoPainel(... {kind:'plan', levelId: st.levelId})` | L. |
| `apps/web/src/editor/paneStyle.ts:57`, `:89` | L (`levelGraphicsOf`). |

### 2h. Visibilidade, câmera e gráficos (apoio)

| Arquivo:linha | Depende de |
|---|---|
| `editor/viewVisibility.ts:19-25` `visibilityKeyOf(st)` | V, S, A, P, L. Chaves `plan:`, `roof:`, `area:`, `section:`, `3d`. |
| `editor/viewVisibility.ts:29-37` `viewHiddenTargetOf(st)` | Mesmos campos. Vira `ViewHiddenTarget` (`types.ts:1040-1046`: `plan`/`roof` com `levelId`, `area` com `planId`, `section` com `viewId`, `3d`). |
| `packages/model/src/types.ts:223-229` (`Level.graphics`, `hidden`, `roofHidden`, `dimensions`, `texts`, ...) | Ocultação, gráficos e anotações da planta de piso ficam no nível. |
| `packages/model/src/areaPlan.ts:126-133` (`AreaPlan.graphics`, `hidden`) | Gráficos e ocultação próprios da planta de área. |
| `editor/controller.ts:316-327` `viewScale(f)` | V, P, A (escala de área) ou L (escala do nível). |
| `editor/viewKey.ts:13-17` `viewKeyOf(f)` | Chave da câmera 2D: `sec:<S>`, `roof:<L>`, `area:<A ?? L>`, senão `<L>`. |
| `editor/controller.ts:159`, `:372-380`, `:413` | `viewports` (`Map`) indexado por `viewKeyOf`. |
| `editor/paneCamera2d.ts:23`, `usePaneCanvas.ts:88-91` | Mesma chave. |

## 3) Precedente: plantas de área como "segunda vista do mesmo nível"

### 3.1 Modelo

- `AreaPlan` (`packages/model/src/areaPlan.ts:119-135`): `id`, `name`, `levelId` (o nível dono), `schemeId?`, `scale`, `graphics` (`:126`), `tags: RoomTag[]`, `legend?`, `table?`, `annotations?: AreaPlanAnnotations` (`:131`), `hidden?`.
- `RoomTag` (`areaPlan.ts:28`): tem `planId` e `roomId`. É a etiqueta de ambiente que só existe na planta de área.
- `AreaPlanAnnotations` (`areaPlan.ts:7-17`): `dimensions`, `texts`, `detailLines`, `detailRegions`, `tags` e opcionais `spots`, `revisionClouds`, `symbols`.
- Dono e herança das anotações (`areaPlan.ts:186-190`):
  - `annotations === undefined` significa "herda do nível" em `planOwnsAnnotations` (`:190`).
  - `{}` ou conjunto com listas é "próprio". `planAnnotationsOf` (`:196`) normaliza para listas vazias.
- Os elementos (paredes, lajes, etc.) não pertencem à planta de área. Ela só muda o que é mostrado, o perfil e as anotações.

### 3.2 Gravação por vista (roteamento)

- `annotations.ts:9-17` `AnnotationView`: todo comando de anotação leva `levelId` e, opcionalmente, `planId` ou `sectionId`.
- `annotations.ts:198-201`: escopo escolhido em ordem: `sectionId` (`SectionView.annotations`), `planId` (`plan.annotations`), senão o nível (`Level.*`).
- `annotations.ts:160-165` `viewPlan`: exige que a planta exista e que `plan.levelId === levelId`. Erro em pt-BR caso contrário.
- `annotations.ts:131` `levelScope`, `:143` `planScope` (cada escrita reatribui `plan.annotations = {...}`), `:178` `sectionScope` (idem, com `cleanSectionAnnotations`). Três escopos com a mesma forma. Este é o padrão.
- `controller.ts:307-309` `areaPlanIdNow()` e `controller.ts:354-366` `exec1`: quando a vista é planta de área, o controlador injeta `planId` em todo comando de anotação que não o trouxe. Mesma coisa para `sectionId`. Rede de segurança.
- `tools/base.ts:169` `viewPlanId(env)` = `env.areaPlanId?.()`. As ferramentas passam `planId` explicitamente (`textTool.ts:71`, `tagTool.ts:71`, etc.).

### 3.3 Leitura por vista

- `packages/tools/src/annotationPick.ts:119-146` `viewAnnotationsOf(p, L, pid)`: com `pid`, lê `plan.annotations` (com perfil de camadas, `resolveViewProfile`). Sem `pid`, lê o nível.
- `apps/web/src/editor/viewAnnotations.ts:19-50` `annotationsOfActiveView`: com corte, lê `SectionView.annotations`; com planta de área, lê `plan.annotations` (ou o nível, se não for dono); caso contrário, o nível.
- Inconsistência leve: `viewAnnotationsOf` (ferramentas) usa `planAnnotationsOf`, que devolve vazio quando não há conjunto próprio. `annotationsOfActiveView` (visibilidade, ids) cai no nível. Para plantas abertas pela UI isso não aparece, porque `openAreaPlan` semeia (ver 3.4). Só afeta plantas sem `annotations` abertas por outro caminho.

### 3.4 Criação, semeadura e abertura

- `areaPlanActions.ts:33-55` `annotationsFromLevel(p, L)`: copia cotas, textos, detalhes e etiquetas do nível com ids novos. Não compartilha objetos.
- `areaPlanActions.ts:174-197` `createAreaPlanAction`: a planta nasce com a cópia do nível e com `graphics` próprio.
- `areaPlanActions.ts:64` `seedPlanAnnotationsAction`: semeia planta antiga sem `annotations`.
- `areaPlanActions.ts:216-222` `openAreaPlan(store, planId)`: chama `editor.selectLevel(plan.levelId, 'area', plan.id)` e semeia se `annotations === undefined`.
- `viewTabActions.ts:53-58` (`navega`) chama `openAreaPlan` antes de `selectLevel` para toda aba de área.

### 3.5 Estado, abas, navegador, câmera, visibilidade, escala

- Estado: `planKind:'area'` + `areaPlanId` (`state.ts:65-67`). Aba: `OpenView` `{kind:'plan', levelId, planKind:'area', areaPlanId}` (`openViews.ts:13-19`), chave `area:<id>` (`openViews.ts:48`), rótulo com `ap.name` (`viewTabActions.ts:9-20`).
- Navegador: `Views.tsx:221-232`.
- Câmera 2D: `viewKey.ts:14` `area:<areaPlanId ?? levelId>`.
- Visibilidade: `viewVisibility.ts:23` `area:<planId>`; `ViewHiddenTarget` `{kind:'area', planId}` (`types.ts:1043`); `AreaPlan.hidden` (`areaPlan.ts:133`).
- Escala: `controller.ts:322-324` usa `plan.scale`; a planta de piso usa `levelGraphicsOf(...).scale` (`:326`).
- Prancha: `SheetViewSource` `{kind:'areaPlan', planId}` (`sheet.ts:59`), render em `render/sheet/viewports.ts:66`.
- DXF: alvo `area:<planId>` (`dxfBatch.ts:31`), `areaPlanDxf(planId)` (`dxfAreaPlan.ts:109`), com perfil e anotações próprias.
- Seções já seguem o mesmo padrão: `SectionView.annotations` (`types.ts:1031`) com `sectionScope` (`annotations.ts:157-170`).

### 3.6 Resumo do padrão

Uma vista é a tripla `(levelId, tipo, id?)`. Para cada consumidor (anotações, ocultação, gráficos, escala, câmera, aba, navegador, DXF, prancha), o id da vista tem prioridade e o nível é o fallback. As anotações têm dono explícito, com herança por `undefined` vs definido, semeadura por cópia e roteamento automático pelo controlador. Plantas de área já cumprem isso; corte também. Plantas de piso e de cobertura ainda usam o nível diretamente.

## 4) Onde um `planId` novo precisa ser propagado

### 4a. Anotações que já são por vista (carregam `planId`/`sectionId`, guardadas no dono)

- Planta de área: cotas, textos, linhas e regiões de detalhe, etiquetas de elemento, pontos de cota (spots), nuvens de revisão, símbolos (`AreaPlanAnnotations`, `areaPlan.ts:7-17`), e etiquetas de ambiente `RoomTag` (`areaPlan.ts`, com `planId`).
- Corte/elevação: as mesmas listas em `SectionView.annotations` (`types.ts:1031`).
- Ferramentas, seleção e edição passam `planId` (`selectTool.ts:693-740`, `annotationPick.ts`).

Para um planta de disciplina, este grupo é o modelo a copiar: um campo `annotations` no dono, `planOwnsAnnotations`, um escopo `planScope` e um `planId` no `AnnotationView`.

### 4b. Anotações que são por nível (sem `planId`; guardadas em `Level`)

- Planta de piso: `Level.dimensions`, `texts`, `detailLines`, `detailRegions`, `tags`, `spots`, `revisionClouds`, `symbols` (`types.ts:229-245`), via `levelScope` (`annotations.ts:128-138`).
- Separadores de ambiente: `Level.roomSeparators` (`types.ts:245`). Comandos `addRoomSeparator` e `removeRoomSeparator` recebem só `levelId` (`annotations.ts:33-34`, `roomSeparatorTool.ts:68`).
- Posição do rótulo do ambiente: `setRoomLabel` (`commands.ts:308`, `controller.ts:725`). O `Room` (`types.ts:772-775`) tem `levelId`. É uma posição do modelo, compartilhada por todas as plantas do nível. A planta de área tem `RoomTag` separado para isso.
- Gráficos e ocultação da planta de piso: `Level.graphics` (`types.ts:223`), `Level.hidden` (`types.ts:225`) e `Level.roofHidden` (`types.ts:227`).
- Snap e pick de elementos: todos por `levelId` (`pick.ts`, `infer.ts`).

### 4c. Lista de propagação (onde um `planId` novo entra)

Modelo e persistência:
- `packages/model/src/types.ts` (`Project`, nova coleção ou campo de discriminação) e `types.ts:1040-1046` (`ViewHiddenTarget`).
- `packages/model/src/annotations.ts:6-16` (`AnnotationView`) e `:198-201` (escolha de escopo).
- `packages/model/src/annotations.ts:421` (`annotationMoveCommands`) e `:391`, `:409`.
- `packages/model/src/sheet.ts:57-63` (`SheetViewSource`).
- `packages/model/src/areaPlan.ts:119-135` (`AreaPlan`), se a disciplina for uma propriedade da planta.

Estado da interface:
- `editor/openViews.ts:7` (`PlanKind`), `:13-19` (`OpenView`), `:35` (`planKindOf`), `:45-58` (`viewKey`), `:117` (`levelToRelease`), `:129-142` (`activeViewOf`).
- `editor/state.ts:65-67` (novos campos em `UiState`), `:398-457` (defaults), `:489-500` (subscriber que abre a aba).
- `editor/paneView.ts:10-18`, `:31-44`, `:47-49`, `:60-66`.
- `editor/viewKey.ts:4-17`.
- `editor/viewVisibility.ts:19-37` (chaves de visibilidade e alvo).
- `editor/sessao.ts:19-37`, `:57-61`, `:85-101` (persistência da sessão).
- `editor/layoutTree.ts:301-304` (persistência dos painéis).
- `editor/paneStore.ts:39-45` (`viewOfFields`, `initialLayout`).
- `editor/paneViews.ts:47` (`viewsForPreset`) e `ui/ViewTabs.tsx:31`, `ui/PaneGrid.tsx:134-156`.

Controlador e ações:
- `editor/controller.ts:45-55` (`activeViewTagContext`), `:90-101` (`PLAN_ANNOTATION_TYPES`), `:307-309` (`areaPlanIdNow`), `:316-327` (`viewScale`), `:354-366` (`exec1`), `:372-380` (`viewKey`), `:698-740` (arraste de rótulo), `:964-966` (apagar), `:1067`, `:1091-1093`, `:1130-1136` (colar), `:1300-1304` (`selectLevel`), `:1306` (`setView`), `:1347` (`load`).
- `editor/viewTabActions.ts:9-20` (`tabOf`), `:53-90` (`navega`), `:92` (`activateView`), `:104` (`closeTab`).
- `editor/areaPlanActions.ts:216-222` (`openAreaPlan`), e a criação de planta análoga.
- `editor/tagActions.ts:45-90`.

Ferramentas:
- `packages/tools/src/types.ts:63` (`ToolEnv`): hoje só `areaPlanId?()`. Um `planId` de disciplina pode seguir o mesmo caminho ou virar uma função nova.
- `packages/tools/src/base.ts:169` (`viewPlanId`) e as chamadas em `textTool.ts:71`, `tagTool.ts:71`, `openingTool.ts:326`, `angularDimensionTool.ts:100,320`, `annotationExtraTools.ts:120,189,257,353`.
- `packages/tools/src/annotationPick.ts:119-146` (`viewAnnotationsOf`).
- `packages/tools/src/selectTool.ts:141-191`.
- `packages/tools/src/transformTools.ts:41`, `:277` (ver surpresa 2).

Leitura, visão e tela:
- `apps/web/src/editor/viewAnnotations.ts:19-50` e `ViewState` em `:13`.
- `apps/web/src/ui/browser/Views.tsx:151-232` (nova seção no navegador).
- `packages/render/src/plan/build.ts:55-82` (`PlanInput`), `:162-172`, `:263-276`.
- `packages/render/src/plan/planContext.ts:41-45`, `:164`.
- `packages/render/src/sheet/build.ts:12-20` e `sheet/viewports.ts:35-80`.

Saída:
- `apps/web/src/editor/dxfBatch.ts:30-33`, `dxfBatch.types.ts:15-18`, `dxfBatchRenderers.ts:11-13`, `dxfExport.ts:256`, `:275-277`, `:404-413`, `dxfExportDialogModel.ts:56-71`.
- `apps/web/src/editor/sheetInsertSources.ts:31`, `sheetInsert.ts:181`, `ui/sheet/useSheetPrefetch.ts:15`, `sheetActions.ts:346-351`.

## 5) Surpresas (resumo)

1. A vista ativa é um conjunto de campos soltos em `useUi` (`view`, `levelId`, `planKind`, `areaPlanId`, `sectionId`, `sheetId`, `faceView`) que se traduzem para `OpenView` por `activeViewOf` (`openViews.ts:129`). Não existe um identificador único de vista no estado. A chave de vista é uma string recalculada em pelo menos quatro lugares com formatos diferentes: `viewKey` (`openViews.ts:45`), `viewKeyOf` (`viewKey.ts:13`), `visibilityKeyOf` (`viewVisibility.ts:19`) e `dxfExportDialogModel.ts:68`. Uma planta de disciplina precisaria entrar em todas elas. Hoje a planta de piso usa `plan:<levelId>` na câmera e na visibilidade, então duas plantas do mesmo nível colidiriam sem mudança de chave.
2. Mover e Copiar anotações não passam `planId`. `transformTools.ts:41` e `:277` chamam `annotationIdsIn` e `annotationMoveCommands` só com `levelId`, e `annotations.ts:421` lê `levelDimensions`/`levelTexts`. Anotações da planta de área, portanto, não entram no conjunto movível por Mover ou Copiar. Apagar (`controller.ts:964-966`) e as alças (`selectTool.ts:693-740`) já tratam o caso. Isto precisa ser verificado com teste antes de depender do comportamento atual.
3. A prancha não sabe representar planta de cobertura nem de área ao mesmo tempo que nível: `SheetViewSource` `{kind:'plan', levelId}` (`sheet.ts:58`) não tem `planKind`. Uma planta de disciplina exigiria um novo `kind` ou um campo novo, com render próprio (`render/sheet/viewports.ts:35`). Além disso, a escala de planta na prancha é gravada como escala do nível em cópia do projeto (`viewports.ts:18-19`), o que faz a escala da prancha depender da escala de `Level.graphics`.

Outras observações: o DXF lote não lista a planta de cobertura (`dxfBatch.ts:30-33`); a exportação de planta de piso inteira depende de `levelId` (`dxfExport.ts:138`); e o painel (`panes.ts:47-49`, `followLevel`) só acompanha o nível, não a planta de disciplina.
