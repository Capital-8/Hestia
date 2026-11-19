import { multiArea, pointInPolygon, polygonArea, type MultiPolygon, type Polygon, type Ring, type Vec2 } from '@hestia/geom';
import { fillRegionOf, lineIntervals, type ElementJunction, type ResolvedFloor } from '@hestia/engine';
import { formatQuantity, unitsOf, type DetailLevel, type Id, type Project, type ResolvedUnits } from '@hestia/model';
import type { Viewport } from '../viewport.ts';
import { mix } from './color.ts';
import { corPadraoSuperficie } from './materialPlan.ts';
import { holeMarkOps } from './holeMarks.ts';
import { ALCA_PX, quadradoEm } from './marcadores.ts';
import { juncaoDoNivel, pisosDoNivel } from './resolucao.ts';
import { defaultPaint, espessuraDeCorte, surfaceColor, type PlanPaint } from './style.ts';
import type { FillOp, LabelOp, PlanTheme, StrokeOp } from './types.ts';

export interface FloorOps {
  fills: FillOp[];
  strokes: StrokeOp[];
  labels: LabelOp[];
}

const empty = (): FloorOps => ({ fills: [], strokes: [], labels: [] });

/** Linha da membrana de piso ou laje: o contorno (furos incluídos), fino e tracejado, como a membrana da parede (decisão 0023 §5). */
export function membraneLineOps(polygon: MultiPolygon, theme: PlanTheme): StrokeOp[] {
  return polygon.flat().map((ring) => ({ pts: ring, closed: true, widthPx: 1, color: theme.inkSoft, alpha: 0.9, dash: [6, 3] }));
}

/** Área nas unidades do projeto, com o número de casas pedido, como nas demais etiquetas da planta. */
export const fmtArea = (u: ResolvedUnits, a: number, digits: number): string => formatQuantity(u, 'area', a, { decimals: digits });

/** Centroide de um anel (fórmula da área); cai na média dos vértices quando a área é zero. */
function ringCentroid(r: Ring): Vec2 {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < r.length; i++) {
    const p = r[i]!;
    const q = r[(i + 1) % r.length]!;
    const k = p.x * q.y - q.x * p.y;
    a += k;
    cx += (p.x + q.x) * k;
    cy += (p.y + q.y) * k;
  }
  if (Math.abs(a) < 1e-12) {
    return { x: r.reduce((s, v) => s + v.x, 0) / r.length, y: r.reduce((s, v) => s + v.y, 0) / r.length };
  }
  return { x: cx / (3 * a), y: cy / (3 * a) };
}

/**
 * Ponto para a etiqueta do piso: o centroide do maior polígono se cair dentro dele (furos incluídos). Se cair fora
 * (piso em L, por exemplo), usa o meio do maior trecho interno na mesma altura.
 */
export function labelPoint(m: MultiPolygon): Vec2 | null {
  let best: Polygon | null = null;
  for (const q of m) if (!best || Math.abs(polygonArea(q)) > Math.abs(polygonArea(best))) best = q;
  const outer = best?.[0];
  if (!best || !outer || outer.length < 3) return null;
  const c = ringCentroid(outer);
  if (pointInPolygon(c, best)) return c;
  let span: [number, number] | null = null;
  for (const [t0, t1] of lineIntervals(best, { x: 0, y: c.y }, { x: 1, y: 0 }, { x: 0, y: 1 })) {
    if (!span || t1 - t0 > span[1] - span[0]) span = [t0, t1];
  }
  return span ? { x: (span[0] + span[1]) / 2, y: c.y } : c;
}

/**
 * Pisos do nível na planta (D1). O piso fica atrás das paredes (decisão 0006): preenchimento com a cor do material
 * da camada de topo, mais claro que o das paredes; hachura em médio/fino com zoom suficiente (no fino, sempre);
 * contorno fino de 1 px com os furos. No grosseiro só o preenchimento chapado. Com etiquetas ligadas, o código do
 * tipo e a área no centroide.
 */
export function floorFills(
  p: Project,
  levelId: Id,
  theme: PlanTheme,
  dark: boolean,
  detail: DetailLevel,
  v: Viewport,
  hidden?: ReadonlySet<Id>,
  paint: PlanPaint = defaultPaint('floor', v.zoom),
  scale = 100,
): FloorOps {
  const jl = juncaoDoNivel(p, levelId);
  return concatOps(
    pisosDoNivel(p, levelId)
      .filter((f) => !hidden?.has(f.floorId))
      .map((f) => floorOpsOf(p, f, theme, dark, detail, v, paint, jl.elements.get(f.floorId), scale)),
  );
}

/**
 * Operações de um piso (preenchimento, contorno, etiqueta). `floorFills` as junta; a planta as ordena pela cota. Com a
 * junção resolvida (`el.cut`, decisão 0023 §3, P7b), o preenchimento e o contorno são a região que o piso ocupa depois
 * do recorte; sem corte, o contorno do piso, como antes.
 */
/** Tamanho da fonte das etiquetas de piso e laje em mm de papel (mesmo padrão dos ambientes). */
export const SURFACE_TEXT_MM = 1.6;

export function floorOpsOf(p: Project, f: ResolvedFloor, theme: PlanTheme, dark: boolean, detail: DetailLevel, _v: Viewport, paint: PlanPaint, el?: ElementJunction, scale = 100): FloorOps {
  const out = empty();
  // A cor do piso é a da camada de cima que não é membrana (a membrana não tem volume nem cor própria na planta).
  const top = f.layers.find((l) => !l.membrane);
  // Preenchimento: a camada de cima (o término dela vale mesmo sem junção) ou, com corte, a região resolvida — ou as
  // partes da camada de cima quando o término dela é explícito (0023 F7 e 0025).
  const region = fillRegionOf(top ?? { explicit: false, polygon: f.polygon }, el);
  if (region.length === 0) return out;
  const fillBase = dark ? theme.bg : '#ffffff';
  const fine = detail === 'fine';
  const m = top ? p.materials[top.materialId] : undefined;
  const cp = corPadraoSuperficie(m, { dark, detail, paint });
  const color = surfaceColor(cp.fundo, fillBase, dark ? 0.42 : 0.74, paint);
  const hatch = cp.padrao ? { ...cp.padrao, ...(fine ? {} : { zoomMin: 40 }) } : undefined;
  out.fills.push({ polygons: region, color, alpha: 1, hatch });
  out.strokes.push(...holeMarkOps(f.polygon, theme, paint, detail));
  if (detail !== 'coarse') {
    // Contorno como faixa preenchida (e não traço): os traços são todos desenhados depois dos preenchimentos e
    // apareceriam por cima das paredes; a faixa respeita a ordem (piso primeiro, paredes por cima). A espessura é a
    // do corte do piso (decisão 0015 §2.1), em papel: o polígono da faixa sai com o zoom em `resolverZoom`.
    out.fills.push({ polygons: region, color: mix(theme.ink, fillBase, 0.35), alpha: 1, contour: true, faixa: espessuraDeCorte(paint) });
    // Linha de membrana na face da própria camada (P8): ela pode ir ao núcleo da parede.
    for (const l of f.layers) if (l.membrane) out.strokes.push(...membraneLineOps(l.polygon, theme));
  }
  if (p.settings.showTags) {
    const code = p.floorTypes[f.typeId]?.code;
    const at = labelPoint(f.polygon);
    const text = [code, fmtArea(unitsOf(p), multiArea(f.polygon), 1)].filter(Boolean).join(' · ');
    if (at) out.labels.push({ at, text, papel: { escala: scale, fontMm: SURFACE_TEXT_MM } });
  }
  return out;
}

/** Junta operações de várias peças, na ordem dada (a ordem dos preenchimentos é a de pintura). */
export function concatOps(list: FloorOps[]): FloorOps {
  const out = empty();
  for (const o of list) {
    out.fills.push(...o.fills);
    out.strokes.push(...o.strokes);
    out.labels.push(...o.labels);
  }
  return out;
}

/** Peça de piso, laje ou telhado para destaque: id e contorno em planta (furos incluídos); `area` substitui a área em planta (telhado: real). */
export interface OutlinedPart {
  id: Id;
  polygon: MultiPolygon;
  area?: number;
  /** Quais vértices do anel recebem quadradinho de alça; ausente = todos (telhado em arco mostra só os cantos lógicos). */
  grips?: (ring: Ring) => boolean[];
}

/**
 * Destaque de seleção e de hover de peças (pisos e lajes): azul translúcido; selecionado ganha contorno de 2 px,
 * quadradinhos nos vértices e, quando `areaLabel` está ligado, a área no centroide (a etiqueta de tipo já a mostra
 * com as etiquetas ligadas). `grips` desliga só os quadradinhos: a planta de área mantém o destaque e o contorno, mas
 * não oferece alça de elemento de modelo.
 */
export function outlineSelectionOps(parts: OutlinedPart[], selection: Id[], hover: Id | null, areaLabel: boolean, theme: PlanTheme, u: ResolvedUnits, _v?: Viewport, grips = true): FloorOps {
  const out = empty();
  const sel = new Set(selection);
  for (const f of parts) {
    const isSel = sel.has(f.id);
    const isHover = !isSel && hover === f.id;
    if (!isSel && !isHover) continue;
    out.fills.push({ polygons: f.polygon, color: theme.select, alpha: isSel ? 0.26 : 0.16 });
    if (!isSel) continue;
    for (const ring of f.polygon.flat()) {
      out.strokes.push({ pts: ring, closed: true, widthPx: 2, color: theme.select, alpha: 1 });
      if (!grips) continue;
      const gripsDoAnel = f.grips?.(ring);
      ring.forEach((pt, i) => {
        if (gripsDoAnel && !gripsDoAnel[i]) return;
        const quadrado = quadradoEm(pt, ALCA_PX);
        out.fills.push({ ...quadrado.fill, color: '#ffffff', alpha: 1 });
        out.strokes.push({ ...quadrado.traco, widthPx: 1.6, color: theme.select, alpha: 1 });
      });
    }
    if (areaLabel) {
      const at = labelPoint(f.polygon);
      if (at) out.labels.push({ at, text: fmtArea(u, f.area ?? multiArea(f.polygon), 2), dy: -12, tone: 'info' });
    }
  }
  return out;
}

/** Destaque dos pisos do nível (D1). */
export function floorSelectionOps(p: Project, levelId: Id, selection: Id[], hover: Id | null, theme: PlanTheme, v: Viewport, hidden?: ReadonlySet<Id>, grips = true): FloorOps {
  const parts = pisosDoNivel(p, levelId)
    .filter((f) => !hidden?.has(f.floorId))
    .map((f) => ({ id: f.floorId, polygon: f.polygon }));
  return outlineSelectionOps(parts, selection, hover, !p.settings.showTags, theme, unitsOf(p), v, grips);
}

/** Pisos do nível abaixo, como referência apagada (D4): mesma linguagem do subpavimento das paredes. */
export function belowFloorOps(floors: Array<Pick<ResolvedFloor, 'polygon'>>, theme: PlanTheme): FloorOps {
  const out = empty();
  for (const f of floors) {
    out.fills.push({ polygons: f.polygon, color: theme.underlay, alpha: 0.22 });
    for (const ring of f.polygon.flat()) out.strokes.push({ pts: ring, closed: true, widthPx: 1, color: theme.underlay, alpha: 0.7 });
  }
  return out;
}
