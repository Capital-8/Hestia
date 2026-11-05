import { EPS, add, angleOf, dist, len, mul, norm, perp, sub, dot, type SketchSeg, type Vec2 } from '@hestia/geom';
import { arcPieces, defaultSketchId, type SketchIdFn } from './sketchShapesArc.ts';
import { t as translate, type DictKey, type Lang } from './i18n.ts';

export { arcCenterEnds, arcThreePoints, arcTangent, filletShape, defaultSketchId, type FilletResult, type SketchIdFn } from './sketchShapesArc.ts';

/**
 * Geradores puros de formas do esboço. Entrada em metros; saída: `SketchSeg[]` com ids novos.
 * Entradas degeneradas (pontos coincidentes, lados < 3, raio nulo...) devolvem lista vazia
 * (ou null no filete), para a UI apenas não mostrar prévia.
 */

const TWO_PI = Math.PI * 2;

/** Polilinha de segmentos ligando os pontos em sequência (fecha se `closed`). */
function chain(pts: Vec2[], closed: boolean, nid: SketchIdFn): SketchSeg[] {
  const n = closed ? pts.length : pts.length - 1;
  const out: SketchSeg[] = [];
  for (let i = 0; i < n; i++) out.push({ id: nid(), a: pts[i]!, b: pts[(i + 1) % pts.length]! });
  return out;
}

/** Reta entre dois pontos. Pontos coincidentes não formam linha. */
export function lineShape(a: Vec2, b: Vec2, nid: SketchIdFn = defaultSketchId): SketchSeg[] {
  return dist(a, b) < EPS ? [] : [{ id: nid(), a, b }];
}

/** Retângulo com eixos paralelos aos eixos, a partir de dois cantos opostos. */
export function rectangleShape(p1: Vec2, p2: Vec2, nid: SketchIdFn = defaultSketchId): SketchSeg[] {
  if (Math.abs(p2.x - p1.x) < EPS || Math.abs(p2.y - p1.y) < EPS) return [];
  return chain([p1, { x: p2.x, y: p1.y }, p2, { x: p1.x, y: p2.y }], true, nid);
}

/**
 * Retângulo girado: `p1→p2` é a base e `widthPoint` define a largura pela distância perpendicular
 * (do lado em que estiver o ponto). Os lados são os da base, da altura e as duas paralelas.
 */
export function rotatedRectangleShape(p1: Vec2, p2: Vec2, widthPoint: Vec2, nid: SketchIdFn = defaultSketchId): SketchSeg[] {
  if (len(sub(p2, p1)) < EPS) return [];
  const n = perp(norm(sub(p2, p1)));
  const h = dot(sub(widthPoint, p1), n);
  if (Math.abs(h) < EPS) return [];
  const off = mul(n, h);
  return chain([p1, p2, add(p2, off), add(p1, off)], true, nid);
}

/** Polígono regular de `sides` lados com um vértice em `start` (ângulo) e raio `R`. */
function regularPolygon(center: Vec2, startAngle: number, R: number, sides: number, nid: SketchIdFn): SketchSeg[] {
  const pts: Vec2[] = [];
  for (let k = 0; k < sides; k++) {
    const th = startAngle + (k * TWO_PI) / sides;
    pts.push({ x: center.x + R * Math.cos(th), y: center.y + R * Math.sin(th) });
  }
  return chain(pts, true, nid);
}

const validSides = (sides: number): boolean => Number.isInteger(sides) && sides >= 3;

/** Polígono regular inscrito: vértices sobre a circunferência de raio |vertex − center|, um deles em `vertex`. */
export function inscribedPolygon(center: Vec2, vertex: Vec2, sides: number, nid: SketchIdFn = defaultSketchId): SketchSeg[] {
  const R = dist(center, vertex);
  if (!validSides(sides) || R < EPS) return [];
  return regularPolygon(center, angleOf(sub(vertex, center)), R, sides, nid);
}

/**
 * Polígono regular circunscrito à circunferência de raio |edgeMid − center|: a aresta cujo ponto
 * médio é `edgeMid` tangencia essa circunferência. Vértices a R = apótema / cos(π/n).
 */
export function circumscribedPolygon(center: Vec2, edgeMid: Vec2, sides: number, nid: SketchIdFn = defaultSketchId): SketchSeg[] {
  const apothem = dist(center, edgeMid);
  if (!validSides(sides) || apothem < EPS) return [];
  const R = apothem / Math.cos(Math.PI / sides);
  // Os vértices da primeira aresta ficam em θ₀ ∓ π/n; o ponto médio dela cai em θ₀.
  return regularPolygon(center, angleOf(sub(edgeMid, center)) - Math.PI / sides, R, sides, nid);
}

/** Círculo como dois arcos de 180° (limite de `arcFromSagitta`). `radiusPoint` define o raio. */
export function circleShape(center: Vec2, radiusPoint: Vec2, nid: SketchIdFn = defaultSketchId): SketchSeg[] {
  return arcPieces(center, dist(center, radiusPoint), angleOf(sub(radiusPoint, center)), TWO_PI, nid);
}

/**
 * Elipse de semieixos `rx` (eixo local x) e `ry`, girada de `rotation` rad em torno do centro.
 * Círculo (rx = ry) vira os dois arcos do `circleShape`. Caso geral: polilinha de cordas inscritas
 * no próprio elipse, com erro de corda ≤ 2 mm. Pela curvatura máxima κ = a/b², a corda tem
 * N ≈ 2π·a^1.5 / (b·√(8·tol)) partes (a = semieixo maior, b = menor), arredondado para múltiplo de 4
 * e com mínimo de 8. Limite de 512 cordas: elipses muito finas ficam com erro maior que a tolerância.
 */
export function ellipseShape(center: Vec2, rx: number, ry: number, rotation = 0, nid: SketchIdFn = defaultSketchId): SketchSeg[] {
  const a = Math.max(rx, ry);
  const b = Math.min(rx, ry);
  if (b < EPS) return [];
  if (a - b <= 1e-9 * a) return arcPieces(center, a, rotation, TWO_PI, nid);
  const tol = 0.002;
  const raw = Math.ceil((TWO_PI * Math.pow(a, 1.5)) / (b * Math.sqrt(8 * tol)));
  const n = Math.min(512, Math.max(8, Math.ceil(raw / 4) * 4));
  const cr = Math.cos(rotation);
  const sr = Math.sin(rotation);
  const pts: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const t = (TWO_PI * i) / n;
    const x = rx * Math.cos(t);
    const y = ry * Math.sin(t);
    pts.push({ x: center.x + x * cr - y * sr, y: center.y + x * sr + y * cr });
  }
  return chain(pts, true, nid);
}

/** Tipo de entrada que a UI deve pedir: ponto no desenho, linha existente, comprimento, ângulo, contagem ou flag. */
export type ShapeInputKind = 'point' | 'segment' | 'length' | 'angle' | 'count' | 'flag';

export interface ShapeInput {
  key: string;
  label: string;
  kind: ShapeInputKind;
}

export type ShapeKindId =
  | 'line'
  | 'rectangle'
  | 'rotatedRectangle'
  | 'inscribedPolygon'
  | 'circumscribedPolygon'
  | 'circle'
  | 'arcThreePoints'
  | 'arcCenterEnds'
  | 'arcTangent'
  | 'fillet'
  | 'ellipse';

export interface ShapeKind {
  id: ShapeKindId;
  /** Rótulo em pt-BR para o menu. */
  label: string;
  /** Entradas na ordem em que a UI pede; os nomes `key` batem com os parâmetros da função. */
  inputs: readonly ShapeInput[];
}

const P = (key: string, label: string): ShapeInput => ({ key, label, kind: 'point' });

/** Catálogo das formas: id, rótulo e entradas necessárias, para a UI montar os passos. */
export const SHAPE_KINDS: readonly ShapeKind[] = [
  { id: 'line', label: 'Linha', inputs: [P('a', 'Início'), P('b', 'Fim')] },
  { id: 'rectangle', label: 'Retângulo', inputs: [P('p1', 'Primeiro canto'), P('p2', 'Canto oposto')] },
  {
    id: 'rotatedRectangle',
    label: 'Retângulo girado',
    inputs: [P('p1', 'Início da base'), P('p2', 'Fim da base'), P('widthPoint', 'Ponto da largura')],
  },
  {
    id: 'inscribedPolygon',
    label: 'Polígono inscrito',
    inputs: [P('center', 'Centro'), P('vertex', 'Vértice'), { key: 'sides', label: 'Lados', kind: 'count' }],
  },
  {
    id: 'circumscribedPolygon',
    label: 'Polígono circunscrito',
    inputs: [P('center', 'Centro'), P('edgeMid', 'Meio de uma aresta'), { key: 'sides', label: 'Lados', kind: 'count' }],
  },
  { id: 'circle', label: 'Círculo', inputs: [P('center', 'Centro'), P('radiusPoint', 'Ponto do raio')] },
  {
    id: 'arcThreePoints',
    label: 'Arco por 3 pontos',
    inputs: [P('start', 'Início'), P('onArc', 'Ponto no arco'), P('end', 'Fim')],
  },
  {
    id: 'arcCenterEnds',
    label: 'Arco centro-extremidades',
    inputs: [P('center', 'Centro'), P('start', 'Início'), P('end', 'Fim'), { key: 'ccw', label: 'Anti-horário', kind: 'flag' }],
  },
  {
    id: 'arcTangent',
    label: 'Arco tangente',
    inputs: [P('start', 'Início'), P('tangentPoint', 'Ponto na tangente'), P('end', 'Fim')],
  },
  {
    id: 'fillet',
    label: 'Concordância',
    inputs: [
      { key: 'segA', label: 'Primeira linha', kind: 'segment' },
      { key: 'segB', label: 'Segunda linha', kind: 'segment' },
      { key: 'radius', label: 'Raio', kind: 'length' },
    ],
  },
  {
    id: 'ellipse',
    label: 'Elipse',
    inputs: [
      P('center', 'Centro'),
      { key: 'rx', label: 'Semieixo X', kind: 'length' },
      { key: 'ry', label: 'Semieixo Y', kind: 'length' },
      { key: 'rotation', label: 'Rotação', kind: 'angle' },
    ],
  },
];

const SHAPE_LABEL_KEYS: Record<ShapeKindId, DictKey> = {
  line: 'tl_shape_line',
  rectangle: 'tl_shape_rectangle',
  rotatedRectangle: 'tl_shape_rot_rect',
  inscribedPolygon: 'tl_shape_inscribed_poly',
  circumscribedPolygon: 'tl_shape_circum_poly',
  circle: 'tl_shape_circle',
  arcThreePoints: 'tl_shape_arc_3p',
  arcCenterEnds: 'tl_shape_arc_ce',
  arcTangent: 'tl_shape_arc_tan',
  fillet: 'tl_shape_fillet',
  ellipse: 'tl_shape_ellipse',
};

const SHAPE_INPUT_KEYS: Record<string, DictKey> = {
  Início: 'tl_shape_in_start',
  Fim: 'tl_shape_in_end',
  'Primeiro canto': 'tl_shape_in_first_corner',
  'Canto oposto': 'tl_shape_in_opposite_corner',
  'Início da base': 'tl_shape_in_base_start',
  'Fim da base': 'tl_shape_in_base_end',
  'Ponto da largura': 'tl_shape_in_width_point',
  Centro: 'tl_shape_in_center',
  Vértice: 'tl_shape_in_vertex',
  Lados: 'tl_shape_in_sides',
  'Meio de uma aresta': 'tl_shape_in_edge_mid',
  'Ponto do raio': 'tl_shape_in_radius_point',
  'Ponto no arco': 'tl_shape_in_on_arc',
  'Anti-horário': 'tl_shape_in_ccw',
  'Ponto na tangente': 'tl_shape_in_tangent_point',
  'Primeira linha': 'tl_shape_in_first_line',
  'Segunda linha': 'tl_shape_in_second_line',
  Raio: 'tl_shape_in_radius',
  'Semieixo X': 'tl_shape_in_semiaxis_x',
  'Semieixo Y': 'tl_shape_in_semiaxis_y',
  Rotação: 'tl_shape_in_rotation',
};

/** Rótulo da forma no idioma pedido (o rótulo PT de `SHAPE_KINDS` é o fallback). */
export function shapeLabel(shape: ShapeKind, lang: Lang = 'pt'): string {
  const key = SHAPE_LABEL_KEYS[shape.id];
  return key && lang === 'en' ? translate(lang, key) : shape.label;
}

/** Rótulo de uma entrada da forma no idioma pedido (o rótulo PT é o fallback). */
export function shapeInputLabel(label: string, lang: Lang = 'pt'): string {
  const key = SHAPE_INPUT_KEYS[label];
  return key && lang === 'en' ? translate(lang, key) : label;
}
