import type { InstanciasDeProtoCortina, MalhaCortinaProjeto, PrototipoCortina } from '@hestia/engine';
import type { Id } from '@hestia/model';

/**
 * Parede cortina no 3D (decisão 0056, fase 1): a malha vem do kernel (`cortina_malha`) como PROTÓTIPOS (um por tipo de montante e de painel, comprimento
 * unitário) mais as MATRIZES das instâncias. Aqui ficam as contas puras que o `ModelScene` usa para montar um `InstancedMesh` por (protótipo, material,
 * transparência) e nível: agrupar as instâncias, converter a matriz 3 x 4 do Rust para a coluna-maior do three, as normais por face do protótipo, as arestas
 * e a caixa de cada cortina (a peça de picking é a caixa: o raio acha a cortina inteira, e o realce usa o mesmo contorno).
 *
 * O vidro (`transparente`) fica num lote separado, desenhado depois dos opacos e sem escrita de profundidade (ver `scene3d.ts`).
 */

/** Instâncias de um mesmo protótipo e material, de uma ou mais cortinas do mesmo nível. */
export interface LoteCortina3d {
  proto: number;
  papel: number;
  materialId: Id | null;
  transparente: boolean;
  /** Vértices e índices do protótipo, normais por vértice (cada vértice é de uma face só). */
  vertices: Float32Array;
  normais: Float32Array;
  indices: Uint32Array;
  /** 16 números por instância, coluna-maior (`THREE.Matrix4.elements`). */
  matrizes: Float32Array;
  /** Cortina dona de cada instância (mesma ordem das matrizes). */
  donos: Id[];
  n: number;
}

/** Matriz 3 x 4 linha-maior do Rust (`[r0 r1 r2 t]` por linha) -> 4 x 4 coluna-maior, escrita em `saida` a partir de `desde`. */
export function matriz16(m12: ArrayLike<number>, de: number, saida: Float32Array, desde: number): void {
  const o = de;
  saida[desde + 0] = m12[o + 0]!;
  saida[desde + 1] = m12[o + 4]!;
  saida[desde + 2] = m12[o + 8]!;
  saida[desde + 3] = 0;
  saida[desde + 4] = m12[o + 1]!;
  saida[desde + 5] = m12[o + 5]!;
  saida[desde + 6] = m12[o + 9]!;
  saida[desde + 7] = 0;
  saida[desde + 8] = m12[o + 2]!;
  saida[desde + 9] = m12[o + 6]!;
  saida[desde + 10] = m12[o + 10]!;
  saida[desde + 11] = 0;
  saida[desde + 12] = m12[o + 3]!;
  saida[desde + 13] = m12[o + 7]!;
  saida[desde + 14] = m12[o + 11]!;
  saida[desde + 15] = 1;
}

/** Malha de peça avulsa no 3D: triângulo a triângulo (sem vértice compartilhado), em coordenadas do mundo, com a normal de cada face. */
export interface LoteAvulsoCortina3d {
  cortina: Id;
  papel: number;
  materialId: Id | null;
  transparente: boolean;
  vertices: Float32Array;
  normais: Float32Array;
  indices: Uint32Array;
}

/** Normal de cada vértice = normal do triângulo a que pertence (o Rust dá vértices próprios por face: sombreamento chapado). */
export function normaisDoProto(p: PrototipoCortina): Float32Array {
  return normaisDaMalha(p.vertices, p.indices);
}

/** Normal de cada vértice de uma malha = normal do triângulo a que o vértice pertence. Vértice compartilhado por faces toma a da última (use soup). */
export function normaisDaMalha(v: ArrayLike<number>, indices: ArrayLike<number>): Float32Array {
  const n = new Float32Array(v.length);
  for (let t = 0; t + 2 < indices.length; t += 3) {
    const ia = indices[t]! * 3;
    const ib = indices[t + 1]! * 3;
    const ic = indices[t + 2]! * 3;
    const ux = v[ib]! - v[ia]!;
    const uy = v[ib + 1]! - v[ia + 1]!;
    const uz = v[ib + 2]! - v[ia + 2]!;
    const wx = v[ic]! - v[ia]!;
    const wy = v[ic + 1]! - v[ia + 1]!;
    const wz = v[ic + 2]! - v[ia + 2]!;
    let nx = uy * wz - uz * wy;
    let ny = uz * wx - ux * wz;
    let nz = ux * wy - uy * wx;
    const l = Math.hypot(nx, ny, nz);
    if (l < 1e-18) continue;
    nx /= l;
    ny /= l;
    nz /= l;
    for (const i of [ia, ib, ic]) {
      n[i] = nx;
      n[i + 1] = ny;
      n[i + 2] = nz;
    }
  }
  return n;
}

/**
 * Peças avulsas (`grupos` do kernel) das cortinas visíveis, uma malha por grupo. Os triângulos são copiados para soup (cada face com os próprios
 * vértices), de modo que a normal sai chapada mesmo onde o Rust compartilha vértices entre as tampas. Opacas primeiro, vidro depois.
 */
export function avulsosDaCortina(malha: MalhaCortinaProjeto, visivel: (wallId: Id) => boolean = () => true): LoteAvulsoCortina3d[] {
  const out: LoteAvulsoCortina3d[] = [];
  for (const g of malha.grupos) {
    if (!visivel(g.wallId) || g.indices.length === 0) continue;
    const k = g.indices.length;
    const v = new Float32Array(3 * k);
    for (let q = 0; q < k; q++) {
      const de = 3 * g.indices[q]!;
      v[3 * q] = g.vertices[de]!;
      v[3 * q + 1] = g.vertices[de + 1]!;
      v[3 * q + 2] = g.vertices[de + 2]!;
    }
    const idx = Uint32Array.from({ length: k }, (_, q) => q);
    out.push({ cortina: g.wallId, papel: g.papel, materialId: g.materialId, transparente: g.transparente, vertices: v, normais: normaisDaMalha(v, idx), indices: idx });
  }
  return out.sort((a, b) => Number(a.transparente) - Number(b.transparente));
}

/**
 * Instâncias da malha, filtradas pelas cortinas visíveis (`visivel`), juntadas por (protótipo, material, transparência): um lote = um desenho.
 * Opacos primeiro, vidros depois (a ordem do array já é a de desenho); dentro de cada grupo, por protótipo.
 */
export function lotesDaCortina(malha: MalhaCortinaProjeto, visivel: (wallId: Id) => boolean = () => true): LoteCortina3d[] {
  const mapa = new Map<string, { ref: InstanciasDeProtoCortina; fontes: InstanciasDeProtoCortina[] }>();
  for (const g of malha.instancias) {
    if (!visivel(g.wallId) || g.n === 0) continue;
    const chave = `${g.proto}|${g.materialId ?? ''}|${g.transparente ? 1 : 0}`;
    const e = mapa.get(chave);
    if (e) e.fontes.push(g);
    else mapa.set(chave, { ref: g, fontes: [g] });
  }
  const normais = new Map<number, Float32Array>();
  const lotes: LoteCortina3d[] = [];
  for (const { ref, fontes } of mapa.values()) {
    const proto = malha.protos.get(ref.proto);
    if (!proto) continue;
    let nrm = normais.get(proto.proto);
    if (!nrm) normais.set(proto.proto, (nrm = normaisDoProto(proto)));
    const n = fontes.reduce((s, f) => s + f.n, 0);
    const matrizes = new Float32Array(16 * n);
    const donos: Id[] = [];
    let k = 0;
    for (const f of fontes) {
      for (let i = 0; i < f.n; i++) {
        matriz16(f.matrizes, 12 * i, matrizes, 16 * k++);
        donos.push(f.wallId);
      }
    }
    lotes.push({ proto: proto.proto, papel: ref.papel, materialId: ref.materialId, transparente: ref.transparente, vertices: proto.vertices, normais: nrm, indices: proto.indices, matrizes, donos, n });
  }
  return lotes.sort((a, b) => Number(a.transparente) - Number(b.transparente) || a.proto - b.proto);
}

/** Posição `(x, y, z)` do vértice `i` do protótipo levada ao mundo pela instância `k` do lote. */
function aoMundo(l: LoteCortina3d, i: number, k: number, saida: number[]): void {
  const e = l.matrizes;
  const o = 16 * k;
  const x = l.vertices[3 * i]!;
  const y = l.vertices[3 * i + 1]!;
  const z = l.vertices[3 * i + 2]!;
  saida[0] = e[o]! * x + e[o + 4]! * y + e[o + 8]! * z + e[o + 12]!;
  saida[1] = e[o + 1]! * x + e[o + 5]! * y + e[o + 9]! * z + e[o + 13]!;
  saida[2] = e[o + 2]! * x + e[o + 6]! * y + e[o + 10]! * z + e[o + 14]!;
}

/** Caixa (mundo) de cada cortina: de todos os vértices de todas as suas instâncias e peças avulsas (o montante de canto entra no picking). */
export function caixasDasCortinas(
  lotes: readonly LoteCortina3d[],
  avulsos: readonly LoteAvulsoCortina3d[] = [],
): Map<Id, { min: [number, number, number]; max: [number, number, number] }> {
  const out = new Map<Id, { min: [number, number, number]; max: [number, number, number] }>();
  const caixa = (id: Id) => {
    let c = out.get(id);
    if (!c) out.set(id, (c = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] }));
    return c;
  };
  const estende = (c: { min: [number, number, number]; max: [number, number, number] }, p: number[]): void => {
    for (let a = 0; a < 3; a++) {
      if (p[a]! < c.min[a]!) c.min[a] = p[a]!;
      if (p[a]! > c.max[a]!) c.max[a] = p[a]!;
    }
  };
  const p = [0, 0, 0];
  for (const l of lotes) {
    for (let k = 0; k < l.n; k++) {
      const c = caixa(l.donos[k]!);
      for (let i = 0; i < l.vertices.length / 3; i++) {
        aoMundo(l, i, k, p);
        estende(c, p);
      }
    }
  }
  for (const a of avulsos) {
    const c = caixa(a.cortina);
    for (let i = 0; i < a.vertices.length / 3; i++) estende(c, [a.vertices[3 * i]!, a.vertices[3 * i + 1]!, a.vertices[3 * i + 2]!]);
  }
  return out;
}

/** Os 12 triângulos de uma caixa (8 vértices, anti-horário visto de fora). */
const TRI_CAIXA = [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2, 0, 4, 7, 0, 7, 3, 1, 2, 6, 1, 6, 5];

/**
 * Malha de picking: a caixa de cada cortina como 12 triângulos em coordenadas de mundo, com a faixa de índices de cada uma (`ranges` no formato do picking,
 * em triângulos). Só para o raio e o realce; nunca é desenhada (cor e profundidade desligadas).
 */
export function malhaDePickCortina(caixas: ReadonlyMap<Id, { min: readonly number[]; max: readonly number[] }>): { positions: number[]; indices: number[]; ranges: Array<{ id: Id; start: number; count: number }> } {
  const positions: number[] = [];
  const indices: number[] = [];
  const ranges: Array<{ id: Id; start: number; count: number }> = [];
  for (const [id, c] of [...caixas].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const [x0, y0, z0] = c.min as [number, number, number];
    const [x1, y1, z1] = c.max as [number, number, number];
    if (!(Number.isFinite(x0) && Number.isFinite(x1))) continue;
    const base = positions.length / 3;
    positions.push(x0, y0, z0, x1, y0, z0, x1, y1, z0, x0, y1, z0, x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1);
    const ini = indices.length / 3;
    for (const t of TRI_CAIXA) indices.push(base + t);
    ranges.push({ id, start: ini, count: TRI_CAIXA.length / 3 });
  }
  return { positions, indices, ranges };
}

/**
 * Arestas vivas (ângulo entre faces acima de `anguloRad`) de todas as instâncias, em pares de pontos de mundo, para os estilos de linhas. As arestas do
 * protótipo são calculadas uma vez por protótipo e depois levadas ao mundo por cada matriz.
 */
export function arestasDaCortina(lotes: readonly LoteCortina3d[], anguloRad: number, avulsos: readonly LoteAvulsoCortina3d[] = []): Float32Array {
  const corte = Math.cos(anguloRad);
  const saida: number[] = [];
  const p = [0, 0, 0];
  for (const l of lotes) {
    const seg = arestasVivas(l.vertices, l.normais, l.indices, corte);
    for (let k = 0; k < l.n; k++) {
      for (const i of seg) {
        aoMundo(l, i, k, p);
        saida.push(p[0]!, p[1]!, p[2]!);
      }
    }
  }
  for (const a of avulsos) {
    for (const i of arestasVivas(a.vertices, a.normais, a.indices, corte)) saida.push(a.vertices[3 * i]!, a.vertices[3 * i + 1]!, a.vertices[3 * i + 2]!);
  }
  return Float32Array.from(saida);
}

/** Índices de vértice (de dois em dois = um segmento) das arestas de uma malha em que as normais das duas faces se afastam mais que `cosCorte`. */
function arestasVivas(pos: ArrayLike<number>, nr: ArrayLike<number>, indices: ArrayLike<number>, cosCorte: number): number[] {
  // Aresta = par de posições (as faces têm vértices próprios: junta pela posição, não pelo índice).
  const chave = (i: number): string => `${Math.round(pos[3 * i]! * 1e6)},${Math.round(pos[3 * i + 1]! * 1e6)},${Math.round(pos[3 * i + 2]! * 1e6)}`;
  const arestas = new Map<string, { a: number; b: number; normais: number[][] }>();
  for (let t = 0; t + 2 < indices.length; t += 3) {
    const tri = [indices[t]!, indices[t + 1]!, indices[t + 2]!];
    for (let e = 0; e < 3; e++) {
      const a = tri[e]!;
      const b = tri[(e + 1) % 3]!;
      const ka = chave(a);
      const kb = chave(b);
      const k = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
      const n = [nr[3 * a]!, nr[3 * a + 1]!, nr[3 * a + 2]!];
      const x = arestas.get(k);
      if (x) x.normais.push(n);
      else arestas.set(k, { a, b, normais: [n] });
    }
  }
  const out: number[] = [];
  for (const x of arestas.values()) {
    // Aresta de contorno (uma face só) ou com ângulo vivo.
    const vivo = x.normais.length < 2 || x.normais.some((n, i) => x.normais.some((m, j) => j > i && n[0]! * m[0]! + n[1]! * m[1]! + n[2]! * m[2]! < cosCorte));
    if (vivo) out.push(x.a, x.b);
  }
  return out;
}

/**
 * Centro (mundo) da instância `k` do lote: o centro da caixa do protótipo (vértices em coordenadas locais) levado pela matriz da instância. Escrito em
 * `saida`. Usado para dizer em que célula cai um painel, sem desenhar nada.
 */
export function centroDaInstancia(l: LoteCortina3d, k: number, saida: number[]): void {
  let x0 = Infinity;
  let y0 = Infinity;
  let z0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  let z1 = -Infinity;
  for (let i = 0; i < l.vertices.length; i += 3) {
    const x = l.vertices[i]!;
    const y = l.vertices[i + 1]!;
    const z = l.vertices[i + 2]!;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
    if (z < z0) z0 = z;
    if (z > z1) z1 = z;
  }
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const cz = (z0 + z1) / 2;
  const e = l.matrizes;
  const o = 16 * k;
  saida[0] = e[o]! * cx + e[o + 4]! * cy + e[o + 8]! * cz + e[o + 12]!;
  saida[1] = e[o + 1]! * cx + e[o + 5]! * cy + e[o + 9]! * cz + e[o + 13]!;
  saida[2] = e[o + 2]! * cx + e[o + 6]! * cy + e[o + 10]! * cz + e[o + 14]!;
}

/**
 * Subconjunto dos lotes: só as instâncias para as quais `aceita(dono, centro)` é verdadeiro (centro em mundo). Lote sem instância aceita some. Os
 * matrizes e os donos são cópias do subconjunto (o lote original não muda); a geometria do protótipo é a mesma.
 */
export function subconjuntoDeLotes(lotes: readonly LoteCortina3d[], aceita: (dono: Id, centro: readonly number[]) => boolean): LoteCortina3d[] {
  const out: LoteCortina3d[] = [];
  const centro: number[] = [0, 0, 0];
  for (const l of lotes) {
    const ks: number[] = [];
    for (let k = 0; k < l.n; k++) {
      centroDaInstancia(l, k, centro);
      if (aceita(l.donos[k]!, centro)) ks.push(k);
    }
    if (!ks.length) continue;
    const matrizes = new Float32Array(16 * ks.length);
    const donos: Id[] = [];
    ks.forEach((k, j) => {
      matrizes.set(l.matrizes.subarray(16 * k, 16 * k + 16), 16 * j);
      donos.push(l.donos[k]!);
    });
    out.push({ ...l, matrizes, donos, n: ks.length });
  }
  return out;
}

/**
 * A célula (`s0..s1`, `z0..z1`, em metros a partir do início e da base da parede) contém o ponto `centro` (mundo)? A parede é o eixo `a`-`b` de
 * comprimento `L`; `profundidade` é a espessura da cortina (o ponto tem de estar entre as duas faces). A folga exclui pontos sobre a borda: os
 * montantes ficam sobre as linhas da grade, e um painel fica estritamente dentro da célula.
 */
export function celulaContemCentro(
  centro: readonly number[],
  parede: { a: { x: number; y: number }; b: { x: number; y: number }; L: number; zBase: number; profundidade: number },
  celula: { s0: number; s1: number; z0: number; z1: number },
  folga = 1e-4,
): boolean {
  if (!(parede.L > 0)) return false;
  const ux = (parede.b.x - parede.a.x) / parede.L;
  const uy = (parede.b.y - parede.a.y) / parede.L;
  const dx = centro[0]! - parede.a.x;
  const dy = centro[1]! - parede.a.y;
  const s = dx * ux + dy * uy;
  const n = -dx * uy + dy * ux;
  const z = centro[2]! - parede.zBase;
  return (
    s > celula.s0 + folga &&
    s < celula.s1 - folga &&
    z > celula.z0 + folga &&
    z < celula.z1 - folga &&
    Math.abs(n) <= parede.profundidade / 2 + folga
  );
}
