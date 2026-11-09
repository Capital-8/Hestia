/**
 * Referência TS da malha do guarda-corpo (decisão 0055, Fase 3b): soldagem na grade de 1 µm e análise de grupo.
 * Espelha `crates/geom-wasm/src/gc_malha.rs`; usada só pelos testes de paridade.
 */
export type V3 = [number, number, number];
export interface PecaMalha { vertices: V3[]; triangulos: [number, number, number][] }
export interface Analise { vertices: number; arestas: number; faces: number; euler: number; volume: number; fechada: boolean }
export const GRADE_SAIDA = 1e-6;

/** Lê `arr[i]`; lança erro se o índice faltar (em vez de devolver `undefined` em silêncio). */
export function at<T>(arr: readonly T[], i: number): T {
  const v = arr[i];
  if (!Number.isInteger(i) || i < 0 || i >= arr.length || v === undefined) {
    throw new RangeError(`índice ${i} fora do intervalo 0..${arr.length - 1}`);
  }
  return v;
}

export const quantizar = (v: number): number => Math.floor(v / GRADE_SAIDA + 0.5);

export class MalhaRef {
  vertices: V3[] = [];
  indices: number[] = [];
  grupos: { primeiro: number; n: number }[] = [];
  private mapa = new Map<string, number>();

  private vertice(p: V3): number {
    const k: V3 = [quantizar(p[0]), quantizar(p[1]), quantizar(p[2])];
    const ch = k.join(',');
    const e = this.mapa.get(ch);
    if (e !== undefined) return e;
    const i = this.vertices.length;
    this.vertices.push([k[0] * GRADE_SAIDA, k[1] * GRADE_SAIDA, k[2] * GRADE_SAIDA]);
    this.mapa.set(ch, i);
    return i;
  }

  adicionarGrupo(peca: PecaMalha): number {
    const ids = peca.vertices.map((p) => this.vertice(p));
    const primeiro = this.indices.length;
    for (const t of peca.triangulos) {
      const a = at(ids, t[0]), b = at(ids, t[1]), c = at(ids, t[2]);
      if (a !== b && b !== c && a !== c) this.indices.push(a, b, c);
    }
    this.grupos.push({ primeiro, n: this.indices.length - primeiro });
    return this.grupos.length - 1;
  }

  analisar(g: number): Analise {
    const { primeiro, n } = at(this.grupos, g);
    const idx = this.indices.slice(primeiro, primeiro + n);
    const usados = new Set<number>();
    const dir = new Map<string, number>();
    const und = new Set<string>();
    let volume = 0;
    for (let i = 0; i < idx.length; i += 3) {
      const i0 = at(idx, i), i1 = at(idx, i + 1), i2 = at(idx, i + 2);
      const arestas: [number, number][] = [[i0, i1], [i1, i2], [i2, i0]];
      for (const [a, b] of arestas) {
        usados.add(a);
        dir.set(`${a},${b}`, (dir.get(`${a},${b}`) ?? 0) + 1);
        und.add(`${Math.min(a, b)},${Math.max(a, b)}`);
      }
      const a = at(this.vertices, i0), b = at(this.vertices, i1), c = at(this.vertices, i2);
      volume += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
    }
    let fechada = true;
    for (const [ch, nn] of dir) {
      const partes = ch.split(',');
      const a = at(partes, 0), b = at(partes, 1);
      if (nn !== 1 || dir.get(`${b},${a}`) !== 1) fechada = false;
    }
    const v = usados.size, e = und.size, f = idx.length / 3;
    return { vertices: v, arestas: e, faces: f, euler: v - e + f, volume, fechada };
  }

  somaCoordenadas(g: number): V3 {
    const { primeiro, n } = at(this.grupos, g);
    const usados = [...new Set(this.indices.slice(primeiro, primeiro + n))];
    const s: V3 = [0, 0, 0];
    for (const i of usados) {
      const v = at(this.vertices, i);
      s[0] += v[0];
      s[1] += v[1];
      s[2] += v[2];
    }
    return s;
  }
}
