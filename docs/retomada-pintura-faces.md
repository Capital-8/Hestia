# Retomada — Pintura de Faces, Estúdio da Face 2D, Extrusões e Ripados

Documento de passagem de contexto para retomar o desenvolvimento no outro computador exatamente de onde parou, antes da **Fase 3 (`@hestia/web`)**.

---

## 1. O que já foi implementado (Fases 1, 2 e Kernel Rust)

### 1.1. Kernel Rust / WASM (`crates/geom-wasm` + `@hestia/geom`)
- [pintura_face.rs](file:///d:/Programas/Hestia/crates/geom-wasm/src/pintura_face.rs):
  - `EspecificacaoRipas`, `gerar_ripas(regiao, spec)` (lote em uma passada quando `fresta > DIM_MINIMA`, ou por tira quando `fresta <= DIM_MINIMA`), `fresta_minima_concava(raio, largura_ripa, profundidade)`, `recortar_camadas_prioridade(base, regioes)` e testes unitários em `#[cfg(test)] mod testes`.
- [lib.rs](file:///d:/Programas/Hestia/crates/geom-wasm/src/lib.rs):
  - Registra `pub mod pintura_face;` e exporta `#[no_mangle] pub extern "C" fn executar_ripas(largura: f64, fresta: f64, angulo_graus: f64) -> u32`.
- Ponte JS↔WASM em `@hestia/geom`:
  - [contrato.ts](file:///d:/Programas/Hestia/packages/geom/src/kernel/contrato.ts): método opcional `ripas?` em `ImplKernel`.
  - [abis.ts](file:///d:/Programas/Hestia/packages/geom/src/kernel/abis.ts): assinatura opcional `executar_ripas?` em `ExportsKernel`.
  - [implementacaoRust.ts](file:///d:/Programas/Hestia/packages/geom/src/kernel/implementacaoRust.ts): implementação de `impl.ripas` usando a arena compartilhada + `lerSaida`.
  - [glue.test.ts](file:///d:/Programas/Hestia/packages/geom/src/kernel/glue.test.ts): teste de integração `implWasm.ripas` + `generateSlatStrips`.

> **IMPORTANTE sobre o `.wasm` neste commit:**
> As fontes Rust mudaram, mas `packages/geom/assets/geom_wasm.wasm` **ainda não foi recompilado** nesta máquina porque `cargo build --release --target wasm32-unknown-unknown` falhou no build script da crate `libm` por falta do linker MSVC (`link.exe` / Visual C++ Build Tools).
> **Primeira ação no outro PC (com MSVC Build Tools ou Linux/macOS):**
> ```bash
> npm run build:wasm
> npm run wasm:check
> ```

---

### 1.2. Wave 1 — Geometria 2D e Modelo (`@hestia/geom` + `@hestia/model`)
- [faceArt.ts](file:///d:/Programas/Hestia/packages/geom/src/faceArt.ts) (exportado em [index.ts](file:///d:/Programas/Hestia/packages/geom/src/index.ts)):
  - Tipos `FaceShape2D` (`rect`, `circle`, `ellipse`, `lineBand`, `arcBand`, `arch`, `poly`), `SlatsSpec`, `FaceArtItemInput`, `CoplanarFacePiece`, `ExtrudedFacePiece`, `PartitionFaceResult`.
  - `shapeToMultiPolygon`, `generateSlatStrips` (usa `implKernel()?.ripas` em Rust quando ativo, com fallback TS via `operacoesKernel.ts`), `partitionFacePaint` (recorte coplanar por prioridade + extrusões com `cutMode: 'clipBelow' | 'overlay'`), `concaveSlatMinGap`, `transformDxfPaths`.
- [faceArt.test.ts](file:///d:/Programas/Hestia/packages/geom/src/faceArt.test.ts): 13 testes cobrindo formas 2D, arco/dome, `lineBand`/`arcBand`, ripados em ângulo, empilhamento/recorte (`clipBelow` e `overlay`), `concaveSlatMinGap` e `transformDxfPaths`.
- [facePaint.ts](file:///d:/Programas/Hestia/packages/model/src/facePaint.ts) (exportado em [index.ts](file:///d:/Programas/Hestia/packages/model/src/index.ts)):
  - Tipos `WallFaceSlot` (`sideExt`, `sideInt`, `endA`, `endB`, `top`, `bottom`, `opening:${string}:sill|head|jambLeft|jambRight`), `PlanarFaceSlot` (`top`, `bottom`, `edge:${number}:${number}`), `FaceSlot`, `FaceLayerTarget` (`number | 'all'`), `FaceKey`, `FaceRegion`, `FaceDxfOverlay`, `FacePaintEntry`, `FacePaintCommand`.
  - Helpers `faceKeyOf`, `parseFaceKey`, `findFacePaint`, `findExactFacePaint`, `effectiveFaceMaterial`, `availableFacesForElement`, `isFacePaintableElement`, `applyFacePaintCommand`.
- Integração em `@hestia/model`:
  - [types.ts](file:///d:/Programas/Hestia/packages/model/src/types.ts): `facePaints?: FacePaintEntry[]` em `Wall`, `Floor` e `Slab`.
  - [commands.ts](file:///d:/Programas/Hestia/packages/model/src/commands.ts) e [history.ts](file:///d:/Programas/Hestia/packages/model/src/history.ts): `FacePaintCommand` (`setFacePaint`, `removeFacePaint`) integrado em `applyCommand` e `commandLabel`.
- [facePaint.test.ts](file:///d:/Programas/Hestia/packages/model/src/facePaint.test.ts): 4 testes de comando, desfazer/refazer e precedência por camada.

---

### 1.3. Wave 2 — Motor de Planificação, Quantitativos e 3D (`@hestia/engine` + `@hestia/render`)
- `@hestia/engine` (exportado em [index.ts](file:///d:/Programas/Hestia/packages/engine/src/index.ts)):
  - [faceUnwrap.ts](file:///d:/Programas/Hestia/packages/engine/src/faceUnwrap.ts):
    - `UnwrappedOpening`, `UnwrappedLayerDivider`, `UnwrappedCrossWall`, `UnwrappedFace`.
    - `unwrapElementFace(p, elementId, face, layer)` — planifica paredes retas e curvas (desenvolvimento cilíndrico em comprimento real de arco na face externa/interna, expondo `isCurved`, `curveRadius`, `concave`, aberturas reais em `(u, v)`, divisórias de camadas e paredes transversais) além de topos/fundos/bordas de `Floor` e `Slab`.
    - `faceEntryToArtItems(entry, defaultMatId)` — converte regiões e `dxfOverlays` em `FaceArtItemInput[]`.
  - [facePaintQuantities.ts](file:///d:/Programas/Hestia/packages/engine/src/facePaintQuantities.ts):
    - `FacePaintQuantities`, `quantifyFacePaints(p, levelId)`, `applyFacePaintAdjustments(...)` — contabiliza área pintada por material (`faceAreaByMaterial`), desconto do material base substituído, volume de extrusões (`volumeByMaterial`) e metros lineares de ripado (`linearMetersByMaterial`).
    - Integrado em [quantities.ts](file:///d:/Programas/Hestia/packages/engine/src/quantities.ts), [floorQuantities.ts](file:///d:/Programas/Hestia/packages/engine/src/floorQuantities.ts) e [slabQuantities.ts](file:///d:/Programas/Hestia/packages/engine/src/slabQuantities.ts).
  - [faceUnwrap.test.ts](file:///d:/Programas/Hestia/packages/engine/src/faceUnwrap.test.ts): 5 testes (vitest passou antes dos últimos ajustes no Rust).
- `@hestia/render` (exportado em [index.ts](file:///d:/Programas/Hestia/packages/render/src/index.ts)):
  - [facePaintSolids.ts](file:///d:/Programas/Hestia/packages/render/src/model3d/facePaintSolids.ts): gera lotes 3D por material para paredes com `facePaints` (`sideExt`, `sideInt`, `endA`, `endB`, `top`, `bottom`, ombreiras/peitoris/vergas de aberturas), mantendo junções T/L via `wallLayerBandsAfterJunction`.
  - [facePaintPlanar.ts](file:///d:/Programas/Hestia/packages/render/src/model3d/facePaintPlanar.ts): gera lotes 3D pintados para `Floor` e `Slab` (topo, fundo com suporte a caimento `slabSlope`, e bordas `edge:ring:idx`).
  - [facePaintExtrusions.ts](file:///d:/Programas/Hestia/packages/render/src/model3d/facePaintExtrusions.ts): gera geometria 3D para extrusões e ripados (`baseOffset`, `thickness`, inclinação em lajes e projeção radial cilíndrica ao longo de arcos em paredes curvas côncavas/convexas sem colisão de facetas).
  - [facePick3d.ts](file:///d:/Programas/Hestia/packages/render/src/model3d/facePick3d.ts) e [faceHighlight.ts](file:///d:/Programas/Hestia/packages/render/src/model3d/faceHighlight.ts): `FaceHit`, `pickFace(...)` via raycast/BVH com classificação exata de face, camada e UV `(u, v)`, e `faceHighlightMesh(...)` para pré-visualização semitransparente no 3D.
  - Integração em [solids.ts](file:///d:/Programas/Hestia/packages/render/src/model3d/solids.ts), [paredesInstanciadas3d.ts](file:///d:/Programas/Hestia/packages/render/src/model3d/paredesInstanciadas3d.ts) (exclui paredes pintadas do caminho instanciado para renderizar lotes pintados) e [scene3d.ts](file:///d:/Programas/Hestia/packages/render/src/model3d/scene3d.ts).
  - [facePaintSolids.test.ts](file:///d:/Programas/Hestia/packages/render/src/model3d/facePaintSolids.test.ts): 4 testes.

> **Observação sobre ambiente no outro PC:**
> Neste ambiente havia cópias antigas em `node_modules/@hestia/*` em vez de links simbólicos para `packages/*/src`. No outro PC, garanta `npm ci` / workspaces vinculados corretamente para o Vitest e o TypeScript resolverem direto de `packages/*/src/index.ts`.

---

## 2. O que falta implementar (Fase 3 / Wave 3 — `@hestia/web`)

### 2.1. Nova Aba de Vista `OpenView` (`kind: 'face'`) e Estado UI
1. [openViews.ts](file:///d:/Programas/Hestia/apps/web/src/editor/openViews.ts):
   - Estender `OpenView` com `{ kind: 'face'; elementId: Id; face: FaceSlot; layer: FaceLayerTarget }`.
   - Estender `ActiveViewFields` com `faceView: { elementId: Id; face: FaceSlot; layer: FaceLayerTarget } | null` e atualizar `view: 'plan' | '3d' | 'section' | 'sheet' | 'face'`.
   - Atualizar `viewKey` (`face:${v.elementId}:${v.face}:${v.layer}`) e `activeViewOf`.
2. [sessao.ts](file:///d:/Programas/Hestia/apps/web/src/editor/sessao.ts):
   - Incluir `'face'` em `VistaDaSessao` e `{ kind: 'face'; ... }` em `abaValida`.
   - Adicionar `faceView?: { elementId: Id; face: FaceSlot; layer: FaceLayerTarget } | null` em `Sessao`, serializando **apenas quando não for null/undefined** para manter compatibilidade total com os testes existentes de [sessao.test.ts](file:///d:/Programas/Hestia/apps/web/src/editor/sessao.test.ts).
3. [state.ts](file:///d:/Programas/Hestia/apps/web/src/editor/state.ts):
   - Adicionar `'face'` em `ViewKind`.
   - Adicionar em `UiState`:
     - `faceView: { elementId: Id; face: FaceSlot; layer: FaceLayerTarget } | null`
     - `facePaint: { active: boolean; materialId: Id; layerMode: 'all' | 'layer'; eraseMode: boolean; hoverHit: FaceHit | null }`
   - Atualizar a guarda do `useUi.subscribe` (linha ~414) incluindo `&& s.faceView === prev.faceView`.
   - Limpar `facePaint.active` quando trocar de ferramenta (`editor.setTool`) ou sair da vista 3D.
4. [viewTabActions.ts](file:///d:/Programas/Hestia/apps/web/src/editor/viewTabActions.ts):
   - Atualizar `tabOf` para `case 'face':` retornando `null` se `p.elements[v.elementId]` não existir mais (para `dropMissingViews` fechar a aba automaticamente ao excluir o elemento).
   - Tratar `case 'face':` em `navega` e criar helper `openFaceStudioTab(elementId, face, layer)`.
5. [ViewControlBar.tsx](file:///d:/Programas/Hestia/apps/web/src/ui/ViewControlBar.tsx) e [App.tsx](file:///d:/Programas/Hestia/apps/web/src/App.tsx):
   - Em `ViewControlBar.tsx`, retornar `null` quando `view === 'sheet' || view === 'face'`.
   - Em `App.tsx`, dentro de `Palco()`, renderizar `<FaceStudioView ... />` quando `view === 'face' && faceView`.

---

### 2.2. Pintura Direta no 3D + Barra de Opções + Menu de Contexto + Ribbon
> **Nota arquitetural importante:** `ToolId` mora em [registry.ts](file:///d:/Programas/Hestia/packages/tools/src/registry.ts) e passa por `toolAllowedInView` em `@hestia/model`. Recomenda-se expor **"Pintar Face"** e **"Estúdio da Face (2D)"** como `ActionId` em `apps/web/src/ui/ribbon/` (`model.ts`, `panelsShared.ts` no painel `P_GEOMETRY`, `actions.ts`, `useCtx.ts`, e traduzir todos os novos `t('PT', 'EN')` nos 6 idiomas em `ribbon-i18n-4.json` para passar `node scripts/check-ribbon-i18n.mjs`), controlando o modo pelo estado `ui.facePaint` em `useUi` sem poluir `ToolId` de croqui 2D.

1. [ViewportCanvas.tsx](file:///d:/Programas/Hestia/apps/web/src/ui/ViewportCanvas.tsx):
   - Em `view === '3d'` com `facePaint.active`:
     - Hover: chamar `pickFace` e exibir um overlay `THREE.Mesh` único gerenciado via `faceHighlightMesh(...)` na cena (`model.current.scene`).
     - Clique esquerdo: aplicar comando `setFacePaint` (ou `removeFacePaint` se `eraseMode`) em `editor.store.exec(...)` respeitando `layerMode` (`hit.layerIndex` vs `'all'`).
     - `Shift + Clique` (ou clique direito → menu): abrir a aba 2D `openFaceStudioTab(hit.elementId, hit.face, layer)`.
     - Tecla `Esc`: desativar `facePaint.active`.
2. [OptionsBar.tsx](file:///d:/Programas/Hestia/apps/web/src/ui/OptionsBar.tsx):
   - Quando `ui.facePaint.active` e `ui.view === '3d'`, renderizar barra dedicada com seletor de Material (`p.materials`), toggle `Todas as camadas` / `Camada clicada`, toggle `Pintar` / `Remover`, botão `Abrir Estúdio da Face (2D)` e `Concluir (Esc)`.
3. [contextMenu.ts](file:///d:/Programas/Hestia/apps/web/src/editor/contextMenu.ts) e [useCanvasContextMenu.ts](file:///d:/Programas/Hestia/apps/web/src/ui/useCanvasContextMenu.ts):
   - Para seleção única de parede (`wall`), piso (`floor`) ou laje (`slab`): adicionar entradas `Abrir Estúdio da Face (2D)…`, `Pintar Face no 3D` e `Limpar Pinturas da Face`.

---

### 2.3. Interface do "Estúdio da Face 2D" (`apps/web/src/ui/faceStudio/`)
Respeitar a regra `max-lines: 420` do ESLint e não usar `.toFixed(` / `m²` / `m³` fora de `formatQuantity` (`scripts/check-units.mjs`).

1. `apps/web/src/ui/faceStudio/faceStudioTypes.ts`:
   - Estado da ferramenta 2D (`select`, `paintBucket`, `rect`, `circle`, `ellipse`, `arch`, `lineBand`, `arcBand`, `poly`), snap e seleção de região/overlay.
2. `apps/web/src/ui/faceStudio/FaceStudioToolbar.tsx`:
   - Seletor de face (`availableFacesForElement(p, elementId)`), seletor de camada (`'all'` ou camada específica), ferramentas de desenho, botão **Importar DXF** usando **`parseDxfText`** de `@hestia/io` ([dxfImport.ts](file:///d:/Programas/Hestia/packages/io/src/dxfImport.ts)) para criar `FaceDxfOverlay` posicionável/rotacionável sobre a face planificada, controles de zoom e grid/snap.
3. `apps/web/src/ui/faceStudio/FaceStudioCanvas.tsx`:
   - Canvas 2D métrico `(u, v)` consumindo `unwrapElementFace(p, elementId, face, layer)` e `partitionFacePaint(...)`.
   - Exibe contorno real (parede curva planificada com badge indicando desenvolvimento cilíndrico/arco), aberturas (`UnwrappedOpening`) com snap nas bordas/centros, divisões de camadas (`UnwrappedLayerDivider`), paredes transversais (`UnwrappedCrossWall`), separadores DXF e prévia das regiões/ripados.
4. `apps/web/src/ui/faceStudio/FaceStudioInspector.tsx`:
   - Editor lateral da face base ou da região/overlay selecionado: Material, Ordem de prioridade (`order`), `cutMode` (`'clipBelow'` para apoio horizontal/vertical sem colisão vs `'overlay'`), `baseOffset`, `thickness`, painel paramétrico de **Ripado (`SlatsSpec`)** com alerta automático via `concaveSlatMinGap` quando a curvatura côncava causar risco de colisão na frente das ripas, e transformações `offset` / `rotationDeg` / `scale` / `separatorWidth` do DXF.
5. `apps/web/src/ui/faceStudio/FaceStudioView.tsx`:
   - Container completo conectando Toolbar + Canvas 2D + Inspector e despachando `setFacePaint` / `removeFacePaint` pelo `editor.store.exec(...)` com suporte completo a Desfazer/Refazer.

---

## 3. Verificações obrigatórias no outro PC após concluir
```bash
npm run build:wasm
npm run wasm:check
npm run test
npm run typecheck
npm run lint
node scripts/check-boundaries.mjs
node scripts/check-units.mjs
node scripts/check-ribbon-i18n.mjs
```
