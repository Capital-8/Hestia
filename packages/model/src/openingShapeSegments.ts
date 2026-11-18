/**
 * Contorno do vão como segmentos (reta ou arco) para a polilinha do DXF: o `bulge` do VERTEX (código 42) guarda o arco sem
 * tesselar. Mesma geometria de `outline` (openingShape.ts): arcos exatos onde a forma é arco; a elipse sem ser círculo fica em
 * cordas de `outline` (não há arco de elipse no DXF).
 */
import { outline, type OPt, type OpeningShape } from './openingShape.ts';

/** Segmento do contorno de `a` até `b`. `bulge` = tan(θ/4) do arco (θ = ângulo incluído, positivo = anti-horário); 0 = reta. */
export interface OpeningSegment {
  a: OPt;
  b: OPt;
  bulge: number;
}

const EPS = 1e-12;

/** Retas entre pontos consecutivos do anel fechado (sem arco). */
function cordas(ring: readonly OPt[]): OpeningSegment[] {
  return ring.map((p, i): OpeningSegment => ({ a: p, b: ring[(i + 1) % ring.length]!, bulge: 0 }));
}

/** Arco pleno, abatido e ogival: lados retos da base até a nascença, um ou dois arcos e a base de volta. */
function arcosDoVao(shape: Extract<OpeningShape, { kind: 'round' | 'segmental' | 'pointed' }>): OpeningSegment[] {
  const w = shape.width;
  const h = shape.height;
  const half = w / 2;
  const segs: OpeningSegment[] = [];
  const reta = (a: OPt, b: OPt): void => {
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) > EPS) segs.push({ a, b, bulge: 0 });
  };
  if (shape.kind === 'pointed') {
    const f = shape.rise;
    const zs = h - f; // nascença
    const r = (f * f + half * half) / (2 * half); // raio de cada metade
    const apex = Math.atan2(f, r - half); // ângulo do ápice visto do centro da metade
    const bulge = Math.tan(apex / 4); // cada metade inclui o ângulo `apex`
    reta([half, 0], [half, zs]);
    segs.push({ a: [half, zs], b: [0, h], bulge });
    segs.push({ a: [0, h], b: [-half, zs], bulge });
    reta([-half, zs], [-half, 0]);
    segs.push({ a: [-half, 0], b: [half, 0], bulge: 0 });
    return segs;
  }
  const f = shape.kind === 'round' ? half : shape.rise;
  const R = (half * half + f * f) / (2 * f); // raio do arco
  const zc = h - R; // centro do arco
  const zs = h - f; // nascença
  const a0 = Math.atan2(zs - zc, half); // ângulo da ombreira direita
  reta([half, 0], [half, zs]);
  segs.push({ a: [half, zs], b: [-half, zs], bulge: Math.tan((Math.PI - 2 * a0) / 4) });
  reta([-half, zs], [-half, 0]);
  segs.push({ a: [-half, 0], b: [half, 0], bulge: 0 });
  return segs;
}

/**
 * Contorno do vão como anel fechado de segmentos, anti-horário, na mesma ordem de `outline`. Retângulo e elipse sem ser círculo
 * saem em retas (`outline`); arco pleno, abatido, ogival e círculo (largura = altura) saem com `bulge` exato. Lança erro se a
 * forma não passa em `validateOpeningShape` (o mesmo de `outline`).
 */
export function outlineSegments(shape: OpeningShape, tol?: number): OpeningSegment[] {
  if (shape.kind === 'circle' && Math.abs(shape.width - shape.height) < EPS) {
    const r = shape.width / 2;
    // Dois semicírculos: o círculo de centro (0, r) passa pelas duas ombreiras (±r, r).
    return [
      { a: [r, r], b: [-r, r], bulge: 1 },
      { a: [-r, r], b: [r, r], bulge: 1 },
    ];
  }
  if (shape.kind === 'round' || shape.kind === 'segmental' || shape.kind === 'pointed') {
    outline(shape, tol); // mesma validação de `outline`
    return arcosDoVao(shape);
  }
  return cordas(outline(shape, tol));
}

/**
 * Leva os segmentos por `map` (afim, do contorno do vão para o desenho). Com `espelha` (determinante negativo), o arco inverte
 * o sentido: o bulge troca de sinal, a ordem dos vértices não muda.
 */
export function mapaSegmentos(segs: readonly OpeningSegment[], map: (p: OPt) => OPt, espelha: boolean): OpeningSegment[] {
  const s = espelha ? -1 : 1;
  return segs.map((g): OpeningSegment => ({ a: map(g.a), b: map(g.b), bulge: s * g.bulge }));
}
