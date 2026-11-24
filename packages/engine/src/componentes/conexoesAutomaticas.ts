import type { Familia } from '@hestia/model';
import type { LigacaoResolvida } from './corposTipos.ts';
import type { PontoSegmento } from './orientarSegmento.ts';
import { resolverFamilia } from './resolver.ts';

/*
 * Conexões automáticas de tubos (ficha C6, CONTRATO §7): dado o encontro de trechos, decide qual conexão da família do domínio
 * entra (luva, curva 90°, curva 45°, redução, tê, junção 45°) e como posicionar a instância. Funções puras e determinísticas.
 * Unidades: pontos em metros, diâmetros nominais (DN) em mm, ângulos em graus nas regras e em radianos na orientação.
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

/** Regras por domínio; domínio sem entrada não ganha conexão automática (a ferramenta avisa). */
export const CONEXOES_POR_DOMINIO: Readonly<Record<string, RegrasConexao>> = {
  esgoto: {
    tubo: 'fam_tubo_esgoto',
    curva90: 'fam_esgoto_curva90',
    curva45: 'fam_esgoto_curva45',
    te: 'fam_esgoto_te',
    juncao45: 'fam_esgoto_juncao45',
    luva: 'fam_esgoto_luva',
    reducao: 'fam_esgoto_reducao',
    tampao: 'fam_esgoto_tampao',
  },
};

/** Família de tubo do primeiro domínio cujo tubo real existe no projeto; `undefined` se nenhum (a ferramenta usa o padrão). */
export function idTuboDoProjeto(familias: Readonly<Record<string, unknown>> | undefined): string | undefined {
  for (const r of Object.values(CONEXOES_POR_DOMINIO)) if (familias?.[r.tubo] !== undefined) return r.tubo;
  return undefined;
}

export type TipoConexao = 'luva' | 'curva90' | 'curva45' | 'reducao' | 'te' | 'juncao45';

/** Trecho reto entre `a` e `b` (m) com o diâmetro nominal em mm. */
export interface TrechoEncontro {
  a: PontoSegmento;
  b: PontoSegmento;
  dn: number;
}

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

/** Resultado de uma avaliação: a conexão (ou `null`) e o aviso em português quando não há conexão a inserir. */
export interface ResultadoConexao {
  conexao: ConexaoEncontro | null;
  aviso: string | null;
}

/** Tolerância angular das regras (graus): a mesma de ≈ 2,5° da compatibilidade de ligações. */
export const TOLERANCIA_ANGULO = 2.5;
/** Tolerância (mm) para considerar dois DN iguais. */
const TOLERANCIA_DN = 0.5;
const RAD = Math.PI / 180;

type V3 = [number, number, number];

const dot = (u: V3, v: V3): number => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
const cross = (u: V3, v: V3): V3 => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
const norma = (u: V3): number => Math.hypot(u[0], u[1], u[2]);

function unitario(u: V3): V3 | null {
  const n = norma(u);
  return n < 1e-12 ? null : [u[0] / n, u[1] / n, u[2] / n];
}

/** Direção unitária que sai de `de` rumo a `para`; null se coincidem. */
function direcaoEntre(de: PontoSegmento, para: PontoSegmento): V3 | null {
  return unitario([para[0] - de[0], para[1] - de[1], para[2] - de[2]]);
}

/** Direção do trecho saindo da ponta que encontra o outro: ponta `a` sai rumo a `b` e vice-versa. */
function saindoDaPonta(t: TrechoEncontro, ponta: 'a' | 'b'): V3 | null {
  return ponta === 'a' ? direcaoEntre(t.a, t.b) : direcaoEntre(t.b, t.a);
}

/** Ângulo (graus) entre dois vetores unitários. */
function anguloGraus(u: V3, v: V3): number {
  return Math.acos(Math.max(-1, Math.min(1, dot(u, v)))) / RAD;
}

const iguais = (x: number, y: number): boolean => Math.abs(x - y) <= TOLERANCIA_DN;

/**
 * Conexão para o encontro das pontas `pontaA` de `trechoA` e `pontaB` de `trechoB` (as duas no mesmo ponto), com o aviso do motivo
 * quando não há conexão. Ângulo interno entre os trechos: 180° (colinear) luva, ou redução se o DN muda; 90° curva 90°;
 * 135° (desvio de 45°) curva 45°; qualquer outro, ou curva com DN diferente, sem conexão e com aviso.
 */
export function avaliarEncontro(trechoA: TrechoEncontro, pontaA: 'a' | 'b', trechoB: TrechoEncontro, pontaB: 'a' | 'b', regras: RegrasConexao): ResultadoConexao {
  const ua = saindoDaPonta(trechoA, pontaA);
  const ub = saindoDaPonta(trechoB, pontaB);
  if (!ua || !ub) return { conexao: null, aviso: 'Trecho de comprimento nulo: nada a conectar.' };
  const angulo = anguloGraus(ua, ub);
  const diametros = [trechoA.dn, trechoB.dn];
  const mesmoDn = iguais(trechoA.dn, trechoB.dn);
  const faz = (tipo: TipoConexao, familiaId: string): ResultadoConexao => ({ conexao: { tipo, familiaId, direcoes: [ua, ub], diametros }, aviso: null });
  if (angulo >= 180 - TOLERANCIA_ANGULO) return mesmoDn ? faz('luva', regras.luva) : faz('reducao', regras.reducao);
  if (!mesmoDn) return { conexao: null, aviso: 'Curva entre bitolas diferentes: coloque uma redução num trecho reto antes da curva.' };
  if (Math.abs(angulo - 90) <= TOLERANCIA_ANGULO) return faz('curva90', regras.curva90);
  if (Math.abs(angulo - 135) <= TOLERANCIA_ANGULO) return faz('curva45', regras.curva45);
  return { conexao: null, aviso: `Ângulo de ${Math.round(180 - angulo)}° sem conexão automática (só 0°, 45° e 90°).` };
}

/** Conexão do encontro (ou `null`); o motivo da ausência sai de `avaliarEncontro`. */
export function conexaoParaEncontro(trechoA: TrechoEncontro, pontaA: 'a' | 'b', trechoB: TrechoEncontro, pontaB: 'a' | 'b', regras: RegrasConexao): ConexaoEncontro | null {
  return avaliarEncontro(trechoA, pontaA, trechoB, pontaB, regras).conexao;
}

/**
 * Derivação: a ponta `pontaRamal` do ramal toca o MEIO do trecho principal em `ponto` (o principal será dividido em dois).
 * Ramal a 90° do principal: tê; a 45° de um dos sentidos: junção 45°; outro ângulo: sem conexão e com aviso.
 */
export function avaliarDerivacao(principal: TrechoEncontro, ponto: PontoSegmento, ramal: TrechoEncontro, pontaRamal: 'a' | 'b', regras: RegrasConexao): ResultadoConexao {
  const ua = direcaoEntre(ponto, principal.a);
  const ub = direcaoEntre(ponto, principal.b);
  const ur = saindoDaPonta(ramal, pontaRamal);
  if (!ua || !ub || !ur) return { conexao: null, aviso: 'Derivação sobre a ponta do trecho ou trecho nulo: nada a dividir.' };
  const angulo = Math.min(anguloGraus(ur, ua), anguloGraus(ur, ub));
  const faz = (tipo: TipoConexao, familiaId: string): ResultadoConexao => ({ conexao: { tipo, familiaId, direcoes: [ua, ub, ur], diametros: [principal.dn, principal.dn, ramal.dn] }, aviso: null });
  const ortogonal = Math.abs(anguloGraus(ur, ua) - 90) <= TOLERANCIA_ANGULO;
  if (ortogonal) return faz('te', regras.te);
  if (Math.abs(angulo - 45) <= TOLERANCIA_ANGULO) return faz('juncao45', regras.juncao45);
  return { conexao: null, aviso: 'Derivação só a 90° (tê) ou 45° (junção): outro ângulo fica sem conexão.' };
}

/** Conexão da derivação (ou `null`). */
export function conexaoParaDerivacao(principal: TrechoEncontro, ponto: PontoSegmento, ramal: TrechoEncontro, pontaRamal: 'a' | 'b', regras: RegrasConexao): ConexaoEncontro | null {
  return avaliarDerivacao(principal, ponto, ramal, pontaRamal, regras).conexao;
}

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

/**
 * Posiciona a instância de `familia` no `ponto` (m) de modo que cada ligação dela aponte na direção do trecho que chega.
 * Casa as ligações da família com as direções por permutação (primeiro exigindo o DN igual, depois sem exigir); devolve `null`
 * se a família não tem as ligações necessárias ou a geometria não casa. A origem da conexão fica no ponto de encontro.
 */
export function posicionarConexao(familia: Familia, ponto: PontoSegmento, conexao: ConexaoEncontro): PosicaoConexao | null {
  const values = valoresDaConexao(familia, conexao);
  const ligs: LigacaoResolvida[] = resolverFamilia(familia, { valores: { ...values, L: 1000 } }).ligacoes ?? [];
  const n = conexao.direcoes.length;
  if (ligs.length !== n) return null;
  for (const exigirDn of [true, false]) {
    for (const perm of permutacoes(n)) {
      const escolhidas = perm.map((i) => ligs[i]);
      if (escolhidas.some((l) => l === undefined)) continue;
      const lista = escolhidas as LigacaoResolvida[];
      if (exigirDn && lista.some((l, k) => !iguais(l.diametro * 1000, conexao.diametros[k] ?? 0))) continue;
      const locais = lista.map((l) => l.direcao as V3);
      const r = rotacaoQueAlinha(locais, conexao.direcoes);
      if (!r) continue;
      const o = decompor(r);
      return { x: ponto[0], y: ponto[1], z: ponto[2], rotation: o.rotation, inclinacao: o.inclinacao, values, ligacoes: lista.map((l) => l.id) };
    }
  }
  return null;
}
