import type { OPt } from '@hestia/model';
import type { OpeningPart, PartBox } from './openingModelTypes.ts';

/*
 * Geometria de contato das ferragens (docs/estudo-esquadrias/42). Tudo em (t, z); a profundidade (s) entra só como intervalo.
 * Usada pela colocação das dobradiças e da maçaneta (`openingModelFerragem.ts`) e pelo verificador do contrato
 * (`openingFerragemContrato.ts`).
 */

export type Anel = readonly OPt[];

/** Retângulo (t, z) de uma caixa. */
export interface Ret {
  t0: number;
  t1: number;
  z0: number;
  z1: number;
}

/** Anel (t, z) da peça: o prisma `tz`, ou a própria caixa (peças com perfil `ts` ou `sz` valem pela caixa envolvente). */
export function anelDaPeca(p: OpeningPart): Anel {
  if (p.profile?.plane === 'tz') return p.profile.pts;
  const b = p.box;
  return [[b.t0, b.z0], [b.t1, b.z0], [b.t1, b.z1], [b.t0, b.z1]];
}

export const retDe = (b: PartBox): Ret => ({ t0: b.t0, t1: b.t1, z0: b.z0, z1: b.z1 });

const cantosDe = (r: Ret): OPt[] => [[r.t0, r.z0], [r.t1, r.z0], [r.t1, r.z1], [r.t0, r.z1]];

function distPontoSeg(px: number, pz: number, a: OPt, b: OPt): number {
  const l2 = (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2;
  const k = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - a[0]) * (b[0] - a[0]) + (pz - a[1]) * (b[1] - a[1])) / l2));
  return Math.hypot(px - (a[0] + k * (b[0] - a[0])), pz - (a[1] + k * (b[1] - a[1])));
}

const cruz = (o: OPt, a: OPt, b: OPt): number => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

function segCruza(a: OPt, b: OPt, c: OPt, d: OPt): boolean {
  const d1 = cruz(a, b, c);
  const d2 = cruz(a, b, d);
  const d3 = cruz(c, d, a);
  const d4 = cruz(c, d, b);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

function pontoNoAnel(r: Anel, x: number, z: number): boolean {
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, zi] = r[i]!;
    const [xj, zj] = r[j]!;
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}

/** Distância (m) entre o retângulo e o anel no plano (t, z); 0 quando se tocam ou se sobrepõem. */
export function distRetAnel(r: Ret, anel: Anel): number {
  const rc = cantosDe(r);
  const n = anel.length;
  if (anel.some(([x, z]) => x >= r.t0 && x <= r.t1 && z >= r.z0 && z <= r.z1)) return 0;
  if (pontoNoAnel(anel, r.t0, r.z0) || pontoNoAnel(anel, r.t1, r.z1)) return 0;
  let melhor = Infinity;
  for (let i = 0; i < n; i++) {
    const a = anel[i]!;
    const b = anel[(i + 1) % n]!;
    for (let k = 0; k < 4; k++) {
      const c = rc[k]!;
      const d = rc[(k + 1) % 4]!;
      if (segCruza(a, b, c, d)) return 0;
      melhor = Math.min(melhor, distPontoSeg(a[0], a[1], c, d), distPontoSeg(b[0], b[1], c, d), distPontoSeg(c[0], c[1], a, b), distPontoSeg(d[0], d[1], a, b));
    }
  }
  return melhor;
}

/** Folga 3D (m) entre a caixa de uma ferragem e uma peça: raiz da soma dos quadrados da folga em s e da distância em (t, z). */
export function folgaAte(b: PartBox, p: OpeningPart): number {
  const ds = Math.max(0, b.s0 - p.box.s1, p.box.s0 - b.s1);
  return Math.hypot(ds, distRetAnel(retDe(b), anelDaPeca(p)));
}

/** Menor folga 3D entre a caixa e qualquer peça do conjunto (Infinity se o conjunto é vazio). */
export const folgaAteAlguma = (b: PartBox, ps: readonly OpeningPart[]): number => ps.reduce((m, p) => Math.min(m, folgaAte(b, p)), Infinity);

/** Valores de t em que a reta horizontal `z` cruza o anel (arestas com ponta inferior incluída, superior excluída). */
export function cruzamentos(anel: Anel, z: number): number[] {
  const out: number[] = [];
  for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
    const [xi, zi] = anel[i]!;
    const [xj, zj] = anel[j]!;
    if (zi > z !== zj > z) out.push(xi + ((z - zi) * (xj - xi)) / (zj - zi));
  }
  return out;
}

/** Extremos em t da fatia horizontal `z` do conjunto de anéis; `null` quando nenhum anel passa por `z`. */
export function fatiaEm(aneis: readonly Anel[], z: number): { min: number; max: number } | null {
  let min = Infinity;
  let max = -Infinity;
  for (const a of aneis)
    for (const x of cruzamentos(a, z)) {
      min = Math.min(min, x);
      max = Math.max(max, x);
    }
  return max >= min ? { min, max } : null;
}

/** O ponto (x, z) está no anel ou a até `tol` da borda? */
export function dentroDoAnel(anel: Anel, x: number, z: number, tol: number): boolean {
  return pontoNoAnel(anel, x, z) || anel.some((a, i) => distPontoSeg(x, z, a, anel[(i + 1) % anel.length]!) <= tol);
}
