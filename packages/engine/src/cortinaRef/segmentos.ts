/**
 * Remoção e restauração de segmento e região fundida da parede cortina (decisão 0056, §5.2). Remover um segmento interno
 * funde as duas células vizinhas numa região. A região precisa ser RETANGULAR: uma remoção que dê região não retangular
 * é ignorada e vira o aviso `cortina-celula-nao-retangular` (no comando, `podeRemoverSegmento` recusa). Dentro de uma
 * região não há montante: os segmentos internos dela saem como "sem montante" mesmo sem remoção explícita.
 * Linha global: U = 0..nu (0 e nu são as bordas); V = nu+1..nu+nv+1 (nu+1 é a borda da base). Só linha interna pode ser
 * removida (o `LineRef` não aponta borda); segmento de borda removido só tira o montante da borda.
 */
import { at, type SegmentRef } from './tipos.ts';
import type { GradeResolvida } from './grade.ts';

/** Remoção pedida: linha global `a` (ver cabeçalho), segmento `b` (k) e a ordem na lista da instância. */
export interface PedidoRemocao {
  ordem: number;
  a: number;
  b: number;
}

export interface RegiaoFundida {
  /** Índice (i·nv + j) da célula canônica: a de menor j e, empatando, a de menor i. */
  canon: number;
  i0: number;
  i1: number;
  j0: number;
  j1: number;
  celulas: number;
}

export interface Remocao {
  /** Por célula (índice i·nv + j): índice canônico da sua região. Sem remoção, é o próprio índice. */
  regiaoDeCelula: number[];
  /** Uma por região (singletons incluídas), em ordem de `canon`. */
  regioes: RegiaoFundida[];
  /** Segmentos sem montante, chave `${linhaGlobal}:${k}`: remoção aceita, borda removida, ou interno a uma região. */
  semMontante: Set<string>;
  /**
   * Remoções que dariam região não retangular: ignoradas (aviso `cortina-celula-nao-retangular`). `i`/`j` = a célula de
   * um lado do segmento recusado (a de menor índice do par, como o Rust); `celulas` = membros da região que a remoção daria,
   * `area` = área da caixa dela.
   */
  naoRetangulares: Array<{ ordem: number; i: number; j: number; celulas: number; area: number }>;
}

/** Par de células que um segmento interno separa (índice i·nv + j), ou `null` se é de borda ou está fora. */
function arestaDe(nu: number, nv: number, linha: number, k: number): [number, number] | null {
  if (linha >= 1 && linha <= nu - 1 && k >= 0 && k < nv) return [(linha - 1) * nv + k, linha * nv + k];
  const lj = linha - nu - 1;
  if (lj >= 1 && lj <= nv - 1 && k >= 0 && k < nu) return [k * nv + (lj - 1), k * nv + lj];
  return null;
}

/** Rótulo de componente de cada célula, unindo as células das arestas dadas (union-find). */
function rotular(n: number, arestas: ReadonlyArray<[number, number]>): number[] {
  const pai = Array.from({ length: n }, (_, i) => i);
  const acha = (x: number): number => {
    let y = x;
    while (at(pai, y) !== y) {
      pai[y] = at(pai, at(pai, y));
      y = at(pai, y);
    }
    return y;
  };
  for (const [a, b] of arestas) pai[acha(a)] = acha(b);
  return Array.from({ length: n }, (_, i) => acha(i));
}

/** Caixa (em índices de célula) e contagem das células de um componente. */
function caixa(nv: number, lab: readonly number[], rot: number): { i0: number; i1: number; j0: number; j1: number; celulas: number; area: number } {
  let i0 = Infinity, i1 = -Infinity, j0 = Infinity, j1 = -Infinity, celulas = 0;
  lab.forEach((r, idx) => {
    if (r !== rot) return;
    const i = Math.floor(idx / nv);
    const j = idx % nv;
    celulas++;
    i0 = Math.min(i0, i);
    i1 = Math.max(i1, i);
    j0 = Math.min(j0, j);
    j1 = Math.max(j1, j);
  });
  return { i0, i1, j0, j1, celulas, area: (i1 - i0 + 1) * (j1 - j0 + 1) };
}

/**
 * Aplica as remoções na ordem da lista. Cada remoção interna é aceita só se a região que ela forma (o componente das duas
 * células) continua retangular; senão é ignorada. Borda sempre aceita. A grade `g` só precisa de `nu` e `nv`.
 */
export function aplicarRemocoes(g: { nu: number; nv: number }, lista: readonly PedidoRemocao[]): Remocao {
  const { nu, nv } = g;
  const n = nu * nv;
  const aceitas: Array<[number, number]> = [];
  const semMontante = new Set<string>();
  const naoRetangulares: Remocao['naoRetangulares'] = [];
  for (const it of lista) {
    const ar = arestaDe(nu, nv, it.a, it.b);
    if (!ar) {
      semMontante.add(`${it.a}:${it.b}`);
      continue;
    }
    const lab = rotular(n, [...aceitas, ar]);
    const c = caixa(nv, lab, at(lab, ar[0]));
    if (c.celulas === c.area) aceitas.push(ar);
    else naoRetangulares.push({ ordem: it.ordem, i: Math.floor(ar[0] / nv), j: ar[0] % nv, celulas: c.celulas, area: c.area });
  }

  const lab = rotular(n, aceitas);
  const porRot = new Map<number, number[]>();
  lab.forEach((r, idx) => {
    const l = porRot.get(r);
    if (l) l.push(idx);
    else porRot.set(r, [idx]);
  });
  const regiaoDeCelula: number[] = Array.from({ length: n }, () => 0);
  const regioes: RegiaoFundida[] = [];
  for (const cels of porRot.values()) {
    // canônica: menor j, empatando menor i (o índice é i·nv + j, então comparo (j, i) explicitamente)
    let canon = cels[0] as number;
    for (const idx of cels) {
      const j = idx % nv;
      const i = Math.floor(idx / nv);
      const cj = canon % nv;
      const ci = Math.floor(canon / nv);
      if (j < cj || (j === cj && i < ci)) canon = idx;
    }
    for (const idx of cels) regiaoDeCelula[idx] = canon;
    const c = caixa(nv, lab, at(lab, canon));
    regioes.push({ canon, i0: c.i0, i1: c.i1, j0: c.j0, j1: c.j1, celulas: c.celulas });
  }
  regioes.sort((x, y) => x.canon - y.canon);

  for (let li = 1; li < nu; li++) {
    for (let k = 0; k < nv; k++) if (at(lab, (li - 1) * nv + k) === at(lab, li * nv + k)) semMontante.add(`${li}:${k}`);
  }
  for (let lj = 1; lj < nv; lj++) {
    for (let k = 0; k < nu; k++) if (at(lab, k * nv + lj - 1) === at(lab, k * nv + lj)) semMontante.add(`${nu + 1 + lj}:${k}`);
  }
  return { regiaoDeCelula, regioes, semMontante, naoRetangulares };
}

/**
 * Pode remover o segmento `nova` depois de `lista`? (`removeSegment` do §4.7: recusa região não retangular.)
 * A `ordem` de `nova` é a do fim da lista.
 */
export function podeRemoverSegmento(g: { nu: number; nv: number }, lista: readonly PedidoRemocao[], nova: { a: number; b: number }): boolean {
  const ordem = lista.length;
  const r = aplicarRemocoes(g, [...lista, { ordem, ...nova }]);
  return !r.naoRetangulares.some((x) => x.ordem === ordem);
}

/** Restaura um segmento: tira da lista a entrada de índice `indice` (desfazer da remoção). */
export function restaurarSegmento(lista: readonly SegmentRef[], indice: number): SegmentRef[] {
  return lista.filter((_, k) => k !== indice);
}

/** Região retangular de uma célula da grade resolvida (para o painel e o aviso). */
export function regiaoDaCelula(g: GradeResolvida, i: number, j: number): RegiaoFundida {
  const canon = at(g.remocao.regiaoDeCelula, i * g.nv + j);
  const r = g.remocao.regioes.find((x) => x.canon === canon);
  if (!r) throw new Error(`região inexistente para a célula (${i}, ${j})`);
  return r;
}
