import type { Familia } from '@hestia/model';
import type { LigacaoResolvida } from './corposTipos.ts';
import type { PontoSegmento } from './orientarSegmento.ts';
import { resolverFamilia } from './resolver.ts';

/*
 * Posicionamento de conexões de tubo (extraído de `conexoesAutomaticas.ts` na ficha B2 para desfazer o import circular com
 * `resolvedorNo.ts`): tipos da decisão de conexão e `posicionarConexao`, que orienta a instância da peça no ponto de encontro e
 * calcula os recuos (bolsa). Funções puras e determinísticas. Unidades: pontos em metros, DN em mm, ângulos em graus nas regras e
 * em radianos na orientação.
 */

/** Ids das famílias de conexão de um domínio (CONTRATO §7: constantes por domínio no engine, até a regra ir para a família). */
export interface RegrasConexao {
  tubo: string;
  curva90: string;
  curva45: string;
  te: string;
  juncao45: string;
  luva: string;
  reducao: string;
  tampao: string;
}

export type TipoConexao = 'luva' | 'curva90' | 'curva45' | 'reducao' | 'te' | 'juncao45';

/**
 * Conexão escolhida. `direcoes` são as direções unitárias, saindo do ponto de encontro, de cada trecho que chega nela e
 * `diametros` (mm) os DN na mesma ordem: encontro = [trecho A, trecho B]; derivação = [principal rumo a `a`, principal rumo a `b`, ramal].
 */
export interface ConexaoEncontro {
  tipo: TipoConexao;
  familiaId: string;
  direcoes: [number, number, number][];
  diametros: number[];
}

/** Tolerância angular das regras (graus): a mesma de ≈ 2,5° da compatibilidade de ligações. */
export const TOLERANCIA_ANGULO = 2.5;
/** Tolerância (mm) para considerar dois DN iguais. */
const TOLERANCIA_DN = 0.5;

type V3 = [number, number, number];

const dot = (u: V3, v: V3): number => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
const cross = (u: V3, v: V3): V3 => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
const norma = (u: V3): number => Math.hypot(u[0], u[1], u[2]);

function unitario(u: V3): V3 | null {
  const n = norma(u);
  return n < 1e-12 ? null : [u[0] / n, u[1] / n, u[2] / n];
}

const iguais = (x: number, y: number): boolean => Math.abs(x - y) <= TOLERANCIA_DN;


/** Instância da conexão: orientação no modelo (`Rz(rotation)·Ry(inclinacao[0])·Rz(inclinacao[1])`), valores e ligação usada em cada trecho. */
export interface PosicaoConexao {
  x: number;
  y: number;
  z: number;
  rotation: number;
  inclinacao: [number, number];
  values: Record<string, number>;
  /** Para cada direção de `ConexaoEncontro.direcoes`, o id da ligação da família de conexão que a atende. */
  ligacoes: string[];
  /**
   * Quanto cada trecho recua (m) do ponto de encontro para a ponta dele ficar DENTRO da bolsa na profundidade do catálogo: a distância
   * do centro até a ligação menos a profundidade da bolsa (ponta lisa: a própria distância). 0 quando a ligação não declara encaixe
   * (famílias antigas): o trecho vai até o ponto, como sempre foi.
   */
  recuos: number[];
  /**
   * Os mesmos recuos (m) COM sinal (ficha F1): negativo quando a ponta do tubo entra além do ponto de encontro (luva de redução
   * soldável, cuja origem fica na boca grande). `recuos` é este valor limitado a 0.
   */
  recuosComSinal: number[];
  /** Tipo da família escolhido para o par de bitolas (só nas famílias de bitola composta, sem `DN`). */
  typeId?: string;
}

type M3 = [V3, V3, V3];

/** Matriz cujas colunas são `e1`, `e2`, `e3`. */
function colunas(e1: V3, e2: V3, e3: V3): M3 {
  return [[e1[0], e2[0], e3[0]], [e1[1], e2[1], e3[1]], [e1[2], e2[2], e3[2]]];
}

/** Base ortonormal a partir de dois vetores unitários não paralelos; null se forem paralelos. */
function base(u: V3, v: V3): M3 | null {
  const e3 = unitario(cross(u, v));
  if (!e3 || norma(cross(u, v)) < 1e-3) return null;
  const e2 = cross(e3, u);
  return colunas(u, e2, e3);
}

/** Rotação de arco mínimo que leva `d` a `u` (unitários). */
function arcoMinimo(d: V3, u: V3): M3 {
  const c = dot(d, u);
  let eixo = cross(d, u);
  if (c < -0.999999) eixo = cross(d, Math.abs(d[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]);
  const e = unitario(eixo);
  if (!e) return [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const ang = c < -0.999999 ? Math.PI : Math.acos(Math.max(-1, Math.min(1, c)));
  const s = Math.sin(ang);
  const k = 1 - Math.cos(ang);
  const co = Math.cos(ang);
  return [
    [co + e[0] * e[0] * k, e[0] * e[1] * k - e[2] * s, e[0] * e[2] * k + e[1] * s],
    [e[1] * e[0] * k + e[2] * s, co + e[1] * e[1] * k, e[1] * e[2] * k - e[0] * s],
    [e[2] * e[0] * k - e[1] * s, e[2] * e[1] * k + e[0] * s, co + e[2] * e[2] * k],
  ];
}

const aplica = (m: M3, v: V3): V3 => [dot(m[0], v), dot(m[1], v), dot(m[2], v)];

/** Rotação que leva as direções locais `d` às do mundo `u` (mesma ordem); null se não há rotação que sirva todas. */
function rotacaoQueAlinha(d: V3[], u: V3[]): M3 | null {
  const d0 = d[0];
  const u0 = u[0];
  if (!d0 || !u0) return null;
  let r: M3 | null = null;
  for (let j = 1; j < d.length && r === null; j++) {
    const dj = d[j];
    const uj = u[j];
    const bd = dj && base(d0, dj);
    const bu = uj && base(u0, uj);
    if (bd && bu) r = multiplica(bu, transposta(bd));
  }
  r ??= arcoMinimo(d0, u0);
  for (let k = 0; k < d.length; k++) {
    const dk = d[k];
    const uk = u[k];
    if (!dk || !uk || dot(aplica(r, dk), uk) < 0.999) return null;
  }
  return r;
}

function transposta(m: M3): M3 {
  return [[m[0][0], m[1][0], m[2][0]], [m[0][1], m[1][1], m[2][1]], [m[0][2], m[1][2], m[2][2]]];
}

function multiplica(a: M3, b: M3): M3 {
  const t = transposta(b);
  return [0, 1, 2].map((i) => [0, 1, 2].map((j) => dot(a[i] as V3, t[j] as V3))) as M3;
}

/** Decompõe `R = Rz(rotation)·Ry(i0)·Rz(i1)` (convenção do modelo). */
function decompor(r: M3): { rotation: number; inclinacao: [number, number] } {
  const c = Math.max(-1, Math.min(1, r[2][2]));
  const i0 = Math.acos(c);
  if (Math.sin(i0) > 1e-9) return { rotation: Math.atan2(r[1][2], r[0][2]), inclinacao: [i0, Math.atan2(r[2][1], -r[2][0])] };
  return { rotation: c > 0 ? Math.atan2(r[1][0], r[0][0]) : Math.atan2(-r[1][0], -r[0][0]), inclinacao: [i0, 0] };
}

/** Permutações de `0..n-1` em ordem fixa (n pequeno: 2 ou 3). */
function permutacoes(n: number): number[][] {
  if (n <= 1) return [[0]];
  const saida: number[][] = [];
  for (const p of permutacoes(n - 1)) for (let i = 0; i <= p.length; i++) saida.push([...p.slice(0, i), n - 1, ...p.slice(i)]);
  return saida;
}

/** Valores `DN`/`DN2` (mm) que a família declara: redução usa maior e menor; tê e junção usam o principal e o ramal. */
function valoresDaConexao(familia: Familia, c: ConexaoEncontro): Record<string, number> {
  const ids = new Set(familia.parametros.map((p) => p.id));
  const maior = Math.max(...c.diametros);
  const menor = Math.min(...c.diametros);
  const ehTe = c.tipo === 'te' || c.tipo === 'juncao45';
  const dn = c.tipo === 'reducao' ? maior : (c.diametros[0] ?? maior);
  const dn2 = c.tipo === 'reducao' ? menor : ehTe ? (c.diametros[2] ?? dn) : dn;
  const valores: Record<string, number> = {};
  if (ids.has('DN')) valores.DN = dn;
  if (ids.has('DN2')) valores.DN2 = dn2;
  return valores;
}

/** Família de bitola composta: tem `COD` (código do produto) e não tem `DN`; a bitola é o par (maior, menor). */
const ehBitolaComposta = (familia: Familia): boolean => !familia.parametros.some((p) => p.id === 'DN') && familia.parametros.some((p) => p.id === 'COD');

/** Par (maior, menor) do nome de um tipo, tipo `DN 100 x 75` ou `100x75`; `null` se o nome não tem o par. */
function paresDoNome(nome: string): [number, number] | null {
  const m = /(\d+(?:[.,]\d+)?)\s*x\s*(\d+(?:[.,]\d+)?)/i.exec(nome);
  return m?.[1] !== undefined && m[2] !== undefined ? [Number(m[1].replace(',', '.')), Number(m[2].replace(',', '.'))] : null;
}

/** Tipo de bitola composta cujo par é o da conexão (maior e menor dos DN), com o código; `null` se o catálogo não tem o par. */
function tipoDoPar(familia: Familia, c: ConexaoEncontro): { typeId: string; codigo: number } | null {
  const maior = Math.max(...c.diametros);
  const menor = Math.min(...c.diametros);
  for (const t of familia.tipos) {
    const cod = t.valores.COD;
    const par = paresDoNome(t.nome);
    if (typeof cod === 'number' && par && iguais(par[0], maior) && iguais(par[1], menor)) return { typeId: t.id, codigo: cod };
  }
  return null;
}

/**
 * Nas ligações de bitola composta, a ponta de maior diâmetro vai no trecho de maior DN (e a de menor, no de menor). Com trechos
 * colineares as duas permutações geométricas servem; esta ordem escolhe a certa. DN iguais não impõem ordem.
 */
function ordemConsistente(lista: LigacaoResolvida[], dns: number[]): boolean {
  for (let i = 0; i < lista.length; i++) {
    for (let j = i + 1; j < lista.length; j++) {
      const di = dns[i] ?? 0;
      const dj = dns[j] ?? 0;
      if (iguais(di, dj)) continue;
      const li = lista[i]?.diametro ?? 0;
      const lj = lista[j]?.diametro ?? 0;
      if (Math.sign(li - lj) !== Math.sign(di - dj)) return false;
    }
  }
  return true;
}

/**
 * Posiciona a instância de `familia` no `ponto` (m) de modo que cada ligação dela aponte na direção do trecho que chega.
 * Casa as ligações da família com as direções por permutação (primeiro exigindo o DN igual, depois sem exigir); devolve `null`
 * se a família não tem as ligações necessárias ou a geometria não casa. A origem da conexão fica no ponto de encontro (luva de duas bocas: o centro entre elas).
 * Família de bitola composta (sem `DN`, com `COD`): o tipo é o do par de bitolas da conexão; sem tipo para o par, `null`.
 */
export function posicionarConexao(familia: Familia, ponto: PontoSegmento, conexao: ConexaoEncontro): PosicaoConexao | null {
  const composta = ehBitolaComposta(familia);
  const tipo = composta ? tipoDoPar(familia, conexao) : null;
  if (composta && tipo === null) return null;
  const values = { ...valoresDaConexao(familia, conexao), ...(tipo ? { COD: tipo.codigo } : {}) };
  const ligs: LigacaoResolvida[] = resolverFamilia(familia, { ...(tipo ? { tipoId: tipo.typeId } : {}), valores: { ...values, L: 1000 } }).ligacoes ?? [];
  const n = conexao.direcoes.length;
  if (ligs.length !== n) return null;
  const criterios: Array<'dn' | 'ordem' | 'livre'> = composta ? ['ordem', 'livre'] : ['dn', 'livre'];
  for (const criterio of criterios) {
    for (const perm of permutacoes(n)) {
      const escolhidas = perm.map((i) => ligs[i]);
      if (escolhidas.some((l) => l === undefined)) continue;
      const lista = escolhidas as LigacaoResolvida[];
      if (criterio === 'dn' && lista.some((l, k) => !iguais(l.diametro * 1000, conexao.diametros[k] ?? 0))) continue;
      if (criterio === 'ordem' && !ordemConsistente(lista, conexao.diametros)) continue;
      const locais = lista.map((l) => l.direcao as V3);
      const r = rotacaoQueAlinha(locais, conexao.direcoes);
      if (!r) continue;
      const o = decompor(r);
      // Luva de duas ligações (ficha C3): a origem da família fica numa boca, então o CENTRO entre as bocas é que vai ao ponto de encontro.
      const centro: V3 = lista.length === 2 && conexao.tipo === 'luva' ? [0, 1, 2].map((k) => ((lista[0]?.posicao[k] ?? 0) + (lista[1]?.posicao[k] ?? 0)) / 2) as V3 : [0, 0, 0];
      const deslocado = aplica(r, centro);
      const recuosComSinal = lista.map((l) => (l.encaixe === undefined ? 0 : Math.hypot(l.posicao[0] - centro[0], l.posicao[1] - centro[1], l.posicao[2] - centro[2]) - (l.encaixe.tipo === 'bolsa' ? l.encaixe.profundidade : 0)));
      const recuos = recuosComSinal.map((r) => Math.max(0, r));
      return { x: ponto[0] - deslocado[0], y: ponto[1] - deslocado[1], z: ponto[2] - deslocado[2], rotation: o.rotation, inclinacao: o.inclinacao, values, ligacoes: lista.map((l) => l.id), recuos, recuosComSinal, ...(tipo ? { typeId: tipo.typeId } : {}) };
    }
  }
  return null;
}
