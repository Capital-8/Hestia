import {
  formatQuantity,
  northArrowFamilyFor,
  revisionCloudFamilyFor,
  spotFamilyFor,
  unitsOf,
  type Id,
  type Project,
  type RevisionCloud,
  type SpotAnnotation,
  type SymbolAnnotation,
} from '@hestia/model';
import { add, type Vec2 } from '@hestia/geom';
import type { FillOp, LabelOp, StrokeOp } from './types.ts';
import { espessuraDeProjecao, type PlanPaint } from './style.ts';
import { noteLabel } from './tags.ts';

export interface ExtraOpsLook {
  isSection?: boolean;
  selection?: readonly Id[];
  selectColor?: string;
  levelElevation?: number;
}

function formatMeasure(p: Project, valM: number, unit: 'project' | 'm' | 'cm' | 'mm', precision: 0 | 1 | 2 | 3): string {
  const u = unitsOf(p);
  if (unit === 'project') {
    const sign = valM > 1e-4 ? '+' : valM < -1e-4 ? '-' : '±';
    return `${sign}${formatQuantity(u, 'length', Math.abs(valM), { decimals: precision })}`;
  }
  const factor = unit === 'm' ? 1 : unit === 'cm' ? 100 : 1000;
  const sign = valM > 1e-4 ? '+' : valM < -1e-4 ? '-' : '±';
  return `${sign}${(Math.abs(valM) * factor).toFixed(precision)} ${unit}`;
}

function circlePts(c: Vec2, r: number, sides = 24): Vec2[] {
  const pts: Vec2[] = [];
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2;
    pts.push({ x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r });
  }
  return pts;
}

function quadrantPts(c: Vec2, r: number, startAng: number): Vec2[] {
  const pts: Vec2[] = [c];
  for (let i = 0; i <= 8; i++) {
    const a = startAng + (i / 8) * (Math.PI / 2);
    pts.push({ x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r });
  }
  return pts;
}

/**
 * Renderiza Cotas de Elevação (alvo P&B em planta / triângulo P&B em corte) e Coordenadas de Ponto
 * seguindo as famílias paramétricas e origens (Projeto, Levantamento ou Relativo).
 */
export function spotAnnotationOps(
  p: Project,
  levelId: Id,
  spots: readonly SpotAnnotation[],
  paint: PlanPaint,
  scale: number,
  look: ExtraOpsLook = {},
): { fills: FillOp[]; strokes: StrokeOp[]; labels: LabelOp[] } {
  const fills: FillOp[] = [];
  const strokes: StrokeOp[] = [];
  const labels: LabelOp[] = [];
  if (!paint.visible || !spots.length) return { fills, strokes, labels };
  const baseColor = paint.color ?? '#16181c';
  const selectColor = look.selectColor ?? '#2563eb';
  const sel = new Set(look.selection ?? []);
  const mPerMm = scale / 1000;
  const levelElev = look.levelElevation ?? (p.levels.find((l) => l.id === levelId)?.elevation ?? 0);

  for (const spot of spots) {
    const fam = spotFamilyFor(p.settings, spot.kind, spot.familyId);
    const isSel = sel.has(spot.id);
    const color = isSel ? selectColor : baseColor;
    const strokeStyle = isSel ? { widthPx: 1.8, color, alpha: 1 } : { ...espessuraDeProjecao(paint), color, alpha: 1 };
    const r = (fam.symbolMm / 2) * mPerMm;

    if (spot.kind === 'elevation') {
      const baseZ = fam.base === 'survey'
        ? (p.settings.surveyPoint?.z ?? 0)
        : fam.base === 'project'
          ? (p.settings.projectBasePoint?.z ?? 0)
          : levelElev;
      const zWorld = look.isSection ? spot.target.y : levelElev;
      const valText = `${fam.prefix}${formatMeasure(p, zWorld - baseZ, fam.unit, fam.precision)}`;

      if (look.isSection) {
        // Símbolo técnico NBR 6492 / Revit em corte: triângulo invertido apoiado na linha horizontal.
        const h = fam.symbolMm * mPerMm;
        const hw = h * 0.65;
        const tip = spot.target;
        const left = { x: tip.x - hw, y: tip.y + h };
        const right = { x: tip.x + hw, y: tip.y + h };
        const midTop = { x: tip.x, y: tip.y + h };
        const lineEndX = spot.at.x >= tip.x ? Math.max(spot.at.x + 2 * mPerMm, tip.x + hw * 2.8) : Math.min(spot.at.x - 2 * mPerMm, tip.x - hw * 2.8);
        if (fam.sectionSymbol === 'triangle-bw') {
          fills.push({ polygons: [[[tip, midTop, left]]], color, alpha: 1 });
        }
        strokes.push({ pts: [tip, left, right], closed: true, ...strokeStyle });
        strokes.push({ pts: [tip, midTop], closed: false, ...strokeStyle });
        strokes.push({ pts: [left, { x: lineEndX, y: tip.y + h }], closed: false, ...strokeStyle });
        const textPos = { x: (tip.x + lineEndX) / 2, y: tip.y + h + fam.textMm * 0.65 * mPerMm };
        labels.push({ ...noteLabel(textPos, valText, fam.textMm, scale, 0), ...(isSel ? { color: selectColor } : {}) });
      } else {
        // Símbolo técnico NBR 6492 / Revit em planta: círculo alvo com quadrantes opostos P&B.
        const c = spot.target;
        if (fam.planSymbol === 'target-bw') {
          fills.push({ polygons: [[quadrantPts(c, r, 0)]], color, alpha: 1 });
          fills.push({ polygons: [[quadrantPts(c, r, Math.PI)]], color, alpha: 1 });
        }
        if (fam.planSymbol !== 'crosshair') {
          strokes.push({ pts: circlePts(c, r), closed: true, ...strokeStyle });
        }
        const ext = r * 1.35;
        strokes.push({ pts: [{ x: c.x - ext, y: c.y }, { x: c.x + ext, y: c.y }], closed: false, ...strokeStyle });
        strokes.push({ pts: [{ x: c.x, y: c.y - ext }, { x: c.x, y: c.y + ext }], closed: false, ...strokeStyle });
        const useLeader = spot.showLeader ?? fam.showLeader;
        if (useLeader) {
          const pts = spot.elbow ? [c, spot.elbow, spot.at] : [c, spot.at];
          strokes.push({ pts, closed: false, ...strokeStyle });
        }
        const textAt = useLeader ? spot.at : { x: c.x + ext + 3 * fam.textMm * mPerMm * 0.4, y: c.y + fam.textMm * 0.4 * mPerMm };
        labels.push({ ...noteLabel(textAt, valText, fam.textMm, scale, 0), ...(isSel ? { color: selectColor } : {}) });
      }
    } else {
      // Coordenada de ponto (N/E) relativa ao Ponto Base, Levantamento (com rotação do Norte Verdadeiro) ou Origem.
      let dx = spot.target.x;
      let dy = spot.target.y;
      if (fam.base === 'project' && p.settings.projectBasePoint) {
        dx -= p.settings.projectBasePoint.x;
        dy -= p.settings.projectBasePoint.y;
      } else if (fam.base === 'survey' && p.settings.surveyPoint) {
        const sx = dx - p.settings.surveyPoint.x;
        const sy = dy - p.settings.surveyPoint.y;
        const rad = ((p.settings.surveyPoint.trueNorthDeg ?? 0) * Math.PI) / 180;
        dx = sx * Math.cos(rad) + sy * Math.sin(rad);
        dy = -sx * Math.sin(rad) + sy * Math.cos(rad);
      }
      const c = spot.target;
      if (fam.planSymbol === 'target-bw') {
        fills.push({ polygons: [[quadrantPts(c, r, 0)]], color, alpha: 1 });
        fills.push({ polygons: [[quadrantPts(c, r, Math.PI)]], color, alpha: 1 });
      }
      if (fam.planSymbol !== 'crosshair') strokes.push({ pts: circlePts(c, r), closed: true, ...strokeStyle });
      const ext = r * 1.4;
      strokes.push({ pts: [{ x: c.x - ext, y: c.y }, { x: c.x + ext, y: c.y }], closed: false, ...strokeStyle });
      strokes.push({ pts: [{ x: c.x, y: c.y - ext }, { x: c.x, y: c.y + ext }], closed: false, ...strokeStyle });
      const pts = spot.elbow ? [c, spot.elbow, spot.at] : [c, spot.at];
      strokes.push({ pts, closed: false, ...strokeStyle });
      const text = `${fam.prefix}N ${formatMeasure(p, dy, fam.unit, fam.precision)}\n${fam.prefix}E ${formatMeasure(p, dx, fam.unit, fam.precision)}`;
      labels.push({ ...noteLabel(spot.at, text, fam.textMm, scale, 0), ...(isSel ? { color: selectColor } : {}) });
    }
  }
  return { fills, strokes, labels };
}

/** Gera arcos abaulados paramétricos ao longo de uma polilinha/retângulo de nuvem de revisão. */
export function revisionCloudStrokes(
  points: readonly Vec2[],
  closed: boolean,
  arcLengthM: number,
): Vec2[][] {
  if (points.length < 2) return [];
  const lobe = Math.max(0.05, arcLengthM);
  const out: Vec2[][] = [];
  const count = closed ? points.length : points.length - 1;
  for (let idx = 0; idx < count; idx++) {
    const p0 = points[idx]!;
    const p1 = points[(idx + 1) % points.length]!;
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-5) continue;
    // Normal apontando para fora em polígono anti-horário.
    const nx = dy / len;
    const ny = -dx / len;
    const lobes = Math.max(2, Math.round(len / lobe));
    const amp = (len / lobes) * 0.36;
    const edgePts: Vec2[] = [p0];
    for (let i = 0; i < lobes; i++) {
      const t0 = i / lobes;
      const t1 = (i + 1) / lobes;
      for (const k of [0.22, 0.5, 0.78, 1]) {
        const t = t0 + (t1 - t0) * k;
        const bulge = k === 1 ? 0 : Math.sin(k * Math.PI) * amp;
        edgePts.push({ x: p0.x + dx * t + nx * bulge, y: p0.y + dy * t + ny * bulge });
      }
    }
    out.push(edgePts);
  }
  return out;
}

/** Renderiza entidades únicas de Nuvem de Revisão (`RevisionCloud`). */
export function revisionCloudOps(
  p: Project,
  clouds: readonly RevisionCloud[],
  paint: PlanPaint,
  scale: number,
  look: ExtraOpsLook = {},
): { strokes: StrokeOp[]; labels: LabelOp[] } {
  const strokes: StrokeOp[] = [];
  const labels: LabelOp[] = [];
  if (!paint.visible || !clouds.length) return { strokes, labels };
  const sel = new Set(look.selection ?? []);
  const selectColor = look.selectColor ?? '#2563eb';
  const mPerMm = scale / 1000;
  for (const cloud of clouds) {
    const fam = revisionCloudFamilyFor(p.settings, cloud.familyId);
    const isSel = sel.has(cloud.id);
    const color = isSel ? selectColor : fam.color;
    const widthPx = isSel ? Math.max(2.4, fam.lineWidthPx + 0.8) : fam.lineWidthPx;
    for (const pts of revisionCloudStrokes(cloud.points, cloud.closed, fam.arcLengthMm * mPerMm)) {
      strokes.push({ pts, closed: false, widthPx, color, alpha: 1 });
    }
    if (cloud.revisionTag && cloud.points.length) {
      const top = cloud.points.reduce((best, q) => (q.y > best.y ? q : best), cloud.points[0]!);
      labels.push({ ...noteLabel({ x: top.x, y: top.y + 1.8 * mPerMm }, cloud.revisionTag, 2.0, scale, 0), ...(isSel ? { color: selectColor } : {}) });
    }
  }
  return { strokes, labels };
}

/** Renderiza símbolos únicos (Seta Norte) com estilos prontos de fábrica. */
export function symbolAnnotationOps(
  p: Project,
  symbols: readonly SymbolAnnotation[],
  paint: PlanPaint,
  scale: number,
  look: ExtraOpsLook = {},
): { fills: FillOp[]; strokes: StrokeOp[]; labels: LabelOp[] } {
  const fills: FillOp[] = [];
  const strokes: StrokeOp[] = [];
  const labels: LabelOp[] = [];
  if (!paint.visible || !symbols.length) return { fills, strokes, labels };
  const sel = new Set(look.selection ?? []);
  const selectColor = look.selectColor ?? '#2563eb';
  const mPerMm = scale / 1000;

  for (const sym of symbols) {
    const fam = northArrowFamilyFor(p.settings, sym.familyId);
    const isSel = sel.has(sym.id);
    const color = isSel ? selectColor : fam.color;
    const strokeStyle = { widthPx: isSel ? 2.0 : 1.3, color, alpha: 1 };
    const r = (fam.diameterMm / 2) * mPerMm;
    const rot = (pt: Vec2): Vec2 => {
      const c = Math.cos(sym.rotation);
      const s = Math.sin(sym.rotation);
      return add(sym.at, { x: pt.x * c - pt.y * s, y: pt.x * s + pt.y * c });
    };

    if (fam.style === 'nbr-minimal') {
      strokes.push({ pts: circlePts(sym.at, r, 32), closed: true, ...strokeStyle });
      const tip = rot({ x: 0, y: r * 1.15 });
      const left = rot({ x: -r * 0.42, y: -r * 0.45 });
      const right = rot({ x: r * 0.42, y: -r * 0.45 });
      const notch = rot({ x: 0, y: -r * 0.18 });
      fills.push({ polygons: [[[tip, right, notch]]], color, alpha: 1 });
      strokes.push({ pts: [tip, left, notch, right], closed: true, ...strokeStyle });
    } else if (fam.style === 'compass') {
      strokes.push({ pts: circlePts(sym.at, r, 32), closed: true, ...strokeStyle });
      strokes.push({ pts: circlePts(sym.at, r * 0.82, 32), closed: true, ...strokeStyle });
      const nTip = rot({ x: 0, y: r * 0.95 });
      const sTip = rot({ x: 0, y: -r * 0.95 });
      const ePt = rot({ x: r * 0.28, y: 0 });
      const wPt = rot({ x: -r * 0.28, y: 0 });
      fills.push({ polygons: [[[nTip, ePt, sym.at]]], color, alpha: 1 });
      fills.push({ polygons: [[[sTip, wPt, sym.at]]], color, alpha: 1 });
      strokes.push({ pts: [nTip, ePt, sTip, wPt], closed: true, ...strokeStyle });
      strokes.push({ pts: [nTip, sTip], closed: false, ...strokeStyle });
    } else {
      // Rosa dos ventos clássica (estrela de 4 pontas P&B).
      strokes.push({ pts: circlePts(sym.at, r * 0.72, 32), closed: true, ...strokeStyle });
      const dirs: Array<[Vec2, Vec2, Vec2]> = [
        [rot({ x: 0, y: r }), rot({ x: r * 0.18, y: r * 0.18 }), rot({ x: -r * 0.18, y: r * 0.18 })],
        [rot({ x: r, y: 0 }), rot({ x: r * 0.18, y: -r * 0.18 }), rot({ x: r * 0.18, y: r * 0.18 })],
        [rot({ x: 0, y: -r }), rot({ x: -r * 0.18, y: -r * 0.18 }), rot({ x: r * 0.18, y: -r * 0.18 })],
        [rot({ x: -r, y: 0 }), rot({ x: -r * 0.18, y: r * 0.18 }), rot({ x: -r * 0.18, y: -r * 0.18 })],
      ];
      for (const [tip, pA, pB] of dirs) {
        fills.push({ polygons: [[[sym.at, tip, pA]]], color, alpha: 1 });
        strokes.push({ pts: [sym.at, tip, pA], closed: true, ...strokeStyle });
        strokes.push({ pts: [sym.at, tip, pB], closed: true, ...strokeStyle });
      }
    }

    labels.push({ ...noteLabel(rot({ x: 0, y: r + 2.4 * mPerMm }), 'N', 2.4, scale, 0), ...(isSel ? { color: selectColor } : {}) });
    if (fam.showCardinals) {
      labels.push({ ...noteLabel(rot({ x: 0, y: -(r + 2.2 * mPerMm) }), 'S', 1.8, scale, 0), ...(isSel ? { color: selectColor } : {}) });
      labels.push({ ...noteLabel(rot({ x: r + 2.2 * mPerMm, y: 0 }), 'E', 1.8, scale, 0), ...(isSel ? { color: selectColor } : {}) });
      labels.push({ ...noteLabel(rot({ x: -(r + 2.2 * mPerMm), y: 0 }), 'W', 1.8, scale, 0), ...(isSel ? { color: selectColor } : {}) });
    }
  }
  return { fills, strokes, labels };
}
