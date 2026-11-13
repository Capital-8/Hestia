// Rótulo do passo de desfazer de cada comando (o texto que o Desfazer/Refazer mostra). Um rótulo por tipo de comando; o `never` do
// fim faz um comando novo sem rótulo não compilar.
import type { Command } from './commands.ts';

export function labelOf(c: Command): string {
  switch (c.type) {
    case 'addWall':
      return 'Criar parede';
    case 'addCadDrawing':
      return 'Inserir CAD';
    case 'updateCadDrawing':
      return 'Editar CAD importado';
    case 'addGeneric':
      return 'Inserir objeto importado';
    case 'updateGeneric':
      return 'Editar objeto importado';
    case 'addCopyLink':
      return 'Manter cópias vinculadas';
    case 'deleteCopyLink':
      return 'Desvincular';
    case 'addFloor':
      return 'Criar piso';
    case 'upsertFloorType':
      return 'Editar tipo de piso';
    case 'deleteFloorType':
      return 'Excluir tipo de piso';
    case 'addSlab':
      return 'Criar laje';
    case 'upsertSlabType':
      return 'Editar tipo de laje';
    case 'deleteSlabType':
      return 'Excluir tipo de laje';
    case 'addRoof':
      return 'Criar telhado';
    case 'addCeiling':
      return 'Criar forro';
    case 'addCeilings':
      return c.ceilings.length === 1 ? 'Criar forro' : 'Criar forros por ambiente';
    case 'updateCeiling':
      return 'Alterar forro';
    case 'removeCeiling':
      return 'Excluir forro';
    case 'upsertCeilingType':
      return 'Editar tipo de forro';
    case 'deleteCeilingType':
      return 'Excluir tipo de forro';
    case 'duplicateCeilingType':
      return 'Duplicar tipo de forro';
    case 'addRoom':
      return 'Criar ambiente';
    case 'updateRoom':
      return 'Alterar ambiente';
    case 'removeRoom':
      return 'Excluir ambiente';
    case 'upsertRoofType':
      return 'Editar tipo de telhado';
    case 'deleteRoofType':
      return 'Excluir tipo de telhado';
    case 'addStair':
      return 'Criar escada';
    case 'upsertStairType':
      return 'Editar tipo de escada';
    case 'deleteStairType':
      return 'Excluir tipo de escada';
    case 'addRamp':
      return 'Criar rampa';
    case 'upsertRampType':
      return 'Editar tipo de rampa';
    case 'deleteRampType':
      return 'Excluir tipo de rampa';
    case 'addOpening':
      return c.opening.kind === 'door' ? 'Inserir porta' : 'Inserir janela';
    case 'updateElements':
      return 'Alterar propriedades';
    case 'detachOutline':
      return 'Soltar contorno das paredes';
    case 'relinkOutline':
      return 'Revincular contorno às paredes';
    case 'detachCeilingRoom':
      return 'Soltar forro do ambiente';
    case 'relinkCeilingRoom':
      return 'Revincular forro ao ambiente';
    case 'setWallEnds':
      return 'Ajustar parede';
    case 'setJoin':
      return 'Alterar junção';
    case 'transform':
      return c.copy ? 'Copiar' : c.transform.kind === 'translate' ? 'Mover' : c.transform.kind === 'rotate' ? 'Rotacionar' : 'Espelhar';
    case 'splitWall':
      return 'Dividir parede';
    case 'deleteElements':
      return 'Excluir';
    case 'upsertWallType':
      return 'Editar tipo de parede';
    case 'deleteWallType':
      return 'Excluir tipo de parede';
    case 'upsertMullionType':
      return 'Editar tipo de montante';
    case 'deleteMullionType':
      return 'Excluir tipo de montante';
    case 'upsertCurtainPanelType':
      return 'Editar tipo de painel';
    case 'deleteCurtainPanelType':
      return 'Excluir tipo de painel';
    case 'addGridLine':
      return 'Adicionar linha da grade';
    case 'moveGridLine':
      return 'Mover linha da grade';
    case 'lockGridLine':
      return c.locked ? 'Travar linha da grade' : 'Destravar linha da grade';
    case 'removeGridLine':
      return 'Apagar linha da grade';
    case 'removeSegment':
      return 'Remover segmento da grade';
    case 'restoreSegment':
      return 'Restaurar segmento da grade';
    case 'setLineMullion':
      return 'Trocar montante da linha';
    case 'clearLineOverride':
      return 'Voltar linha ao padrão';
    case 'setCellPanel':
      return 'Trocar painel da célula';
    case 'clearCellOverride':
      return 'Voltar célula ao padrão';
    case 'normalizarSobrescritas':
      return 'Normalizar sobrescritas da cortina';
    case 'setCellOpening':
      return 'Colocar esquadria na célula';
    case 'updateCellOpening':
      return 'Editar esquadria da célula';
    case 'removeCellOpening':
      return 'Remover esquadria da célula';
    case 'setCurtainHost':
      return 'Embutir cortina na parede';
    case 'clearCurtainHost':
      return 'Tirar cortina da parede hospedeira';
    case 'upsertMaterial':
      return 'Editar material';
    case 'upsertOpeningType':
      return 'Editar tipo de abertura';
    case 'upsertLevel':
      return 'Editar nível';
    case 'deleteLevel':
      return 'Excluir nível';
    case 'setLevelViewRange':
      return 'Alterar intervalo de vista';
    case 'setProjectGraphics':
      return 'Alterar gráficos do projeto';
    case 'setLevelGraphics':
      return 'Alterar gráficos da vista';
    case 'resetLevelGraphics':
      return 'Restaurar gráficos da vista';
    case 'setView3D':
      return 'Alterar a vista 3D';
    case 'resetView3D':
      return 'Restaurar a vista 3D';
    case 'setViewHidden':
      return 'Ocultar na vista';
    case 'setSectionAnnotations':
      return 'Anotar no corte';
    case 'setSectionLevelExtent':
      return 'Criar/editar nível';
    case 'setSectionGraphics':
      return 'Alterar gráficos do corte';
    case 'resetSectionGraphics':
      return 'Restaurar gráficos do corte';
    case 'setProjectName':
      return 'Renomear projeto';
    case 'setDefaults':
      return 'Padrões do projeto';
    case 'setSettings':
      return 'Configurações do projeto';
    case 'setDimensionStyle':
      return 'Estilo de cotas';
    case 'upsertDimensionFamily':
      return 'Família de cotas';
    case 'removeDimensionFamily':
      return 'Excluir família de cotas';
    case 'setDefaultDimensionFamily':
      return 'Família de cotas padrão';
    case 'setDxfLayerStyle':
      return 'Editar camada do DXF';
    case 'resetDxfLayers':
      return 'Restaurar camadas do DXF';
    case 'toggleOpeningFavorite':
      return 'Favoritar tipo de abertura';
    case 'addView':
      return 'Criar vista';
    case 'updateView':
      return 'Alterar vista';
    case 'deleteView':
      return 'Excluir vista';
    case 'batch':
      return 'Várias alterações';
    case 'setOpeningHost':
      return 'Trocar parede anfitriã';
    case 'setElementLevel':
      return 'Mudar de nível';
    case 'addDimension':
      return 'Criar cota';
    case 'updateDimension':
      return 'Editar cota';
    case 'removeDimension':
      return 'Excluir cota';
    case 'addRoomSeparator':
      return 'Criar linha de separação';
    case 'removeRoomSeparator':
      return 'Excluir linha de separação';
    case 'updateRoomSeparator':
      return 'Editar linha de separação';
    case 'addDetailLine':
      return 'Criar linha de detalhe';
    case 'updateDetailLine':
      return 'Editar linha de detalhe';
    case 'removeDetailLine':
      return 'Excluir linha de detalhe';
    case 'addDetailRegion':
      return 'Criar região de detalhe';
    case 'updateDetailRegion':
      return 'Editar região de detalhe';
    case 'removeDetailRegion':
      return 'Excluir região de detalhe';
    case 'addTag':
      return 'Criar etiqueta';
    case 'updateTag':
      return 'Editar etiqueta';
    case 'removeTag':
      return 'Excluir etiqueta';
    case 'addText':
      return 'Criar texto';
    case 'updateText':
      return 'Editar texto';
    case 'removeText':
      return 'Excluir texto';
    case 'addSheet':
      return 'Criar prancha';
    case 'updateSheet':
      return 'Editar prancha';
    case 'removeSheet':
      return 'Excluir prancha';
    case 'addViewport':
      return 'Adicionar vista à prancha';
    case 'updateViewport':
      return 'Mover vista da prancha';
    case 'removeViewport':
      return 'Excluir vista da prancha';
    case 'setSheetOrder':
      return 'Reordenar pranchas';
    case 'ensurePluginProjectUid':
      return 'Identificar projeto para plugins';
    case 'setPluginViewOverride':
      return 'Substituição de material de visualização';
    case 'clearPluginViewOverride':
      return 'Remover substituição de visualização';
    case 'addView3DPoint':
      return 'Salvar ponto de vista 3D';
    case 'updateView3DPoint':
      return 'Editar ponto de vista 3D';
    case 'removeView3DPoint':
      return 'Excluir ponto de vista 3D';
    case 'setView3DPointOrder':
      return 'Reordenar pontos de vista 3D';
    case 'addGrid':
      return 'Criar grade';
    case 'updateGrid':
      return 'Editar grade';
    case 'removeGrid':
      return 'Excluir grade';
    case 'addGridType':
      return 'Criar tipo de grade';
    case 'updateGridType':
      return 'Editar tipo de grade';
    case 'removeGridType':
      return 'Excluir tipo de grade';
    case 'addAreaPlan':
      return 'Criar planta de área';
    case 'updateAreaPlan':
      return 'Alterar planta de área';
    case 'removeAreaPlan':
      return 'Excluir planta de área';
    case 'addRoomTag':
      return 'Criar etiqueta de ambiente';
    case 'updateRoomTag':
      return 'Alterar etiqueta de ambiente';
    case 'removeRoomTag':
      return 'Excluir etiqueta de ambiente';
    case 'setRoomReference':
      return 'Mover referência do ambiente';
    case 'setRoomLabel':
      return 'Mover rótulo do ambiente';
    case 'upsertRoomCategory':
      return 'Editar categoria de ambiente';
    case 'removeRoomCategory':
      return 'Excluir categoria de ambiente';
    case 'addGuardaCorpo':
      return 'Adicionar guarda-corpo';
    case 'updateGuardaCorpo':
      return 'Editar guarda-corpo';
    case 'deleteGuardaCorpo':
      return 'Excluir guarda-corpo';
    case 'upsertTipoGuardaCorpo':
      return 'Editar tipo de guarda-corpo';
    case 'deleteTipoGuardaCorpo':
      return 'Excluir tipo de guarda-corpo';
    case 'upsertPerfilNorma':
      return 'Editar perfil de norma';
    case 'deletePerfilNorma':
      return 'Excluir perfil de norma';
    case 'setNormaGuardaCorpo':
      return 'Escolher norma do projeto';
    case 'addTerrain':
      return 'Adicionar terreno';
    case 'updateTerrain':
      return 'Editar terreno';
    case 'editTerrainFontes':
      return 'Editar pontos e curvas do terreno';
    case 'addTerrainRegion':
      return 'Adicionar região de terreno';
    case 'updateTerrainRegion':
      return 'Editar região de terreno';
    case 'setTerrainRegionContorno':
      return 'Editar contorno da região de terreno';
    case 'addLot':
      return 'Adicionar lote';
    case 'updateLot':
      return 'Editar lote';
    case 'setLotContorno':
      return 'Editar contorno do lote';
    case 'setLocalizacao':
      return 'Definir localização do projeto';
    case 'upsertColorScheme':
      return 'Editar esquema de cores';
    case 'removeColorScheme':
      return 'Excluir esquema de cores';
    default: {
      const _nunca: never = c;
      return _nunca;
    }
  }
}
