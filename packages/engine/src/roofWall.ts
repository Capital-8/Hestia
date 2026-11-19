import { arcFromSagitta, arcPointAt, cross, dist, dot, intersectSegments, sub, type Vec2 } from '@hestia/geom';
import type { ProfilePoint, Wall } from '@hestia/model';
import { roofThickness, roofTopAt, type ResolvedRoof } from './roofs.ts';

/** Altura mínima de uma parede sob o telhado (1 cm), como em wallZ. */
const MIN_HEIGHT = 0.01;
/** Afastamento (m) ao longo do eixo para medir um salto de cota dos dois lados de uma divisa. */
const DELTA = 1e-6;
/** Salto de cota (m) acima do qual a divisa é um degrau real (faces que não se encontram), não inclinação contínua. */
const STEP = 1e-3;
/** Tolerância (m) para um vértice de telhado contar como sobre o eixo da parede. */
const ON_AXIS = 1e-7;
/** Passo máximo (m) ao longo do arco de uma parede curva para amostrar a face inferior do telhado. */
const ARC_STEP = 0.25;
/** Precisão (m) do ponto em que o arco entra ou sai do telhado. */
const ARC_EPS = 1e-6;

/** Eixo da parede com os telhados que o cobrem: comprimento, pontos de quebra e face inferior do telhado em cada t. */
interface AxisRoofs {
  L: number;
  bps: number[];
  /** Face inferior do telhado sobre o ponto do eixo a distância t, ou null fora de todos os telhados. */
  bottomAt: (t: number) => number | null;
}

/**
 * Eixo da parede (reta ou curva) contra os telhados que cobrem o eixo: comprimento, quebras e face inferior.
 * Reta: quebras exatas nas bordas. Curva (sag ≠ 0): o eixo é o arco; quebras por amostragem a cada ARC_STEP e pelos
 * pontos em que o arco entra ou sai do telhado. Arco degenerado ou comprimento nulo, null.
 *
 * O nível do telhado NÃO decide o anexo: a cobertura costuma ser desenhada no nível de cima (ou o telhado muda de nível
 * depois, `setElementLevel`), e a parede continua embaixo dele. Vale o telhado que cobre o eixo, de qualquer nível, e a
 * face usada é a mais baixa ACIMA da base `baseZ` da parede (face abaixo da base não daria altura à parede). Com telhado
 * escolhido (`attachTopRoofId`), só ele conta.
 */
function axisRoofs(w: Wall, roofs: ResolvedRoof[], baseZ: number, half = 0): AxisRoofs | null {
  const rs = w.attachTopRoofId ? roofs.filter((r) => r.roofId === w.attachTopRoofId) : roofs;
  const arc = w.sag !== 0 ? arcFromSagitta(w.a, w.b, w.sag) : null;
  if (w.sag !== 0 && !arc) return null;
  const L = arc ? arc.length : dist(w.a, w.b);
  if (L < 1e-9) return null;
  const u = { x: (w.b.x - w.a.x) / L, y: (w.b.y - w.a.y) / L };
  const pointAt = (t: number): Vec2 => (arc ? arcPointAt(arc, t) : { x: w.a.x + u.x * t, y: w.a.y + u.y * t });
  const bottomAt = (t: number): number | null => {
    const p = pointAt(t);
    // Cobertura decidida pelo eixo; com `half` (parede anexada em toda a espessura) o topo é o mais baixo entre o eixo
    // e as duas faces (deslocamento perpendicular ao eixo), nos pontos que o telhado cobre.
    const samples = half > 0 ? [p, ...faceSamples(w, arc, t, p, half)] : [p];
    let z: number | null = null;
    let axisCovered = false;
    samples.forEach((q, k) => {
      for (const r of rs) {
        const top = roofTopAt(r, q);
        if (top === null) continue;
        if (k === 0) axisCovered = true;
        const bottom = top - roofThickness(r);
        // Face no nível da base ou abaixo dela não serve para o topo: a parede ficaria sem altura.
        if (bottom <= baseZ + MIN_HEIGHT) continue;
        z = z === null ? bottom : Math.min(z, bottom);
      }
    });
    return axisCovered ? z : null;
  };
  const bps = arc ? curveBreakpoints(L, (t) => bottomAt(t) !== null) : breakpoints(w, rs, L, u);
  return { L, bps, bottomAt };
}

/** Pontos das duas faces da parede na posição t do eixo (a `half` metros do eixo, na normal). */
function faceSamples(w: Wall, arc: ReturnType<typeof arcFromSagitta>, t: number, p: Vec2, half: number): Vec2[] {
  let nx: number;
  let ny: number;
  if (arc) {
    const r = arcPointAt(arc, Math.min(arc.length, t + 1e-4));
    const q = arcPointAt(arc, Math.max(0, t - 1e-4));
    const d = Math.hypot(r.x - q.x, r.y - q.y) || 1;
    nx = -(r.y - q.y) / d;
    ny = (r.x - q.x) / d;
  } else {
    const d = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y) || 1;
    nx = -(w.b.y - w.a.y) / d;
    ny = (w.b.x - w.a.x) / d;
  }
  return [{ x: p.x + nx * half, y: p.y + ny * half }, { x: p.x - nx * half, y: p.y - ny * half }];
}

/**
 * Quebras de um arco de comprimento L: amostras a cada ARC_STEP e, entre duas amostras de cobertura diferente, o ponto
 * em que o arco entra ou sai do telhado (bissecção até ARC_EPS). Entre quebras a face inferior varia pouco, então o
 * mínimo e o trecho sem telhado saem das quebras como no eixo reto. Um trecho coberto menor que ARC_STEP entre duas
 * amostras sem telhado pode passar sem ser amostrado.
 */
function curveBreakpoints(L: number, covered: (t: number) => boolean): number[] {
  const n = Math.max(1, Math.ceil(L / ARC_STEP));
  const out: number[] = [0];
  for (let i = 0; i < n; i++) {
    const a = (L * i) / n;
    const b = (L * (i + 1)) / n;
    if (covered(a) !== covered(b)) {
      const inside = covered(a);
      let lo = a;
      let hi = b;
      while (hi - lo > ARC_EPS) {
        const m = (lo + hi) / 2;
        if (covered(m) === inside) lo = m;
        else hi = m;
      }
      out.push((lo + hi) / 2);
    }
    out.push(b);
  }
  return out;
}

/**
 * Perfil superior de uma parede reta anexada ao telhado (decisão 0008, item 6): a cota do topo é a face INFERIOR do telhado
 * ao longo do eixo (cota da face superior menos a espessura total), relativa à base `baseZ`. Só o trecho do eixo coberto
 * pelo telhado segue o telhado; o trecho sem telhado fica na altura normal `normalTop` (absoluta), com um degrau no limite.
 * Amostras: extremos do eixo, cada divisa entre águas e cada borda do telhado que o eixo cruza, e um ponto médio entre duas
 * amostras seguidas. Entre telhados que cobrem o mesmo ponto vale a face inferior mais baixa acima da base da parede (o
 * telhado pode estar em qualquer nível: ver `axisRoofs`). Sem nenhum trecho coberto, null (a parede segue a altura normal).
 * Parede curva não usa perfil. `half` > 0 (metade da espessura, `Wall.attachTopRoofFull`): o topo vale o ponto mais baixo
 * entre o eixo e as duas faces. Nas divisas entre águas o perfil ganha quebra onde o eixo cruza; o corte exato pelas
 * faces é conservador (a parede nunca fura a água; sobra no máximo inclinação × meia espessura na face mais alta).
 */
export function roofWallProfile(w: Wall, roofs: ResolvedRoof[], baseZ: number, normalTop: number, half = 0): ProfilePoint[] | null {
  if (w.sag !== 0) return null;
  const ax = axisRoofs(w, roofs, baseZ, half);
  if (!ax) return null;
  const { L, bps, bottomAt } = ax;
  const mids = bps.slice(0, -1).map((t, i) => (t + bps[i + 1]!) / 2);
  if (![...bps, ...mids].some((t) => bottomAt(t) !== null)) return null;
  const topAt = (t: number): number => bottomAt(t) ?? normalTop;
  const pt = (t: number, z: number): ProfilePoint => ({ t, h: Math.max(MIN_HEIGHT, z - baseZ) });
  const out: ProfilePoint[] = [];
  for (let i = 0; i < bps.length; i++) {
    const t = bps[i]!;
    const hv = topAt(t);
    if (t > 0 && t < L) {
      const jl = topAt(t - DELTA);
      const jr = topAt(t + DELTA);
      if (Math.abs(jl - jr) > STEP) {
        out.push(pt(t, jl), pt(t, jr));
        continue;
      }
    }
    out.push(pt(t, hv));
    const next = bps[i + 1];
    if (next !== undefined) {
      const m = (t + next) / 2;
      out.push(pt(m, topAt(m)));
    }
  }
  return out.length >= 2 ? out : null;
}

/** Cobertura do eixo de uma parede pelos telhados: comprimento, trecho sem telhado e menor face inferior coberta. */
export interface RoofAxisReport {
  length: number;
  /** Comprimento do eixo que não está sob telhado nenhum (m). */
  uncovered: number;
  /** Menor face inferior de telhado sobre o eixo coberto (cota absoluta); null sem telhado. */
  minBottom: number | null;
}

/**
 * Relatório de cobertura do eixo (reta ou curva, medido ao longo do arco): o aviso usa este relatório. `baseZ` é a base
 * da parede: faces de telhado na base ou abaixo dela não contam (não dão altura à parede). Sem `baseZ`, vale toda face.
 * Null só em parede de comprimento nulo ou arco degenerado.
 */
export function roofAxisReport(w: Wall, roofs: ResolvedRoof[], baseZ = -Infinity): RoofAxisReport | null {
  const ax = axisRoofs(w, roofs, baseZ);
  if (!ax) return null;
  const { L, bps, bottomAt } = ax;
  let uncovered = 0;
  for (let i = 0; i + 1 < bps.length; i++) {
    const t0 = bps[i]!;
    const t1 = bps[i + 1]!;
    if (bottomAt((t0 + t1) / 2) === null) uncovered += t1 - t0;
  }
  // A face inferior é linear entre quebras, então o mínimo está numa quebra.
  let minBottom: number | null = null;
  for (const t of bps) {
    const z = bottomAt(t);
    if (z !== null) minBottom = minBottom === null ? z : Math.min(minBottom, z);
  }
  return { length: L, uncovered, minBottom };
}

/** Parâmetros t (0..L) onde o eixo cruza as bordas das águas e onde há vértices sobre ele, com os extremos. */
function breakpoints(w: Wall, rs: ResolvedRoof[], L: number, u: Vec2): number[] {
  const ts = new Set<number>([0, L]);
  const a = w.a;
  const b = w.b;
  for (const r of rs) {
    for (const pl of r.planes) {
      for (const poly of pl.polygon) {
        for (const ring of poly) {
          ring.forEach((c, i) => {
            const d = ring[(i + 1) % ring.length]!;
            const x = intersectSegments(a, b, c, d);
            if (x) ts.add(dot(sub(x, a), u));
            if (Math.abs(cross(u, sub(c, a))) < ON_AXIS) ts.add(dot(sub(c, a), u));
          });
        }
      }
    }
  }
  const sorted = [...ts].filter((t) => t >= 0 && t <= L).sort((x, y) => x - y);
  return sorted.filter((t, i) => i === 0 || t - sorted[i - 1]! > 1e-9);
}
