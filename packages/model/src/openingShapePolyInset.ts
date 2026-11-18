/**
 * Recuo (offset por reta) do contorno das formas retas (`gable`, `trapezoid`, `polygon`) e faixas por aresta, para as peças da
 * esquadria (docs/estudo-esquadrias/32). Arquivo novo. Mesmo sistema do contorno: x ao longo da parede, z para cima, metros,
 * anéis anti-horários e abertos.
 *
 * Cada aresta anda para dentro pela sua distância (negativa = para fora) e os vértices novos são a interseção das retas
 * vizinhas (junta em meia-esquadria). A distância de cada aresta vem da classe dela: base (horizontal em z = 0), lateral
 * (mais íngreme que 45 graus) ou topo/telhado (o resto). O recuo é recusado (`null`/`[]`) quando uma aresta colapsa ou inverte, ou
 * o anel deixa de ser simples: é o limite do polígono côncavo, que avisa (`forma-vao-poligono-concavo`).
 */
import { outline, type OPt, type OpeningShape } from './openingShape.ts';
import { ringIsSimple, type PolygonFormShape } from './openingShapePolygon.ts';

export type EdgeClass = 'base' | 'side' | 'arc';

/** Distâncias por classe de aresta. */
export interface EdgeInsets {
  side: number;
  arc: number;
  base: number;
}

/** Acima disto o anel recuado não é conferido quanto à auto-interseção (custo O(n²)). */
const MAX_CHECK = 600;

export const isPolygonForm = (s: OpeningShape): s is PolygonFormShape => s.kind === 'gable' || s.kind === 'trapezoid' || s.kind === 'polygon';

/** Classe de cada aresta i (de ring[i] a ring[i + 1]) de um anel anti-horário. */
export function edgeClasses(ring: readonly OPt[]): EdgeClass[] {
  return ring.map((a, i): EdgeClass => {
    const b = ring[(i + 1) % ring.length]!;
    const dx = Math.abs(b[0] - a[0]);
    const dz = Math.abs(b[1] - a[1]);
    if (dz < 1e-9 && a[1] < 1e-9 && b[0] > a[0]) return 'base';
    return dz > dx ? 'side' : 'arc';
  });
}

/** Anel com cada aresta i deslocada `dist[i]` para dentro; `null` se uma aresta colapsa, inverte ou o anel deixa de ser simples. */
export function offsetRing(ring: readonly OPt[], dist: readonly number[]): OPt[] | null {
  const n = ring.length;
  const dir: OPt[] = [];
  const q: OPt[] = [];
  for (let i = 0; i < n; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % n]!;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (!(len > 1e-9)) return null;
    const d: OPt = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
    dir.push(d);
    q.push([a[0] - d[1] * dist[i]!, a[1] + d[0] * dist[i]!]); // normal à esquerda = para dentro
  }
  const out: OPt[] = [];
  for (let k = 0; k < n; k++) {
    const i = (k + n - 1) % n; // aresta que chega no vértice k
    const d0 = dir[i]!;
    const d1 = dir[k]!;
    const c = d0[0] * d1[1] - d0[1] * d1[0];
    if (Math.abs(c) < 1e-9) {
      if (Math.abs(dist[i]! - dist[k]!) > 1e-12) return null;
      out.push(q[k]!);
      continue;
    }
    const t = ((q[k]![0] - q[i]![0]) * d1[1] - (q[k]![1] - q[i]![1]) * d1[0]) / c;
    out.push([q[i]![0] + t * d0[0], q[i]![1] + t * d0[1]]);
  }
  for (let i = 0; i < n; i++) {
    const a = out[i]!;
    const b = out[(i + 1) % n]!;
    if ((b[0] - a[0]) * dir[i]![0] + (b[1] - a[1]) * dir[i]![1] <= 1e-9) return null;
  }
  return n <= MAX_CHECK && !ringIsSimple(out) ? null : out;
}

const distOf = (cls: readonly EdgeClass[], ins: EdgeInsets): number[] => cls.map((c) => (c === 'base' ? ins.base : c === 'side' ? ins.side : ins.arc));

/** Região recuada da forma reta, anti-horária; `[]` quando o recuo consome a forma. */
export function polygonInset(shape: PolygonFormShape, ins: EdgeInsets, tol?: number): OPt[] {
  const ring = outline(shape, tol);
  const r = offsetRing(ring, distOf(edgeClasses(ring), ins));
  if (!r || r.length < 3) return [];
  let a = 0;
  for (let i = 0; i < r.length; i++) a += r[i]![0] * r[(i + 1) % r.length]![1] - r[(i + 1) % r.length]![0] * r[i]![1];
  return a / 2 > 1e-9 ? r : [];
}

/** Faixa em volta de uma aresta (quadrilátero de junta em meia-esquadria). */
export interface EdgeStrip {
  ring: OPt[];
  /** Índice da aresta no anel de `outline`. */
  edge: number;
  cls: EdgeClass;
}

/** Um metro: quanto a base sai para baixo nas faixas, para as laterais descerem além do piso e serem cortadas por quem chama. */
const BASE_DOWN = -1;

/**
 * Faixas por aresta entre o recuo `dOut` (do lado de fora) e `dIn` (de dentro), sem a base (a base, mais um metro para baixo, só
 * serve para as laterais descerem até o piso: quem chama corta em z). As faixas se encaixam sem sobra nem sobreposição. `null`
 * quando algum recuo é recusado.
 */
export function edgeStrips(shape: PolygonFormShape, dOut: { side: number; arc: number }, dIn: { side: number; arc: number }, tol?: number): EdgeStrip[] | null {
  const ring = outline(shape, tol);
  const cls = edgeClasses(ring);
  const out = offsetRing(ring, distOf(cls, { ...dOut, base: BASE_DOWN }));
  const inn = offsetRing(ring, distOf(cls, { ...dIn, base: BASE_DOWN }));
  if (!out || !inn) return null;
  const strips: EdgeStrip[] = [];
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    if (cls[i] === 'base') continue;
    const j = (i + 1) % n;
    strips.push({ ring: [out[i]!, out[j]!, inn[j]!, inn[i]!], edge: i, cls: cls[i]! });
  }
  return strips;
}
