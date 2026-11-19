import { closestOnSegment, dist, type Vec2 } from '@hestia/geom';
import type { Id, Terrain } from '@hestia/model';

/**
 * Escolha de vértices no modo "Editar terreno" (A.6). Trabalha só com as FONTES do terreno (pontos, vértices de curvas e de quebras: dado do
 * modelo) e nunca com a malha derivada. O índice espacial é uma grade uniforme, montada UMA vez por conteúdo das fontes (`indiceDasFontes`):
 * mover o cursor, o zoom e o quadro não o refazem; só uma edição das fontes o refaz (mudar rótulos, pontos cotados, borda ou cor, não).
 */

/** Acima disto, na janela, o modo não desenha alças nem escolhe vértices ("aproxime para editar pontos"). */
export const LIMITE_ALCAS = 500;

/** Referência a um item editável do terreno: vértice de fonte, linha de rótulo ou ponto cotado. `i` e `j` são posições nas listas do modelo. */
export type FonteRef =
  | { tipo: 'ponto'; i: number }
  | { tipo: 'curva'; i: number; j: number }
  | { tipo: 'quebra'; i: number; j: number }
  | { tipo: 'rotulo'; i: number }
  | { tipo: 'cotado'; i: number };

/** Vértice de fonte: posição em planta e cota (a da curva inteira, para vértice de curva). */
export interface VerticeFonte {
  ref: Extract<FonteRef, { tipo: 'ponto' | 'curva' | 'quebra' }>;
  x: number;
  y: number;
  z: number;
}

export interface IndiceFontes {
  vertices: VerticeFonte[];
  /** Lado da célula (m). */
  celula: number;
  minX: number;
  minY: number;
  grade: Map<number, number[]>;
}

export const mesmaRef = (a: FonteRef | null, b: FonteRef | null): boolean => {
  if (!a || !b || a.tipo !== b.tipo) return false;
  if (a.tipo === 'ponto' || a.tipo === 'rotulo' || a.tipo === 'cotado') return a.i === b.i;
  const o = b as typeof a;
  return a.i === o.i && a.j === o.j;
};

// ---- montagem ----------------------------------------------------------------------------------------------------------------

type Fontes = Pick<Terrain, 'pontos' | 'curvas' | 'quebras'>;

/** Vértices na ordem canônica do terreno (A.4): pontos soltos, curvas, quebras. */
export function listaDeVerticesDasFontes(f: Fontes): VerticeFonte[] {
  const out: VerticeFonte[] = [];
  for (let i = 0; i * 3 + 2 < f.pontos.length; i++) out.push({ ref: { tipo: 'ponto', i }, x: f.pontos[i * 3]!, y: f.pontos[i * 3 + 1]!, z: f.pontos[i * 3 + 2]! });
  f.curvas.forEach((c, i) => {
    for (let j = 0; j * 2 + 1 < c.xy.length; j++) out.push({ ref: { tipo: 'curva', i, j }, x: c.xy[j * 2]!, y: c.xy[j * 2 + 1]!, z: c.z });
  });
  f.quebras.forEach((q, i) => {
    for (let j = 0; j * 3 + 2 < q.xyz.length; j++) out.push({ ref: { tipo: 'quebra', i, j }, x: q.xyz[j * 3]!, y: q.xyz[j * 3 + 1]!, z: q.xyz[j * 3 + 2]! });
  });
  return out;
}

const chave = (cx: number, cy: number): number => cx * 1_000_003 + cy;

function montar(vertices: VerticeFonte[]): IndiceFontes {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const v of vertices) {
    minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x);
    minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y);
  }
  if (vertices.length === 0) return { vertices, celula: 1, minX: 0, minY: 0, grade: new Map() };
  const w = maxX - minX, h = maxY - minY;
  const area = Math.max(w, 1e-3) * Math.max(h, 1e-3);
  const celula = Math.max(Math.sqrt(area / vertices.length) * 2, Math.max(w, h) / 1000, 1e-3);
  const grade = new Map<number, number[]>();
  vertices.forEach((v, k) => {
    const c = chave(Math.floor((v.x - minX) / celula), Math.floor((v.y - minY) / celula));
    const l = grade.get(c);
    if (l) l.push(k);
    else grade.set(c, [k]);
  });
  return { vertices, celula, minX, minY, grade };
}

// ---- cache por assinatura ----------------------------------------------------------------------------------------------------

interface Entrada {
  pontos: Terrain['pontos'];
  curvas: Terrain['curvas'];
  quebras: Terrain['quebras'];
  assinatura: number[];
  indice: IndiceFontes;
}

const cache = new Map<Id, Entrada>();
const CACHE_MAX = 16;
let construcoes = 0;

/** Quantas vezes um índice foi (re)montado desde o início: o teste de cache confere que só sobe quando as fontes mudam. */
export const construcoesDoIndice = (): number => construcoes;

/** Esvazia o cache (testes). */
export const limparIndicesDasFontes = (): void => {
  cache.clear();
};

/** Assinatura exata das fontes: contagens e valores. Só é calculada quando as listas mudam de identidade. */
function assinaturaDe(f: Fontes): number[] {
  const s: number[] = [f.pontos.length];
  for (const v of f.pontos) s.push(v);
  s.push(f.curvas.length);
  for (const c of f.curvas) {
    s.push(c.z, c.xy.length);
    for (const v of c.xy) s.push(v);
  }
  s.push(f.quebras.length);
  for (const q of f.quebras) {
    s.push(q.xyz.length);
    for (const v of q.xyz) s.push(v);
  }
  return s;
}

const iguais = (a: readonly number[], b: readonly number[]): boolean => a.length === b.length && a.every((v, i) => v === b[i]);

/**
 * Índice espacial das fontes do terreno. Mesmas listas (mesma identidade) devolvem o índice guardado sem nenhum cálculo; listas novas com o
 * MESMO conteúdo (ex.: edição de rótulo, que copia tudo) também reaproveitam; só conteúdo diferente remonta.
 */
export function indiceDasFontes(tn: Terrain): IndiceFontes {
  const e = cache.get(tn.id);
  if (e && e.pontos === tn.pontos && e.curvas === tn.curvas && e.quebras === tn.quebras) return e.indice;
  const assinatura = assinaturaDe(tn);
  if (e && iguais(e.assinatura, assinatura)) {
    e.pontos = tn.pontos;
    e.curvas = tn.curvas;
    e.quebras = tn.quebras;
    return e.indice;
  }
  construcoes++;
  const indice = montar(listaDeVerticesDasFontes(tn));
  if (!cache.has(tn.id) && cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as Id);
  cache.set(tn.id, { pontos: tn.pontos, curvas: tn.curvas, quebras: tn.quebras, assinatura, indice });
  return indice;
}

// ---- consultas -------------------------------------------------------------------------------------------------------------

/** Índices dos vértices cuja célula toca a caixa; `null` quando varrer a grade custaria mais do que varrer tudo. */
function candidatos(ix: IndiceFontes, minX: number, minY: number, maxX: number, maxY: number): number[] | null {
  const c0 = Math.floor((minX - ix.minX) / ix.celula), c1 = Math.floor((maxX - ix.minX) / ix.celula);
  const r0 = Math.floor((minY - ix.minY) / ix.celula), r1 = Math.floor((maxY - ix.minY) / ix.celula);
  if ((c1 - c0 + 1) * (r1 - r0 + 1) > ix.grade.size * 2 + 16) return null;
  const out: number[] = [];
  for (let cx = c0; cx <= c1; cx++) {
    for (let cy = r0; cy <= r1; cy++) {
      const l = ix.grade.get(chave(cx, cy));
      if (l) out.push(...l);
    }
  }
  return out;
}

/** Vértice de fonte mais próximo de `at` a no máximo `tol` (m); empate: o de menor posição na ordem canônica. */
export function verticeMaisProximo(ix: IndiceFontes, at: Vec2, tol: number): VerticeFonte | null {
  const lista = candidatos(ix, at.x - tol, at.y - tol, at.x + tol, at.y + tol);
  let melhor: { k: number; d: number } | null = null;
  const tenta = (k: number): void => {
    const v = ix.vertices[k]!;
    const d = Math.hypot(v.x - at.x, v.y - at.y);
    if (d <= tol && (!melhor || d < melhor.d || (d === melhor.d && k < melhor.k))) melhor = { k, d };
  };
  if (lista) lista.forEach(tenta);
  else ix.vertices.forEach((_, k) => tenta(k));
  const m = melhor as { k: number } | null;
  return m ? ix.vertices[m.k]! : null;
}

/** Janela do mundo (metros) que a vista mostra. */
export interface JanelaMundo {
  min: Vec2;
  max: Vec2;
}

export interface AlcasNaJanela {
  /** Vértices dentro da janela; vazio quando passam do limite. */
  vertices: VerticeFonte[];
  /** Quantos há na janela (para de contar logo acima do limite). */
  n: number;
  excedeu: boolean;
}

/** Vértices de fonte dentro da janela. Acima de `limite` não devolve nenhum: o modo mostra "aproxime para editar pontos". */
export function alcasNaJanela(ix: IndiceFontes, janela: JanelaMundo | null, limite = LIMITE_ALCAS): AlcasNaJanela {
  const dentro = (v: VerticeFonte): boolean => !janela || (v.x >= janela.min.x && v.x <= janela.max.x && v.y >= janela.min.y && v.y <= janela.max.y);
  const lista = janela ? candidatos(ix, janela.min.x, janela.min.y, janela.max.x, janela.max.y) : null;
  const achados: VerticeFonte[] = [];
  const vistos = lista ? lista.map((k) => ix.vertices[k]!) : ix.vertices;
  for (const v of vistos) {
    if (!dentro(v)) continue;
    achados.push(v);
    if (achados.length > limite) return { vertices: [], n: achados.length, excedeu: true };
  }
  return { vertices: achados, n: achados.length, excedeu: false };
}

/** Linha de rótulo `i` (a, b) e ponto cotado `i`. */
export function linhaDeRotulo(tn: Pick<Terrain, 'linhasRotulo'>, i: number): [Vec2, Vec2] | null {
  const v = tn.linhasRotulo;
  return i >= 0 && i * 4 + 3 < v.length ? [{ x: v[i * 4]!, y: v[i * 4 + 1]! }, { x: v[i * 4 + 2]!, y: v[i * 4 + 3]! }] : null;
}

export function pontoCotado(tn: Pick<Terrain, 'pontosCotados'>, i: number): Vec2 | null {
  const v = tn.pontosCotados;
  return i >= 0 && i * 2 + 1 < v.length ? { x: v[i * 2]!, y: v[i * 2 + 1]! } : null;
}

/**
 * O que está sob `at` (tolerância `tol`, m): vértice de fonte, ponto cotado ou linha de rótulo, o mais próximo; empate: vértice, depois ponto cotado.
 * `comVertices` falso (alças escondidas por excesso de vértices) deixa só rótulos e pontos cotados.
 */
export function alvoDeEdicao(tn: Terrain, ix: IndiceFontes, at: Vec2, tol: number, comVertices = true): FonteRef | null {
  let melhor: { ref: FonteRef; d: number; prio: number } | null = null;
  const tenta = (ref: FonteRef, d: number, prio: number): void => {
    if (d > tol) return;
    if (!melhor || d < melhor.d || (d === melhor.d && prio < melhor.prio)) melhor = { ref, d, prio };
  };
  if (comVertices) {
    const v = verticeMaisProximo(ix, at, tol);
    if (v) tenta(v.ref, Math.hypot(v.x - at.x, v.y - at.y), 0);
  }
  for (let i = 0; pontoCotado(tn, i); i++) tenta({ tipo: 'cotado', i }, dist(pontoCotado(tn, i)!, at), 1);
  for (let i = 0; linhaDeRotulo(tn, i); i++) {
    const [a, b] = linhaDeRotulo(tn, i)!;
    tenta({ tipo: 'rotulo', i }, dist(at, closestOnSegment(at, a, b)), 2);
  }
  return (melhor as { ref: FonteRef } | null)?.ref ?? null;
}

/** Posição em planta do item (para o realce e para o início do arrasto). */
export function posicaoDoItem(tn: Terrain, ref: FonteRef): Vec2 | null {
  switch (ref.tipo) {
    case 'ponto': return tn.pontos.length > ref.i * 3 + 2 ? { x: tn.pontos[ref.i * 3]!, y: tn.pontos[ref.i * 3 + 1]! } : null;
    case 'curva': { const c = tn.curvas[ref.i]; return c && c.xy.length > ref.j * 2 + 1 ? { x: c.xy[ref.j * 2]!, y: c.xy[ref.j * 2 + 1]! } : null; }
    case 'quebra': { const q = tn.quebras[ref.i]; return q && q.xyz.length > ref.j * 3 + 2 ? { x: q.xyz[ref.j * 3]!, y: q.xyz[ref.j * 3 + 1]! } : null; }
    case 'cotado': return pontoCotado(tn, ref.i);
    case 'rotulo': { const l = linhaDeRotulo(tn, ref.i); return l ? { x: (l[0].x + l[1].x) / 2, y: (l[0].y + l[1].y) / 2 } : null; }
  }
}

/** Cota do item, quando tem (ponto, vértice de curva ou de quebra). */
export function cotaDoItem(tn: Terrain, ref: FonteRef): number | null {
  switch (ref.tipo) {
    case 'ponto': return tn.pontos[ref.i * 3 + 2] ?? null;
    case 'curva': return tn.curvas[ref.i]?.z ?? null;
    case 'quebra': return tn.quebras[ref.i]?.xyz[ref.j * 3 + 2] ?? null;
    default: return null;
  }
}
