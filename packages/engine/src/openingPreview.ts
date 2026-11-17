import { arcPointAt, arcTangentAt, type Vec2 } from '@hestia/geom';
import {
  openingAngle2d,
  openingDetail2d,
  openingLeafPlan,
  openingPlanDisplay,
  openingShowSwing,
  openingSwingStyle,
  openingTypeById,
  type DetailLevel,
  type Opening,
  type OpeningType,
  type Project,
} from '@hestia/model';
import type { WallFrame } from './frame.ts';
import { buildOpeningModel } from './openingModel.ts';
import {
  openingPlanPaths,
  type OpeningPlanAnchor,
  type OpeningPlanOptions,
  type OpeningPlanPath,
  type OpeningPlanRole,
  type OpeningPlanTone,
} from './openingPlan.ts';
import { openingGeometry } from './resolve.ts';
import type { OpeningGeometry } from './types.ts';
import type { OpeningModel } from './openingModelTypes.ts';

/*
 * Prévia de colocação e planta usam o MESMO desenho (modelo único + `openingPlanPaths`). Aqui ficam a conversão das
 * coordenadas locais do vão para o mundo e a montagem das opções da planta, para a ferramenta não duplicar nenhuma regra.
 */

/** Traço da planta já em coordenadas do mundo (a mesma conversão da planta e do DXF). */
export interface OpeningPlanWorldPath {
  pts: Vec2[];
  closed: boolean;
  weight: number;
  tone: OpeningPlanTone;
  dash?: [number, number];
  role: OpeningPlanRole;
}

/** Traço da prévia: o necessário para desenhar o símbolo real na ferramenta. */
export interface OpeningPreviewStroke {
  pts: Vec2[];
  closed: boolean;
  dashed: boolean;
  role: OpeningPlanRole;
}

const at = (c: Vec2, u: Vec2, n: Vec2, t: number, s: number): Vec2 => ({
  x: c.x + u.x * t + n.x * s,
  y: c.y + u.y * t + n.y * s,
});

function anchoredBasis(g: OpeningGeometry, anchor: OpeningPlanAnchor): { origin: Vec2; u: Vec2; n: Vec2; scale: number } {
  const { arc, sMid } = g.curve!;
  const origin = arcPointAt(arc, g.offset + anchor.t, sMid + anchor.s);
  let u = arcTangentAt(arc, g.offset + anchor.t);
  let scale = 1;
  if (anchor.refT !== undefined) {
    const dl = anchor.refT - anchor.t;
    if (Math.abs(dl) > 1e-6) {
      const target = arcPointAt(arc, g.offset + anchor.refT, sMid + anchor.s);
      const dx = target.x - origin.x;
      const dy = target.y - origin.y;
      const chord = Math.hypot(dx, dy);
      if (chord > 1e-9) {
        const sgn = dl > 0 ? 1 : -1;
        u = { x: (dx / chord) * sgn, y: (dy / chord) * sgn };
        scale = chord / Math.abs(dl);
      }
    }
  }
  return { origin, u, n: { x: -u.y, y: u.x }, scale };
}

/** Ponto em coordenadas locais do vão usando a mesma âncora rígida da folha em parede curva. */
export function openingAnchoredPoint(g: OpeningGeometry, anchor: OpeningPlanAnchor, t: number, s: number): Vec2 {
  if (!g.curve) return at(g.center, g.u, g.n, t, s);
  const { origin, u, n, scale } = anchoredBasis(g, anchor);
  return {
    x: origin.x + (u.x * (t - anchor.t) + n.x * (s - anchor.s)) * scale,
    y: origin.y + (u.y * (t - anchor.t) + n.y * (s - anchor.s)) * scale,
  };
}

function mapAnchoredRigid(g: OpeningGeometry, p: OpeningPlanPath, anchor: OpeningPlanAnchor): Vec2[] {
  const { origin, u, n, scale } = anchoredBasis(g, anchor);
  return p.pts.map((q) => ({
    x: origin.x + (u.x * (q.t - anchor.t) + n.x * (q.s - anchor.s)) * scale,
    y: origin.y + (u.y * (q.t - anchor.t) + n.y * (q.s - anchor.s)) * scale,
  }));
}

function mapCurvedPath(g: OpeningGeometry, p: OpeningPlanPath): Vec2[] {
  const { arc, sMid } = g.curve!;
  const src = p.pts;
  if (src.length === 0) return [];
  const out: Vec2[] = [];
  const count = p.closed ? src.length : src.length - 1;
  for (let i = 0; i < count; i++) {
    const a = src[i]!;
    const b = src[(i + 1) % src.length]!;
    const dt = Math.abs(b.t - a.t);
    const steps = dt > 0.04 ? Math.max(2, Math.ceil(dt / 0.08)) : 1;
    for (let k = 0; k < steps; k++) {
      const f = k / steps;
      out.push(arcPointAt(arc, g.offset + a.t + (b.t - a.t) * f, sMid + a.s + (b.s - a.s) * f));
    }
  }
  if (!p.closed) {
    const last = src[src.length - 1]!;
    out.push(arcPointAt(arc, g.offset + last.t, sMid + last.s));
  }
  return out;
}

/** Põe os traços locais do vão (`t` ao longo da parede, `s` na profundidade) em coordenadas do mundo. */
export function openingPlanPathsAt(g: OpeningGeometry, paths: readonly OpeningPlanPath[]): OpeningPlanWorldPath[] {
  return paths.map((p) => ({
    ...p,
    pts: !g.curve
      ? p.pts.map((q) => at(g.center, g.u, g.n, q.t, q.s))
      : p.anchor
        ? mapAnchoredRigid(g, p, p.anchor)
        : mapCurvedPath(g, p),
  }));
}

/** Opções do desenho do vão iguais às da planta (a mesma fonte de ângulo, exibição, folha e corte). */
export function openingPlanOptionsOf(t: OpeningType, modelHeight: number, detail: 'low' | 'mid' | 'high'): OpeningPlanOptions {
  return {
    detail,
    angle: (openingAngle2d(t) * Math.PI) / 180,
    planDisplay: openingPlanDisplay(t),
    showSwing: openingShowSwing(t),
    swingStyle: openingSwingStyle(t),
    leafPlan: openingLeafPlan(t),
    cutZ: modelHeight / 2,
  };
}

/** Detalhe efetivo da planta nas opções do projeto (`scale` segue o detalhe; `off` continua desligado). */
export function openingPreviewDetail(t: OpeningType, detail: DetailLevel): 'low' | 'mid' | 'high' | 'off' {
  const d = openingDetail2d(t);
  if (d !== 'scale') return d;
  return detail === 'coarse' ? 'low' : detail === 'medium' ? 'mid' : 'high';
}

/** Traços LOCAIS da prévia do vão, na mesma montagem da planta. Vazio quando o detalhe está desligado. */
export function openingPreviewLocalPaths(
  p: Project,
  opening: Opening,
  frame: WallFrame,
  detail: DetailLevel,
): OpeningPlanPath[] {
  const t = openingTypeById(p, opening.typeId);
  if (!t) return [];
  const d = openingPreviewDetail(t, detail);
  if (d === 'off') return [];
  const g = openingGeometry(p, opening, frame);
  const m = buildOpeningModel(p, opening, g, frame);
  return openingPlanPaths(m, openingPlanOptionsOf(t, m.height, d));
}

/** Traços da planta do vão EM COORDENADAS DO MUNDO, iguais aos que a planta desenha. */
export function openingPlanWorldPaths(
  g: OpeningGeometry,
  model: OpeningModel,
  opts: Omit<OpeningPlanOptions, 'detail'> & { detail: 'low' | 'mid' | 'high' | 'off' },
): OpeningPlanWorldPath[] {
  const d = opts.detail;
  if (d === 'off') return [];
  return openingPlanPathsAt(g, openingPlanPaths(model, { ...opts, detail: d }));
}

/**
 * Prévia de colocação com a esquadria REAL do tipo (bandeiras, laterais, folhas, alizar, arco), na mesma montagem da
 * planta. É a função que a ferramenta usa; o deslocamento ao longo da parede fica na conversão das coordenadas.
 */
export function openingPreviewStrokes(
  p: Project,
  opening: Opening,
  frame: WallFrame,
  detail: DetailLevel,
): OpeningPreviewStroke[] {
  const g = openingGeometry(p, opening, frame);
  const t = openingTypeById(p, opening.typeId);
  if (!t) return [];
  const d = openingPreviewDetail(t, detail);
  if (d === 'off') return [];
  const m = buildOpeningModel(p, opening, g, frame);
  return openingPlanWorldPaths(g, m, openingPlanOptionsOf(t, m.height, d)).map((s) => ({
    pts: s.pts,
    closed: s.closed,
    dashed: s.dash !== undefined,
    role: s.role,
  }));
}
