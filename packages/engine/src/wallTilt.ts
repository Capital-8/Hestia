/**
 * Parede inclinada (F2.2): funções puras. Convenção: `tilt` em graus, positivo = topo desloca para a ESQUERDA de a→b
 * (como o sinal de `sag`). Rotação em torno da linha de base: d(z) = z·tan(tilt). H = altura vertical;
 * t = espessura perpendicular à face. Fórmulas: docs/parede-formas/METODOLOGIA.md 4.1.
 */
export interface Pt { x: number; y: number }
export interface AxisAtLevel { a: Pt; b: Pt; sag: number }

export const TILT_MAX_DEG = 60;
const rad = (deg: number): number => (deg * Math.PI) / 180;

/** Deslocamento horizontal (assinado, + = esquerda de a→b) do plano médio na cota z. */
export function tiltOffset(z: number, tiltDeg: number): number {
  return z * Math.tan(rad(tiltDeg));
}

/** Espessura medida na horizontal: t/cosθ. */
export function thicknessHorizontal(t: number, tiltDeg: number): number {
  return t / Math.cos(rad(tiltDeg));
}

/** s = +1 se o topo se afasta do centro do arco, −1 se se aproxima, 0 sem inclinação ou sem arco. */
export function arcTiltSide(sag: number, tiltDeg: number): -1 | 0 | 1 {
  if (!(sag !== 0) || !(tiltDeg !== 0)) return 0;
  // Centro do lado de `sag`; o topo vai para a esquerda quando tilt > 0.
  return Math.sign(sag) * Math.sign(tiltDeg) > 0 ? -1 : 1;
}

/** Raio do eixo a partir da corda c e da flecha |sag| (4.1). */
export function arcRadius(chord: number, sag: number): number {
  const s = Math.abs(sag);
  return (chord * chord / 4 + s * s) / (2 * s);
}

/** Eixo no nível z. Reta: a e b deslocados d(z) pela normal esquerda. Arco: raio R ± d(z), ângulo φ e centro constantes. */
export function axisAtLevel(a: Pt, b: Pt, sag: number, z: number, tiltDeg: number): AxisAtLevel {
  const dx = b.x - a.x, dy = b.y - a.y;
  const c = Math.hypot(dx, dy);
  const d = tiltOffset(z, tiltDeg);
  if (sag === 0 || c === 0) {
    const nx = c === 0 ? 0 : -dy / c, ny = c === 0 ? 0 : dx / c;
    return { a: { x: a.x + nx * d, y: a.y + ny * d }, b: { x: b.x + nx * d, y: b.y + ny * d }, sag: 0 };
  }
  const R = arcRadius(c, sag);
  const sg = Math.sign(sag);
  const cosH = (R - Math.abs(sag)) / R; // cos(φ/2); ≤ 0 quando o arco passa de 180° (não ocorre: |sag| ≤ c/2)
  const nx = -dy / c, ny = dx / c;
  const cen = { x: (a.x + b.x) / 2 + sg * nx * R * cosH, y: (a.y + b.y) / 2 + sg * ny * R * cosH };
  const Rz = R - sg * d; // topo à esquerda aproxima o centro quando o centro está à esquerda
  const k = Rz / R;
  return {
    a: { x: cen.x + (a.x - cen.x) * k, y: cen.y + (a.y - cen.y) * k },
    b: { x: cen.x + (b.x - cen.x) * k, y: cen.y + (b.y - cen.y) * k },
    sag: sg * Rz * (1 - cosH),
  };
}

/** Comprimento do eixo na cota z. Reta: L. Arco: φ·(R + s·z·tanθ). */
export function axisLengthAtLevel(L: number, z: number, tiltDeg: number): number;
export function axisLengthAtLevel(R: number, phi: number, z: number, tiltDeg: number, s: -1 | 0 | 1): number;
export function axisLengthAtLevel(...args: number[]): number {
  if (args.length === 3) return args[0] ?? 0;
  const [R = 0, phi = 0, z = 0, tiltDeg = 0, s = 0] = args;
  return phi * (R + s * z * Math.tan(rad(Math.abs(tiltDeg))));
}

export interface StraightTiltInput { L: number; H: number; t: number; tiltDeg: number }
export interface ArcTiltInput { R: number; phi: number; H: number; t: number; tiltDeg: number; s: -1 | 0 | 1 }

/** Volume sem junções e sem vãos: reta L·H·t/cosθ. */
export function volumeStraight({ L, H, t, tiltDeg }: StraightTiltInput): number {
  return (L * H * t) / Math.cos(rad(tiltDeg));
}
/** Área real da face no eixo: reta L·H/cosθ. */
export function faceAreaStraight({ L, H, tiltDeg }: StraightTiltInput): number {
  return (L * H) / Math.cos(rad(tiltDeg));
}
/** Volume do arco: φ·H·(t/cosθ)·(R + s·H·tanθ/2). */
export function volumeArc({ R, phi, H, t, tiltDeg, s }: ArcTiltInput): number {
  const th = rad(Math.abs(tiltDeg));
  return phi * H * (t / Math.cos(th)) * (R + (s * H * Math.tan(th)) / 2);
}
/** Área real da face do arco no eixo: φ·(H/cosθ)·(R + s·H·tanθ/2). */
export function faceAreaArc({ R, phi, H, tiltDeg, s }: Omit<ArcTiltInput, 't'>): number {
  const th = rad(Math.abs(tiltDeg));
  return phi * (H / Math.cos(th)) * (R + (s * H * Math.tan(th)) / 2);
}

/**
 * Validade: |tilt| ≤ 60 e, para arco (R finito), R − H·tan|θ| > t/(2cosθ) + 0,01 (o arco não se fecha).
 * Reta: omitir `R` (ou Infinity).
 */
export function tiltValid(p: { tiltDeg: number; H: number; t: number; R?: number }): boolean {
  const { tiltDeg, H, t, R } = p;
  if (!Number.isFinite(tiltDeg) || !Number.isFinite(H) || !Number.isFinite(t) || Math.abs(tiltDeg) > TILT_MAX_DEG) return false;
  if (R === undefined || R === Infinity) return true;
  if (!Number.isFinite(R)) return false;
  const th = rad(Math.abs(tiltDeg));
  return R - H * Math.tan(th) > t / (2 * Math.cos(th)) + 0.01;
}
