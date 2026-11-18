import { clipRect, crownBand, ringHalves, ringSignedArea, type OPt, type OpeningShape } from '@hestia/model';
import type { PartBox, PartMotion } from './openingModelTypes.ts';

/*
 * Esquadria de correr (e peças que deslizam) em vão com forma (docs/estudo-esquadrias/28 §6). Geometria decidida:
 * - TRILHO superior: faixa em arco de espessura constante entre o recuo do topo e o do fundo do trilho (mesma regra da travessa
 *   da folha); em círculo, a metade superior do anel entre as duas elipses. O trilho inferior fica reto na base do arco (a base é
 *   reta); em círculo vira a metade inferior do anel.
 * - FOLHA que desliza: a folha é um prisma recortado pelo contorno recuado NAS DUAS pontas do curso, isto é, pela interseção da
 *   região com a mesma região deslocada pelo curso. Como a região recuada é convexa, a folha cabe sob o arco em toda posição
 *   intermediária (combinação convexa das duas pontas). A folha fixa (sem `motion`) é só recortada pelo contorno, como antes.
 */

const EPS = 1e-9;

/** Anel convexo (anti-horário, sem reentrâncias)? */
export function convexo(r: readonly OPt[]): boolean {
  for (let i = 0; i < r.length; i++) {
    const a = r[i]!;
    const b = r[(i + 1) % r.length]!;
    const c = r[(i + 2) % r.length]!;
    if ((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]) < -1e-9) return false;
  }
  return true;
}

/** Sutherland-Hodgman: `subject` recortado por um polígono CONVEXO anti-horário; [] quando nada sobra. */
export function clipConvexo(subject: readonly OPt[], clip: readonly OPt[]): OPt[] {
  let ring: OPt[] = [...subject];
  for (let i = 0; i < clip.length && ring.length >= 3; i++) {
    const a = clip[i]!;
    const b = clip[(i + 1) % clip.length]!;
    const lado = (p: OPt): number => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
    const next: OPt[] = [];
    for (let k = 0; k < ring.length; k++) {
      const p = ring[k]!;
      const q = ring[(k + 1) % ring.length]!;
      const sp = lado(p);
      const sq = lado(q);
      if (sp >= -EPS) next.push(p);
      if (sp >= -EPS !== sq >= -EPS) {
        const u = sp / (sp - sq);
        next.push([p[0] + u * (q[0] - p[0]), p[1] + u * (q[1] - p[1])]);
      }
    }
    ring = next;
  }
  return ring.length >= 3 && ringSignedArea(ring) > EPS ? ring : [];
}

/**
 * Peça que desliza: a caixa recortada pela região e pela região deslocada pelo curso inteiro. Região não convexa (arco com
 * prateleira) ou curso nulo: só o recorte da posição fechada. Se a interseção some (peça fina no alto da folha móvel, que não cabe sob o
 * arco nas duas pontas do curso), devolve [] e a peça sai: a folha móvel fica com montantes e vidro sob o envelope.
 */
export function clipDeslizante(regiao: readonly OPt[], b: PartBox, m: Extract<PartMotion, { kind: 'slide' }>): OPt[] {
  const fechado = clipRect(regiao, b.t0, b.t1, b.z0, b.z1);
  const dt = m.dt * m.travel;
  const dz = m.dz * m.travel;
  if (fechado.length < 3 || (Math.abs(dt) < EPS && Math.abs(dz) < EPS) || !convexo(regiao)) return fechado;
  const fim = clipConvexo(fechado, regiao.map((p): OPt => [p[0] - dt, p[1] - dz]));
  return fim; // [] = a peça não cabe sob o arco em todo o curso (a travessa fina de cima da folha móvel) e sai
}

/**
 * Trilho que segue o contorno: devolve os anéis que o substituem, ou `null` (nada a mudar: trilho reto numa base reta, ou faixa
 * que não cabe). `track-head` = topo; `track-sill` só muda no círculo.
 */
export function trilhoNoContorno(id: string, b: PartBox, shape: OpeningShape, H: number): OPt[][] | null {
  const topo = id === 'track-head';
  if (!topo && !(id === 'track-sill' && shape.kind === 'circle')) return null;
  const dOut = topo ? H - b.z1 : b.z0;
  const dIn = topo ? H - b.z0 : b.z1;
  if (!(dIn > dOut + EPS)) return null;
  if (shape.kind === 'circle') {
    const m = ringHalves(shape, Math.max(0, dOut), dIn);
    if (!m) return null;
    const metade = (r: readonly OPt[]): OPt[] => (topo ? clipRect(r, -1e3, 1e3, H / 2, H + 1) : clipRect(r, -1e3, 1e3, -1, H / 2));
    const aneis = [metade(m.right), metade(m.left)].filter((r) => r.length >= 3);
    return aneis.length > 0 ? aneis : null;
  }
  if (!topo) return null;
  const faixa = crownBand(shape, dOut, dIn);
  return faixa ? [faixa.pts] : null;
}
