import { multiArea, type Polygon, type Vec2 } from '@hestia/geom';
import { t, type Lang } from './i18n.ts';
import { isRoof, type Id, type Layer, type Project, type Roof, type RoofEave, type RoofType } from './types.ts';

export const DEFAULT_EAVE: RoofEave = { fascia: false, fasciaHeight: 0.2, gutter: false, soffit: false };

type RoofInput = { id: Id; typeId: Id; levelId: Id; boundary: Vec2[] } & Partial<Omit<Roof, 'order' | 'kind'>>;

/** Constrói um telhado com os campos padrão (duas águas de 30%, cumeeira ao longo de x); `order` vem do comando addRoof. */
export function makeRoof(r: RoofInput): Omit<Roof, 'order'> {
  const n = r.boundary.length;
  return {
    kind: 'roof',
    holes: [],
    heightOffset: 0,
    shape: 'gable',
    slopePercent: 30,
    dir: { x: 1, y: 0 },
    planes: [],
    edgeSlopes: Array.from({ length: n }, () => 30),
    edgeOverhangs: Array.from({ length: n }, () => 0),
    profile: [],
    joinOthers: true,
    rafterCut: 'plumb',
    eave: DEFAULT_EAVE,
    mark: '',
    comments: '',
    ...r,
  };
}

export const roofsOnLevel = (p: Project, levelId: Id): Roof[] =>
  Object.values(p.elements)
    .filter(isRoof)
    .filter((r) => r.levelId === levelId)
    .sort((a, b) => a.order - b.order);

export const roofTypeThickness = (t: RoofType): number => t.layers.reduce((s, l) => s + l.thickness, 0);

/** Flecha do arco da aresta `i` (m); 0 = reta (campo ausente em telhados antigos). */
export const roofEdgeSag = (r: Roof, i: number): number => r.edgeSag?.[i] ?? 0;

export const roofPolygon = (r: Roof): Polygon => [r.boundary, ...r.holes];

/** Área em planta (contorno menos furos), metros quadrados. */
export const roofPlanArea = (r: Roof): number => multiArea([roofPolygon(r)]);

const L = (fn: Layer['function'], materialId: string, thickness: number): Layer => ({ function: fn, materialId, thickness, wraps: false });

const rt = (id: string, name: string, code: string, description: string, layers: Layer[], cost = 0): RoofType => ({ id, name, code, description, layers, cost });

/** Tipos de telhado iniciais (camadas do topo para baixo; espessura vertical), no idioma pedido. */
export function roofTypes(lang: Lang = 'pt'): RoofType[] {
  return [
    rt('rt_ceramica', t(lang, 'md_roof_ceramica'), 'TL-01', t(lang, 'md_roof_ceramica_desc'), [
      L('finish1', 'mat_telha_ceramica', 0.015),
      L('substrate', 'mat_madeira', 0.03),
      L('structure', 'mat_madeira', 0.05),
    ], 180),
    rt('rt_fibro', t(lang, 'md_roof_fibro'), 'TL-02', t(lang, 'md_roof_fibro_desc'), [
      L('finish1', 'mat_fibrocimento', 0.008),
      L('structure', 'mat_madeira', 0.075),
    ], 95),
    rt('rt_metalica', t(lang, 'md_roof_metalica'), 'TL-03', t(lang, 'md_roof_metalica_desc'), [
      L('finish1', 'mat_telha_metalica', 0.05),
      L('structure', 'mat_perfil', 0.1),
    ], 260),
  ];
}

/** Tipos de telhado em PT (compatibilidade); use `roofTypes(lang)` para o idioma ativo. */
export const DEFAULT_ROOF_TYPES: RoofType[] = roofTypes('pt');
