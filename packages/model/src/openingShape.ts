/**
 * Forma do vão no plano da parede: retângulo, meia-lua, arco abatido, ogival e elipse (círculo quando w = h).
 * Unidades: metros. Sistema do contorno: x ao longo da parede (origem no meio da base), z para cima (origem na base do vão).
 * Adaptado do spike 1a (`packages/engine/src/spike/outline.ts`), sem importar dele.
 */

/**
 * Forma do vão. `rise` (flecha) existe só nas formas de arco com flecha livre.
 */
export type OpeningShape =
  | { kind: 'rect'; width: number; height: number }
  /** Arco pleno, semicírculo de raio `width / 2` no topo. Meia-lua quando `height = width / 2`; exige `height >= width / 2`. */
  | { kind: 'round'; width: number; height: number }
  /** Arco abatido: flecha `rise` em (0, width / 2]; a nascença fica em `height - rise`. */
  | { kind: 'segmental'; width: number; height: number; rise: number }
  /** Ogival: dois arcos com centro do lado oposto; a flecha `rise` deve ser >= width / 2 (abaixo disso o arco tem vale). */
  | { kind: 'pointed'; width: number; height: number; rise: number }
  /** Elipse inscrita em `width` x `height` (círculo quando são iguais). */
  | { kind: 'circle'; width: number; height: number };

/** Problema de uma forma de vão. Vazio = forma válida. */
export type OpeningShapeIssue =
  | 'width-invalid' // largura não finita ou <= 0
  | 'height-invalid' // altura não finita ou <= 0
  | 'rise-invalid' // flecha não finita, <= 0, ou arco abatido com flecha acima de w / 2
  | 'rise-exceeds-height' // flecha acima da altura: a nascença ficaria abaixo da base
  | 'pointed-rise-below-half' // ogival com flecha < w / 2: vale no meio do arco e estouro da altura
  | 'round-height-below-half'; // arco pleno com altura < w / 2: o raio não cabe sob o topo

/** Erro máximo (m) entre a corda e o arco verdadeiro. */
export const CHORD_TOL = 0.001;

const EPS = 1e-12;
const pos = (v: number): boolean => Number.isFinite(v) && v > 0;

/** Problemas da forma (metros). Dimensões inválidas encerram a validação antes das regras de cada forma. */
export function validateOpeningShape(shape: OpeningShape): OpeningShapeIssue[] {
  const issues: OpeningShapeIssue[] = [];
  if (!pos(shape.width)) issues.push('width-invalid');
  if (!pos(shape.height)) issues.push('height-invalid');
  if (issues.length > 0) return issues;
  const w = shape.width;
  const h = shape.height;
  switch (shape.kind) {
    case 'rect':
    case 'circle':
      return issues;
    case 'round':
      if (h < w / 2 - EPS) issues.push('round-height-below-half');
      return issues;
    case 'segmental':
      if (!pos(shape.rise) || shape.rise > w / 2 + EPS) issues.push('rise-invalid');
      else if (shape.rise > h + EPS) issues.push('rise-exceeds-height');
      return issues;
    case 'pointed':
      if (!pos(shape.rise)) issues.push('rise-invalid');
      else {
        if (shape.rise < w / 2 - EPS) issues.push('pointed-rise-below-half');
        if (shape.rise > h + EPS) issues.push('rise-exceeds-height');
      }
      return issues;
  }
}

/** Ponto do contorno: [x, z]. O anel é anti-horário e aberto (o último ponto não repete o primeiro). */
export type OPt = readonly [number, number];

/** Pontos de um arco de centro (cx, cz) e raio R entre os ângulos a0 e a1, incluindo as pontas. Corda com erro <= tol. */
function arcPts(cx: number, cz: number, R: number, a0: number, a1: number, tol: number): OPt[] {
  const dθ = 2 * Math.acos(Math.max(-1, 1 - tol / R)); // passo máximo para sagita <= tol
  const n = Math.max(2, 2 * Math.ceil(Math.abs(a1 - a0) / dθ / 2)); // par: a coroa (x = 0) cai em um vértice
  const out: OPt[] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    out.push([cx + R * Math.cos(a), cz + R * Math.sin(a)]);
  }
  return out;
}

/** Remove pontos consecutivos coincidentes. */
function dedupe(pts: OPt[]): OPt[] {
  const out: OPt[] = [];
  for (const p of pts) {
    const q = out[out.length - 1];
    if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-9) out.push(p);
  }
  return out;
}

/** Arco abatido (e meia-lua, com f = w / 2): arco único de flecha f, nascença em h - f. */
function segmentalRing(w: number, h: number, f: number, tol: number): OPt[] {
  const half = w / 2;
  const R = (half * half + f * f) / (2 * f); // raio do arco
  const zc = h - R; // centro do arco
  const zs = h - f; // nascença
  const a0 = Math.atan2(zs - zc, half); // ângulo da ombreira direita
  return dedupe([[half, 0], ...arcPts(0, zc, R, a0, Math.PI - a0, tol), [-half, 0]]);
}

/** Ogival: cada metade é um arco de raio r com centro do lado oposto; o ápice fica em x = 0 e z = h. */
function pointedRing(w: number, h: number, f: number, tol: number): OPt[] {
  const half = w / 2;
  const zs = h - f; // nascença
  const r = (f * f + half * half) / (2 * half); // raio de cada metade
  const cx = half - r; // centro da metade direita (x <= 0 quando f >= w / 2)
  const aApex = Math.atan2(f, r - half); // ângulo do ápice visto do centro
  const right = arcPts(cx, zs, r, 0, aApex, tol); // da nascença direita ao ápice
  const left = right.map((p): OPt => [-p[0], p[1]]).reverse(); // do ápice à nascença esquerda
  return dedupe([[half, 0], ...right, ...left, [-half, 0]]);
}

/** Elipse de semi-eixos a (x) e b (z), centrada em (0, b). Passo pelo raio de curvatura mínimo: corda com erro <= tol. */
function ellipseRing(a: number, b: number, tol: number): OPt[] {
  const M = Math.max(a, b); // maior velocidade da parametrização (limite do comprimento de corda)
  const rMin = Math.min((a * a) / b, (b * b) / a); // menor raio de curvatura
  const dt = Math.min(Math.PI / 2, Math.sqrt(8 * tol * rMin) / M);
  const n = 4 * Math.max(1, Math.ceil(2 * Math.PI / dt / 4)); // múltiplo de 4: base, topo e laterais são vértices
  const out: OPt[] = [];
  for (let i = 0; i < n; i++) {
    const t = (2 * Math.PI * i) / n;
    out.push([a * Math.cos(t), b + b * Math.sin(t)]);
  }
  return out;
}

/**
 * Contorno do vão como anel aberto, anti-horário, em metros. Cordas com erro máximo `tol` (padrão 1 mm).
 * Lança erro se a forma não passa em `validateOpeningShape`.
 */
export function outline(shape: OpeningShape, tol = CHORD_TOL): OPt[] {
  const issues = validateOpeningShape(shape);
  if (issues.length > 0) throw new Error(`forma de vão inválida: ${issues.join(', ')}`);
  const w = shape.width;
  const h = shape.height;
  const half = w / 2;
  switch (shape.kind) {
    case 'rect':
      return [[half, 0], [half, h], [-half, h], [-half, 0]];
    case 'circle':
      return ellipseRing(half, h / 2, tol);
    case 'round':
      return segmentalRing(w, h, half, tol);
    case 'segmental':
      return segmentalRing(w, h, shape.rise, tol);
    case 'pointed':
      return pointedRing(w, h, shape.rise, tol);
  }
}
