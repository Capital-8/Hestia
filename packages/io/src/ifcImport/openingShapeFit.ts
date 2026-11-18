/**
 * Reconhece a forma de um vão a partir do contorno 2D do seu perfil IFC (x = largura ao longo da parede, y = altura).
 * Candidatas: retângulo, círculo/elipse, arco pleno, arco abatido, ogival, empena, trapézio e ferradura (a flecha é procurada numa grade e
 * refinada; o trapézio sai das larguras da base e do topo; a ferradura, da largura da base). A forma com menor desvio de Hausdorff (vértices contra segmentos, nos
 * dois sentidos) vence.
 *
 * - desvio <= `FORMA_EXATA_TOL`: forma exata, sem aviso;
 * - desvio <= `FORMA_PROXIMA_TOL`: forma livre, aproximada pela mais próxima (quem chama avisa o desvio);
 * - acima disso: polígono livre (`polygon`, exato e sem aviso) se o contorno é um polígono simples e válido (docs/estudo-esquadrias/32);
 *   senão `null`, e o vão segue como caixa envolvente (contorno com auto-interseção, por exemplo).
 *
 * [I] A orientação do perfil (y para cima, base em y mínimo) é a mesma suposição de `outlineIsNotRect`; perfil de cabeça
 * para baixo não é reconhecido e cai na caixa envolvente.
 */
import { MAX_POLYGON_POINTS, cleanRing, outline, ringIsSimple, validateOpeningShape, type OpeningShape, type OPt } from '@hestia/model';
import type { Pt2 } from './ifc.ts';

/** Desvio (m) abaixo do qual a forma é considerada exata. Cordas de 1 mm nos dois lados, com folga. */
export const FORMA_EXATA_TOL = 0.004;
/** Desvio (m) acima do qual o contorno não é aproximado por nenhuma forma do modelo. */
export const FORMA_PROXIMA_TOL = 0.05;

/** Passos da grade de flecha (arco abatido e ogival) antes do refinamento. */
const GRADE = 60;
const REFINO = 40;

export interface ShapeFit {
  shape: OpeningShape;
  /** Desvio máximo (m) entre o contorno e a forma escolhida. */
  dev: number;
  exact: boolean;
}

type Ring = ReadonlyArray<OPt>;

/** Distância de um ponto ao segmento ab. */
function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Maior distância de um vértice de `pts` ao anel `ring` (segmentos fechados). */
function oneSided(pts: Ring, ring: Ring): number {
  let worst = 0;
  for (const [px, py] of pts) {
    let best = Infinity;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]!;
      const b = ring[(i + 1) % ring.length]!;
      best = Math.min(best, distToSegment(px, py, a[0], a[1], b[0], b[1]));
    }
    worst = Math.max(worst, best);
  }
  return worst;
}

/** Desvio simétrico (Hausdorff) entre dois anéis fechados. */
const hausdorff = (a: Ring, b: Ring): number => Math.max(oneSided(a, b), oneSided(b, a));

/** Anel do perfil com o vértice de fechamento e os repetidos tirados; centro em x = 0 e base em z = 0. Null se degenerado. */
function normalize(loop: readonly Pt2[]): { ring: OPt[]; w: number; h: number } | null {
  const pts: OPt[] = [];
  for (const p of loop) {
    const last = pts[pts.length - 1];
    if (last && Math.abs(last[0] - p.x) < 1e-9 && Math.abs(last[1] - p.y) < 1e-9) continue;
    pts.push([p.x, p.y]);
  }
  if (pts.length > 1 && Math.abs(pts[0]![0] - pts[pts.length - 1]![0]) < 1e-9 && Math.abs(pts[0]![1] - pts[pts.length - 1]![1]) < 1e-9) pts.pop();
  if (pts.length < 3) return null;
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMin = Math.min(...ys);
  const w = xMax - xMin;
  const h = Math.max(...ys) - yMin;
  if (!(w > 1e-6 && h > 1e-6)) return null;
  const cx = (xMin + xMax) / 2;
  return { ring: pts.map(([x, y]): OPt => [x - cx, y - yMin]), w, h };
}

/** Desvio entre o anel normalizado e a forma, ou `Infinity` se a forma não é válida. */
function devOf(ring: Ring, shape: OpeningShape): number {
  if (validateOpeningShape(shape).length > 0) return Infinity;
  return hausdorff(ring, outline(shape, 0.001));
}

/**
 * Melhor flecha de uma família (abatido ou ogival) entre `lo` e `hi`: grade e refinamento por busca em seção áurea.
 * `make` monta a forma para uma flecha.
 */
function bestRise(ring: Ring, lo: number, hi: number, make: (rise: number) => OpeningShape): { shape: OpeningShape; dev: number } | null {
  if (!(hi > lo)) return null;
  let best: { rise: number; dev: number } | null = null;
  const step = (hi - lo) / GRADE;
  for (let i = 0; i <= GRADE; i++) {
    const rise = lo + i * step;
    const dev = devOf(ring, make(rise));
    if (best === null || dev < best.dev) best = { rise, dev };
  }
  if (best === null || !Number.isFinite(best.dev)) return null;
  let a = Math.max(lo, best.rise - step);
  let b = Math.min(hi, best.rise + step);
  const phi = (Math.sqrt(5) - 1) / 2;
  for (let k = 0; k < REFINO; k++) {
    const c = b - phi * (b - a);
    const d = a + phi * (b - a);
    if (devOf(ring, make(c)) < devOf(ring, make(d))) b = d;
    else a = c;
  }
  const rise = (a + b) / 2;
  const dev = devOf(ring, make(rise));
  return dev < best.dev ? { shape: make(rise), dev } : { shape: make(best.rise), dev: best.dev };
}

/** Largura (extensão em x) dos pontos do anel na cota `z` (tolerância 1 um); 0 se nenhum ponto cai nela. */
function widthAt(ring: Ring, z: number): number {
  const xs = ring.filter((p) => Math.abs(p[1] - z) < 1e-6).map((p) => p[0]);
  return xs.length > 0 ? Math.max(...xs) - Math.min(...xs) : 0;
}

/** Trapézio simétrico pelas larguras medidas na base e no topo; `null` se alguma é nula. */
function trapezoidOf(ring: Ring, w: number, h: number): OpeningShape | null {
  const base = widthAt(ring, 0);
  const top = widthAt(ring, h);
  if (!(base > 1e-6 && top > 1e-6)) return null;
  return { kind: 'trapezoid', width: w, height: h, topWidth: top, ...(Math.abs(base - w) > 1e-9 ? { baseWidth: base } : {}) };
}

/** Polígono livre do anel normalizado (anti-horário, u a partir da borda esquerda), ou `null` se não é um polígono válido. */
function polygonOf(ring: Ring, w: number, h: number): OpeningShape | null {
  const clean = cleanRing(ring);
  if (clean.length < 3 || clean.length > MAX_POLYGON_POINTS || !ringIsSimple(clean)) return null;
  let area = 0;
  clean.forEach((p, i) => {
    const q = clean[(i + 1) % clean.length]!;
    area += p[0] * q[1] - q[0] * p[1];
  });
  const ccw = area >= 0 ? clean : [...clean].reverse();
  const shape: OpeningShape = { kind: 'polygon', width: w, height: h, points: ccw.map((p) => ({ u: p[0] + w / 2, v: p[1] })) };
  return validateOpeningShape(shape).length === 0 ? shape : null;
}

/**
 * Forma do vão que melhor descreve o contorno do perfil, ou `null` se nenhuma forma do modelo chega perto (desvio acima de
 * `FORMA_PROXIMA_TOL`) ou o contorno é degenerado. `shape.kind === 'rect'` quer dizer que o contorno é um retângulo.
 */
export function fitOpeningShape(loop: readonly Pt2[]): ShapeFit | null {
  const n = normalize(loop);
  if (!n) return null;
  const { ring, w, h } = n;
  const candidates: Array<{ shape: OpeningShape; dev: number }> = [];
  const push = (shape: OpeningShape): void => {
    candidates.push({ shape, dev: devOf(ring, shape) });
  };
  push({ kind: 'rect', width: w, height: h });
  push({ kind: 'circle', width: w, height: h });
  if (h >= w / 2) push({ kind: 'round', width: w, height: h });
  const abatido = bestRise(ring, 1e-3 * h, Math.min(w / 2, h), (rise) => ({ kind: 'segmental', width: w, height: h, rise }));
  if (abatido) candidates.push(abatido);
  const ogival = bestRise(ring, w / 2, h, (rise) => ({ kind: 'pointed', width: w, height: h, rise }));
  if (ogival) candidates.push(ogival);
  const empena = bestRise(ring, 1e-3 * h, h, (rise) => ({ kind: 'gable', width: w, height: h, rise }));
  if (empena) candidates.push(empena);
  const trapezio = trapezoidOf(ring, w, h);
  if (trapezio) push(trapezio);
  const neck = widthAt(ring, 0); // ferradura: a abertura entre as ombreiras é a largura da base
  if (neck > 1e-6 && neck < w - 1e-6) push({ kind: 'horseshoe', width: w, height: h, neck });
  let best = candidates[0]!;
  for (const c of candidates) if (c.dev < best.dev) best = c;
  if (!Number.isFinite(best.dev) || best.dev > FORMA_PROXIMA_TOL) {
    const livre = polygonOf(ring, w, h);
    return livre ? { shape: livre, dev: 0, exact: true } : null;
  }
  // Abatido ou ogival com flecha igual à metade da largura é o arco pleno (a mesma curva): reporta como `round`.
  const s = best.shape;
  if ((s.kind === 'pointed' || s.kind === 'segmental') && Math.abs(s.rise - w / 2) <= 1e-3) {
    const round: OpeningShape = { kind: 'round', width: w, height: h };
    best = { shape: round, dev: devOf(ring, round) };
  }
  return { shape: best.shape, dev: best.dev, exact: best.dev <= FORMA_EXATA_TOL };
}

/** Rótulo em português de uma forma, para o aviso de aproximação. */
export function nomeDaForma(shape: OpeningShape): string {
  switch (shape.kind) {
    case 'rect':
      return 'retângulo';
    case 'circle':
      return 'elipse ou círculo';
    case 'round':
      return 'arco pleno';
    case 'segmental':
      return 'arco abatido';
    case 'pointed':
      return 'ogival';
    case 'gable':
      return 'empena';
    case 'trapezoid':
      return 'trapézio';
    case 'horseshoe':
      return 'ferradura';
    case 'polygon':
      return 'polígono livre';
  }
}
