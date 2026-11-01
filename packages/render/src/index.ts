export * from './viewport.ts';
export * from './gpu.ts';
// Instrumentação de desempenho (Fase 0.2): contadores, instância do app e interceções de contexto.
export * from './perf/index.ts';
export * from './plan/types.ts';
export * from './plan/build.ts';
export * from './plan/zoomOps.ts';
export * from './plan/grid.ts';
export * from './plan/cpuPlan.ts';
export * from './plan/gpuPlan.ts';
export * from './model3d/solids.ts';
export * from './model3d/orbit.ts';
export * from './model3d/scene3d.ts';
export * from './model3d/pick3d.ts';
export * from './model3d/selecaoPorCaixa3d.ts';
export * from './model3d/cad3d.ts';
// Prévia do Colar alinhado: camada violeta translúcida, fora do picking e do realce.
export { CamadaFantasmas, COR_DO_FANTASMA, OPACIDADE_DO_FANTASMA, type OpcoesFantasmas } from './model3d/ghost.ts';
export * from './model3d/levels3d.ts';
export * from './model3d/levelsData.ts';
// Chaves de conteúdo por nível (ver `chaveNivel3d.ts`): a montagem 3D usa para saber o que precisa ser re-resolvido.
export { chavesDeNivel } from './model3d/chaveNivel3d.ts';
// Picking por ID buffer (R3): tabela de códigos, geometria do passe e o leitor da GPU (`PickGpu3d`).
export * from './model3d/pickIdBuffer3d.ts';
export * from './model3d/openingParts.ts';
// Recursos de GPU da cena 3D (Fase 2.1/2.2): orçamento contábil, lotes por categoria/material e instâncias.
export { OrcamentoVram, TETO_VRAM_PADRAO } from './gpu/orcamento.ts';
export { GestorRecursosGpu, type OpcoesAtualizacao, type OpcoesGestor, type ResultadoGestor } from './gpu/gestorRecursos.ts';
export { caixaDePosicoes, LoteGeometriaGpu, mesclarLotes, unirCaixas, type Caixa, type DadosLote } from './gpu/loteGeometria.ts';
export { LoteLinhasGpu } from './gpu/loteLinhas.ts';
export { caixaDeMatrizes, InstanciasGpu } from './gpu/instanciasGpu.ts';
export * from './section/build.ts';
export * from './section/clip.ts';
export * from './section/frame.ts';
export * from './section/pick.ts';
export * from './section/handles.ts';
// Camada viva do corte/elevação: marcador de captura, guias/trilhas e tooltip de snap em (t,z), sem refazer a lista.
export * from './section/live.ts';
// Rótulos do corte/elevação resolvidos do papel (mm × escala) para pixels, como o `PlanFrame` faz na planta.
export * from './section/labels.ts';
export { sectionStyleOf, type SectionStyle } from './section/style.ts';
// Vista da planta (decisão 0013) e o que a exportação DXF reaproveita dela: a mesma geometria, o mesmo corte e a mesma pegada.
export { contextoDaVista } from './plan/viewContext.ts';
export { planViewOf, hiddenSelectionOps, type PlanView } from './plan/view.ts';
export { openingPlanWorldPaths, openingPlanDetail, openingDetailByZoom, type OpeningPlanWorldPath, type OpeningSymbolDetail, type OpeningSymbolOptions } from './plan/symbols.ts';
// Gráficos da vista (decisão 0015): estilo resolvido por nível, com o zoom corrente, e o padrão de uma categoria.
export { defaultPaint, planStyleOf, type PlanPaint, type PlanStyle, type PlanVisual } from './plan/style.ts';
export { climbWalk, spiralByComponent, spiralPostRing, stairCut, type StairCut } from './plan/stairs.ts';
export { risersInClimbOrder } from './stairRisers.ts';
export { roofFootprint } from './plan/roofs.ts';
export { openingTagLabels } from './plan/openingTags.ts';
// Pranchas (decisão 0022): lista de desenho da folha em mm de papel, para a tela e o PDF.
export * from './sheet/types.ts';
export * from './sheet/build.ts';
export * from './sheet/vista3d.ts';
export { STAMP_H, STAMP_W, captionOf, stampHeightOf } from './sheet/frame.ts';
// Ambientes (decisão 0018, 0037): nome e centro de cada ambiente, o mesmo texto da planta de piso e do DXF.
export { roomFullText, roomLabelAt, roomNameText } from './plan/rooms.ts';
export { areaPlanLegendOps, areaPlanRoomOps, areaPlanTableOps, areaPlanTagOps, labelGhostOps, referenceAt, referenceSegments, roomTagLines, tagBoxModel } from './plan/areaPlan.ts';
export * from './plan/sketch.ts';
// Anotações (textos e cotas): desenho, caixa do texto, moldura e destaque de seleção/hover.
export { annotationHighlightOps, annotationsOfLevel, blocoEm, drawnAnnotations, linhasDoTexto, noteOps, roomSeparatorStrokes, textBlockModel, type NoteLook, type NoteOps, type NoteTarget, type TextBlockModel } from './plan/notes.ts';
