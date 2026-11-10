# Insumos da Fase 1 para as Fases 2b e 3

Pontos que ainda decidem por tipo de planta ou ficaram na forma antiga, levantados pelas raias D (editor) e E
(interface). As linhas são as do fim da Fase 1 e podem ter se deslocado: procure pelo símbolo.

## Editor (`apps/web/src/editor`)
1. `controller.ts` `setTool`: restrição de ferramenta vale fora do 3D (também em corte e prancha) usando a planta de
   fundo (`tipoDeVistaDeFundo`); mensagem `eds_msg_area_tools_only`.
2. `controller.ts` `pointer`/`labelHit`: rótulo de ambiente arrastável só com Selecionar, em piso e área; no piso a
   "planta padrão" é a primeira área do nível (`primeiraVistaDeAreaDoNivel`); `roomTagAt` só existe na área.
3. `controller.ts` `exec1`: injeta `viewId` no comando de anotação só na área.
4. `controller.ts` `avisandoOculto`/`areaPlanIdNow`: aviso de criação oculta pelo perfil só na área
   (`hiddenCreationWarning`).
5. `controller.ts` `cotasAutomaticasDaPlanta`: mensagem `..._area_*` na área.
6. `controller.ts` `viewScale`: escala da área vem de `area.scale`; piso e cobertura usam a do nível.
7. `controller.ts` `viewKey` (`chaveDeViewportDePlanta`): viewport guardado por nível, `roof:<nível>` ou `area:<planta>`.
8. `viewVisibility.ts` `visibilityKeyOf`/`viewHiddenTargetOf`: chaves e alvos por tipo; fallback sem projeto decide por tipo.
9. `viewAnnotations.ts`: separadores de ambiente só entram fora da planta de área.
10. `deleteIds.ts`: exclusão na área por caminho próprio (`updateAreaPlan{annotations}`, `removeRoomTag`, ...).
11. `dxfExportDialogModel.ts` `activeDxfTargetKey`: cobertura sem DXF; piso `plan:<nível>`; área `area:<planta>`.
12. `dxfBatch.ts`, `dxfExport.ts` (`viewDxf`, `PlanViewRef` local), `dxfBatch.types.ts`: alvos `plan` e `area` separados.
13. `dxfAreaPlan.ts`: pipeline próprio com `AreaPlan` e `drawnAnnotations(p, levelId, plan)`.
14. `openViews.ts`: `levelToRelease` só libera piso; `viewKey` por tipo; `viewTabActions.ts`: rótulo de cobertura.
15. `areaPlanActions.ts`: `openAreaPlan` semeia anotações quando `annotations === undefined`; operações da entidade.
16. `sheetActions.ts`, `sheetInsert.ts`: `SheetViewSource` `plan` × `areaPlan`; escala natural por tipo.
17. Forma antiga do estado, marcada `// forma antiga (Fase 2)`: `state.ts`, `openViews.ts`, `sessao.ts`,
    `controller.ts`, `pastePreview.ts`, `dxfExportDialogModel.ts`, `dxfExport.ts`; tipo `ViewState` em
    `viewVisibility.ts` e `viewAnnotations.ts`.
18. `controller.ts` `hiddenInView` usa o `planViewOf` do render com `levelId` solto; `dimDoubleClick.ts` usa o
    `viewAnnotationsOf` de `packages/tools` com `(p, levelId, planId)`.

## Interface (`apps/web/src/ui`)
- `TitleBar.tsx`: título por `planKind`.
- `Properties.tsx`: painel de cobertura e de planta de área por `planKind`; `planId` só para área.
- `OptionsBar.tsx`: barra de opções de planta de área.
- `RoomProperties.tsx`: etiqueta da vista só na planta de área.
- `ViewportCanvas.tsx`: `roofPlanMode` por `planKind === 'roof'`; `areaPlan` (objeto inteiro) passado ao render e
  serializado na chave de contexto; `planId` do DXF/viewport por `planKind === 'area'`.
- `ribbon/actions.ts`: ação só na planta de área.
- `browser/Views.tsx`: destaque da vista ativa por `planKind`.
- `dialogs/TextDialog.tsx`, `dims/TempDimsOverlay.tsx`, `dims/DimValueEditor.tsx`: `planId` por `planKind`.
- `dims/dimEditModel.ts`: usa o `viewAnnotationsOf` de `packages/tools`.

## Ferramentas (`packages/tools`)
- `ToolEnv` não sabe que a vista é cobertura: `viewIdOfEnv` devolve piso. A função local `viewAnnotationsOf`
  de `annotationPick.ts` recebe `(p, levelId, areaPlanId)`.

## Desenho (`packages/render`)
- `PlanInput` recebe `levelId` + `areaPlan` (objeto) + `roofPlanMode`; `planViewOf`/`PlanView` do render colidem em
  nome com os do modelo; `sheet/viewports.ts` monta um `AreaPlan` com escala própria para a prancha.
