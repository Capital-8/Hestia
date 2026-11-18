/* eslint-disable max-lines -- a faixa concentra as ações pontuais (cada uma com rótulo bilíngue, dica e guarda); dividir depois. */
import { definirMapaCorteAterro } from '@hestia/engine';
import { copyLinkOf, isBeam, isCeiling, isColumn, isFloor, isFooting, isOpening, isRamp, isRoof, isRoom, isSlab, isStair, isTerrain, isWall, type Element, type Id, type Project, type Ramp, type Wall } from '@hestia/model';
import { criarGuardaCorpoDeEscada, criarGuardaCorpoDeRampa, mensagensDeGuardaCorpo, placeFootingsAtColumns, TerrainRegionTool, type PerimeterModifyKind, type PredefinicaoRegiao, type ShortcutCommand, type ToolEnv, type ToolOptions } from '@hestia/tools';
import { t as translate, useI18n } from '../../editor/i18n.ts';
import { numberOpeningMarks } from '../../editor/tagActions.ts';
import { addMissingTagsAction } from '../../editor/areaPlanActions.ts';
import { pedirAlerta } from '../../editor/alertaPrompt.ts';
import { editor } from '../../editor/controller.ts';
import { createSimilarTarget, startCreateSimilar } from '../../editor/createSimilar.ts';
import { resetDock, setDock } from '../../editor/dockActions.ts';
import type { DockLayout, DockPanel, DockSide } from '../../editor/dockLayout.ts';
import { editThinLines, thinLinesOn } from '../../editor/graphicsActions.ts';
import { perimeterActions } from '../../editor/perimeter.ts';
import { addSheetAction } from '../../editor/sheetActions.ts';
import { sheetsPerLevelAction } from '../../editor/sheetInsert.ts';
import { setSnap, toggleRoofProjection, useUi, type DialogKind, type UiState } from '../../editor/state.ts';
import { transfer } from '../../editor/transfer.ts';
import { alternarMassaNaVista, massaVisivelNaVista } from '../../editor/viewVisibility.ts';
import { activateView } from '../../editor/viewTabActions.ts';
import { massaUnicaSelecionada } from '../dialogs/massPisosForm.ts';
import { applyDrop } from '../dockDrag.ts';
import { gridToolOf } from '../gridUi.ts';
import { abrirLocalizacao } from '../dialogs/localizacaoAberta.ts';
import { abrirTerrenoSchedule } from '../dialogs/terrenoScheduleAberta.ts';
import { abrirLoteRumos } from '../dialogs/loteRumosAberto.ts';
import { abrirLoteSchedule } from '../dialogs/loteScheduleAberta.ts';
import { abrirImportTerreno } from '../../editor/terrenoImport.ts';
import { ativarTopografia, editarTerreno } from '../terrainActions.ts';
import { idPerimetroEditavel } from '../perimeter/perimeterEditavel.ts';
import { acompanharInclinacao, definirTransicaoDaCadeia } from '../../editor/wallTiltActions.ts';
import { t, type ActionId, type Txt } from './model.ts';

/** Liga a ferramenta Região de terreno numa predefinição (Subdivisão, Plataforma ou Região nivelada); `porElemento` só vale na plataforma. */
function ativarRegiao(predef: PredefinicaoRegiao, porElemento = false): void {
  editor.setTool('terrainRegion');
  const ativa = editor.activeTool;
  if (!(ativa instanceof TerrainRegionTool)) return;
  ativa.definirPredefinicao(predef);
  if (porElemento) ativa.definirPorElemento(true);
}

/** A ferramenta Região de terreno está ativa nesta predefinição (e, na plataforma, neste modo "Por elemento")? */
const regiaoAtiva = (predef: PredefinicaoRegiao, porElemento = false) => (c: RibbonCtx): boolean => {
  const ativa = editor.activeTool;
  return c.tool === 'terrainRegion' && ativa instanceof TerrainRegionTool && ativa.predefinicao === predef && ativa.porElemento === porElemento;
};

/** A região nasce sobre um terreno: sem terreno no projeto, o botão explica o que fazer antes. */
const semTerrenoNoProjeto = (c: RibbonCtx): Txt | false =>
  Object.values(c.p.elements).some(isTerrain) ? false : t('Crie um terreno antes (Topografia).', 'Create a terrain first (Toposurface).');

/** Leva o painel para o outro dock (esquerdo <-> direito), pela mesma regra de soltura do arraste. */
function flipSide(panel: DockPanel): void {
  const d = useUi.getState().dock;
  const to: DockSide = d.sides[panel] === 'left' ? 'right' : 'left';
  setDock(applyDrop(d, panel, to));
}

/** Estado que a faixa lê para decidir "pressionado" e "desabilitado". */
export interface RibbonCtx {
  tool: UiState['tool'];
  selection: Id[];
  view: UiState['view'];
  planKind: UiState['planKind'];
  areaPlanId: Id | null;
  levelId: Id;
  showGrid: boolean;
  showUnderlay: boolean;
  showRoofProjection: boolean;
  /** Mapa de corte e aterro ligado na planta (U2). */
  mapaCorteAterro: boolean;
  propsOpen: boolean;
  browserOpen: boolean;
  /** Dock de cada painel (Propriedades e Navegador). */
  sides: DockLayout['sides'];
  options: ToolOptions;
  p: Project;
  /** Pintura direta de faces no 3D ativa. */
  facePaintActive?: boolean;
  /** Modo da ferramenta de pintura de faces no 3D. */
  facePaintMode?: 'paint' | 'studioPick';
  /** Com o modo de perímetro aberto: o comando de Modificar ligado sobre o esboço (null = seleção de linhas). */
  perimetro?: { modify: PerimeterModifyKind | null; selecting?: boolean } | null;
}

export interface ActionDef {
  label: Txt;
  icon: string;
  /** Explicação em uma frase (segunda linha do tooltip). */
  hint?: Txt;
  /** Comando de atalho por sequência (ex.: Criar semelhante = CS); o tooltip mostra a tecla atual. */
  shortcut?: ShortcutCommand;
  /** Atalho fixo com modificador (ex.: Ctrl+X), mostrado no tooltip sem entrar na configuração de sequências. */
  keys?: string;
  run: () => void;
  pressed?: (c: RibbonCtx) => boolean;
  /** Devolve o motivo quando a ação não pode rodar agora; `false` quando pode. */
  disabled?: (c: RibbonCtx) => Txt | false;
}

const openDialog = (dialog: DialogKind, dialogArg: string | null = null): (() => void) => () => useUi.setState({ dialog, dialogArg });

/** Diálogo "Propriedades de tipo" do que está selecionado ou do que a ferramenta ativa vai criar. */
function typeDialogFor(c: RibbonCtx): { dialog: DialogKind; arg: string } | null {
  const o = c.options;
  if (c.tool !== 'select') {
    switch (c.tool) {
      case 'wall': return { dialog: 'wallType', arg: o.wallTypeId };
      case 'door': return { dialog: 'openingType', arg: o.doorTypeId };
      case 'window': return { dialog: 'openingType', arg: o.windowTypeId };
      case 'floor': return { dialog: 'floorType', arg: o.floorTypeId };
      case 'slab': case 'slope': return { dialog: 'slabType', arg: o.slabTypeId };
      case 'ceiling': return o.ceilingTypeId ? { dialog: 'ceilingType', arg: o.ceilingTypeId } : null;
      case 'roof': case 'roofextrusion': case 'roofarrow': return o.roofTypeId ? { dialog: 'roofType', arg: o.roofTypeId } : null;
      case 'stair': case 'stairrun': return o.stair?.typeId ? { dialog: 'stairType', arg: o.stair.typeId } : null;
      case 'grid': return { dialog: 'gridType', arg: gridToolOf(o, c.p).typeId };
      case 'column': return { dialog: 'columnType', arg: o.columnTypeId ?? Object.keys(c.p.columnTypes ?? {})[0] ?? '' };
      case 'beam': return { dialog: 'beamType', arg: o.beamTypeId ?? Object.keys(c.p.beamTypes ?? {})[0] ?? '' };
      case 'footing': return { dialog: 'footingType', arg: o.footingTypeId ?? Object.keys(c.p.footingTypes ?? {})[0] ?? '' };
      case 'ramp': {
        const id = o.ramp?.typeId ?? Object.keys(c.p.rampTypes)[0];
        return id ? { dialog: 'rampType', arg: id } : null;
      }
      default: return null;
    }
  }
  const e: Element | undefined = c.selection.map((id) => c.p.elements[id]).find((x): x is Element => !!x);
  if (!e) return null;
  if (isWall(e)) return { dialog: 'wallType', arg: e.typeId };
  if (isOpening(e)) return { dialog: 'openingType', arg: e.typeId };
  if (isFloor(e)) return { dialog: 'floorType', arg: e.typeId };
  if (isSlab(e)) return { dialog: 'slabType', arg: e.typeId };
  if (isCeiling(e)) return { dialog: 'ceilingType', arg: e.typeId };
  if (isRoof(e)) return { dialog: 'roofType', arg: e.typeId };
  if (isStair(e)) return { dialog: 'stairType', arg: e.typeId };
  if (isRamp(e)) return { dialog: 'rampType', arg: e.typeId };
  if (isColumn(e)) return { dialog: 'columnType', arg: e.typeId };
  if (isBeam(e)) return { dialog: 'beamType', arg: e.typeId };
  if (isFooting(e)) return { dialog: 'footingType', arg: e.typeId };
  return null;
}

const planOrSection = (c: RibbonCtx): boolean => c.view === 'plan' || c.view === 'section';
const noSel = (c: RibbonCtx): Txt | false => (c.selection.length === 0 ? t('Selecione elementos primeiro.', 'Select elements first.') : false);
/** Copiar/Recortar só valem para o que o buffer leva; forro, anotação, grade e id inexistente ficam de fora. */
const naoTransferivel = (verbo: 'Copiar' | 'Recortar'): Txt =>
  verbo === 'Copiar'
    ? t(
      'Copiar só vale para paredes, pisos, lajes, telhados, escadas, rampas, ambientes e aberturas hospedadas (com a parede selecionada).',
      'Copy only works for walls, floors, slabs, roofs, stairs, ramps, rooms and hosted openings (with the host wall selected).',
    )
    : t(
      'Recortar só vale para paredes, pisos, lajes, telhados, escadas, rampas, ambientes e aberturas hospedadas (com a parede selecionada).',
      'Cut only works for walls, floors, slabs, roofs, stairs, ramps, rooms and hosted openings (with the host wall selected).',
    );
const stairsIn = (c: RibbonCtx): Array<{ typeId: Id }> => c.selection.map((id) => c.p.elements[id]).filter(isStair);
const rampsIn = (c: RibbonCtx): Ramp[] => c.selection.map((id) => c.p.elements[id]).filter(isRamp);
const wallsIn = (c: RibbonCtx): Wall[] => c.selection.map((id) => c.p.elements[id]).filter(isWall);

function thinTarget(): { levelId: Id } | 'section' {
  const ui = useUi.getState();
  return ui.view === 'section' ? 'section' : { levelId: ui.levelId };
}

const sched = (label: Txt, dialog: DialogKind): ActionDef => ({ label, icon: 'schedule', run: openDialog(dialog) });

export const ACTIONS: Record<ActionId, ActionDef> = {
  cotasAuto: {
    label: t('Cotas automáticas', 'Auto Dimensions'),
    icon: 'cotasAuto',
    hint: t('Cotas automáticas do nível ativo: escolha o que cotar, por onde medir e em quais lados.', 'Automatic dimensions for the active level.'),
    run: openDialog('cotasAuto'),
  },
  dimensionFamilies: {
    label: t('Famílias de cotas', 'Dimension Types'),
    icon: 'dimension',
    hint: t('Aparência nomeada das cotas (marcador, texto, leitura e formato); a família padrão é a da cota nova.', 'Named dimension appearance (marker, text, read convention and format); the default family is used for new dimensions.'),
    run: openDialog('dimensionFamilies'),
  },
  tagFamilies: {
    label: t('Famílias de etiquetas', 'Tag Types'),
    icon: 'tag',
    hint: t('Modelo de rótulo com parâmetros, contorno (círculo, hexágono, retângulo) e tamanho em mm de papel.', 'Label format with parameters, outline shape (circle, hexagon, rectangle) and size in paper mm.'),
    run: openDialog('tagFamilies'),
  },
  numberMarks: {
    label: t('Numerar marcas', 'Number Marks'),
    icon: 'tag',
    hint: t('Numera automaticamente P01, J01… nas portas e janelas sem marca e verifica duplicatas.', 'Automatically numbers P01, J01… on unmarked doors and windows and checks duplicates.'),
    run: () => { numberOpeningMarks(false); },
  },
  tagRoom: {
    label: t('Etiquetar ambiente', 'Tag Room'),
    icon: 'tagRoom',
    hint: t('Ativa a etiqueta na categoria de ambiente para clicar no ambiente e rotulá-lo.', 'Activates tagging for rooms so you can click a room to tag it.'),
    run: () => {
      editor.setTool('tag');
    },
  },
  typeProps: {
    label: t('Propriedades de tipo', 'Type Properties'),
    icon: 'type',
    hint: t('Abre o tipo do elemento selecionado (ou o que a ferramenta ativa vai criar).', 'Opens the type of the selected element or of the active tool.'),
    run: () => {
      const d = typeDialogFor(ctxNow());
      if (d) useUi.setState({ dialog: d.dialog, dialogArg: d.arg });
    },
    disabled: (c) => (typeDialogFor(c) ? false : t('Selecione um elemento com tipo, ou ative uma ferramenta de criação.', 'Select an element with a type.')),
  },
  properties: {
    label: t('Propriedades', 'Properties'),
    icon: 'props',
    hint: t('Mostra ou oculta a paleta de propriedades.', 'Show or hide the Properties palette.'),
    run: () => useUi.setState((s) => ({ propsOpen: !s.propsOpen })),
    pressed: (c) => c.propsOpen,
  },
  browser: {
    label: t('Navegador de projeto', 'Project Browser'),
    icon: 'levels',
    hint: t('Mostra ou oculta o navegador de projeto.', 'Show or hide the Project Browser.'),
    run: () => useUi.setState((s) => ({ browserOpen: !s.browserOpen })),
    pressed: (c) => c.browserOpen,
  },
  propsSide: {
    label: t('Propriedades à direita', 'Properties on the Right'),
    icon: 'props',
    hint: t('Alterna o lado das propriedades entre a esquerda (padrão do Revit) e a direita.', 'Switch the Properties palette between the left and right sides.'),
    run: () => flipSide('props'),
    pressed: (c) => c.sides.props === 'right',
  },
  tagAll: {
    label: t('Etiquetar todos', 'Tag All'),
    icon: 'tag',
    hint: t('Etiqueta todos os elementos sem etiqueta desta vista.', 'Tag every untagged element in this view.'),
    run: () => {
      // Na planta de área, "Etiquetar todos" completa as etiquetas de AMBIENTE (Room Tag) da vista.
      const s = useUi.getState();
      if (s.view === 'plan' && s.planKind === 'area' && s.areaPlanId) {
        const n = addMissingTagsAction(editor.store, s.areaPlanId);
        useUi.setState({
          status: n
            ? { key: n === 1 ? 'shr_status_rooms_tagged_one' : 'shr_status_rooms_tagged_many', args: { n } }
            : { key: 'shr_status_rooms_all_tagged' },
        });
        return;
      }
      useUi.setState({ dialog: 'tagAll' });
    },
  },
  wallTags: {
    label: t('Códigos de parede', 'Wall Type Codes'),
    icon: 'tag',
    hint: t('Mostra ou oculta as etiquetas de elementos na vista.', 'Show or hide element labels in the view.'),
    run: () => editor.store.exec({ type: 'setSettings', patch: { showTags: !editor.project.settings.showTags } }, translate(useI18n.getState().lang, 'shr_undo_toggle_tags')),
    pressed: (c) => c.p.settings.showTags,
  },
  browserSide: {
    label: t('Navegador à direita', 'Project Browser on the Right'),
    icon: 'levels',
    hint: t('Alterna o lado do navegador de projeto entre a esquerda (padrão do Revit) e a direita.', 'Switch the Project Browser between the left and right sides.'),
    run: () => flipSide('browser'),
    pressed: (c) => c.sides.browser === 'right',
  },
  resetDock: {
    label: t('Restaurar disposição dos painéis', 'Reset Panel Layout'),
    icon: 'levels',
    hint: t('Volta Propriedades e Navegador ao padrão: à esquerda, com as propriedades em cima.', 'Put Properties and Project Browser back in the default layout.'),
    run: () => resetDock(),
  },
  sameType: {
    label: t('Mesmo tipo', 'Same Type'),
    icon: 'sametype',
    hint: t('Seleciona todas as instâncias do tipo do elemento selecionado.', 'Select all instances of the type.'),
    run: () => { editor.selectAllOfSelectedType(); },
    disabled: noSel,
  },
  sameName: {
    label: t('Mesmo nome', 'Same Name'),
    icon: 'samename',
    hint: t('Seleciona todos os ambientes do nível com o mesmo nome (hoje só ambientes).', 'Select all rooms with the same name.'),
    run: () => { editor.selectAllOfSelectedName(); },
    disabled: (c) => (c.selection.some((id) => isRoom(c.p.elements[id])) ? false : t('Selecione um ambiente primeiro.', 'Select a room first.')),
  },
  createSimilar: {
    label: t('Criar semelhante', 'Create Similar'),
    icon: 'copy',
    hint: t('Ativa a ferramenta do elemento selecionado, já com o tipo dele.', 'Starts the tool of the selected element with its type.'),
    shortcut: 'createSimilar',
    run: () => { startCreateSimilar(editor.project, (id) => editor.setTool(id)); },
    disabled: (c) => (createSimilarTarget(c.p, c.selection)
      ? false
      : t('Selecione um elemento de um só tipo (parede, porta, janela, piso, laje, forro, telhado, pilar, viga ou sapata).', 'Select one element of a single type (wall, door, window, floor, slab, ceiling, roof, column, beam or footing).')),
  },
  moveLevel: {
    label: t('Nível…', 'Level…'),
    icon: 'layers',
    hint: t('Move a seleção para outro nível.', 'Move the selection to another level.'),
    run: () => useUi.setState({ dialog: 'moveLevel', dialogArg: null }),
    disabled: noSel,
  },
  editPerimeter: {
    label: t('Editar perímetro', 'Edit Perimeter'),
    icon: 'editperimeter',
    hint: t('Reabre o contorno do elemento selecionado na planta, para ajustar linhas, inclinação e balanço.', 'Reopens the outline of the selected element on the plan, to adjust lines, slope and overhang.'),
    run: () => {
      const id = idPerimetroEditavel(editor.project, useUi.getState().selection);
      if (id) perimeterActions.edit(id);
    },
    disabled: (c) => (idPerimetroEditavel(c.p, c.selection) ? false : t('Selecione um telhado, piso, laje ou forro', 'Select a roof, floor, slab or ceiling')),
  },
  copySelection: {
    label: t('Copiar', 'Copy'),
    icon: 'copy',
    hint: t('Copia a seleção; Ctrl+V cola seguindo o cursor.', 'Copies the selection; Ctrl+V pastes following the cursor.'),
    keys: 'Ctrl+C',
    run: () => { editor.copySelection(); },
    disabled: (c) => {
      if (c.selection.length === 0) return noSel(c);
      return transfer.copyableIds(c.p, c.selection).length === 0 ? naoTransferivel('Copiar') : false;
    },
  },
  cutSelection: {
    label: t('Recortar', 'Cut'),
    icon: 'cutscissors',
    hint: t('Copia e apaga a seleção; Ctrl+V cola seguindo o cursor.', 'Copies and deletes the selection; Ctrl+V pastes following the cursor.'),
    keys: 'Ctrl+X',
    run: () => { editor.cutSelection(); },
    disabled: (c) => {
      if (c.selection.length === 0) return noSel(c);
      return editor.canCutSelection(c.selection, c.p) ? false : naoTransferivel('Recortar');
    },
  },
  pasteAligned: {
    label: t('Colar', 'Paste'),
    icon: 'paste',
    hint: t('Cola o copiado seguindo o cursor; clique para posicionar.', 'Pastes what was copied following the cursor; click to place it.'),
    keys: 'Ctrl+V',
    run: () => { editor.pasteAligned(); },
    disabled: (c) => {
      if (c.view === 'sheet') return t('Não vale para pranchas.', 'Not available for sheets.');
      if (c.view !== 'plan') return t('Só em planta.', 'Plan views only.');
      return transfer.hasClip() ? false : t('Nada copiado ainda. Use Copiar ou Ctrl+C.', 'Nothing copied yet. Use Copy or Ctrl+C.');
    },
  },
  syncLinked: { label: t('Sincronizar', 'Sync'), icon: 'layers', hint: t('Sincroniza o andar-tipo inteiro (paredes, aberturas, pisos, forros...) a partir do nível selecionado, num passo de desfazer.', 'Syncs the whole typical floor (walls, openings, floors, ceilings...) from the selected level, in one undo step.'), run: () => { editor.syncLinkedSelection(); }, disabled: (c) => (c.selection.some((id) => copyLinkOf(c.p, id) !== null) ? false : t('Selecione um elemento de andar-tipo.', 'Select a typical-floor linked element.')) },
  unlinkLinked: { label: t('Desvincular', 'Unlink'), icon: 'cutscissors', hint: t('Desfaz o vínculo: as cópias ficam no projeto, mas não sincronizam mais.', 'Removes the link: copies stay but stop syncing.'), run: () => { editor.unlinkLinkedSelection(); }, disabled: (c) => (c.selection.some((id) => copyLinkOf(c.p, id) !== null) ? false : t('Selecione um elemento de andar-tipo.', 'Select a typical-floor linked element.')) },
  pasteAlignedLevels: {
    label: t('Alinhado aos níveis selecionados', 'Aligned to Selected Levels'),
    icon: 'paste',
    hint: t('Copia o que está copiado para os níveis escolhidos, mantendo o X/Y e os offsets do nível (vale em planta, 3D, corte e elevação).', 'Copies what was copied to the chosen levels, keeping X/Y and level offsets (works in plan, 3D, section and elevation).'),
    run: () => { editor.openPasteLevelsDialog(); },
    disabled: (c) => {
      if (c.view === 'sheet') return t('Não vale para pranchas.', 'Not available for sheets.');
      return transfer.hasClip() ? false : t('Nada copiado ainda. Use Copiar ou Ctrl+C.', 'Nothing copied yet. Use Copy or Ctrl+C.');
    },
  },
  delete: {
    label: t('Excluir', 'Delete'),
    icon: 'close',
    // No modo de perímetro, Excluir é o comando sobre as linhas do esboço (não apaga o projeto) e não precisa de seleção.
    run: () => { if (editor.perimetro.ativo) editor.perimetro.setModify('delete'); else editor.deleteSelection(); },
    disabled: (c) => (c.perimetro ? false : noSel(c)),
  },
  zoomFit: {
    label: t('Enquadrar tudo', 'Zoom to Fit'),
    icon: 'fit',
    run: () => {
      const s = useUi.getState();
      if (s.view === '3d') useUi.setState({ previewTick: s.previewTick + 1 });
      else editor.zoomExtents();
    },
  },
  thinLines: {
    label: t('Linhas finas', 'Thin Lines'),
    icon: 'tl',
    hint: t('Mostra todas as linhas da vista com 1 px de espessura na tela.', 'Show all lines at 1 px on screen.'),
    run: () => {
      const target = thinTarget();
      const r = editThinLines(editor.store, target, !thinLinesOn(editor.project, target));
      if (!r.ok) useUi.setState({ status: r.error ?? { key: 'shr_status_thin_lines_error' } });
    },
    pressed: (c) => planOrSection(c) && thinLinesOn(c.p, c.view === 'section' ? 'section' : { levelId: c.levelId }),
    disabled: (c) => (planOrSection(c) ? false : t('Só em planta ou corte.', 'Plan or section views only.')),
  },
  grid: { label: t('Grade', 'Grid'), icon: 'grid', hint: t('Grade de pontos na planta: mostra os pontos e o cursor os captura.', 'Dot grid in plan: shows the dots and the cursor snaps to them.'), run: () => setSnap({ grid: !useUi.getState().showGrid }), pressed: (c) => c.showGrid },
  underlay: { label: t('Subpavimento', 'Underlay'), icon: 'layers', hint: t('Mostra o pavimento abaixo, apagado.', 'Show the level below, faded.'), run: () => useUi.setState((s) => ({ showUnderlay: !s.showUnderlay })), pressed: (c) => c.showUnderlay },
  roofProjection: { label: t('Projeção da cobertura', 'Roof Projection'), icon: 'roof', run: toggleRoofProjection, pressed: (c) => c.showRoofProjection },
  showMass: {
    label: t('Mostrar massa', 'Show Mass'),
    icon: 'massShow',
    run: alternarMassaNaVista,
    pressed: (c) => massaVisivelNaVista(c.p),
    disabled: (c) => (c.view === 'sheet' ? t('Não vale para pranchas.', 'Does not apply to sheets.') : false),
  },
  pisosDaMassa: {
    label: t('Pisos da massa', 'Floors from Mass'),
    icon: 'massFloors',
    run: openDialog('massPisos'),
    disabled: (c) => (massaUnicaSelecionada(c.p, c.selection) ? false : t('Selecione uma massa.', 'Select a mass.')),
  },
  paredesDaMassa: {
    label: t('Paredes da massa', 'Walls from Mass'),
    icon: 'massWalls',
    run: openDialog('massParedes'),
    disabled: (c) => (massaUnicaSelecionada(c.p, c.selection) ? false : t('Selecione uma massa.', 'Select a mass.')),
  },
  graphicsVisibility: {
    label: t('Visibilidade/Gráficos', 'Visibility/Graphics'),
    icon: 'layers',
    hint: t('Visibilidade por categoria e gráficos da vista ativa.', 'Category visibility and graphics of the active view.'),
    run: () => {
      const s = useUi.getState();
      useUi.setState({ dialog: 'graphicsVisibility', dialogArg: s.view === 'section' ? 'section' : s.view === '3d' ? '3d' : s.levelId });
    },
    disabled: (c) => (c.view === 'sheet' ? t('Não vale para pranchas.', 'Not available for sheets.') : false),
  },
  view3d: { label: t('Vista 3D', '3D View'), icon: 'cube', run: () => activateView({ kind: '3d' }) },
  genElevations: {
    label: t('Elevação', 'Elevation'),
    icon: 'plan',
    hint: t('Cria Norte, Sul, Leste e Oeste em volta de tudo o que está no projeto: paredes, escadas, guarda-corpos, lajes, telhados... (substitui as de mesmo nome).', 'Creates North, South, East and West elevations around everything in the project: walls, stairs, railings, slabs, roofs...'),
    run: () => editor.generateElevations(),
  },
  newSheet: {
    label: t('Prancha', 'Sheet'),
    icon: 'sheet',
    run: () => {
      try {
        activateView({ kind: 'sheet', sheetId: addSheetAction(editor.store) });
        useUi.setState({ status: { key: 'shr_status_sheet_created' } });
      } catch (e) {
        useUi.setState({ status: e instanceof Error ? e.message : { key: 'shr_status_op_rejected' } });
      }
    },
  },
  addViewSheet: {
    label: t('Adicionar vista', 'Add View'),
    icon: 'plan',
    hint: t('Adiciona plantas, cortes ou o 3D à prancha aberta.', 'Adds plans, sections or the 3D to the open sheet.'),
    run: () => {
      const s = useUi.getState();
      if (s.view !== 'sheet' || !s.sheetId) {
        useUi.setState({ status: { key: 'shr_status_open_sheet_first' } });
        return;
      }
      useUi.setState({ dialog: 'addView', dialogArg: s.sheetId });
    },
  },
  publishSheets: {
    label: t('Publicar pranchas', 'Publish Sheets'),
    icon: 'sheet',
    hint: t('Escolhe as pranchas, a ordem e um PDF por prancha.', 'Pick sheets, order and one PDF per sheet.'),
    run: () => useUi.setState({ dialog: 'publish', dialogArg: null }),
  },
  sheetsPerLevel: {
    label: t('Prancha por nível', 'Sheet per Level'),
    icon: 'sheet',
    hint: t('Cria uma prancha A3 com a planta de cada nível do projeto.', 'Creates an A3 sheet with each level plan.'),
    run: () => {
      try {
        const ids = sheetsPerLevelAction(editor.store);
        const first = ids[0];
        if (first) activateView({ kind: 'sheet', sheetId: first });
        useUi.setState({ status: ids.length === 1 ? { key: 'shr_status_sheet_per_level' } : { key: 'shr_status_sheets_per_level', args: { n: ids.length } } });
      } catch (e) {
        useUi.setState({ status: e instanceof Error ? e.message : { key: 'shr_status_op_rejected' } });
      }
    },
  },
  materials: { label: t('Materiais', 'Materials'), icon: 'materialSphere', run: openDialog('materials') },
  externalTools: {
    label: t('Ferramentas externas', 'External Tools'),
    icon: 'component',
    hint: t('Conecta programas externos (como o renderizador) ao modelo.', 'Connect external programs (such as the renderer) to the model.'),
    run: openDialog('externalTools'),
  },
  pluginManager: {
    label: t('Gerenciar suplementos', 'Manage Add-Ins'),
    icon: 'component',
    hint: t('Lista todos os suplementos: instala, atualiza, ajusta permissões, mostra o registro e os dados. Atalho: Alt+Shift+P.', 'Lists every add-in: install, update, adjust permissions, view the log and the data. Shortcut: Alt+Shift+P.'),
    run: openDialog('pluginManager'),
  },
  importCad: {
    label: t('Importar CAD (DXF)', 'Import CAD'),
    icon: 'open',
    hint: t('Insere um desenho DXF no nível, como um objeto só, com as camadas do arquivo.', 'Insert a DXF drawing on the level as a single object, with the file layers.'),
    run: openDialog('importCad'),
  },
  manageCad: {
    label: t('Gerenciar CAD', 'Manage CAD'),
    icon: 'layers',
    hint: t('Lista os desenhos DXF importados: visibilidade, enquadramento, renomear e excluir.', 'Lists imported DXF drawings: visibility, framing, rename and delete.'),
    run: openDialog('manageCad'),
  },
  levels: { label: t('Gerenciar níveis', 'Manage Levels'), icon: 'level', hint: t('Cria e edita os níveis do projeto.', 'Create and edit project levels.'), run: openDialog('levels') },
  levelTool: { label: t('Nível (LL)', 'Level (LL)'), icon: 'level', hint: t('Cria um nível no corte ou elevação: clique no início e no fim da linha horizontal.', 'Creates a level in a section or elevation.'), run: () => editor.setTool('level') },
  lineWeights: { label: t('Espessuras de linha', 'Line Weights'), icon: 'detail', hint: t('Pesos de linha por escala, por categoria e limites de detalhe.', 'Line weights by scale and category.'), run: openDialog('lineWeights') },
  units: {
    label: t('Unidades do projeto', 'Project Units'),
    icon: 'type',
    hint: t('Unidades de comprimento, área, volume, ângulo e inclinação do projeto.', 'Project units for length, area, volume, angle and slope.'),
    shortcut: 'unidades',
    run: openDialog('units'),
  },
  shortcutsConfig: { label: t('Atalhos de teclado…', 'Keyboard Shortcuts…'), icon: 'help', run: openDialog('shortcutsConfig') },
  shortcuts: { label: t('Lista de atalhos', 'Shortcut List'), icon: 'help', run: openDialog('shortcuts') },
  schedWalls: sched(t('Tabela de paredes', 'Wall Schedule'), 'schedule'),
  schedFloors: sched(t('Tabela de pisos', 'Floor Schedule'), 'floorSchedule'),
  schedSlabs: sched(t('Tabela de lajes', 'Slab Schedule'), 'slabSchedule'),
  schedCeilings: sched(t('Tabela de forros', 'Ceiling Schedule'), 'ceilingSchedule'),
  schedRoofs: sched(t('Tabela de telhados', 'Roof Schedule'), 'roofSchedule'),
  schedStairs: sched(t('Tabela de escadas', 'Stair Schedule'), 'stairSchedule'),
  schedRamps: sched(t('Tabela de rampas', 'Ramp Schedule'), 'rampSchedule'),
  schedRooms: sched(t('Tabela de ambientes', 'Room Schedule'), 'roomSchedule'),
  schedOpenings: sched(t('Tabela de portas e janelas', 'Door/Window Schedule'), 'openingSchedule'),
  schedMass: sched(t('Massas por pavimento', 'Masses by Floor'), 'massSchedule'),
  stairSketch: {
    label: t('Editar croqui', 'Edit Sketch'),
    icon: 'stair',
    hint: t('Edita o croqui da escada selecionada.', 'Edit the sketch of the selected stair.'),
    run: () => editor.setTool('stair'),
    disabled: (c) => (stairsIn(c).length === 1 ? false : t('Selecione uma única escada.', 'Select a single stair.')),
  },
  stairTypes: {
    label: t('Tipos de escada', 'Stair Types'),
    icon: 'type',
    run: () => {
      const s = stairsIn(ctxNow())[0];
      if (s) useUi.setState({ dialog: 'stairType', dialogArg: s.typeId });
    },
    disabled: (c) => (stairsIn(c).length > 0 ? false : t('Selecione uma escada.', 'Select a stair.')),
  },
  rampTypes: {
    label: t('Tipos de rampa', 'Ramp Types'),
    icon: 'type',
    run: () => {
      const r = rampsIn(ctxNow())[0];
      if (r) useUi.setState({ dialog: 'rampType', dialogArg: r.typeId });
    },
    disabled: (c) => (rampsIn(c).length > 0 ? false : t('Selecione uma rampa.', 'Select a ramp.')),
  },
  wallTilt: {
    label: t('Inclinar', 'Tilt'),
    icon: 'slope',
    hint: t('Inclina as paredes selecionadas pelo ângulo digitado (positivo: topo à esquerda de a→b).', 'Tilts the selected walls by the typed angle (positive: top to the left of a→b).'),
    run: openDialog('wallTilt'),
    disabled: (c) => (wallsIn(c).length > 0 ? false : t('Selecione paredes primeiro.', 'Select walls first.')),
  },
  tiltFollow: {
    label: t('Acompanhar inclinação', 'Follow tilt'),
    icon: 'slope',
    hint: t('Aplica a inclinação da primeira parede selecionada a toda a cadeia de paredes contínuas (sinal por sentido a→b), num só desfazer.', 'Applies the first selected wall tilt to its whole chain of continuous walls (sign per a→b direction), in a single undo.'),
    run: () => {
      const erro = acompanharInclinacao(editor.store, useUi.getState().selection);
      if (erro) useUi.setState({ status: erro });
    },
    disabled: (c) => (wallsIn(c).length > 0 ? false : t('Selecione paredes primeiro.', 'Select walls first.')),
  },
  tiltWedge: {
    label: t('Cunha', 'Wedge'),
    icon: 'slope',
    hint: t('Fecha com um prisma o degrau entre paredes contínuas de inclinações diferentes (alterna com o degrau aberto).', 'Closes with a prism the step between continuous walls of different tilts (toggles with the open step).'),
    run: () => {
      const sel = useUi.getState().selection;
      const ref = editor.project.elements[sel.find((id) => isWall(editor.project.elements[id])) ?? ''];
      const j = isWall(ref) ? ref.joinEnd : undefined;
      const erro = definirTransicaoDaCadeia(editor.store, sel, !(j?.transicao === 'cunha'));
      if (erro) useUi.setState({ status: erro });
    },
    disabled: (c) => (wallsIn(c).length > 0 ? false : t('Selecione paredes primeiro.', 'Select walls first.')),
  },
  railingForHost: {
    label: t('Guarda-corpo da escada ou rampa', 'Railing for stair or ramp'),
    icon: 'railing',
    hint: t('Cria um guarda-corpo nos dois lados da escada ou rampa selecionada.', 'Creates a railing on both sides of the selected stair or ramp.'),
    run: () => {
      const c = ctxNow();
      const lang = useI18n.getState().lang;
      const host = c.selection.map((id) => c.p.elements[id]).find((e) => isStair(e) || isRamp(e));
      if (!host) return;
      const env = {
        project: () => editor.project,
        exec: (cmd: Parameters<typeof editor.store.exec>[0]) => editor.store.exec(cmd, translate(lang, 'gc6a_undo_create')),
        setSelection: (ids: Id[]) => useUi.setState({ selection: ids }),
      };
      const msgs = mensagensDeGuardaCorpo(lang);
      const r = isStair(host) ? criarGuardaCorpoDeEscada(env, host.id, msgs) : criarGuardaCorpoDeRampa(env, host.id, msgs);
      if ('error' in r) pedirAlerta(r.error);
    },
    disabled: (c) => (c.selection.some((id) => isStair(c.p.elements[id]) || isRamp(c.p.elements[id])) ? false : t('Selecione uma escada ou uma rampa.', 'Select a stair or a ramp.')),
  },
  terrenoPontos: {
    label: t('Colocar pontos', 'Place Points'),
    icon: 'terrPoints',
    hint: t('Cada clique coloca um ponto do terreno na cota do campo "Cota".', 'Each click places a terrain point at the elevation of the "Elevation" field.'),
    run: () => void ativarTopografia('pontos', editor),
  },
  terrenoCurvas: {
    label: t('Desenhar curvas', 'Draw Contours'),
    icon: 'terrContours',
    hint: t('Desenha curvas de nível; Enter conclui a curva e a cota avança pelo "Passo".', 'Draws contour lines; Enter finishes the curve and the elevation advances by the "Step".'),
    run: () => void ativarTopografia('curvas', editor),
  },
  regiaoSubdivisao: {
    label: t('Subdivisão', 'Subregion'),
    icon: 'terrSubregion',
    hint: t('Desenha um polígono sobre o terreno: divide a superfície e define o material e a permeabilidade.', 'Draws a polygon over the terrain: splits the surface and sets its material and permeability.'),
    run: () => ativarRegiao('subdivisao'),
    pressed: regiaoAtiva('subdivisao'),
    disabled: semTerrenoNoProjeto,
  },
  regiaoPlataforma: {
    label: t('Plataforma', 'Building Pad'),
    icon: 'terrPad',
    hint: t('Desenha um plano de cota fixa sobre o terreno (bordas verticais); corta e aterra o terreno existente.', 'Draws a flat pad at a fixed elevation over the terrain (vertical edges); cuts and fills the existing terrain.'),
    run: () => ativarRegiao('plataforma'),
    pressed: regiaoAtiva('plataforma'),
    disabled: semTerrenoNoProjeto,
  },
  regiaoPlataformaElemento: {
    label: t('Plataforma por elemento', 'Building Pad by Element'),
    icon: 'terrPadElem',
    hint: t('Clique numa laje ou piso: copia o contorno e usa a face inferior como cota da plataforma.', 'Click a slab or floor: copies its outline and uses its bottom face as the pad elevation.'),
    run: () => ativarRegiao('plataforma', true),
    pressed: regiaoAtiva('plataforma', true),
    disabled: semTerrenoNoProjeto,
  },
  regiaoNivelada: {
    label: t('Região nivelada', 'Graded Region'),
    icon: 'terrGraded',
    hint: t('Desenha um plano de cota fixa com taludes (1,5 de corte e 2 de aterro por padrão) sobre o terreno.', 'Draws a flat region at a fixed elevation with side slopes (1.5 cut and 2 fill by default) over the terrain.'),
    run: () => ativarRegiao('nivelada'),
    pressed: regiaoAtiva('nivelada'),
    disabled: semTerrenoNoProjeto,
  },
  loteDesenhar: {
    label: t('Desenhar', 'Draw'),
    icon: 'lotDraw',
    hint: t('Desenha o polígono do lote (linhas de propriedade); o primeiro lado desenhado é a frente.', 'Draws the lot polygon (property lines); the first side drawn is the front.'),
    run: () => editor.setTool('lot'),
    pressed: (c) => c.tool === 'lot',
  },
  lotePorTabela: {
    label: t('Por tabela…', 'From Table…'),
    icon: 'lotTable',
    hint: t('Cria o lote por uma tabela de azimutes e distâncias, com o erro de fechamento ao vivo.', 'Creates the lot from a table of azimuths and distances, with a live closing error.'),
    run: abrirLoteRumos,
  },
  indicesLote: {
    label: t('Índices do lote', 'Lot Indices'),
    icon: 'lotIndices',
    hint: t('Abre a tabela dos índices de cada lote (taxa de ocupação, coeficiente e permeabilidade) com os limites, a marca e exportação em CSV.', 'Opens the table of each lot\'s indices (site coverage, floor area ratio and permeability) with the limits, the mark and CSV export.'),
    run: abrirLoteSchedule,
  },
  importTerreno: {
    label: t('Importar levantamento…', 'Import Survey…'),
    icon: 'terrImport',
    hint: t('Cria o terreno a partir de um levantamento DXF ou CSV.', 'Creates the terrain from a DXF or CSV survey.'),
    run: abrirImportTerreno,
  },
  editTerreno: {
    label: t('Editar terreno', 'Edit Terrain'),
    icon: 'terrEdit',
    hint: t('Edita pontos, curvas, linhas de quebra e borda do terreno selecionado.', 'Edits points, contours, breaklines and boundary of the selected terrain.'),
    run: () => {
      const c = ctxNow();
      editarTerreno(c.p, c.selection, c.levelId, (id) => editor.setTool(id));
    },
  },
  localizacao: {
    label: t('Localização', 'Location'),
    icon: 'nav',
    hint: t('Coordenadas reais da origem, altitude da cota zero e norte verdadeiro do projeto.', 'Real coordinates of the origin, ground-zero altitude and true north of the project.'),
    run: abrirLocalizacao,
  },
  corteAterro: {
    label: t('Corte e aterro', 'Cut and Fill'),
    icon: 'terrCutFill',
    hint: t('Abre a tabela de volumes de corte e aterro por região e por terreno, com exportação em CSV.', 'Opens the cut and fill volume table per region and per terrain, with CSV export.'),
    run: abrirTerrenoSchedule,
  },
  mapaCorteAterro: {
    label: t('Mapa de corte e aterro', 'Cut and Fill Map'),
    icon: 'terrCutFillMap',
    hint: t('Pinta na planta o corte de vermelho e o aterro de azul.', 'Paints cut red and fill blue on the plan.'),
    run: () => {
      const ligar = !useUi.getState().mapaCorteAterro;
      definirMapaCorteAterro(ligar);
      useUi.setState((x) => ({ mapaCorteAterro: ligar, previewTick: x.previewTick + 1 }));
    },
    pressed: (c) => c.mapaCorteAterro,
  },
  schedColumns: sched(t('Tabela de pilares', 'Column Schedule'), 'columnSchedule'),
  schedBeams: sched(t('Tabela de vigas', 'Beam Schedule'), 'beamSchedule'),
  schedFootings: sched(t('Tabela de sapatas', 'Footing Schedule'), 'footingSchedule'),
  column: {
    label: t('Pilar', 'Column'),
    icon: 'column',
    hint: t('Insere um pilar estrutural no projeto.', 'Places a structural column in the project.'),
    run: () => editor.setTool('column'),
    disabled: (c) => (c.view === 'sheet' ? t('Não vale para pranchas.', 'Not available for sheets.') : false),
  },
  beam: {
    label: t('Viga', 'Beam'),
    icon: 'beam',
    hint: t('Desenha uma viga estrutural entre dois pontos.', 'Draws a structural beam between two points.'),
    run: () => editor.setTool('beam'),
    disabled: (c) => (c.view === 'sheet' ? t('Não vale para pranchas.', 'Not available for sheets.') : false),
  },
  footing: {
    label: t('Sapata', 'Footing'),
    icon: 'footing',
    hint: t('Insere uma sapata isolada sob um pilar ou livre no projeto.', 'Places an isolated footing under a column or free in the project.'),
    run: () => editor.setTool('footing'),
    disabled: (c) => (c.view === 'sheet' ? t('Não vale para pranchas.', 'Not available for sheets.') : false),
  },
  structuralEditType: {
    label: t('Editar tipo', 'Edit Type'),
    icon: 'type',
    hint: t('Abre o diálogo de propriedades de tipo da seleção estrutural.', 'Opens the type properties dialog for structural selection.'),
    run: () => {
      const d = typeDialogFor(ctxNow());
      if (d) useUi.setState({ dialog: d.dialog, dialogArg: d.arg });
    },
    disabled: (c) => (typeDialogFor(c) ? false : t('Selecione um elemento com tipo, ou ative uma ferramenta de criação.', 'Select an element with a type.')),
  },
  structuralRotate90: {
    label: t('Girar 90°', 'Rotate 90°'),
    icon: 'rotate',
    hint: t('Gira 90 graus a rotação do pilar ou sapata (na colocação ou nos selecionados).', 'Rotates column or footing by 90 degrees.'),
    run: () => {
      const c = ctxNow();
      if (c.tool === 'column') {
        const cur = c.options.columnRotation ?? 0;
        useUi.setState((s) => ({ options: { ...s.options, columnRotation: (cur + Math.PI / 2) % (2 * Math.PI) } }));
        return;
      }
      if (c.tool === 'footing') {
        const cur = c.options.footingRotation ?? 0;
        useUi.setState((s) => ({ options: { ...s.options, footingRotation: (cur + Math.PI / 2) % (2 * Math.PI) } }));
        return;
      }
      const cols = c.selection.map((id) => c.p.elements[id]).filter(isColumn);
      const fts = c.selection.map((id) => c.p.elements[id]).filter(isFooting);
      for (const col of cols) {
        editor.store.exec({ type: 'updateElements', ids: [col.id], patch: { rotation: (col.rotation + Math.PI / 2) % (2 * Math.PI) } });
      }
      for (const ft of fts) {
        editor.store.exec({ type: 'updateElements', ids: [ft.id], patch: { rotation: (ft.rotation + Math.PI / 2) % (2 * Math.PI) } });
      }
    },
    disabled: (c) => {
      if (c.tool === 'column' || c.tool === 'footing') return false;
      const hasStructural = c.selection.some((id) => {
        const el = c.p.elements[id];
        return isColumn(el) || isFooting(el);
      });
      return hasStructural ? false : t('Selecione pilares ou sapatas para girar.', 'Select columns or footings to rotate.');
    },
  },
  footingAtColumns: {
    label: t('Nos pilares', 'At Columns'),
    icon: 'footing',
    hint: t('Insere sapatas isoladas alinhadas aos pilares do nível ativo.', 'Places isolated footings aligned to columns on the active level.'),
    run: () => {
      const c = ctxNow();
      const selectedColIds = c.selection.filter((id) => isColumn(c.p.elements[id]));
      const env = {
        project: () => editor.project,
        levelId: () => useUi.getState().levelId,
        options: () => useUi.getState().options,
        transaction: (label: string, fn: () => void) => editor.store.transaction(label, fn),
        exec: (cmd: Parameters<typeof editor.store.exec>[0]) => editor.store.exec(cmd),
        setSelection: (ids: Id[]) => useUi.setState({ selection: ids }),
        say: (msg: string) => useUi.setState({ status: msg }),
      } as unknown as ToolEnv;
      placeFootingsAtColumns(env, selectedColIds.length > 0 ? selectedColIds : undefined);
    },
  },
  paintFace3d: {
    label: t('Pintar face (3D)', 'Paint Face (3D)'),
    icon: 'paintBucket',
    hint: t('Ativa a pintura de faces diretamente na vista 3D (Shift+clique abre o Estúdio 2D).', 'Activates direct face painting in the 3D view (Shift+click opens the 2D Studio).'),
    run: () => {
      const cur = useUi.getState();
      const nextActive = !(cur.view === '3d' && cur.facePaint.active && cur.facePaint.mode === 'paint');
      if (nextActive && cur.view !== '3d') activateView({ kind: '3d' });
      editor.setTool('select');
      useUi.setState((s) => ({
        facePaint: { ...s.facePaint, active: nextActive, mode: 'paint', hoverHit: null },
      }));
    },
    pressed: (c) => c.view === '3d' && c.facePaintActive === true && c.facePaintMode === 'paint',
  },
  openFaceStudio: {
    label: t('Estúdio da face (2D)', 'Face Studio (2D)'),
    icon: 'faceStudio',
    hint: t('Ativa a escolha de face no 3D para abrir o Estúdio da Face (2D).', 'Activates face picking in 3D to open the Face Studio (2D).'),
    run: () => {
      const cur = useUi.getState();
      const nextActive = !(cur.view === '3d' && cur.facePaint.active && cur.facePaint.mode === 'studioPick');
      if (nextActive && cur.view !== '3d') activateView({ kind: '3d' });
      editor.setTool('select');
      useUi.setState((s) => ({
        facePaint: { ...s.facePaint, active: nextActive, mode: nextActive ? 'studioPick' : 'paint', hoverHit: null },
        status: nextActive ? translate(useI18n.getState().lang, 'pro_fp_studio_pick_hint') : { key: 'eds_ready' },
      }));
    },
    pressed: (c) => c.view === '3d' && c.facePaintActive === true && c.facePaintMode === 'studioPick',
  },
};

/** Contexto lido na hora do clique (os `run` nunca usam o valor de um render antigo). */
export function ctxNow(): RibbonCtx {
  const s = useUi.getState();
  const perim = editor.perimetro.view();
  return {
    tool: s.tool, selection: s.selection, view: s.view, planKind: s.planKind, areaPlanId: s.areaPlanId, levelId: s.levelId,
    showGrid: s.showGrid, showUnderlay: s.showUnderlay,
    showRoofProjection: s.showRoofProjection, mapaCorteAterro: s.mapaCorteAterro, propsOpen: s.propsOpen, browserOpen: s.browserOpen, sides: s.dock.sides, options: s.options, p: editor.project,
    facePaintActive: s.facePaint.active,
    facePaintMode: s.facePaint.mode,
    perimetro: perim.active ? { modify: perim.modify, selecting: perim.selecting === true } : null,
  };
}
