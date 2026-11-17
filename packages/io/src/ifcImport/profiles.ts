import { applyMat, type IfcFile, type Pt2, type Pt3, pt3, unit3 } from './ifc.ts';
import { listOf, numOf, type StepEntity } from './step.ts';

/** Perfil já posicionado: anéis em planta (o primeiro é o contorno, os demais são furos). */
export interface Profile2D {
  loops: Pt2[][];
}

const to2 = (p: Pt3): Pt2 => ({ x: p.x, y: p.y });

function rect(w: number, d: number): Pt2[] {
  const hw = w / 2;
  const hd = d / 2;
  return [
    { x: -hw, y: -hd },
    { x: hw, y: -hd },
    { x: hw, y: hd },
    { x: -hw, y: hd },
  ];
}

function circle(r: number, n = 32): Pt2[] {
  const out: Pt2[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    out.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
  }
  return out;
}

/**
 * Pontos de uma curva 2D do IFC. Arcos (`IfcArcIndex` e `IfcTrimmedCurve`) saem amostrados com corda de até 1 mm; o que não
 * é reconhecido devolve `null` e o sólido cai para malha/ignorado.
 */
export function curvePoints(f: IfcFile, curve: StepEntity | undefined, depth = 0): Pt2[] | null {
  if (!curve || depth > 8) return null;
  switch (curve.type) {
    case 'IFCPOLYLINE': {
      const pts = f.list(curve, 0).map((p) => f.point(p ? { k: 'ref', id: p.id } : undefined));
      return pts.filter((p): p is Pt3 => !!p).map(to2);
    }
    case 'IFCINDEXEDPOLYCURVE':
      return indexedPoints(f, curve);
    case 'IFCCOMPOSITECURVE': {
      const out: Pt2[] = [];
      for (const seg of f.list(curve, 0)) {
        const parent = f.ent(seg, 2);
        const pts = curvePoints(f, parent, depth + 1);
        if (!pts) continue;
        for (const p of pts) {
          const last = out[out.length - 1];
          if (last && Math.hypot(last.x - p.x, last.y - p.y) < 1e-6) continue;
          out.push(p);
        }
      }
      return out.length >= 2 ? out : null;
    }
    case 'IFCTRIMMEDCURVE':
      return trimmedPoints(f, curve, depth);
    default:
      return null;
  }
}

/** Erro máximo (m) da amostragem de arcos: a corda fica a no máximo 1 mm do arco real. */
const ARC_TOLERANCE = 0.001;
/** Teto de segmentos por arco (um arco gigante com raio enorme não pode gerar milhares de pontos). */
const ARC_MAX_STEPS = 512;

/**
 * `IfcIndexedPolyCurve`: pontos (índice 1-based) e `Segments`. `IfcLineIndex` é uma reta entre os índices; `IfcArcIndex`
 * é um arco pelos três pontos, amostrado. Sem `Segments`, vale a ordem dos pontos.
 */
function indexedPoints(f: IfcFile, curve: StepEntity): Pt2[] | null {
  const coords = f.ent(curve, 0);
  if (!coords) return null;
  const L = f.units.length;
  const pts: Pt2[] = listOf(coords.args[0]).map((item) => {
    const nums = listOf(item).map((x) => numOf(x) ?? 0);
    return { x: (nums[0] ?? 0) * L, y: (nums[1] ?? 0) * L };
  });
  const at = (i: number): Pt2 | undefined => pts[i - 1];
  const out: Pt2[] = [];
  const add = (p: Pt2 | undefined): void => {
    if (!p) return;
    const last = out[out.length - 1];
    if (last && Math.hypot(last.x - p.x, last.y - p.y) < 1e-9) return;
    out.push(p);
  };
  const segments = listOf(curve.args[1]);
  if (!segments.length) pts.forEach(add);
  for (const seg of segments) {
    if (seg.k !== 'type') continue;
    const idx = listOf(seg.arg).map((v) => numOf(v) ?? 0);
    if (seg.name === 'IFCARCINDEX' && idx.length === 3) {
      const [a, b, c] = [at(idx[0] ?? 0), at(idx[1] ?? 0), at(idx[2] ?? 0)];
      if (a && b && c) arcPoints(a, b, c).forEach(add);
    } else {
      for (const i of idx) add(at(i));
    }
  }
  return out.length >= 2 ? out : null;
}

/**
 * Amostra o arco que passa por `a`, `b` e `c` (círculo pelos três pontos), com `a` e `c` nas pontas e a corda a no máximo
 * `ARC_TOLERANCE` do arco real. Pontos colineares viram reta. O arco segue para o lado em que está `b`.
 */
export function arcPoints(a: Pt2, b: Pt2, c: Pt2): Pt2[] {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  if (Math.abs(d) < 1e-12) return [a, c];
  const a2 = a.x * a.x + a.y * a.y;
  const b2 = b.x * b.x + b.y * b.y;
  const c2 = c.x * c.x + c.y * c.y;
  const cx = (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / d;
  const cy = (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / d;
  const r = Math.hypot(a.x - cx, a.y - cy);
  const TAU = Math.PI * 2;
  const ccw = (from: number, to: number): number => (((to - from) % TAU) + TAU) % TAU;
  const angA = Math.atan2(a.y - cy, a.x - cx);
  const angB = Math.atan2(b.y - cy, b.x - cx);
  const angC = Math.atan2(c.y - cy, c.x - cx);
  const forward = ccw(angA, angB) < ccw(angA, angC);
  const sweep = forward ? ccw(angA, angC) : ccw(angC, angA);
  const dir = forward ? 1 : -1;
  const step = r > ARC_TOLERANCE ? 2 * Math.acos(1 - ARC_TOLERANCE / r) : Math.PI;
  const n = Math.min(ARC_MAX_STEPS, Math.max(2, Math.ceil(sweep / step)));
  const out: Pt2[] = [a];
  for (let i = 1; i < n; i++) {
    const t = angA + (dir * sweep * i) / n;
    out.push({ x: cx + r * Math.cos(t), y: cy + r * Math.sin(t) });
  }
  out.push(c);
  return out;
}

/** `IfcTrimmedCurve`: reta (dois pontos) ou arco de círculo (amostrado). */
function trimmedPoints(f: IfcFile, curve: StepEntity, depth: number): Pt2[] | null {
  const basis = f.ent(curve, 0);
  if (!basis) return null;
  const trims = [...listOf(curve.args[1]), ...listOf(curve.args[2])];
  if (basis.type === 'IFCLINE') {
    const pts: Pt3[] = [];
    for (const t of trims) {
      const p = f.point(t);
      if (p) pts.push(p);
    }
    const a = pts[0];
    const b = pts[1] ?? pts[0];
    return a && b ? [to2(a), to2(b)] : null;
  }
  if (basis.type === 'IFCCIRCLE') {
    const m = f.axisPlacement(basis.args[0]);
    const r = (f.num(basis, 1) ?? 0) * f.units.length;
    if (r <= 0) return null;
    const center = applyMat(m, pt3(0, 0, 0));
    const angles: number[] = [];
    for (const t of trims) {
      const p = f.point(t);
      if (p) {
        angles.push(Math.atan2(p.y - center.y, p.x - center.x));
        continue;
      }
      const n = numOf(t);
      if (n != null) angles.push(n * f.units.angle);
    }
    if (angles.length < 2) return null;
    let a0 = angles[0] ?? 0;
    let a1 = angles[1] ?? 0;
    const sense = f.enum(curve, 3) !== 'F';
    if (!sense) [a0, a1] = [a1, a0];
    if (a1 <= a0) a1 += Math.PI * 2;
    const n = Math.max(2, Math.ceil(((a1 - a0) / (Math.PI * 2)) * 32));
    const out: Pt2[] = [];
    for (let i = 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      out.push({ x: center.x + Math.cos(a) * r, y: center.y + Math.sin(a) * r });
    }
    return out;
  }
  return depth > 0 ? null : curvePoints(f, basis, depth + 1);
}

/** Anéis de um `IfcProfileDef`, já com o `Position` do perfil aplicado. */
export function profileLoops(f: IfcFile, profile: StepEntity | undefined): Profile2D | null {
  if (!profile) return null;
  const place = (pts: Pt2[], at: StepEntity | undefined): Pt2[] => {
    if (!at) return pts;
    const m = f.axisPlacement({ k: 'ref', id: at.id });
    return pts.map((p) => {
      const w = applyMat(m, pt3(p.x, p.y, 0));
      return { x: w.x, y: w.y };
    });
  };
  const L = f.units.length;
  switch (profile.type) {
    case 'IFCRECTANGLEPROFILEDEF':
    case 'IFCROUNDEDRECTANGLEPROFILEDEF': {
      const w = (f.num(profile, 3) ?? 0) * L;
      const d = (f.num(profile, 4) ?? 0) * L;
      return { loops: [place(rect(w, d), f.ent(profile, 2))] };
    }
    case 'IFCRECTANGLEHOLLOWPROFILEDEF': {
      const w = (f.num(profile, 3) ?? 0) * L;
      const d = (f.num(profile, 4) ?? 0) * L;
      const t = (f.num(profile, 5) ?? 0) * L;
      const inner = rect(Math.max(w - 2 * t, 0.001), Math.max(d - 2 * t, 0.001)).reverse();
      return { loops: [place(rect(w, d), f.ent(profile, 2)), place(inner, f.ent(profile, 2))] };
    }
    case 'IFCCIRCLEPROFILEDEF':
    case 'IFCCIRCLEHOLLOWPROFILEDEF': {
      const r = (f.num(profile, 3) ?? 0) * L;
      return { loops: [place(circle(r), f.ent(profile, 2))] };
    }
    case 'IFCELLIPSEPROFILEDEF': {
      const a = (f.num(profile, 3) ?? 1) * L;
      const b = (f.num(profile, 4) ?? 1) * L;
      const pts: Pt2[] = [];
      for (let i = 0; i < 24; i++) {
        const t = (i / 24) * Math.PI * 2;
        pts.push({ x: Math.cos(t) * a, y: Math.sin(t) * b });
      }
      return { loops: [place(pts, f.ent(profile, 2))] };
    }
    case 'IFCARBITRARYCLOSEDPROFILEDEF':
    case 'IFCARBITRARYPROFILEDEFWITHVOIDS': {
      const outer = curvePoints(f, f.ent(profile, 2));
      if (!outer) return null;
      const loops: Pt2[][] = [outer];
      for (const inner of f.list(profile, 3)) {
        const pts = curvePoints(f, inner);
        if (pts) loops.push(pts);
      }
      return { loops };
    }
    case 'IFCISHAPEPROFILEDEF':
      return rectProfile(f, profile, 3, 4);
    case 'IFCUSHAPEPROFILEDEF':
      return rectProfile(f, profile, 3, 4);
    case 'IFCLSHAPEPROFILEDEF':
      return rectProfile(f, profile, 3, 4);
    case 'IFCTSHAPEPROFILEDEF':
      return rectProfile(f, profile, 3, 4);
    case 'IFCZSHAPEPROFILEDEF':
      return rectProfile(f, profile, 3, 4);
    case 'IFCCSHAPEPROFILEDEF':
      return rectProfile(f, profile, 3, 4);
    case 'IFCTRAPEZIUMPROFILEDEF': {
      const bot = (f.num(profile, 3) ?? 0) * L;
      const top = (f.num(profile, 4) ?? 0) * L;
      const h = (f.num(profile, 5) ?? 0) * L;
      const off = (f.num(profile, 6) ?? 0) * L;
      const pts = [
        { x: -bot / 2, y: -h / 2 },
        { x: bot / 2, y: -h / 2 },
        { x: off + top / 2, y: h / 2 },
        { x: off - top / 2, y: h / 2 },
      ];
      return { loops: [place(pts, f.ent(profile, 2))] };
    }
    case 'IFCDERIVEDPROFILEDEF':
      return profileLoops(f, f.ent(profile, 2));
    case 'IFCCOMPOSITEPROFILEDEF': {
      const loops: Pt2[][] = [];
      for (const p of f.list(profile, 2)) {
        const sub = profileLoops(f, p);
        if (sub) loops.push(...sub.loops);
      }
      return loops.length ? { loops } : null;
    }
    default:
      return null;
  }
}

/** Perfis de seção metálica: a v1 usa a caixa envolvente (o desenho exato fica para o 3D genérico). */
function rectProfile(f: IfcFile, p: StepEntity, wa: number, da: number): Profile2D | null {
  const w = (f.num(p, wa) ?? 0) * f.units.length;
  const d = (f.num(p, da) ?? 0) * f.units.length;
  if (w <= 0 || d <= 0) return null;
  const m = f.axisPlacement(f.ent(p, 2) ? { k: 'ref', id: f.ent(p, 2)!.id } : undefined);
  return {
    loops: [
      rect(w, d).map((q) => {
        const w3 = applyMat(m, pt3(q.x, q.y, 0));
        return { x: w3.x, y: w3.y };
      }),
    ],
  };
}

export const profileUnitNormal = (a: Pt2, b: Pt2): Pt2 => unit2(b.x - a.x, b.y - a.y);

function unit2(x: number, y: number): Pt2 {
  const l = Math.hypot(x, y) || 1;
  return { x: x / l, y: y / l };
}

export const norm2 = unit3;
