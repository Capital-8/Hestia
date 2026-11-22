export * from './types.ts';
export * from './detailLineGeom.ts';
export * from './materialBlocks.ts';
export * from './dxfLayerStyle.ts';
export * from './cad.ts';
export * from './componentes.ts';
export * from './componentCommands.ts';
export * from './priority.ts';
export * from './termino.ts';
export * from './membrane.ts';
export * from './wallType.ts';
export * from './wallCurtainTypes.ts';
export * from './wallCurtain.ts';
export * from './wallCurtainPresets.ts';
export * from './curtainMullionProfile.ts';
export * from './curtainCommands.ts';
export * from './curtainRemap.ts';
// Esquadria na célula (fase 5): a ferramenta reconhece o erro pela chave e mostra a mensagem do modelo no idioma pedido.
export { ErroEsquadriaCelula } from './curtainOpeningCommands.ts';
export { embutirNaCortina, folgasDaRegiao, folhaMinima, retanguloDaRegiao, type FolgasRegiao, type Retangulo } from './curtainOpening.ts';
export { t as tDoModelo, type Key as ChaveModelo } from './i18n.ts';
export * from './queries.ts';
export * from './projetoDaPlanta.ts';
export * from './semEsquadrias.ts';
export * from './hostedOffset.ts';
export * from './ids.ts';
export * from './defaults.ts';
export * from './commands.ts';
export * from './copyLink.ts';
export * from './copyLinkCommands.ts';
export * from './history.ts';
export * from './outlineCommands.ts';
export * from './migrate.ts';
export * from './meshArrays.ts';
export * from './templates.ts';
export * from './wall.ts';
export * from './wallTilt.ts';
export * from './openingPlane.ts';
export * from './wallOverlap.ts';
export * from './validate.ts';
export { STAIR_MIN_HEIGHT } from './validateStairs.ts';
export { mansardProblems } from './validateRoofMansard.ts';
export * from './profile.ts';
export * from './floor.ts';
export * from './slab.ts';
export * from './ceiling.ts';
export * from './roof.ts';
export * from './room.ts';
export * from './stair.ts';
export * from './stairTypes.ts';
export * from './stairTransform.ts';
export * from './stairFit.ts';
export * from './ramp.ts';
export * from './rampTypes.ts';
export * from './rampTransform.ts';
export * from './validateRamps.ts';
export * from './terrainTypes.ts';
export * from './terrain.ts';
export * from './terrainFontes.ts';
export * from './terrainPapel.ts';
export * from './validateTerrain.ts';
export * from './lotTypes.ts';
export * from './lot.ts';
export * from './validateLot.ts';
export * from './localizacao.ts';
export * from './massTypes.ts';
export * from './mass.ts';
export * from './validateMass.ts';
export * from './massDerivaCommands.ts';
export * from './guardaCorpoTypes.ts';
export * from './guardaCorpo.ts';
export * from './guardaCorpoTransform.ts';
export * from './guardaCorpoNorma.ts';
export * from './validateGuardaCorpo.ts';
export * from './viewRange.ts';
export * from './graphics.ts';
export * from './graphicsCommands.ts';
export * from './level.ts';
export * from './elementLevel.ts';
export * from './opening.ts';
export * from './openingReveal.ts';
export * from './openingTypeLibrary.ts';
export * from './openingExtras.ts';
export * from './openingNominal.ts';
export * from './openingComposition.ts';
export * from './openingCompositionLayout.ts';
export * from './openingCompositionOf.ts';
export * from './openingCompositionRules.ts';
export * from './openingProfiles.ts';
export * from './openingHardware.ts';
export * from './openingStyle.ts';
export * from './openingSupport.ts';
export * from './dimension.ts';
export * from './dimensionContract.ts';
export * from './dimensionStyle.ts';
export * from './dimensionFamily.ts';
export * from './tagFamily.ts';
export * from './annotationFamilies.ts';
export * from './terrainLotFamilies.ts';
export * from './terrainTipo.ts';
export * from './cotasBase.ts';
export * from './tagText.ts';
export * from './marks.ts';
export * from './dimensionRefs.ts';
export * from './sectionView.ts';
export * from './annotations.ts';
export * from './sheet.ts';
export * from './sheetCommands.ts';
export * from './view3dPoints.ts';
export * from './pluginData.ts';
export * from './pluginCommands.ts'; // SUPLEMENTOS:
export * from './pluginContent.ts'; // SUPLEMENTOS:
export { materialReferences } from './pluginContentCommands.ts'; // SUPLEMENTOS:
export * from './areaPlan.ts';
export * from './viewProfile.ts';
export * from './areaPlanCommands.ts';
export * from './planView.ts';
export * from './planViewCommands.ts';
export * from './discipline.ts';
// `disciplinaDaCategoria` no barril é a versão por projeto (remapeamento + registro): a do registro puro continua em
// `registroCategorias.ts` e é re-exportada abaixo; o export explícito aqui resolve o nome ambíguo.
export {
  disciplinaDaCategoria,
  disciplinaExiste,
  disciplinasDoProjeto,
  perfilDaDisciplina,
  tomDaCategoria,
  type DisciplineProfile,
  type ProjectDiscipline,
} from './disciplineProfile.ts';
export * from './registroCategorias.ts';
export * from './grid.ts';
export * from './dimensionSettings.ts';
export * from './units.ts';
export * from './unitsFormat.ts';
export * from './unitsParse.ts';
export * from './viewHiddenCommands.ts';
export * from './sectionAnnotations.ts';
export * from './sectionAnnotationCommands.ts';
export * from './sectionLevelExtents.ts';
export * from './column.ts';
export * from './beam.ts';
export * from './footing.ts';
export * from './structuralCommands.ts';
// SUPLEMENTOS (fase E): expressões JSONLogic restritas, campos, verificações e quantitativos.
export * from './pluginExpr.ts';
export * from './pluginFields.ts';
export * from './pluginChecks.ts';
export * from './pluginSchedules.ts';
export * from './pluginScheduleUnits.ts'; // SUPLEMENTOS: quantitativos nas unidades do projeto
export * from './familia/index.ts';
export * from './furniture/index.ts';
export * from './facePaint.ts';
export * from './collabTypes.ts';
export * from './collabHistory.ts';
