/* eslint-disable max-lines */
import { applyTransform, type Transform, type Vec2 } from '@hestia/geom';
import {
  isOpening,
  isCeiling,
  isFloor,
  isSlab,
  isRoof,
  isStair,
  isRamp,
  isWall,
  isRoom,
  isGeneric,
  type Ceiling,
  type CeilingType,
  type Element,
  type Floor,
  type FloorType,
  type Generic,
  type Slab,
  type Roof,
  type RoofType,
  type SlabType,
  type Id,
  type Room,
  type Stair,
  type StairLanding,
  type StairRun,
  type StairType,
  type Ramp,
  type RampType,
  type JoinConfig,
  type Level,
  type Material,
  type Opening,
  type OpeningType,
  type Project,
  type SectionView,
  type ViewHiddenTarget,
  type Wall,
  type WallType,
} from './types.ts';
import { splitWall } from './splitWall.ts';
import { setOpeningHost } from './openingHost.ts';
import { changesWallEnds, clampOffset, rehostOpenings, wallEndsPatchOf, type WallEndsPatch } from './hostedOffset.ts';
import { applyElementLevel, hasLevel, type SetElementLevel } from './elementLevel.ts';
import { transformStair } from './stairTransform.ts';
import { transformRamp } from './rampTransform.ts';
import { transformCad, transformCeiling, transformFloor, transformRoof, transformSlab } from './transformPlanar.ts';
import { isCad, type CadDrawing } from './cad.ts';
import { stairTypeIssue } from './stair.ts';
import { rampTypeIssue } from './ramp.ts';
import { openingTypeIssue, toggleFavoriteIn } from './opening.ts';
import { withBridgedComposition } from './openingCompositionOf.ts';
import { comTerminoValido } from './termino.ts';
import { viewRangeIssues, type ViewRange } from './viewRange.ts';
import type { DxfLayerStyle } from './dxfLayerStyle.ts';
import type { DimensionStyle } from './dimensionContract.ts';
import { dimensionFamilyIssue, dimensionFamiliesOf, removeDimensionFamilyFrom, writeDimensionFamily, type DimensionFamily } from './dimensionFamily.ts';
import type { DeepPartial, ProjectGraphics, View3DSettings, ViewGraphics, ViewHidden } from './graphics.ts';
import { applyViewHidden } from './viewHiddenCommands.ts';
import { applySectionAnnotations } from './sectionAnnotationCommands.ts';
import type { SectionAnnotations } from './sectionAnnotations.ts';
import { applySectionLevelExtent, type SectionLevelExtent } from './sectionLevelExtents.ts';
import {
  applyLevelGraphics,
  applyProjectGraphics,
  applySectionGraphics,
  applyView3D,
  resetLevelGraphics,
  resetSectionGraphics,
  resetView3D,
} from './graphicsCommands.ts';

import { newId } from './ids.ts';
import { applyAnnotationCommand, type AnnotationCommand } from './annotations.ts';
import { applySheetCommand, dropOrphanViewports, type SheetCommand } from './sheetCommands.ts';
import { applyPluginDataCommand, type PluginDataCommand } from './pluginData.ts';
import { applyView3DPointCommand, type View3DPointCommand } from './view3dPoints.ts';
import { applyGridCommand, type GridCommand } from './grid.ts';
import { applyViewCommand } from './viewCommands.ts';
import { applyCeilingCommand } from './ceilingCommands.ts';
import { applyGuardaCorpoCommand } from './guardaCorpoCommands.ts';
import { applyEstruturaCommand, transformarEstrutura } from './columnCommands.ts';
import type { Beam, BeamType, Column, ColumnType, Footing, FootingType } from './estrTypes.ts';
import { applyCurtainCommand, prepararTipoParede } from './curtainCommands.ts';
import type { AddedGridLine, CellOpeningPatch, CurtainHost, CurtainPanelType, LineRef, MullionType } from './wallCurtainTypes.ts';
import { ajustarCortinasAlteradas, dimensoesCortinas } from './curtainRemap.ts';
import { applyCurtainOpeningCommand } from './curtainOpeningCommands.ts';
import { applyCurtainHostCommand, sincronizarCortinasEmbutidas, temCortinaEmbutida, transformarHospedados } from './curtainHost.ts';
import { transformarGuardaCorpos } from './guardaCorpoTransform.ts';
import type { GuardaCorpo, TipoGuardaCorpo } from './guardaCorpoTypes.ts';
import type { PerfilNorma } from './guardaCorpoNorma.ts';
import { applyRoomCommand } from './roomCommands.ts';
import { applyOutlineCommand } from './outlineCommands.ts';
import { applyCopyLinkCommand } from './copyLinkCommands.ts';
import type { CopyLink } from './copyLink.ts';
import { applyAreaPlanCommand, dropAreaPlansOfLevel, dropRoomTags, prunePlanElementTags } from './areaPlanCommands.ts';
import type { AreaPlan, ColorScheme, RoomCategory, RoomTag } from './areaPlan.ts';
import type { Lang } from './i18n.ts';
import { t } from './i18n.ts';

/** Comando = dados serializáveis. A única forma de escrever no modelo (docs/01 §5). */
export type Command =
  | { type: 'addWall'; wall: Omit<Wall, 'order'> }
  | { type: 'addCadDrawing'; cad: Omit<CadDrawing, 'order'> }
  | { type: 'updateCadDrawing'; id: Id; patch: Partial<Pick<CadDrawing, 'name' | 'visible' | 'offsetZ'>> }
  | { type: 'addGeneric'; generic: Omit<Generic, 'order'> }
  | { type: 'updateGeneric'; id: Id; patch: Partial<Omit<Generic, 'id' | 'kind' | 'order'>> }
  | { type: 'addCopyLink'; link: CopyLink }
  | { type: 'deleteCopyLink'; id: Id }
  | { type: 'addOpening'; opening: Opening }
  | { type: 'addFloor'; floor: Omit<Floor, 'order'> }
  | { type: 'addSlab'; slab: Omit<Slab, 'order'> }
  | { type: 'addRoof'; roof: Omit<Roof, 'order'> }
  | { type: 'addCeiling'; ceiling: Omit<Ceiling, 'order'> }
  | { type: 'addCeilings'; ceilings: Omit<Ceiling, 'order'>[] }
  | { type: 'updateCeiling'; id: Id; patch: Partial<Omit<Ceiling, 'id' | 'kind' | 'order'>> }
  | { type: 'removeCeiling'; id: Id }
  | { type: 'upsertCeilingType'; ceilingType: CeilingType }
  | { type: 'deleteCeilingType'; id: Id }
  | { type: 'duplicateCeilingType'; id: Id; newId: Id; name: string }
  | { type: 'addRoom'; room: Omit<Room, 'order'> }
  | { type: 'updateRoom'; id: Id; patch: Partial<Omit<Room, 'id' | 'kind' | 'order'>> }
  | { type: 'removeRoom'; id: Id }
  | { type: 'upsertRoofType'; roofType: RoofType }
  | { type: 'deleteRoofType'; id: Id }
  | { type: 'addStair'; stair: Omit<Stair, 'order'> }
  | { type: 'upsertStairType'; stairType: StairType }
  | { type: 'deleteStairType'; id: Id }
  | { type: 'addRamp'; ramp: Omit<Ramp, 'order'> } | { type: 'upsertRampType'; rampType: RampType } | { type: 'deleteRampType'; id: Id }
  // Guarda-corpo (decisão 0055 §4.4): tratados em guardaCorpoCommands.ts.
  | { type: 'addGuardaCorpo'; guardaCorpo: Omit<GuardaCorpo, 'order'> }
  | { type: 'updateGuardaCorpo'; id: Id; patch: Partial<Omit<GuardaCorpo, 'id' | 'kind' | 'order'>> }
  | { type: 'deleteGuardaCorpo'; id: Id }
  | { type: 'upsertTipoGuardaCorpo'; tipo: TipoGuardaCorpo }
  | { type: 'deleteTipoGuardaCorpo'; id: Id }
  | { type: 'upsertPerfilNorma'; perfil: PerfilNorma }
  | { type: 'deletePerfilNorma'; id: Id }
  | { type: 'setNormaGuardaCorpo'; id: Id }
  // Estrutura (A.3): tratados em columnCommands.ts, beamCommands.ts e footingCommands.ts; apagar usa `deleteElements`.
  | { type: 'addColumn'; column: Omit<Column, 'order'> }
  | { type: 'updateColumn'; id: Id; patch: Partial<Omit<Column, 'id' | 'kind' | 'order'>> }
  | { type: 'setColumnType'; ids: Id[]; typeId: Id }
  | { type: 'upsertColumnType'; columnType: ColumnType }
  | { type: 'deleteColumnType'; id: Id }
  | { type: 'addBeam'; beam: Omit<Beam, 'order'> }
  | { type: 'updateBeam'; id: Id; patch: Partial<Omit<Beam, 'id' | 'kind' | 'order'>> }
  | { type: 'setBeamType'; ids: Id[]; typeId: Id }
  | { type: 'upsertBeamType'; beamType: BeamType }
  | { type: 'deleteBeamType'; id: Id }
  | { type: 'addFooting'; footing: Omit<Footing, 'order'> }
  | { type: 'updateFooting'; id: Id; patch: Partial<Omit<Footing, 'id' | 'kind' | 'order'>> }
  | { type: 'setFootingType'; ids: Id[]; typeId: Id }
  | { type: 'upsertFootingType'; footingType: FootingType }
  | { type: 'deleteFootingType'; id: Id }
  | { type: 'upsertSlabType'; slabType: SlabType }
  | { type: 'deleteSlabType'; id: Id }
  | { type: 'upsertFloorType'; floorType: FloorType }
  | { type: 'deleteFloorType'; id: Id }
  | { type: 'updateElements'; ids: Id[]; patch: Partial<Wall> | Partial<Opening> | Partial<Floor> | Partial<Slab> | Partial<Ceiling> | Partial<Roof> | Partial<Stair> | Partial<Ramp> | Partial<Room> }
  | { type: 'detachOutline'; id: Id }
  | { type: 'relinkOutline'; id: Id }
  | { type: 'detachCeilingRoom'; id: Id }
  | { type: 'relinkCeilingRoom'; id: Id; roomId: Id }
  | { type: 'setWallEnds'; id: Id; a?: Vec2; b?: Vec2 }
  | { type: 'setJoin'; ends: Array<{ wallId: Id; end: 'a' | 'b' }>; config: JoinConfig }
  | { type: 'transform'; ids: Id[]; transform: Transform; copy?: { idMap: Record<Id, Id> } }
  | { type: 'splitWall'; id: Id; newId: Id; t: number; gap?: number; idMap?: Record<Id, Id> }
  | { type: 'deleteElements'; ids: Id[] }
  | { type: 'upsertWallType'; wallType: WallType }
  | { type: 'deleteWallType'; id: Id }
  // Parede cortina (decisão 0056, §4.7): tratados em curtainCommands.ts.
  | { type: 'upsertMullionType'; mullionType: MullionType }
  | { type: 'deleteMullionType'; id: Id }
  | { type: 'upsertCurtainPanelType'; panelType: CurtainPanelType }
  | { type: 'deleteCurtainPanelType'; id: Id }
  // Parede cortina, fase 2 (§4.7): linhas, segmentos, painéis de célula e normalização (curtainCommands.ts).
  | { type: 'addGridLine'; wallId: Id; line: AddedGridLine }
  | { type: 'moveGridLine'; wallId: Id; line: LineRef; pos: number }
  | { type: 'lockGridLine'; wallId: Id; line: LineRef; locked: boolean }
  | { type: 'removeGridLine'; wallId: Id; line: LineRef }
  | { type: 'removeSegment'; wallId: Id; line: LineRef; k: number }
  | { type: 'restoreSegment'; wallId: Id; line: LineRef; k: number }
  | { type: 'setLineMullion'; wallId: Id; line: LineRef; mullionTypeId: Id | null }
  | { type: 'clearLineOverride'; wallId: Id; line: LineRef }
  | { type: 'setCellPanel'; wallId: Id; i: number; j: number; panelTypeId: Id }
  | { type: 'clearCellOverride'; wallId: Id; i: number; j: number }
  | { type: 'normalizarSobrescritas'; wallId?: Id }
  // Parede cortina, fase 5 (§7, §8): esquadria na célula e cortina embutida (curtainOpeningCommands.ts, curtainHost.ts).
  | { type: 'setCellOpening'; wallId: Id; i: number; j: number; openingTypeId: Id; flipHand: boolean; flipFacing: boolean; mark: string; fit: 'cell' | 'grid'; align?: 'center' | 'start' | 'end'; fundir: boolean }
  | { type: 'updateCellOpening'; wallId: Id; i: number; j: number; patch: CellOpeningPatch }
  | { type: 'removeCellOpening'; wallId: Id; i: number; j: number }
  | { type: 'setCurtainHost'; wallId: Id; host: CurtainHost }
  | { type: 'clearCurtainHost'; wallId: Id }
  | { type: 'upsertMaterial'; material: Material }
  | { type: 'upsertOpeningType'; openingType: OpeningType }
  | { type: 'upsertLevel'; level: Level }
  | AnnotationCommand
  | SheetCommand
  | View3DPointCommand
  | PluginDataCommand
  | GridCommand
  | { type: 'deleteLevel'; id: Id }
  | { type: 'setLevelViewRange'; levelId: Id; patch: Partial<ViewRange> }
  | { type: 'setProjectGraphics'; patch: DeepPartial<ProjectGraphics> }
  | { type: 'setLevelGraphics'; levelId: Id; patch: DeepPartial<ViewGraphics> }
  | { type: 'resetLevelGraphics'; levelId: Id }
  | { type: 'setView3D'; patch: DeepPartial<View3DSettings> }
  | { type: 'resetView3D' }
  | { type: 'setViewHidden'; target: ViewHiddenTarget; hidden: ViewHidden | undefined }
  | { type: 'setSectionAnnotations'; sectionId: Id; annotations: SectionAnnotations | undefined }
  | { type: 'setSectionLevelExtent'; sectionId: Id; levelId: Id; extent: SectionLevelExtent | undefined }
  | { type: 'setSectionGraphics'; patch: DeepPartial<ViewGraphics> }
  | { type: 'resetSectionGraphics' }
  | { type: 'setProjectName'; name: string }
  | { type: 'setDefaults'; patch: Partial<Project['defaults']> }
  | { type: 'setSettings'; patch: Partial<Project['settings']> }
  | { type: 'setDimensionStyle'; patch: Partial<DimensionStyle> }
  | { type: 'upsertDimensionFamily'; family: DimensionFamily }
  | { type: 'removeDimensionFamily'; id: Id }
  | { type: 'setDefaultDimensionFamily'; id: Id }
  | { type: 'setDxfLayerStyle'; layer: string; style: DxfLayerStyle }
  | { type: 'resetDxfLayers' }
  | { type: 'toggleOpeningFavorite'; id: Id }
  | { type: 'addView'; view: SectionView }
  | { type: 'updateView'; id: Id; patch: Partial<Omit<SectionView, 'id'>> }
  | { type: 'deleteView'; id: Id }
  | { type: 'batch'; commands: Command[] }
  | { type: 'setOpeningHost'; id: Id; hostId: Id; offset: number }
  | { type: 'addAreaPlan'; plan: AreaPlan }
  | { type: 'updateAreaPlan'; id: Id; patch: Partial<Omit<AreaPlan, 'id' | 'tags'>> }
  | { type: 'removeAreaPlan'; id: Id }
  | { type: 'addRoomTag'; planId: Id; tag: RoomTag }
  | { type: 'updateRoomTag'; planId: Id; id: Id; patch: Partial<Omit<RoomTag, 'id' | 'planId' | 'roomId'>> }
  | { type: 'removeRoomTag'; planId: Id; id: Id }
  | { type: 'setRoomReference'; id: Id; point: Vec2 | null }
  | { type: 'setRoomLabel'; id: Id; position: Vec2 | null; rotation?: number; leader?: 'auto' | 'none' | 'straight' | 'kinked' | 'crossed' }
  | { type: 'upsertRoomCategory'; category: RoomCategory }
  | { type: 'removeRoomCategory'; id: Id }
  | { type: 'upsertColorScheme'; scheme: ColorScheme }
  | { type: 'removeColorScheme'; id: Id }
  | ({ type: 'setElementLevel' } & SetElementLevel);
function transformWall(w: Wall, t: Transform): Wall {
  const a = applyTransform(t, w.a);
  const b = applyTransform(t, w.b);
  // Espelhar inverte o lado externo: sem trocar `flipped` a pilha de camadas sairia do lado errado.
  // Espelhar também inverte o lado para o qual o arco abaulava.
  return { ...w, a, b, flipped: t.kind === 'mirror' ? !w.flipped : w.flipped, sag: t.kind === 'mirror' ? -w.sag : w.sag };
}

function removeIds(p: Project, ids: Id[]): void {
  const doomed = new Set(ids);
  for (const e of Object.values(p.elements)) if (isOpening(e) && doomed.has(e.hostId)) doomed.add(e.id);
  for (const id of doomed) delete p.elements[id];
}
/**
 * Ids novos dos componentes do croqui na cópia, com os mesmos prefixos do Copiar/Colar (escada 'r'/'p', rampa 'rc').
 * Sem isso a cópia repetiria os ids dos lances/patamares e a edição do croqui acertaria o elemento original.
 * Só roda no caminho com `idMap` (cópia): mover/girar/espelhar mantém os componentes como estão.
 */
function remintComponents<E extends Stair | Ramp>(e: E, mint: (prefix: string) => Id): E {
  const prefix = e.kind === 'stair' ? (c: StairRun | StairLanding): string => (c.kind === 'run' ? 'r' : 'p') : (): string => 'rc';
  return { ...e, components: e.components.map((c) => ({ ...c, id: mint(prefix(c)) })) };
}

/** Move/gira/espelha cada elemento do tipo pedido (mesmo padrão para piso, laje, telhado, escada e ambiente). */
function transformEach<E extends Element>(
  p: Project,
  c: Extract<Command, { type: 'transform' }>,
  pred: (e: Element | undefined) => e is E,
  map: (e: E, t: Transform) => E,
  /** Ajuste só da cópia (ex.: ids novos dos componentes do croqui); a transformação sem cópia não passa por aqui. */
  onCopy?: (e: E) => E,
): void {
  const idMap = c.copy?.idMap;
  for (const e of c.ids.map((id) => p.elements[id]).filter(pred)) {
    const next = map(e, c.transform);
    if (idMap) {
      const nid = idMap[e.id];
      if (nid) p.elements[nid] = { ...(onCopy ? onCopy(next) : next), id: nid, order: p.nextOrder++ } as E;
    } else {
      p.elements[e.id] = next;
    }
  }
}

function applyTransformCmd(p: Project, c: Extract<Command, { type: 'transform' }>): void {
  const idMap = c.copy?.idMap;
  transformEach(p, c, isRoof, transformRoof);
  transformEach(p, c, isStair, transformStair, (s) => remintComponents(s, (prefix) => newId(prefix)));
  transformEach(p, c, isRamp, transformRamp, (r) => remintComponents(r, (prefix) => newId(prefix)));
  transformEach(p, c, isSlab, (s, t) => transformSlab(s, t, !!c.copy?.idMap));
  transformEach(p, c, isCad, (cad, t) => transformCad(cad, t, !!c.copy?.idMap));
  transformEach(p, c, isFloor, (f, t) => transformFloor(f, t, !!c.copy?.idMap));
  transformEach(p, c, isCeiling, (f, t) => transformCeiling(f, t, !!c.copy?.idMap));
  transformEach(p, c, isRoom, (r, t) => ({
    ...r,
    point: applyTransform(t, r.point),
    ...(r.referencePoint ? { referencePoint: applyTransform(t, r.referencePoint) } : {}),
    ...(r.labelPosition ? { labelPosition: applyTransform(t, r.labelPosition) } : {}),
    ...(r.labelRotation !== undefined || t.kind === 'rotate' || t.kind === 'mirror'
      ? { labelRotation: t.kind === 'mirror' ? -(r.labelRotation ?? 0) : (r.labelRotation ?? 0) + (t.kind === 'rotate' ? (t.angle * 180) / Math.PI : 0) }
      : {}),
  }));
  transformarGuardaCorpos(p, c);
  transformarEstrutura(p, c);
  const walls = c.ids.map((id) => p.elements[id]).filter(isWall);
  const wallIds = new Set(walls.map((w) => w.id));
  for (const w of walls) {
    const next = transformWall(w, c.transform);
    if (idMap) {
      const nid = idMap[w.id];
      if (!nid) continue;
      p.elements[nid] = { ...next, id: nid, order: p.nextOrder++ };
    } else {
      p.elements[w.id] = next;
    }
  }
  // Cortina embutida (§8.4, regra 3): acompanha o hospedeiro (espelho inverte o offset; cópia leva a cortina junto).
  transformarHospedados(p, c.transform.kind === 'mirror', c.ids, idMap);
  if (!idMap) {
    // Espelhar troca a face para onde a folha abre (`flipFacing`); a mão da dobradiça (`flipHand`) fica.
    // Só as aberturas das paredes realmente transformadas mudam.
    if (c.transform.kind === 'mirror') {
      for (const o of Object.values(p.elements).filter(isOpening)) {
        if (!wallIds.has(o.hostId)) continue;
        p.elements[o.id] = { ...o, flipFacing: !o.flipFacing };
      }
    }
    return;
  }
  // Cópia: leva as aberturas hospedadas junto, no mesmo deslocamento.
  for (const w of walls) {
    const nw = idMap[w.id];
    if (!nw) continue;
    for (const o of Object.values(p.elements).filter(isOpening)) {
      if (o.hostId !== w.id) continue;
      const nid = idMap[o.id];
      if (!nid) continue;
      p.elements[nid] = { ...o, id: nid, hostId: nw, flipHand: o.flipHand, flipFacing: c.transform.kind === 'mirror' ? !o.flipFacing : o.flipFacing };
    }
  }
}

/** Comandos que podem mudar o comprimento ou a altura de uma parede cortina (§4.9: aparar, estender, altura, nível). */
const COMANDOS_DE_GEOMETRIA = new Set<Command['type']>(['setWallEnds', 'updateElements', 'setElementLevel', 'upsertLevel', 'deleteLevel']);

/**
 * Aplica um comando ao projeto (único ponto de escrita, docs/01 §5). Depois de um comando que muda L ou H de uma
 * parede cortina, as sobrescritas são remapeadas e regravadas no mesmo passo de desfazer (decisão 0056, §4.4).
 */
export function applyCommand(p: Project, c: Command, lang: Lang = 'pt'): void {
  // Cortina embutida (§8.1): depois de qualquer comando, a posição da cortina volta a vir do hospedeiro (e as órfãs de
  // hospedeiro apagado são promovidas). Sem cortina embutida, o caminho é o de sempre.
  if (!COMANDOS_DE_GEOMETRIA.has(c.type) && !temCortinaEmbutida(p)) {
    applyCommandBase(p, c, lang);
    return;
  }
  const antes = dimensoesCortinas(p);
  applyCommandBase(p, c, lang);
  sincronizarCortinasEmbutidas(p);
  if (antes.size > 0) ajustarCortinasAlteradas(p, antes);
}

function applyCommandBase(p: Project, c: Command, lang: Lang): void {
  if (applyCeilingCommand(p, c, lang) || applyRoomCommand(p, c, lang) || applyAreaPlanCommand(p, c, lang) || applyOutlineCommand(p, c, lang) || applyCopyLinkCommand(p, c) || applyGuardaCorpoCommand(p, c, lang) || applyEstruturaCommand(p, c, lang) || applyCurtainCommand(p, c, lang) || applyCurtainOpeningCommand(p, c, lang) || applyCurtainHostCommand(p, c, lang)) return;
  switch (c.type) {
    case 'addWall':
      p.elements[c.wall.id] = { ...c.wall, order: p.nextOrder++ };
      break;
    case 'addCadDrawing':
      p.elements[c.cad.id] = { ...c.cad, order: p.nextOrder++ };
      break;
    case 'updateCadDrawing': {
      const e = p.elements[c.id];
      if (!isCad(e)) throw new Error(t(lang, 'md_cmd_not_cad', { id: c.id }));
      p.elements[c.id] = { ...e, ...c.patch };
      break;
    }
    case 'addGeneric':
      p.elements[c.generic.id] = { ...c.generic, order: p.nextOrder++ };
      break;
    case 'updateGeneric': {
      const e = p.elements[c.id];
      if (!isGeneric(e)) throw new Error(t(lang, 'md_cmd_generic_missing', { id: c.id }));
      p.elements[c.id] = { ...e, ...c.patch };
      break;
    }
    case 'addFloor': {
      if (c.floor.boundary.length < 3) throw new Error(t(lang, 'md_cmd_floor_min_points'));
      if (!p.floorTypes[c.floor.typeId]) throw new Error(t(lang, 'md_cmd_floor_type_missing'));
      p.elements[c.floor.id] = { ...c.floor, order: p.nextOrder++ };
      break;
    }
    case 'upsertFloorType': p.floorTypes[c.floorType.id] = comTerminoValido(c.floorType); break;
    case 'deleteFloorType': {
      if (Object.values(p.elements).some((e) => isFloor(e) && e.typeId === c.id)) throw new Error(t(lang, 'md_cmd_type_in_use'));
      if (Object.keys(p.floorTypes).length <= 1) throw new Error(t(lang, 'md_cmd_last_floor_type'));
      delete p.floorTypes[c.id];
      break;
    }
    case 'addSlab': {
      if (c.slab.boundary.length < 3) throw new Error(t(lang, 'md_cmd_slab_min_points'));
      if (!p.slabTypes[c.slab.typeId]) throw new Error(t(lang, 'md_cmd_slab_type_missing'));
      p.elements[c.slab.id] = { ...c.slab, order: p.nextOrder++ };
      break;
    }
    case 'upsertSlabType': p.slabTypes[c.slabType.id] = comTerminoValido(c.slabType); break;
    case 'deleteSlabType': {
      if (Object.values(p.elements).some((e) => isSlab(e) && e.typeId === c.id)) throw new Error(t(lang, 'md_cmd_type_in_use'));
      if (Object.keys(p.slabTypes).length <= 1) throw new Error(t(lang, 'md_cmd_last_slab_type'));
      delete p.slabTypes[c.id];
      break;
    }
    case 'addRoof': {
      if (c.roof.boundary.length < 3) throw new Error(t(lang, 'md_cmd_roof_min_points'));
      if (!p.roofTypes[c.roof.typeId]) throw new Error(t(lang, 'md_cmd_roof_type_missing'));
      p.elements[c.roof.id] = { ...c.roof, order: p.nextOrder++ };
      break;
    }
    case 'upsertRoofType':
      p.roofTypes[c.roofType.id] = c.roofType;
      break;
    case 'deleteRoofType': {
      if (Object.values(p.elements).some((e) => isRoof(e) && e.typeId === c.id)) throw new Error(t(lang, 'md_cmd_type_in_use'));
      if (Object.keys(p.roofTypes).length <= 1) throw new Error(t(lang, 'md_cmd_last_roof_type'));
      delete p.roofTypes[c.id];
      break;
    }
    case 'addStair': {
      if (!p.stairTypes[c.stair.typeId]) throw new Error(t(lang, 'md_cmd_stair_type_missing'));
      p.elements[c.stair.id] = { ...c.stair, order: p.nextOrder++ };
      break;
    }
    case 'upsertStairType': {
      const issue = stairTypeIssue(c.stairType, lang);
      if (issue) throw new Error(issue);
      p.stairTypes[c.stairType.id] = c.stairType;
      break;
    }
    case 'deleteStairType': {
      if (Object.values(p.elements).some((e) => isStair(e) && e.typeId === c.id)) throw new Error(t(lang, 'md_cmd_type_in_use'));
      if (Object.keys(p.stairTypes).length <= 1) throw new Error(t(lang, 'md_cmd_last_stair_type'));
      delete p.stairTypes[c.id];
      break;
    }
    case 'addRamp':
      if (!p.rampTypes[c.ramp.typeId]) throw new Error(t(lang, 'md_cmd_ramp_type_missing'));
      p.elements[c.ramp.id] = { ...c.ramp, order: p.nextOrder++ }; break;
    case 'upsertRampType': {
      const issue = rampTypeIssue(c.rampType, lang);
      if (issue) throw new Error(issue);
      p.rampTypes[c.rampType.id] = c.rampType; break;
    }
    case 'deleteRampType':
      if (Object.values(p.elements).some((e) => isRamp(e) && e.typeId === c.id)) throw new Error(t(lang, 'md_cmd_type_in_use'));
      if (Object.keys(p.rampTypes).length <= 1) throw new Error(t(lang, 'md_cmd_last_ramp_type'));
      delete p.rampTypes[c.id]; break;
    case 'addOpening': {
      const host = p.elements[c.opening.hostId];
      if (!isWall(host)) throw new Error(t(lang, 'md_cmd_opening_host_required'));
      p.elements[c.opening.id] = { ...c.opening, offset: clampOffset(p, c.opening, host) };
      break;
    }
    case 'updateElements': {
      const ends = wallEndsPatchOf(c.patch as Partial<Wall>);
      const movesEnds = changesWallEnds(c.patch as Partial<Wall>);
      for (const id of c.ids) {
        const e = p.elements[id];
        if (!e) continue;
        if (movesEnds && isWall(e)) {
          const next = { ...e, ...c.patch } as Wall;
          rehostOpenings(p, e, next, ends);
          p.elements[id] = next;
          continue;
        }
        p.elements[id] = { ...e, ...c.patch } as Element;
      }
      for (const id of c.ids) {
        const e = p.elements[id];
        if (isOpening(e)) {
          const host = p.elements[e.hostId];
          if (isWall(host)) e.offset = clampOffset(p, e, host);
        }
      }
      break;
    }
    case 'setWallEnds': {
      const w = p.elements[c.id];
      if (!isWall(w)) break;
      const patch: WallEndsPatch = {};
      if (c.a) patch.a = c.a;
      if (c.b) patch.b = c.b;
      const next = { ...w, ...patch };
      rehostOpenings(p, w, next, patch);
      w.a = next.a;
      w.b = next.b;
      break;
    }
    case 'setJoin':
      for (const e of c.ends) {
        const w = p.elements[e.wallId];
        if (!isWall(w)) continue;
        if (e.end === 'a') w.joinStart = { ...c.config };
        else w.joinEnd = { ...c.config };
      }
      break;
    case 'transform':
      applyTransformCmd(p, c);
      break;
    case 'splitWall':
      splitWall(p, c, lang);
      for (const level of p.levels) if (level.tags?.length) level.tags = level.tags.filter((tag) => Boolean(p.elements[tag.hostId]));
      prunePlanElementTags(p);
      break;
    case 'deleteElements':
      removeIds(p, c.ids);
      dropRoomTags(p, c.ids);
      for (const level of p.levels) if (level.tags?.length) level.tags = level.tags.filter((tag) => !c.ids.includes(tag.hostId));
      prunePlanElementTags(p);
      break;
    case 'upsertWallType':
      // Decisão 0056 §4.1/§4.7: família fixada, camada-sombra da cortina regravada e tipo validado.
      p.wallTypes[c.wallType.id] = prepararTipoParede(p, c.wallType, lang);
      break;
    case 'deleteWallType': {
      if (Object.values(p.elements).some((e) => isWall(e) && e.typeId === c.id)) throw new Error(t(lang, 'md_cmd_type_in_use'));
      if (p.defaults.wallTypeId === c.id) throw new Error(t(lang, 'md_cmd_default_type_undeletable'));
      delete p.wallTypes[c.id];
      break;
    }
    case 'upsertMaterial':
      p.materials[c.material.id] = c.material;
      break;
    case 'upsertOpeningType': {
      const issue = openingTypeIssue(c.openingType);
      if (issue) throw new Error(issue);
      const next = withBridgedComposition(c.openingType, p.openingTypes[c.openingType.id], p.openingProfiles);
      p.openingTypes[next.id] = next;
      break;
    }
    case 'upsertLevel': {
      const i = p.levels.findIndex((l) => l.id === c.level.id);
      if (i >= 0) p.levels[i] = c.level;
      else p.levels.push(c.level);
      p.levels.sort((x, y) => x.elevation - y.elevation);
      break;
    }
    case 'deleteLevel': {
      if (p.levels.length <= 1) throw new Error(t(lang, 'md_cmd_last_level'));
      // Escada também conta pelo nível de topo explícito; o topo automático segue o nível acima e não prende o nível.
      if (Object.values(p.elements).some((e) => (hasLevel(e) && e.levelId === c.id) || (isStair(e) && e.topLevelId === c.id) || (isRamp(e) && e.topLevelId === c.id))) throw new Error(t(lang, 'md_cmd_level_in_use'));
      p.levels = p.levels.filter((l) => l.id !== c.id);
      dropAreaPlansOfLevel(p, c.id);
      dropOrphanViewports(p);
      break;
    }
    case 'addDimension':
    case 'updateDimension':
    case 'removeDimension':
    case 'addText':
    case 'updateText':
    case 'removeText':
    case 'addRoomSeparator':
    case 'removeRoomSeparator':
    case 'updateRoomSeparator':
    case 'addDetailLine': case 'updateDetailLine': case 'removeDetailLine':
    case 'addDetailRegion': case 'updateDetailRegion': case 'removeDetailRegion':
    case 'addTag': case 'updateTag': case 'removeTag':
      applyAnnotationCommand(p, c, lang);
      break;
    case 'addSheet':
    case 'updateSheet':
    case 'removeSheet':
    case 'addViewport':
    case 'updateViewport':
    case 'removeViewport':
    case 'setSheetOrder':
      applySheetCommand(p, c, lang);
      break;
    case 'ensurePluginProjectUid':
    case 'setPluginViewOverride':
    case 'clearPluginViewOverride':
      applyPluginDataCommand(p, c);
      break;
    case 'addView3DPoint':
    case 'updateView3DPoint':
    case 'removeView3DPoint':
    case 'setView3DPointOrder':
      applyView3DPointCommand(p, c, lang);
      break;
    case 'addGrid':
    case 'updateGrid':
    case 'removeGrid':
    case 'addGridType':
    case 'updateGridType':
    case 'removeGridType':
      applyGridCommand(p, c, lang);
      break;
    case 'setLevelViewRange': {
      const l = p.levels.find((x) => x.id === c.levelId);
      if (!l) throw new Error(t(lang, 'md_level_missing'));
      // Sem normalização silenciosa: um valor que quebra a ordem topo ≥ corte ≥ base ≥ profundidade é recusado.
      const next: ViewRange = { ...l.viewRange, ...c.patch };
      const issues = viewRangeIssues(next);
      if (issues.length > 0) throw new Error(issues.join(' '));
      l.viewRange = next;
      break;
    }
    case 'setProjectGraphics':
      applyProjectGraphics(p, c.patch, lang);
      break;
    case 'setLevelGraphics':
      applyLevelGraphics(p, c.levelId, c.patch, lang);
      break;
    case 'resetLevelGraphics':
      resetLevelGraphics(p, c.levelId, lang);
      break;
    case 'setView3D':
      applyView3D(p, c.patch, lang);
      break;
    case 'resetView3D':
      resetView3D(p);
      break;
    case 'setViewHidden':
      applyViewHidden(p, c.target, c.hidden, lang);
      break;
    case 'setSectionAnnotations':
      applySectionAnnotations(p, c.sectionId, c.annotations, lang);
      break;
    case 'setSectionLevelExtent':
      applySectionLevelExtent(p, c.sectionId, c.levelId, c.extent, lang);
      break;
    case 'setSectionGraphics':
      applySectionGraphics(p, c.patch, lang);
      break;
    case 'resetSectionGraphics':
      resetSectionGraphics(p);
      break;
    case 'setProjectName':
      p.name = c.name;
      break;
    case 'setDefaults':
      p.defaults = { ...p.defaults, ...c.patch };
      break;
    case 'setSettings':
      p.settings = { ...p.settings, ...c.patch };
      break;
    case 'setDimensionStyle':
      p.settings = { ...p.settings, dimensionStyle: { ...(p.settings.dimensionStyle ?? {}), ...c.patch } };
      break;
    case 'upsertDimensionFamily': {
      const others = dimensionFamiliesOf(p.settings).filter((f) => f.id !== c.family.id);
      const issue = dimensionFamilyIssue(c.family, others);
      if (issue) throw new Error(issue);
      p.settings = writeDimensionFamily(p.settings, { ...c.family, name: c.family.name.trim() });
      break;
    }
    case 'removeDimensionFamily':
      p.settings = removeDimensionFamilyFrom(p.settings, c.id);
      break;
    case 'setDefaultDimensionFamily': {
      if (!dimensionFamiliesOf(p.settings).some((f) => f.id === c.id)) throw new Error(t(lang, 'md_cmd_dim_family_missing'));
      p.settings = { ...p.settings, defaultDimensionFamilyId: c.id };
      break;
    }
    case 'setDxfLayerStyle': {
      const layer = c.layer.trim();
      if (layer) p.dxfLayers = { ...(p.dxfLayers ?? {}), [layer]: { ...c.style } };
      break;
    }
    case 'resetDxfLayers':
      delete p.dxfLayers;
      break;
    case 'toggleOpeningFavorite': toggleFavoriteIn(p, c.id); break;
    case 'addView':
    case 'updateView':
    case 'deleteView':
      applyViewCommand(p, c, lang);
      break;
    case 'batch':
      for (const sub of c.commands) applyCommand(p, sub, lang);
      break;
    case 'setOpeningHost':
      setOpeningHost(p, c, lang);
      break;
    case 'setElementLevel':
      applyElementLevel(p, c, lang);
      break;
  }
}
