/**
 * Ferradura (arco mourisco) do vão: o arco passa do semicírculo. Arquivo novo; docs/estudo-esquadrias/32.
 *
 * Parâmetros: `width` é a caixa envolvente (o círculo do arco tem diâmetro `width`, raio R = width / 2), `height` a altura total e
 * `neck` a abertura entre as ombreiras retas (0 < neck < width): o círculo cruza as ombreiras x = ±neck / 2 abaixo do centro e o
 * arco SOBE por fora delas até x = ±R na altura do centro e fecha no topo (0, height). O centro fica em z = height - R, ACIMA da
 * nascença (a cota onde a ombreira reta encontra o círculo), que é o que distingue a ferradura do arco pleno. A nascença é
 * z1 = zc - sqrt(R² - neck² / 4) e precisa ser >= 0. Com neck -> width a ferradura tende ao arco pleno.
 * Mesmo sistema de `openingShape.ts`: x ao longo da parede (origem no meio da base), z para cima, metros, anel anti-horário.
 */
import type { OPt, OpeningShape, OpeningShapeIssue } from './openingShape.ts';
import type { OpeningSegment } from './openingShapeSegments.ts';

export type HorseshoeShape = Extract<OpeningShape, { kind: 'horseshoe' }>;

const EPS = 1e-12;
const pos = (v: number): boolean => Number.isFinite(v) && v > 0;

/** Raio, centro, nascença e ângulo da nascença (negativo: abaixo do centro) da ferradura. */
export function horseshoeGeometry(w: number, h: number, neck: number): { R: number; zc: number; z1: number; a0: number } {
  const R = w / 2;
  const zc = h - R;
  const z1 = zc - Math.sqrt(Math.max(0, R * R - (neck * neck) / 4));
  return { R, zc, z1, a0: Math.atan2(z1 - zc, neck / 2) };
}

/** Problemas da ferradura (dimensões `width` e `height` já validadas por quem chama). */
export function validateHorseshoe(s: HorseshoeShape): OpeningShapeIssue[] {
  if (!pos(s.neck) || s.neck >= s.width - EPS) return ['horseshoe-neck-invalid'];
  return horseshoeGeometry(s.width, s.height, s.neck).z1 < -EPS ? ['horseshoe-height-too-low'] : [];
}

/** Pontos do arco de centro (cx, cz) e raio R de a0 a a1 (pontas incluídas); passo par: o topo (x = 0) cai num vértice. */
function arcPts(cx: number, cz: number, R: number, a0: number, a1: number, tol: number): OPt[] {
  const dθ = 2 * Math.acos(Math.max(-1, 1 - tol / Math.max(R, 1e-9)));
  const n = Math.max(2, 2 * Math.ceil(Math.abs(a1 - a0) / dθ / 2));
  const out: OPt[] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    out.push([cx + R * Math.cos(a), cz + R * Math.sin(a)]);
  }
  return out;
}

const dedupe = (pts: OPt[]): OPt[] => pts.filter((p, i) => i === 0 || Math.hypot(p[0] - pts[i - 1]![0], p[1] - pts[i - 1]![1]) > 1e-9);

/** Anel da ferradura: base, ombreira direita, arco (cordas com erro <= tol) e ombreira esquerda. Forma já validada. */
export function horseshoeRing(s: HorseshoeShape, tol: number): OPt[] {
  const { R, zc, a0 } = horseshoeGeometry(s.width, s.height, s.neck);
  const c = s.neck / 2;
  return dedupe([[c, 0], ...arcPts(0, zc, R, a0, Math.PI - a0, tol), [-c, 0]]);
}

/** Segmentos com o arco EXATO (bulge = tan(θ/4), θ = π - 2·a0 > π), na mesma ordem de `horseshoeRing`. */
export function horseshoeSegments(s: HorseshoeShape): OpeningSegment[] {
  const { z1, a0 } = horseshoeGeometry(s.width, s.height, s.neck);
  const c = s.neck / 2;
  const segs: OpeningSegment[] = [];
  const reta = (a: OPt, b: OPt): void => {
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) > 1e-9) segs.push({ a, b, bulge: 0 });
  };
  reta([c, 0], [c, z1]);
  segs.push({ a: [c, z1], b: [-c, z1], bulge: Math.tan((Math.PI - 2 * a0) / 4) });
  reta([-c, z1], [-c, 0]);
  segs.push({ a: [-c, 0], b: [c, 0], bulge: 0 });
  return segs;
}

/**
 * Coroa da ferradura recuada: lateral `side` e arco `arc`. O arco recuado é concêntrico (raio R - arc, mesmo centro) e as
 * ombreiras recuam para x = ±(neck / 2 - side). Do arranque direito ao esquerdo, anti-horário. `null` quando o recuo consome
 * o arco ou o arco recuado deixa de passar para fora das ombreiras recuadas (não é mais ferradura).
 */
export function horseshoeCrown(s: HorseshoeShape, side: number, arc: number, tol: number): { pts: OPt[]; spring: number; half: number } | null {
  const { R, zc } = horseshoeGeometry(s.width, s.height, s.neck);
  const xs = s.neck / 2 - side;
  const rr = R - arc;
  if (!(xs > 1e-9) || !(rr > xs + 1e-9)) return null;
  const z1 = zc - Math.sqrt(rr * rr - xs * xs);
  const a0 = Math.atan2(z1 - zc, xs);
  const pts = dedupe(arcPts(0, zc, rr, a0, Math.PI - a0, tol));
  return { pts, spring: Math.min(pts[0]![1], pts[pts.length - 1]![1]), half: xs };
}
