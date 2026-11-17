/**
 * SPIKE (tarefa 1a, docs/estudo-esquadrias/09-spike-furo-por-contorno.md): contorno não retangular do vão e sua
 * aproximação em faixas horizontais. Código experimental, sem consumidores no produto.
 *
 * Sistema do contorno: x ao longo da parede (origem no meio da base), z para cima (origem na base do vão).
 * Anel anti-horário, aberto (o último ponto não repete o primeiro). Cotas em metros.
 */

export type OutlineKind = 'rect' | 'round' | 'segmental';
/** Ponto do contorno: [x, z]. */
export type OPt = readonly [number, number];

/** Erro máximo (m) entre a corda e o arco verdadeiro. */
export const CHORD_TOL = 0.001;

/**
 * Contorno do vão.
 * - `rect`: retângulo `w` x `h` (rise ignorado).
 * - `round`: arco pleno (meia-lua quando `h = w/2`): semicírculo de raio `w/2` no topo (rise ignorado, vale `w/2`).
 * - `segmental`: arco abatido, flecha `rise` (0 < rise < w/2); a nascença fica em `h - rise`.
 * `inset` > 0 recua as laterais e o topo (arco concentrico, raio R - inset); a base fica em z = 0 (vão de parede).
 * Devolve [] se o recuo consome a forma. Cordas com erro <= `tol`.
 */
export function outline(kind: OutlineKind, w: number, h: number, rise: number, inset = 0, tol = CHORD_TOL): OPt[] {
  const half = w / 2 - inset;
  if (!(w > 0) || !(h > 0) || half <= 0) return [];
  if (kind === 'rect') {
    const top = h - inset;
    return top <= 0 ? [] : [[half, 0], [half, top], [-half, top], [-half, 0]];
  }
  const f = kind === 'round' ? w / 2 : rise;
  if (!(f > 0) || f > w / 2 + 1e-12 || f > h + 1e-12) throw new Error(`flecha inválida: ${f}`);
  const R = (w * w / 4 + f * f) / (2 * f); // raio do arco externo
  const zc = h - R; // centro do arco
  const R2 = R - inset;
  if (R2 <= 0) return [];
  const zs = zc + Math.sqrt(Math.max(0, R2 * R2 - half * half)); // nascença do arco recuado
  const a0 = Math.atan2(zs - zc, half); // ângulo da ombreira direita
  const a1 = Math.PI - a0;
  const dθ = 2 * Math.acos(Math.max(-1, 1 - tol / R2)); // passo máximo para sagita <= tol
  const n = Math.max(2, 2 * Math.ceil((a1 - a0) / dθ / 2)); // par: a coroa (x = 0) é um vértice e o topo é exatamente h
  const pts: Array<[number, number]> = [[half, 0]];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    pts.push([R2 * Math.cos(a), zc + R2 * Math.sin(a)]);
  }
  pts.push([-half, 0]);
  // Remove pontos consecutivos coincidentes (meia-lua: nascença em z = 0).
  return pts.filter((p, i) => i === 0 || Math.hypot(p[0] - pts[i - 1]![0], p[1] - pts[i - 1]![1]) > 1e-9);
}

/** Área do anel (fórmula do cadarço, valor absoluto). */
export function ringArea(r: readonly OPt[]): number {
  let a = 0;
  for (let i = 0; i < r.length; i++) {
    const p = r[i]!;
    const q = r[(i + 1) % r.length]!;
    a += p[0] * q[1] - q[0] * p[1];
  }
  return Math.abs(a) / 2;
}

/** Meia-largura do contorno (simétrico e convexo) na altura z: maior |x| da interseção da reta horizontal com o anel. */
export function halfWidthAt(r: readonly OPt[], z: number): number {
  let m = 0;
  for (let i = 0; i < r.length; i++) {
    const p = r[i]!;
    const q = r[(i + 1) % r.length]!;
    const lo = Math.min(p[1], q[1]);
    const hi = Math.max(p[1], q[1]);
    if (z < lo - 1e-12 || z > hi + 1e-12) continue;
    const x = hi - lo < 1e-12 ? Math.max(Math.abs(p[0]), Math.abs(q[0])) : Math.abs(p[0] + ((q[0] - p[0]) * (z - p[1])) / (q[1] - p[1]));
    if (x > m) m = x;
  }
  return m;
}

/** Faixa horizontal do furo: retângulo centrado de meia-largura `half` entre z0 e z1. */
export interface HoleSlice {
  z0: number;
  z1: number;
  half: number;
}

/** Como a meia-largura de cada faixa é escolhida: `outer` (a da cota mais baixa, o furo contém o contorno), `mid` (a do meio, erro de área ~ zero) ou `inner`. */
export type SliceMode = 'outer' | 'mid' | 'inner';

/**
 * Aproxima o contorno por faixas horizontais. Os níveis de quebra são: base, nascença (se a parte reta existe) e `n`
 * passos de IGUAL COMPRIMENTO DE ARCO ao longo da curva (o erro de escada fica ~ constante; passos iguais em z ou em
 * x deixam a coroa ou a ombreira grosseiras). A faixa de baixo (parte reta) é uma só.
 */
export function holeSlices(ring: readonly OPt[], n: number, mode: SliceMode = 'mid'): HoleSlice[] {
  if (ring.length < 3) return [];
  const zTop = Math.max(...ring.map((p) => p[1]));
  // Nascença: a cota mais alta entre os vértices de máxima largura (a ombreira); 0 na meia-lua.
  const xMax = Math.max(...ring.map((p) => Math.abs(p[0])));
  const zs = Math.max(...ring.filter((p) => Math.abs(p[0]) >= xMax - 1e-9).map((p) => p[1]));
  const levels: number[] = [0];
  if (zs > 1e-9) levels.push(zs);
  // Percurso do arco do lado direito (da nascença à coroa), comprimento acumulado.
  const arc = ring.filter((p) => p[0] >= -1e-12 && p[1] >= zs - 1e-12).sort((a, b) => a[1] - b[1]);
  const len = [0];
  for (let i = 1; i < arc.length; i++) len.push(len[i - 1]! + Math.hypot(arc[i]![0] - arc[i - 1]![0], arc[i]![1] - arc[i - 1]![1]));
  const total = len[len.length - 1] ?? 0;
  for (let k = 1; k < n; k++) {
    const s = (total * k) / n;
    let j = 1;
    while (j < len.length - 1 && len[j]! < s) j++;
    const t = (s - len[j - 1]!) / Math.max(1e-12, len[j]! - len[j - 1]!);
    levels.push(arc[j - 1]![1] + t * (arc[j]![1] - arc[j - 1]![1]));
  }
  levels.push(zTop);
  const zs2 = [...new Set(levels.map((z) => Math.round(z * 1e9) / 1e9))].sort((a, b) => a - b);
  const out: HoleSlice[] = [];
  for (let i = 0; i + 1 < zs2.length; i++) {
    const z0 = zs2[i]!;
    const z1 = zs2[i + 1]!;
    if (z1 - z0 < 1e-9) continue;
    const e = 1e-7; // evita o vértice exato (a meia-largura é descontínua em z0 numa quebra horizontal)
    const half = mode === 'outer' ? halfWidthAt(ring, z0 + e) : mode === 'inner' ? halfWidthAt(ring, z1 - e) : halfWidthAt(ring, (z0 + z1) / 2);
    out.push({ z0, z1, half });
  }
  return out;
}

/** Área coberta pelas faixas (m²). */
export const slicesArea = (s: readonly HoleSlice[]): number => s.reduce((a, b) => a + 2 * b.half * (b.z1 - b.z0), 0);
