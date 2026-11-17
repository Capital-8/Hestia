import type { LayerBand } from '@hestia/engine';
import type { Vec2 } from '@hestia/geom';
import type { SolidBatch } from './solids.ts';

const WELD_EPS = 1.5e-3;
/**
 * Solda os vértices de planta da camada que estão a menos de `WELD_EPS` uns dos outros (faixas de cotas diferentes
 * recortam o mesmo arco em pontos a 0,1 mm, e a tampa e a face lateral usariam pontos diferentes). O primeiro vértice
 * de cada grupo é o representante; anéis que perdem vértices repetidos saem limpos pela união depois.
 */
export function weldBands(bands: LayerBand[], eps: number = WELD_EPS): LayerBand[] {
  const reps: Vec2[] = [];
  const grid = new Map<string, number[]>();
  const rep = (v: Vec2): Vec2 => {
    const ix = Math.floor(v.x / eps);
    const iy = Math.floor(v.y / eps);
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (const r of grid.get(`${ix + dx},${iy + dy}`) ?? []) {
          const w = reps[r]!;
          if (Math.hypot(w.x - v.x, w.y - v.y) < eps) return w;
        }
    reps.push(v);
    const k = `${ix},${iy}`;
    const list = grid.get(k);
    if (list) list.push(reps.length - 1);
    else grid.set(k, [reps.length - 1]);
    return v;
  };
  return bands.map((b) => ({
    ...b,
    poly: b.poly.map((p) =>
      p.map((ring) => ring.map(rep).filter((v, i, a) => v !== a[(i + a.length - 1) % a.length])),
    ),
  }));
}



/**
 * Divide as arestas dos triângulos da camada nos vértices da própria camada que caem sobre elas (T-junctions). Uma
 * aresta longa de um triângulo pode passar por um vértice de outra face (ou de um canto de vão na mesma cota), e a
 * face vizinha usa os pedaços: sem isso a malha tem arestas sem par. O vértice novo leva a normal da face que o
 * recebe, então o sombreamento continua chapado. Vértices são achados por grade espacial (arcos têm milhares).
 */
export function splitTJunctions(b: SolidBatch, firstTri: number, firstVert: number): void {
  const pos = b.positions;
  const nVert = pos.length / 3;
  // Grade de vértices da camada: célula de ~1/12 da maior dimensão (mínimo 2 cm).
  // A busca verifica a distância exata depois; a célula mais grossa reduz consultas sem perder candidatos.
  const mn = [Infinity, Infinity, Infinity];
  const mx = [-Infinity, -Infinity, -Infinity];
  for (let i = firstVert; i < nVert; i++) {
    for (let k = 0; k < 3; k++) {
      mn[k] = Math.min(mn[k]!, pos[i * 3 + k]!);
      mx[k] = Math.max(mx[k]!, pos[i * 3 + k]!);
    }
  }
  const h = Math.max(0.02, Math.max(mx[0]! - mn[0]!, mx[1]! - mn[1]!, mx[2]! - mn[2]!) / 12);
  const cell = (v: number, k: number): number => Math.floor((v - mn[k]!) / h);
  // Cada eixo ocupa no máximo 13 células (12 divisões + extremidade); base 64 evita
  // colisões e dispensa montar strings na consulta, que acontece para cada aresta do triângulo.
  const grid = new Map<number, number[]>();
  const keyOf = (ix: number, iy: number, iz: number): number => (ix * 64 + iy) * 64 + iz;
  for (let i = firstVert; i < nVert; i++) {
    const k = keyOf(cell(pos[i * 3]!, 0), cell(pos[i * 3 + 1]!, 1), cell(pos[i * 3 + 2]!, 2));
    const list = grid.get(k);
    if (list) list.push(i);
    else grid.set(k, [i]);
  }
  // Pontos a até `TOL` da aresta x–y (no interior, longe dos extremos).
  const TOL = 3e-7;
  const onSeg = (p: number, x: number, y: number): boolean => {
    const ax = pos[x * 3]!;
    const ay = pos[x * 3 + 1]!;
    const az = pos[x * 3 + 2]!;
    const dx = pos[y * 3]! - ax;
    const dy = pos[y * 3 + 1]! - ay;
    const dz = pos[y * 3 + 2]! - az;
    const l2 = dx * dx + dy * dy + dz * dz;
    const px = pos[p * 3]! - ax;
    const py = pos[p * 3 + 1]! - ay;
    const pz = pos[p * 3 + 2]! - az;
    const t = (px * dx + py * dy + pz * dz) / l2;
    // Ponto quase coincidente com um extremo não divide a aresta (vértices duplicados).
    if (t <= 0 || t >= 1 || t * t * l2 < TOL * TOL || (1 - t) * (1 - t) * l2 < TOL * TOL) return false;
    const ex = px - t * dx;
    const ey = py - t * dy;
    const ez = pz - t * dz;
    return ex * ex + ey * ey + ez * ez < TOL * TOL;
  };
  // Triângulo degenerado (altura < 1 µm) sai da malha: dividi-lo não termina (as arestas se sobrepõem).
  const sliver = (a: number, c: number, d: number): boolean => {
    const v = (i: number): [number, number, number] => [pos[i * 3]!, pos[i * 3 + 1]!, pos[i * 3 + 2]!];
    const A = v(a);
    const B = v(c);
    const C = v(d);
    const u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
    const w = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
    const cr = Math.hypot(u[1]! * w[2]! - u[2]! * w[1]!, u[2]! * w[0]! - u[0]! * w[2]!, u[0]! * w[1]! - u[1]! * w[0]!);
    const lmax = Math.max(Math.hypot(...u), Math.hypot(...w), Math.hypot(C[0] - B[0], C[1] - B[1], C[2] - B[2]));
    return cr < 1e-6 * lmax;
  };
  // Índices de consulta fora de [0, 63] não têm vértice da grade (ela cobre só [mn, mx]); o recorte mantém a chave injetiva.
  const cellIn = (v: number, k: number): number => Math.min(63, Math.max(0, cell(v, k)));
  const candidates = (x: number, y: number): number[] => {
    const out: number[] = [];
    const lo = [Math.min(pos[x * 3]!, pos[y * 3]!) - TOL, Math.min(pos[x * 3 + 1]!, pos[y * 3 + 1]!) - TOL, Math.min(pos[x * 3 + 2]!, pos[y * 3 + 2]!) - TOL];
    const hi = [Math.max(pos[x * 3]!, pos[y * 3]!) + TOL, Math.max(pos[x * 3 + 1]!, pos[y * 3 + 1]!) + TOL, Math.max(pos[x * 3 + 2]!, pos[y * 3 + 2]!) + TOL];
    for (let ix = cellIn(lo[0]!, 0); ix <= cellIn(hi[0]!, 0); ix++)
      for (let iy = cellIn(lo[1]!, 1); iy <= cellIn(hi[1]!, 1); iy++)
        for (let iz = cellIn(lo[2]!, 2); iz <= cellIn(hi[2]!, 2); iz++) out.push(...(grid.get(keyOf(ix, iy, iz)) ?? []));
    return out;
  };
  const stack: number[][] = [];
  for (let t = firstTri; t < b.indices.length; t += 3) stack.push([b.indices[t]!, b.indices[t + 1]!, b.indices[t + 2]!]);
  const out: number[][] = [];
  // Limite de segurança: se a cascata passar disso, o que sobrar fica sem dividir (melhor que travar).
  let budget = 20 * stack.length + 1000;
  while (stack.length) {
    const t = stack.pop()!;
    if (sliver(t[0]!, t[1]!, t[2]!)) continue;
    if (--budget < 0) {
      out.push(t);
      continue;
    }
    let split = false;
    for (let e = 0; e < 3 && !split; e++) {
      const x = t[e]!;
      const y = t[(e + 1) % 3]!;
      const z = t[(e + 2) % 3]!;
      for (const q of candidates(x, y)) {
        if (q === x || q === y || q === z || !onSeg(q, x, y)) continue;
        const k = pos.length / 3;
        pos.push(pos[q * 3]!, pos[q * 3 + 1]!, pos[q * 3 + 2]!);
        b.normals.push(b.normals[x * 3]!, b.normals[x * 3 + 1]!, b.normals[x * 3 + 2]!);
        stack.push([x, k, z], [k, y, z]);
        split = true;
        break;
      }
    }
    if (!split) out.push(t);
  }
  b.indices.length = firstTri;
  for (const t of out) b.indices.push(t[0]!, t[1]!, t[2]!);
}
