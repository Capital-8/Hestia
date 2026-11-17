import type { MultiPolygon } from '@hestia/geom';
import {
  beamAxisPolyline,
  beamsOnLevel,
  beamJustifyOffsets,
  beamMidPoint,
  beamPolygon,
  beamProfileDims,
  columnsOnLevel,
  columnPolygon,
  findBeamType,
  findColumnType,
  findFootingType,
  footingsOnLevel,
  footingPolygon,
  isBeam,
  unitsOf,
  type DetailLevel,
  type Id,
  type Project,
} from '@hestia/model';
import type { Viewport } from '../viewport.ts';
import { outlineSelectionOps, type FloorOps, type OutlinedPart } from './floors.ts';
import { ALCA_PX, quadradoEm } from './marcadores.ts';
import { defaultPaint, espessuraDeCorte, surfaceColor, type PlanPaint } from './style.ts';
import type { FillOp, LabelOp, PlanTheme, StrokeOp } from './types.ts';

/**
 * Operações 2D dos elementos estruturais (sapatas, vigas e pilares) em planta baixa.
 */
export function structuralPlanOps(
  p: Project,
  levelId: Id,
  theme: PlanTheme,
  dark: boolean,
  _detail: DetailLevel,
  hidden?: ReadonlySet<Id>,
  paintWall?: PlanPaint,
  _paintSlab?: PlanPaint,
  scale = 100,
): FloorOps {
  const fills: FillOp[] = [];
  const strokes: StrokeOp[] = [];
  const labels: LabelOp[] = [];

  const fillBase = dark ? '#1a1a1a' : '#f5f4f0';
  const fillT = dark ? 0.5 : 0.58;
  const pw = paintWall ?? defaultPaint('wall', 50);

  // Sapatas: contorno em tracejado e preenchimento suave (sem linhas vazando em sapatas excêntricas).
  for (const f of footingsOnLevel(p, levelId)) {
    if (hidden?.has(f.id)) continue;
    const t = findFootingType(p, f.typeId);
    const poly = footingPolygon(f, t);
    const m = p.materials[t.materialId];
    const matColor = m?.color ?? '#b0a99f';
    fills.push({ polygons: [[poly]], color: matColor, alpha: 0.35 });
    strokes.push({ pts: poly, closed: true, widthPx: 1, papel: { mm: 0.18, escala: scale }, color: theme.inkSoft, alpha: 0.85, dash: [6, 3] });
  }

  // Vigas: bordas tracejadas/projeção, linhas internas da alma em perfis I/T no detalhe fino/médio, eixo e código.
  for (const b of beamsOnLevel(p, levelId)) {
    if (hidden?.has(b.id)) continue;
    const t = findBeamType(p, b.typeId);
    const poly = beamPolygon(b, t);
    strokes.push({ pts: poly, closed: true, widthPx: 1, papel: { mm: 0.18, escala: scale }, color: theme.inkSoft, alpha: 0.9, dash: [6, 3] });
    if (_detail !== 'coarse' && (t.shape === 'i-section' || t.shape === 't-section')) {
      if (Math.hypot(b.b.x - b.a.x, b.b.y - b.a.y) > 1e-6) {
        const { sMid } = beamJustifyOffsets(b, t);
        const { tw } = beamProfileDims(t);
        for (const s of [sMid - tw / 2, sMid + tw / 2]) {
          strokes.push({
            pts: beamAxisPolyline(b, s),
            closed: false,
            widthPx: 1,
            papel: { mm: 0.13, escala: scale },
            color: theme.inkSoft,
            alpha: 0.65,
            dash: [3, 3],
          });
        }
      }
    }
    strokes.push({ pts: beamAxisPolyline(b, 0), closed: false, widthPx: 1, papel: { mm: 0.13, escala: scale }, color: theme.inkSoft, alpha: 0.75, dash: [6, 3] });
    if (p.settings.showTags) {
      labels.push({ at: beamMidPoint(b), text: t.code, tone: 'info', dy: -8 });
    }
  }

  // Pilares: cor sólida de concreto e contorno em corte + marca/código se showTags.
  const cutEsp = espessuraDeCorte(pw);
  for (const c of columnsOnLevel(p, levelId)) {
    if (hidden?.has(c.id)) continue;
    const t = findColumnType(p, c.typeId);
    const poly = columnPolygon(c, t);
    const m = p.materials[t.materialId];
    const colColor = surfaceColor(m?.color ?? '#8a8580', fillBase, fillT, pw);
    fills.push({ polygons: [[poly]], color: colColor, alpha: 1 });
    strokes.push({ pts: poly, closed: true, ...cutEsp, color: theme.ink, alpha: 1 });
    if (p.settings.showTags) {
      labels.push({ at: c.at, text: c.mark || t.code, tone: 'info', dy: -10 });
    }
  }

  return { fills, strokes, labels };
}

/**
 * Destaca pilares, vigas e sapatas sob hover e seleção + alças de ponta para viga isolada.
 */
export function structuralSelectionOps(
  p: Project,
  levelId: Id,
  selection: readonly Id[],
  hover: Id | null,
  theme: PlanTheme,
  viewport: Viewport,
): FloorOps {
  const parts: OutlinedPart[] = [];
  for (const c of columnsOnLevel(p, levelId)) parts.push({ id: c.id, polygon: [[columnPolygon(c, findColumnType(p, c.typeId))]] });
  for (const b of beamsOnLevel(p, levelId)) parts.push({ id: b.id, polygon: [[beamPolygon(b, findBeamType(p, b.typeId))]] });
  for (const f of footingsOnLevel(p, levelId)) parts.push({ id: f.id, polygon: [[footingPolygon(f, findFootingType(p, f.typeId))]] });

  const out = outlineSelectionOps(parts, [...selection], hover, false, theme, unitsOf(p), viewport, false);

  if (selection.length === 1) {
    const el = p.elements[selection[0]!];
    if (el && isBeam(el) && el.levelId === levelId) {
      for (const pt of [el.a, el.b]) {
        const q = quadradoEm(pt, ALCA_PX);
        out.fills.push({ ...q.fill, color: '#ffffff', alpha: 1 });
        out.strokes.push({ ...q.traco, widthPx: 1.6, color: theme.select, alpha: 1 });
      }
    }
  }

  return out;
}

/**
 * Pegadas dos elementos estruturais do nível para o modo Reveal.
 */
export function structuralPegadas(p: Project, levelId: Id): Map<Id, MultiPolygon> {
  const map = new Map<Id, MultiPolygon>();
  for (const c of columnsOnLevel(p, levelId)) map.set(c.id, [[columnPolygon(c, findColumnType(p, c.typeId))]]);
  for (const b of beamsOnLevel(p, levelId)) map.set(b.id, [[beamPolygon(b, findBeamType(p, b.typeId))]]);
  for (const f of footingsOnLevel(p, levelId)) map.set(f.id, [[footingPolygon(f, findFootingType(p, f.typeId))]]);
  return map;
}
