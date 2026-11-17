import type { Vec2 } from '@hestia/geom';
import { pointAt, type WallFrame } from './frame.ts';
import type { JoinStatus } from './joins.ts';

/**
 * Cruzamento (X) de paredes com inclinação (X1). Duas paredes que se atravessam no meio dos eixos, sem ponta no encontro, não
 * formam junção: os corpos se interpenetram (como no Revit). O pintor vertical, porém, faz uma das paredes ceder a área do
 * cruzamento à outra NA PLANTA DA BASE; com inclinação o corpo cedido se desloca d(z) = z·tanθ de um jeito e o corpo que o
 * cobria de outro, e a parede fica ABERTA (um furo do tamanho da área do cruzamento fora do lugar). Os pares devolvidos aqui
 * não se cortam no pintor: cada parede segue inteira.
 */
const AMOSTRA = 0.1;

/** Chave `idMenor|idMaior` de um par de paredes. */
export const chaveDoPar = (x: string, y: string): string => (x < y ? `${x}|${y}` : `${y}|${x}`);

/** Eixo da parede como polilinha (reta: 2 pontos; arco: amostras a cada ~10 cm). */
function eixo(f: WallFrame): Vec2[] {
  const n = f.arc ? Math.max(2, Math.ceil(f.length / AMOSTRA)) : 1;
  return Array.from({ length: n + 1 }, (_, i) => pointAt(f, (f.length * i) / n, 0));
}

/** Cruzamento próprio das duas polilinhas (parâmetro em metros desde a ponta a, em cada uma); nulo sem cruzamento. */
function cruza(pa: Vec2[], pb: Vec2[]): Array<{ ta: number; tb: number }> {
  const out: Array<{ ta: number; tb: number }> = [];
  let sa = 0;
  for (let i = 0; i + 1 < pa.length; i++) {
    const a0 = pa[i]!, a1 = pa[i + 1]!;
    const la = Math.hypot(a1.x - a0.x, a1.y - a0.y);
    let sb = 0;
    for (let j = 0; j + 1 < pb.length; j++) {
      const b0 = pb[j]!, b1 = pb[j + 1]!;
      const lb = Math.hypot(b1.x - b0.x, b1.y - b0.y);
      const dx = a1.x - a0.x, dy = a1.y - a0.y, ex = b1.x - b0.x, ey = b1.y - b0.y;
      const den = dx * ey - dy * ex;
      if (Math.abs(den) > 1e-12) {
        const u = ((b0.x - a0.x) * ey - (b0.y - a0.y) * ex) / den;
        const v = ((b0.x - a0.x) * dy - (b0.y - a0.y) * dx) / den;
        if (u >= 0 && u <= 1 && v >= 0 && v <= 1) out.push({ ta: sa + u * la, tb: sb + v * lb });
      }
      sb += lb;
    }
    sa += la;
  }
  return out;
}

/**
 * Pares de paredes do grupo que se cruzam sem junção (nenhuma ponta de uma é par, nó ou encosto da outra, e o cruzamento dos
 * eixos está a mais de `margem` das duas pontas) e em que ao menos uma é inclinada. Chave `idMenor|idMaior`.
 */
export function paresQueSeCruzam(group: readonly WallFrame[], status: (id: string, which: 'a' | 'b') => JoinStatus, margem = 0.02): Set<string> {
  const out = new Set<string>();
  const inclinadas = group.filter((f) => !!f.wall.tilt);
  if (inclinadas.length === 0) return out;
  const eixos = new Map<string, Vec2[]>();
  const eixoDe = (f: WallFrame): Vec2[] => eixos.get(f.wall.id) ?? (eixos.set(f.wall.id, eixo(f)), eixos.get(f.wall.id)!);
  const ligadas = (f: WallFrame, outra: WallFrame): boolean => (['a', 'b'] as const).some((w) => {
    const st = status(f.wall.id, w);
    return (st.kind === 'tee' && st.hostId === outra.wall.id) || ((st.kind === 'pair' || st.kind === 'node') && st.partners.some((p) => p.wallId === outra.wall.id));
  });
  for (const f of inclinadas) for (const g of group) {
    if (g === f) continue;
    const chave = chaveDoPar(f.wall.id, g.wall.id);
    if (out.has(chave) || ligadas(f, g) || ligadas(g, f)) continue;
    if (f.z && g.z && !(f.z.z0 < g.z.top - 1e-6 && g.z.z0 < f.z.top - 1e-6)) continue;
    const xs = cruza(eixoDe(f), eixoDe(g));
    if (xs.some((x) => x.ta > margem && x.ta < f.length - margem && x.tb > margem && x.tb < g.length - margem)) out.add(chave);
  }
  return out;
}
