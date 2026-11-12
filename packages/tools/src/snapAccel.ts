import type { Vec2 } from '@hestia/geom';

/**
 * Consulta espacial das listas de captura da vista de corte/elevação (`extraPoints`, `extraSegments`, `extraTracks`).
 *
 * Com 100 escadas e 100 guarda-corpos a vista tem dezenas de milhares de pontos e arestas; varrer tudo a cada movimento do mouse custava
 * 20 ms. Aqui cada lista grande ganha, uma vez e guardada pela identidade do array, uma grade de células (pontos e arestas) e listas
 * ordenadas por x e por y (alinhamento e trilhas horizontais/verticais). A consulta devolve só um SUPERCONJUNTO dos itens ao alcance do
 * cursor, na ordem original da lista; os filtros que `infer` já aplica depois ficam como estão, então o resultado é idêntico ao da
 * varredura completa (listas pequenas nem passam por aqui).
 *
 * Lista que é "índice + cauda pequena" (a vista mais as grades e os pontos da ferramenta) é registrada com `registrarCauda`: a parte
 * do índice usa a estrutura já feita e só a cauda é varrida.
 */

/** Abaixo disto a varredura direta é mais barata que montar a estrutura. */
export const LIMITE_ACELERACAO = 256;

let ligada = true;
/** Só para teste: desliga a estrutura espacial para comparar com a varredura completa. */
export function aceleracaoLigadaParaTeste(v: boolean): void {
  ligada = v;
}
const CELULA = 0.25;
/** Aresta que ocupa mais células que isto (linha de nível de ponta a ponta) fica numa lista varrida sempre. */
const MAX_CELULAS_ARESTA = 64;
/** Consulta que cobriria mais células que isto cai na varredura direta. */
const MAX_CELULAS_CONSULTA = 400;

interface Seg {
  a: Vec2;
  b: Vec2;
}
type Ordenado = { chave: Float64Array; ordem: Int32Array };

const cel = (v: number): number => Math.floor(v / CELULA);
const chaveCel = (ix: number, iy: number): number => (ix + 2_000_000) * 4_000_000 + (iy + 2_000_000);

function ordenar(n: number, valor: (i: number) => number): Ordenado {
  const ordem = new Int32Array(n);
  for (let i = 0; i < n; i++) ordem[i] = i;
  const vals = new Float64Array(n);
  for (let i = 0; i < n; i++) vals[i] = valor(i);
  const idx = Array.from(ordem).sort((p, q) => vals[p]! - vals[q]!);
  const chave = new Float64Array(n);
  const o = new Int32Array(n);
  for (let k = 0; k < n; k++) {
    o[k] = idx[k]!;
    chave[k] = vals[idx[k]!]!;
  }
  return { chave, ordem: o };
}

/** Primeiro índice com chave >= v. */
function inicioDe(ord: Ordenado, v: number): number {
  let lo = 0;
  let hi = ord.chave.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (ord.chave[mid]! < v) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function faixa(ord: Ordenado, de: number, ate: number, out: Set<number>): void {
  for (let k = inicioDe(ord, de); k < ord.chave.length && ord.chave[k]! <= ate; k++) out.add(ord.ordem[k]!);
}

const emOrdem = (s: Set<number>): number[] => Array.from(s).sort((a, b) => a - b);

// ---------- pontos ----------

interface AcelPontos {
  n: number;
  porX: Ordenado;
  porY: Ordenado;
  grade: Map<number, number[]>;
}

function montarPontos(arr: ReadonlyArray<Vec2>, n: number): AcelPontos {
  const grade = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const p = arr[i]!;
    const k = chaveCel(cel(p.x), cel(p.y));
    const l = grade.get(k);
    if (l) l.push(i);
    else grade.set(k, [i]);
  }
  return { n, porX: ordenar(n, (i) => arr[i]!.x), porY: ordenar(n, (i) => arr[i]!.y), grade };
}

// ---------- arestas ----------

interface AcelArestas {
  n: number;
  grade: Map<number, number[]>;
  /** Arestas grandes demais para a grade: sempre candidatas. */
  longas: number[];
}

function montarArestas(arr: ReadonlyArray<Seg>, n: number): AcelArestas {
  const grade = new Map<number, number[]>();
  const longas: number[] = [];
  for (let i = 0; i < n; i++) {
    const e = arr[i]!;
    const x0 = cel(Math.min(e.a.x, e.b.x));
    const x1 = cel(Math.max(e.a.x, e.b.x));
    const y0 = cel(Math.min(e.a.y, e.b.y));
    const y1 = cel(Math.max(e.a.y, e.b.y));
    if (!Number.isFinite(x0 + x1 + y0 + y1) || (x1 - x0 + 1) * (y1 - y0 + 1) > MAX_CELULAS_ARESTA) {
      longas.push(i);
      continue;
    }
    for (let ix = x0; ix <= x1; ix++) {
      for (let iy = y0; iy <= y1; iy++) {
        const k = chaveCel(ix, iy);
        const l = grade.get(k);
        if (l) l.push(i);
        else grade.set(k, [i]);
      }
    }
  }
  return { n, grade, longas };
}

// ---------- trilhas ----------

interface AcelTrilhas {
  n: number;
  /** Trilhas horizontais, ordenadas por y; verticais, por x. */
  h: Ordenado;
  v: Ordenado;
  /**
   * Inclinadas agrupadas pela direção exata (a inclinação de uma escada é a mesma em todos os degraus e escadas): dentro do grupo, a
   * distância do cursor à reta suporte é |c − c0| com c = −uy·x + ux·y, então a faixa de offsets resolve a consulta.
   */
  grupos: Array<{ ux: number; uy: number; c: Ordenado }>;
  /** Sem eixo (faces da planta) e direções além do limite de grupos: varridas sempre. */
  outras: number[];
}

const MAX_GRUPOS_DIRECAO = 64;

interface Trilha extends Seg {
  axis?: 'h' | 'v' | 'd';
}

/** Direção canônica (sentido de x positivo) da trilha inclinada, ou null se degenerada. */
function direcaoDe(e: Seg): { ux: number; uy: number } | null {
  const dx = e.b.x - e.a.x;
  const dy = e.b.y - e.a.y;
  const len = Math.hypot(dx, dy);
  if (!(len > 1e-12)) return null;
  let ux = dx / len;
  let uy = dy / len;
  if (ux < -1e-9 || (Math.abs(ux) <= 1e-9 && uy < 0)) {
    ux = -ux;
    uy = -uy;
  }
  return { ux, uy };
}

function montarTrilhas(arr: ReadonlyArray<Trilha>, n: number): AcelTrilhas {
  const hs: number[] = [];
  const vs: number[] = [];
  const outras: number[] = [];
  const porDirecao = new Map<string, { ux: number; uy: number; idx: number[] }>();
  for (let i = 0; i < n; i++) {
    const e = arr[i]!;
    if (e.axis === 'h') hs.push(i);
    else if (e.axis === 'v') vs.push(i);
    else if (e.axis === 'd') {
      const d = direcaoDe(e);
      if (!d) {
        outras.push(i);
        continue;
      }
      const chave = `${Math.round(d.ux * 1e6)}|${Math.round(d.uy * 1e6)}`;
      const g = porDirecao.get(chave);
      if (g) g.idx.push(i);
      else if (porDirecao.size < MAX_GRUPOS_DIRECAO) porDirecao.set(chave, { ux: d.ux, uy: d.uy, idx: [i] });
      else outras.push(i);
    } else outras.push(i);
  }
  const reindexar = (o: Ordenado, idx: number[]): Ordenado => {
    for (let k = 0; k < o.ordem.length; k++) o.ordem[k] = idx[o.ordem[k]!]!;
    return o;
  };
  const h = reindexar(ordenar(hs.length, (k) => arr[hs[k]!]!.a.y), hs);
  const v = reindexar(ordenar(vs.length, (k) => arr[vs[k]!]!.a.x), vs);
  const grupos = [...porDirecao.values()].map((g) => ({ ux: g.ux, uy: g.uy, c: reindexar(ordenar(g.idx.length, (k) => -g.uy * arr[g.idx[k]!]!.a.x + g.ux * arr[g.idx[k]!]!.a.y), g.idx) }));
  return { n, h, v, grupos, outras };
}

// ---------- cache por identidade ----------

type Acel = { pontos?: AcelPontos; arestas?: AcelArestas; trilhas?: AcelTrilhas };
const porLista = new WeakMap<object, Acel>();
/** Lista "base + cauda": a estrutura vale para os `baseLen` primeiros itens da lista `base`. */
const caudas = new WeakMap<object, { base: ReadonlyArray<unknown>; baseLen: number }>();

/** Marca `lista` como a lista `base` seguida de uma cauda pequena (itens depois de `base.length`), para reaproveitar a estrutura de `base`. */
export function registrarCauda<T>(lista: T[], base: ReadonlyArray<T>): T[] {
  if (base.length >= LIMITE_ACELERACAO) caudas.set(lista, { base, baseLen: base.length });
  return lista;
}

function acelDe(lista: ReadonlyArray<unknown>): { acel: Acel; fonte: ReadonlyArray<unknown>; n: number; cauda: number } | null {
  if (!ligada) return null;
  const c = caudas.get(lista);
  const fonte = c ? c.base : lista;
  const n = c ? c.baseLen : lista.length;
  if (n < LIMITE_ACELERACAO) return null;
  let acel = porLista.get(fonte);
  if (!acel) porLista.set(fonte, (acel = {}));
  return { acel, fonte, n, cauda: c ? lista.length - n : 0 };
}

/** Itens da cauda (depois do trecho indexado), sempre candidatos. */
function comCauda<T>(lista: readonly T[], idx: number[], n: number): T[] {
  const out: T[] = idx.map((i) => lista[i]!);
  for (let i = n; i < lista.length; i++) out.push(lista[i]!);
  return out;
}

// ---------- arestas `face` ----------

const faces = new WeakMap<object, readonly object[]>();

/**
 * As arestas `kind: 'face'` (ombreiras da planta) da lista, na ordem original. Numa lista grande (a vista de corte, cujas arestas são todas
 * `nearest`) o filtro é feito uma vez e guardado pela identidade da lista base; só a cauda é varrida a cada chamada.
 */
export function segmentosDeFace<T extends { kind?: string }>(lista: readonly T[] | undefined): readonly T[] {
  if (!lista) return [];
  const c = caudas.get(lista);
  const fonte = (c ? c.base : lista) as readonly T[];
  const n = c ? c.baseLen : lista.length;
  if (!ligada || n < LIMITE_ACELERACAO) return lista.filter((e) => e.kind === 'face');
  let base = faces.get(fonte) as readonly T[] | undefined;
  if (!base) faces.set(fonte, (base = fonte.slice(0, n).filter((e) => e.kind === 'face')));
  return c ? [...base, ...lista.slice(n).filter((e) => e.kind === 'face')] : base;
}

// ---------- consultas ----------

/** Pontos a até `r` do cursor `c` (superconjunto, na ordem original). */
export function pontosPerto<T extends Vec2>(lista: readonly T[] | undefined, c: Vec2, r: number): readonly T[] {
  if (!lista) return [];
  const a = acelDe(lista);
  if (!a) return lista;
  const x0 = cel(c.x - r);
  const x1 = cel(c.x + r);
  const y0 = cel(c.y - r);
  const y1 = cel(c.y + r);
  if ((x1 - x0 + 1) * (y1 - y0 + 1) > MAX_CELULAS_CONSULTA) return lista;
  const p = (a.acel.pontos ??= montarPontos(a.fonte as ReadonlyArray<Vec2>, a.n));
  const achados = new Set<number>();
  for (let ix = x0; ix <= x1; ix++) for (let iy = y0; iy <= y1; iy++) for (const i of p.grade.get(chaveCel(ix, iy)) ?? []) achados.add(i);
  return comCauda(lista, emOrdem(achados), a.n);
}

/** Pontos cujo x está a até `r` do cursor, ou cujo y está (referências de alinhamento: o ponto pode estar longe na outra direção). */
export function pontosNasFaixas<T extends Vec2>(lista: readonly T[] | undefined, c: Vec2, r: number): readonly T[] {
  if (!lista) return [];
  const a = acelDe(lista);
  if (!a) return lista;
  const p = (a.acel.pontos ??= montarPontos(a.fonte as ReadonlyArray<Vec2>, a.n));
  const achados = new Set<number>();
  faixa(p.porX, c.x - r, c.x + r, achados);
  faixa(p.porY, c.y - r, c.y + r, achados);
  return comCauda(lista, emOrdem(achados), a.n);
}

/** Arestas cuja caixa expandida por `r` contém o cursor (superconjunto das que passam a até `r` dele, na ordem original). */
export function arestasPerto<T extends Seg>(lista: readonly T[] | undefined, c: Vec2, r: number): readonly T[] {
  if (!lista) return [];
  const a = acelDe(lista);
  if (!a) return lista;
  const x0 = cel(c.x - r);
  const x1 = cel(c.x + r);
  const y0 = cel(c.y - r);
  const y1 = cel(c.y + r);
  if ((x1 - x0 + 1) * (y1 - y0 + 1) > MAX_CELULAS_CONSULTA) return lista;
  const g = (a.acel.arestas ??= montarArestas(a.fonte as ReadonlyArray<Seg>, a.n));
  const achados = new Set<number>(g.longas);
  for (let ix = x0; ix <= x1; ix++) for (let iy = y0; iy <= y1; iy++) for (const i of g.grade.get(chaveCel(ix, iy)) ?? []) achados.add(i);
  return comCauda(lista, emOrdem(achados), a.n);
}

/**
 * Trilhas cuja reta suporte passa a até `r` do cursor: horizontais pela faixa de y, verticais pela de x; as inclinadas e sem eixo vão
 * sempre (o filtro exato fica com quem chama).
 */
export function trilhasPerto<T extends Trilha>(lista: readonly T[] | undefined, c: Vec2, r: number): readonly T[] {
  if (!lista) return [];
  const a = acelDe(lista);
  if (!a) return lista;
  const t = (a.acel.trilhas ??= montarTrilhas(a.fonte as ReadonlyArray<Trilha>, a.n));
  const achados = new Set<number>(t.outras);
  faixa(t.h, c.y - r, c.y + r, achados);
  faixa(t.v, c.x - r, c.x + r, achados);
  for (const g of t.grupos) {
    const c0 = -g.uy * c.x + g.ux * c.y;
    // Folga de 1 mm: membros do grupo diferem em até 5e-7 na direção (chave arredondada), o que vira até ~1e-4 m de offset a 100 m da origem.
    // É só superconjunto; o filtro exato de quem chama decide.
    faixa(g.c, c0 - r - 1e-3, c0 + r + 1e-3, achados);
  }
  return comCauda(lista, emOrdem(achados), a.n);
}
