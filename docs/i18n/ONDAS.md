# Ondas de execução — ownership

Cada agente é dono de **um shard de dicionário** e de **um conjunto fixo de arquivos**. Nenhum arquivo aparece em dois agentes.
Nenhum agente faz commit; o orquestrador commita por onda.

Formato: `agente` → shard (`prefixo`) → arquivos.

## Onda 1 — núcleo visível + pacotes (13 agentes)

### 1. pr-core → `areas/props-core.ts` (`prc_`)
- apps/web/src/ui/Properties.tsx
- apps/web/src/ui/TypeRow.tsx, TypeSelector.tsx, TypePreview.tsx, typeFamilies.ts, typeOptions.ts
- apps/web/src/ui/fields.tsx, GenericProps.tsx, ProfileRow.tsx, LevelField.tsx, NivelCotaEditor.tsx

### 2. pr-elements-a → `areas/props-elements-a.ts` (`pra_`)
- apps/web/src/ui/AnnotationProps.tsx
- apps/web/src/ui/PlacementProperties.tsx
- apps/web/src/ui/RoomProperties.tsx

### 3. pr-elements-b → `areas/props-elements-b.ts` (`prb_`)
- apps/web/src/ui/StairProperties.tsx, RampProperties.tsx
- apps/web/src/ui/AreaPlanProperties.tsx, SectionViewProps.tsx, ToolTypeProps.tsx

### 4. pr-elements-c → `areas/props-elements-c.ts` (`prc2_`)
- apps/web/src/ui/RoofProperties.tsx, SlabProperties.tsx, CeilingProperties.tsx, FloorProperties.tsx
- apps/web/src/ui/GridProperties.tsx, LevelProps.tsx, CadProps.tsx, GraphicsProps.tsx

### 5. pr-options → `areas/props-options.ts` (`pro_`)
- apps/web/src/ui/OptionsBar.tsx e *OptionsBar.tsx (Slab, Ceiling, Roof, RoofArrow, Stair, StairRun, Ramp, Array, Grid)
- apps/web/src/ui/perimeter/** (Status, RibbonPanels, Props, OptionsBar, texts)
- apps/web/src/ui/sheet/SheetControlBar.tsx

### 6. sh-ribbon → `areas/shell-ribbon.ts` (`shr_`)
- apps/web/src/ui/ribbon/** (todos)
- apps/web/src/ui/Ribbon.tsx, Icon.tsx

### 7. sh-chrome → `areas/shell-chrome.ts` (`shc_`)
- apps/web/src/ui/TitleBar.tsx, StatusBar.tsx, NavBar.tsx, InfoCenter.tsx, ViewTabs.tsx, ViewControlBar.tsx
- apps/web/src/ui/Tutorial.tsx, SnapButton.tsx, OrthoButton.tsx, DisjoinCheck.tsx, IssuesButton.tsx
- apps/web/src/ui/Dock.tsx, PanelHead.tsx, LabelScroll.tsx, EmptyViews.tsx, Browser.tsx, IfcImportOverlay.tsx, FileMenu.tsx

### 8. dl-cad → `areas/dialogs-cad.ts` (`dlc_`)
- apps/web/src/ui/dialogs/DxfExportDialog.tsx, DxfLayerTable.tsx, ImportCadDialog.tsx, ManageCadDialog.tsx, LayerAdvanced.tsx, LayerTermino.tsx, terminoForm.ts
- apps/web/src/ui/dialogs/UnitsDialog.tsx, unitsDialogModel.ts
- apps/web/src/ui/dialogs/SelectLevelsDialog.tsx, AddViewDialog.tsx
- apps/web/src/ui/dialogs/SheetDialog.tsx, RenumberSheetsDialog.tsx, RevisionDialog.tsx, PublishDialog.tsx

### 9. dl-misc → `areas/dialogs-misc.ts` (`dlm_`)
- apps/web/src/ui/dialogs/OtherDialogs.tsx, ShortcutsConfigDialog.tsx, ExperimentosDialog.tsx, TextDialog.tsx, AutoCotaDialog.tsx, pasteLevelsModel.ts, coreHint.ts
- apps/web/src/ui/dialogs/AlertaDialog.tsx, AreaMergeDialog.tsx, HostedLossDialog.tsx, Dialog.tsx
- apps/web/src/ui/LevelMoveConflictDialog.tsx, MoveLevel.tsx, Capture/Empty restantes que não estão em outro agente

### 10. dl-types → `areas/dialogs-types.ts` (`dlt_`)
- apps/web/src/ui/dialogs/*TypeDialog.tsx (Wall, Floor, Slab, Ceiling, Roof, Grid, Stair, Ramp)
- apps/web/src/ui/dialogs/TypeDialogHeader.tsx, TypeParams.tsx, StairTypeSections.tsx, StripsTab.tsx
- apps/web/src/ui/dialogs/MaterialsDialog.tsx, ProfileDialog.tsx, ProfilePreview.tsx, RoofProfileDialog.tsx, RoomCategoriesDialog.tsx, GraphicsVisibilityDialog.tsx, LineWeightsDialog.tsx
- apps/web/src/ui/dialogs/DimensionFamiliesDialog.tsx, DimensionSettingsDialog.tsx, dimensionStyleModel.ts, dimensionStylePreview.tsx, dimensionSettingsModel.ts
- apps/web/src/ui/dialogs/stairBlondel.ts, stairTypeCalc.ts, stairTypeForm.ts, profilePresets.ts

### 11. dl-stairs → `areas/dialogs-stairs.ts` (`dls_`)
- apps/web/src/ui/dialogs/StairBlondelCard.tsx, StairCalculatorPanel.tsx, StairSectionPreview.tsx, RampSectionPreview.tsx, SectionPreview.tsx, FloorSectionPreview.tsx, SlabSectionPreview.tsx, RoofSectionPreview.tsx
- apps/web/src/ui/dialogs/stairSectionDrawing.ts, rampSectionDrawing.ts, stairSectionProfile.ts, staircase drawing helpers

### 12. dl-opening → `areas/dialogs-opening.ts` (`dlo_`)
- apps/web/src/ui/dialogs/openingType/** (todos)
- apps/web/src/ui/dialogs/openingTypeForm.ts
- apps/web/src/ui/edicaoDeEsquadrias.ts

### 13. pkg-tools → `areas/packages-tools.ts` (`tl_`) + `packages/tools/src/i18n.ts`
- packages/tools/src/** (hints, prompts, status, TOOL_GROUPS, PERFIL_NOMES, nomeComando, mensagens)
- NÃO alterar assinaturas públicas de forma incompatível: `lang` opcional com default `'pt'`.

## Onda 1b — pacotes (4 agentes, em paralelo com a Onda 1)

### 14. pkg-model → `areas/packages-model.ts` (`md_`) + `packages/model/src/i18n.ts`
- packages/model/src/** (defaults, catálogos, enums, validações, formatação)
- `lang` opcional no fim das funções.

### 15. pkg-render → `areas/packages-render.ts` (`rn_`) + `packages/render/src/i18n.ts`
- packages/render/src/** (carimbo, overlay, stairs, viewports)
- `lang` opcional propagado a partir das entradas públicas.

### 16. pkg-io → `areas/packages-io.ts` (`io_`) + `packages/io/src/i18n.ts`
- packages/io/src/** (dxf, ifc, pdf, csv) + apps/web/src/editor/dxfExport.ts, dxfBatch.ts, dxfSheet.ts (wiring)

### 17. pkg-engine → `areas/packages-engine.ts` (`eg_`) + `packages/engine/src/i18n.ts`
- packages/engine/src/** (9 schedules/CSV, mensagens, validação)
- `lang` opcional nas funções de schedule/CSV.

## Onda 2 — restante da UI (7 agentes)

### 18. cv-viewport → `areas/canvas-viewport.ts` (`cvv_`)
- apps/web/src/ui/ViewportCanvas.tsx, ViewportOverlays.tsx, SectionCanvas.tsx, PlanLabels.tsx
- apps/web/src/ui/dims/**, progresso3d.ts, Progresso3D.tsx, progressoAbertura.ts, ProgressoAbertura.tsx, plantaProvisoria.ts, quadroPlanta.ts, montagem3dProgressiva.ts

### 19. cv-sheet → `areas/canvas-sheet.ts` (`cvs_`)
- apps/web/src/ui/sheet/** (exceto SheetControlBar, que é do pr-options)
- apps/web/src/ui/schematic/**
- apps/web/src/editor/sheetActions.ts, sheetInsert.ts

### 20. cv-nav → `areas/canvas-nav.ts` (`cvn_`)
- apps/web/src/ui/browser/** (exceto Views.tsx? inclui Views.tsx)
- apps/web/src/ui/ViewCube.tsx, ViewCubeRing.tsx, viewcube.ts, viewcube-ring.ts
- apps/web/src/ui/graphicsLabels.ts

### 21. ed-status → `areas/editor-status.ts` (`eds_`)
- apps/web/src/editor/controller.ts, state.ts, historyStatus.ts
- apps/web/src/editor/levelActions.ts, areaPlanActions.ts, viewTabActions.ts, viewVisibility.ts, deleteIds.ts, graphicsActions.ts, typeActions.ts

### 22. ed-context → `areas/editor-context.ts` (`edc_`)
- apps/web/src/editor/contextMenu.ts, shortcutConfig.ts, commands.ts, recentCommands.ts
- apps/web/src/editor/elevations.ts, view3dPointActions.ts

### 23. sc-schedules → `areas/schedules.ts` (`sc_`)
- apps/web/src/ui/dialogs/*ScheduleDialog.tsx
- apps/web/src/ui/dialogs/scheduleUnits.ts

### 24. misc-ui → `areas/misc-ui.ts` (`msc_`)
- Qualquer arquivo de `apps/web/src/**` com ocorrências que não pertença a outro agente (ver `TODAS-OCORRENCIAS.csv`).

## Onda 3 — verificação e fechamento (3 agentes)

- **V1**: `npm run typecheck`, `npm run lint`, `npm run test:rapido`; corrige regressões.
- **V2**: e2e EN (Playwright), 12 telas, screenshots, `<html lang>`/`title`.
- **V3**: exportações EN (DXF/IFC/CSV/PDF), `check-i18n.mjs --strict`, relatório final.

## Regras
- Só edite os arquivos do seu bloco + seu shard.
- Se precisar de uma chave existente, use-a; se criar, use o prefixo do seu shard.
- `npm run typecheck` no fim; reporte falhas que não são suas.
- Não faça commit.
- Não rode `npm install`, não altere `package.json`.
