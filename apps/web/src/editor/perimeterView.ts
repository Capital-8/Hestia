import { arcFromSagitta, dist, type SketchDraft, type SketchTarget } from '@hestia/geom';
import { effectiveSeg, type PerimeterShape as FerramentaForma, type ToolId } from '@hestia/tools';
import type { PerimeterView } from './perimeterApi.ts';
import type { PerimeterShape } from '../ui/perimeter/PerimeterRibbonPanels.tsx';

/** Visão do modo quando ele está fechado. Os padrões de opções são os da barra (ver `perimeterMode.ts`). */
export const VISAO_FECHADA: PerimeterView = {
  active: false,
  modify: null,
  selecting: false,
  target: 'roof',
  draft: null,
  result: null,
  shape: 'line',
  lineKind: 'boundary',
  options: { overhang: 0.5, slopePct: 30, extendToCore: false, heightOffset: 0 },
  hoverId: null,
  selectionBox: null,
  selectedEdge: null,
  status: '',
};

/** Forma da galeria (ids da tela) para a forma da ferramenta de perímetro. */
const PARA_FERRAMENTA: Record<PerimeterShape, FerramentaForma> = {
  line: 'line',
  rect: 'rectangle',
  'poly-inscribed': 'inscribedPolygon',
  'poly-circumscribed': 'circumscribedPolygon',
  circle: 'circle',
  'arc-3pt': 'arcThreePoints',
  'arc-center': 'arcCenterEnds',
  'arc-tangent': 'arcTangent',
  fillet: 'fillet',
  ellipse: 'ellipse',
  'pick-face': 'pickFace',
  'by-perimeter': 'byPerimeter',
  'pick-room': 'pickRoom',
};

/** Forma da ferramenta para a galeria. Sem forma (modo de seleção) a galeria mostra "Linha", a forma padrão. */
export function formaDaFerramenta(f: FerramentaForma | null): PerimeterShape {
  return (Object.keys(PARA_FERRAMENTA) as PerimeterShape[]).find((k) => PARA_FERRAMENTA[k] === f) ?? 'line';
}

/** Forma da galeria para a ferramenta. */
export const formaDaTela = (f: PerimeterShape): FerramentaForma => PARA_FERRAMENTA[f];

/** Alvo do perímetro para a ferramenta da faixa, ou null se a ferramenta não abre o modo. */
const ALVO_DA_FERRAMENTA: Partial<Record<ToolId, SketchTarget>> = { roof: 'roof', floor: 'floor', slab: 'slab', ceiling: 'ceiling', mass: 'mass' };
export const alvoDaFerramenta = (id: ToolId): SketchTarget | null => ALVO_DA_FERRAMENTA[id] ?? null;

/**
 * Aresta selecionada (a primeira de `draft.selected`), com a posição em `draft.segs` (base 0, como a barra de status
 * mostra `index + 1`), o comprimento do eixo (arco incluído) e os valores efetivos. Null sem seleção.
 */
export function arestaDe(d: SketchDraft): PerimeterView['selectedEdge'] {
  const id = d.selected[0];
  const index = id === undefined ? -1 : d.segs.findIndex((s) => s.id === id);
  const seg = index >= 0 ? d.segs[index] : undefined;
  if (!seg) return null;
  const e = effectiveSeg(d, seg);
  const arc = seg.sag ? arcFromSagitta(seg.a, seg.b, seg.sag) : null;
  return {
    id: seg.id,
    index,
    total: d.segs.length,
    length: arc ? arc.length : dist(seg.a, seg.b),
    definesSlope: e.definesSlope,
    slopePct: e.slopePct,
    overhang: e.overhang,
  };
}
