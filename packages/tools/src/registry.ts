import type { SketchTarget } from '@hestia/geom';
import type { Tool, ToolEnv } from './types.ts';
import { PerimeterTool } from './perimeterTool.ts';
import { WallTool } from './wallTool.ts';
import { OpeningTool } from './openingTool.ts';
import { SelectTool } from './selectTool.ts';
import { MirrorTool, MoveTool, RotateTool } from './transformTools.ts';
import { SectionAlignTool, SectionMoveTool } from './sectionEditTools.ts';
import { ArrayTool } from './arrayTool.ts';
import { OffsetTool } from './offsetTool.ts';
import { AlignTool } from './alignTool.ts';
import { MeasureTool } from './trimAlign.ts';
import { TrimTool } from './trimTool.ts';
import { JoinTool } from './joinTool.ts';
import { SplitTool } from './splitTool.ts';
import { SectionTool } from './sectionTool.ts';
import { RehostTool } from './rehostTool.ts';
import { FloorTool } from './floorTool.ts';
import { SlabTool } from './slabTool.ts';
import { CeilingTool } from './ceilingTool.ts';
import { SlopeTool } from './slabSlopeTool.ts';
import { ParallelTool } from './parallelTool.ts';
import { RoofTool } from './roofTool.ts';
import { RoofExtrusionTool } from './roofExtrusionTool.ts';
import { RoofArrowTool } from './roofArrowTool.ts';
import { AttachRoofTool, DetachRoofTool } from './attachRoofTool.ts';
import { StairTool } from './stairTool.ts';
import { StairRunTool } from './stairRunTool.ts';
import { RampTool } from './rampTool.ts';
import { DimensionTool } from './dimensionTool.ts';
import { AngularDimensionTool } from './angularDimensionTool.ts';
import { TextTool } from './textTool.ts';
import { RoomTool } from './roomTool.ts';
import { RoomSeparatorTool } from './roomSeparatorTool.ts';
import { DetailLineTool } from './detailLineTool.ts';
import { DetailRegionTool } from './detailRegionTool.ts';
import { TagTool } from './tagTool.ts';
import { GridTool } from './gridTool.ts';
import { LevelTool } from './levelTool.ts';
import { PasteTool } from './pasteTool.ts';
import { RenderCameraTool } from './renderCameraTool.ts';

export type ToolId = 'select' | 'wall' | 'floor' | 'slab' | 'ceiling' | 'slope' | 'door' | 'window' | 'move' | 'copy' | 'rotate' | 'mirror' | 'array' | 'offset' | 'parallel' | 'trim' | 'align' | 'joins' | 'split' | 'measure' | 'level' | 'section' | 'rehost' | 'roof' | 'roofarrow' | 'roofextrusion' | 'attachroof' | 'detachroof' | 'stair' | 'stairrun' | 'ramp' | 'dimension' | 'angularDimension' | 'grid' | 'text' | 'room' | 'roomsep' | 'detailLine' | 'filledRegion' | 'tag' | 'perimeter' | 'paste' | 'renderCamera';

export const TOOL_GROUPS: Array<{ title: string; tools: ToolId[] }> = [
  { title: 'Construir', tools: ['wall', 'door', 'window', 'floor', 'slab', 'ceiling', 'roof', 'stair', 'stairrun', 'ramp', 'room'] },
  { title: 'Modificar', tools: ['move', 'copy', 'rotate', 'mirror', 'array', 'offset', 'parallel', 'trim', 'align', 'joins', 'split', 'rehost', 'slope', 'attachroof', 'detachroof'] },
  { title: 'Anotar', tools: ['level', 'dimension', 'angularDimension', 'text', 'detailLine', 'filledRegion', 'tag', 'renderCamera'] },
  { title: 'Medir', tools: ['measure'] },
];

/** Cria a ferramenta. `perimeterTarget` só vale para 'perimeter' (o elemento que o perímetro cria ou edita). */
export function createTool(id: ToolId, env: ToolEnv, perimeterTarget: SketchTarget = 'roof'): Tool {
  switch (id) {
    case 'select':
      return new SelectTool(env);
    case 'paste':
      return new PasteTool(env);
    case 'perimeter':
      return new PerimeterTool(env, perimeterTarget);
    case 'wall':
      return new WallTool(env);
    case 'floor':
      return new FloorTool(env);
    case 'slab':
      return new SlabTool(env);
    case 'ceiling':
      return new CeilingTool(env);
    case 'slope':
      return new SlopeTool(env);
    case 'roof':
      return new RoofTool(env);
    case 'roofarrow':
      return new RoofArrowTool(env);
    case 'roofextrusion':
      return new RoofExtrusionTool(env);
    case 'attachroof':
      return new AttachRoofTool(env);
    case 'detachroof':
      return new DetachRoofTool(env);
    case 'stair':
      return new StairTool(env);
    case 'stairrun':
      return new StairRunTool(env);
    case 'ramp':
      return new RampTool(env);
    case 'dimension':
      return new DimensionTool(env);
    case 'angularDimension':
      return new AngularDimensionTool(env);
    case 'grid':
      return new GridTool(env);
    case 'text':
      return new TextTool(env);
    case 'room':
      return new RoomTool(env);
    case 'roomsep':
      return new RoomSeparatorTool(env);
    case 'detailLine':
      return new DetailLineTool(env);
    case 'filledRegion':
      return new DetailRegionTool(env);
    case 'tag':
      return new TagTool(env);
    case 'door':
      return new OpeningTool(env, 'door');
    case 'window':
      return new OpeningTool(env, 'window');
    case 'move':
      return env.section?.() ? new SectionMoveTool(env) : new MoveTool(env, false);
    case 'copy':
      return new MoveTool(env, true);
    case 'rotate':
      return new RotateTool(env);
    case 'mirror':
      return new MirrorTool(env);
    case 'array':
      return new ArrayTool(env);
    case 'offset':
      return new OffsetTool(env);
    case 'parallel':
      return new ParallelTool(env);
    case 'trim':
      return new TrimTool(env);
    case 'align':
      return env.section?.() ? new SectionAlignTool(env) : new AlignTool(env);
    case 'joins':
      return new JoinTool(env);
    case 'split':
      return new SplitTool(env);
    case 'measure':
      return new MeasureTool(env);
    case 'level':
      return new LevelTool(env);
    case 'renderCamera':
      return new RenderCameraTool(env);
    case 'rehost':
      return new RehostTool(env);
    case 'section':
      return new SectionTool(env);
  }
}

export const TOOL_LABEL: Record<ToolId, string> = {
  select: 'Selecionar',
  paste: 'Colar',
  wall: 'Parede',
  floor: 'Piso',
  slab: 'Laje',
  ceiling: 'Forro',
  roof: 'Telhado',
  slope: 'Inclinação',
  roofarrow: 'Seta de inclinação',
  roofextrusion: 'Telhado por extrusão',
  door: 'Porta',
  window: 'Janela',
  move: 'Mover',
  copy: 'Copiar',
  rotate: 'Rotacionar',
  mirror: 'Espelhar',
  array: 'Matriz',
  offset: 'Deslocar',
  parallel: 'Parede paralela',
  trim: 'Aparar',
  align: 'Alinhar',
  joins: 'Junção',
  split: 'Dividir',
  measure: 'Medir',
  level: 'Nível',
  section: 'Corte',
  rehost: 'Trocar anfitriã',
  attachroof: 'Anexar topo',
  detachroof: 'Desanexar topo',
  stair: 'Escada por croqui',
  stairrun: 'Escada (reta/L/U/caracol)',
  ramp: 'Rampa',
  dimension: 'Cota',
  angularDimension: 'Cota angular',
  grid: 'Grade',
  text: 'Texto',
  room: 'Ambiente',
  roomsep: 'Separador de ambiente/área',
  detailLine: 'Linha de detalhe',
  filledRegion: 'Região preenchida',
  tag: 'Etiqueta',
  perimeter: 'Perímetro',
  renderCamera: 'Câmera de render',
};

