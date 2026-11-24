import { triangulate, type Vec2 } from '@hestia/geom';
import type { Malha } from './malha.ts';
import type { PerfilResolvido } from './corposTipos.ts';

/*
 * Apoio das malhas de corpos (ficha A5): anéis do perfil, normais suaves por anel, faixas laterais e tampas.
 * Convenções (CONTRATO.md §2.2 e §2.3): contorno externo anti-horário e furos horários, tudo em METROS. A normal lateral
 * aponta PARA FORA DO SÓLIDO, que fica à esquerda de quem percorre o anel: para uma aresta de direção (du, dv) a normal
 * é (dv, −du) normalizada. Vale para externo e furos.
 *
 * DECISÃO de furos nas tampas: `triangulate` de @hestia/geom aceita furos (earcut com `holes`), então NÃO há ponte de
 * corte: cada anel de furo entra direto na triangulação da tampa.
 *
 * Normais suaves: um ponto do anel compartilha vértice (e normal média) com as duas arestas vizinhas quando o ângulo entre
 * elas é menor que 60°; acima disso (canto vivo) cada aresta tem o seu próprio vértice, com a normal da própria aresta.
 * Tampas têm vértices próprios (normal chapada).
 *
 * `pecaDoTriangulo` sai 0 para todo triângulo: quem junta os corpos numa só malha reatribui o índice do corpo.
 */

export type Pt2 = [number, number];
export type Ponto3 = [number, number, number];

/** Leva (u, v), a normal 2D (nu, nv) e o parâmetro do corte (z na extrusão, ângulo na revolução) ao mundo. */
export type Mapa = (u: number, v: number, nu: number, nv: number, corte: number) => { p: Ponto3; n: Ponto3 };

const COS_SUAVE = 0.5;
const AREA_MINIMA = 1e-12;
const TOLERANCIA_PONTO = 1e-12;

export function malhaVazia(): Malha {
  return { positions: [], normals: [], indices: [], pecaDoTriangulo: [] };
}

/** Anéis do perfil como pontos (u, v): o externo (anti-horário) e cada furo (horário), sem pontos repetidos seguidos. */
export function aneisDoPerfil(perfil: PerfilResolvido): Pt2[][] {
  const saida: Pt2[][] = [orientar(lerAnel(perfil.externo), true)];
  for (const furo of perfil.furos) saida.push(orientar(lerAnel(furo), false));
  return saida.filter((a) => a.length >= 3);
}

function lerAnel(plano: number[]): Pt2[] {
  const anel: Pt2[] = [];
  for (let i = 0; i + 1 < plano.length; i += 2) {
    const p: Pt2 = [plano[i] ?? 0, plano[i + 1] ?? 0];
    const ultimo = anel[anel.length - 1];
    if (ultimo && Math.abs(ultimo[0] - p[0]) + Math.abs(ultimo[1] - p[1]) < TOLERANCIA_PONTO) continue;
    anel.push(p);
  }
  const primeiro = anel[0];
  const ultimo = anel[anel.length - 1];
  if (anel.length > 1 && primeiro && ultimo && Math.abs(primeiro[0] - ultimo[0]) + Math.abs(primeiro[1] - ultimo[1]) < TOLERANCIA_PONTO) {
    anel.pop();
  }
  return anel;
}

/** Área com sinal (shoelace): positiva no anti-horário. */
function areaAssinada(anel: Pt2[]): number {
  let soma = 0;
  for (let i = 0; i < anel.length; i++) {
    const a = anel[i]!;
    const b = anel[(i + 1) % anel.length]!;
    soma += a[0] * b[1] - b[0] * a[1];
  }
  return soma / 2;
}

/** Garante o sentido do contrato: anti-horário para o externo, horário para furos. */
function orientar(anel: Pt2[], antiHorario: boolean): Pt2[] {
  const area = areaAssinada(anel);
  if (area === 0 || (area > 0) === antiHorario) return anel;
  return [...anel].reverse();
}

/** Normal 2D unitária para FORA do sólido de cada aresta i (de anel[i] até anel[i+1]). */
function normaisDasArestas(anel: Pt2[]): Pt2[] {
  const n = anel.length;
  const saida: Pt2[] = [];
  for (let i = 0; i < n; i++) {
    const a = anel[i]!;
    const b = anel[(i + 1) % n]!;
    const du = b[0] - a[0];
    const dv = b[1] - a[1];
    const comprimento = Math.hypot(du, dv) || 1;
    saida.push([dv / comprimento, -du / comprimento]);
  }
  return saida;
}

/** Acrescenta um vértice e devolve o índice dele. */
function adicionarVertice(m: Malha, p: Ponto3, n: Ponto3): number {
  m.positions.push(p[0], p[1], p[2]);
  m.normals.push(n[0], n[1], n[2]);
  return m.positions.length / 3 - 1;
}

/**
 * Acrescenta um triângulo, pulando os de área ~0 (ex.: pontos de anel sobre o eixo). A ordem dos vértices é ajustada para
 * que a normal geométrica fique do lado da normal do vértice `a` (para fora do sólido).
 */
export function adicionarTriangulo(m: Malha, a: number, b: number, c: number): void {
  const pa = posicao(m, a);
  const pb = posicao(m, b);
  const pc = posicao(m, c);
  const x = cruzado(sub(pb, pa), sub(pc, pa));
  const dobroArea = Math.hypot(x[0], x[1], x[2]);
  if (dobroArea / 2 < AREA_MINIMA) return;
  const na = [m.normals[a * 3]!, m.normals[a * 3 + 1]!, m.normals[a * 3 + 2]!] as Ponto3;
  const invertido = x[0] * na[0] + x[1] * na[1] + x[2] * na[2] < 0;
  m.indices.push(a, invertido ? c : b, invertido ? b : c);
  m.pecaDoTriangulo.push(0);
}

/**
 * Faixas laterais de um anel entre cortes consecutivos `cortes[k]` e `cortes[k+1]`. Com `fechado`, o último corte liga
 * ao primeiro (revolução de 360°); senão, são `cortes.length − 1` faixas.
 */
export function faixasLaterais(m: Malha, anel: Pt2[], cortes: number[], fechado: boolean, mapa: Mapa): void {
  const n = anel.length;
  if (n < 3) return;
  const normais = normaisDasArestas(anel);
  const suave: boolean[] = [];
  const normalSuave: Pt2[] = [];
  for (let i = 0; i < n; i++) {
    const entrada = normais[(i - 1 + n) % n]!;
    const saida = normais[i]!;
    const cosseno = entrada[0] * saida[0] + entrada[1] * saida[1];
    suave.push(cosseno >= COS_SUAVE);
    const somaU = entrada[0] + saida[0];
    const somaV = entrada[1] + saida[1];
    const tamanho = Math.hypot(somaU, somaV) || 1;
    normalSuave.push([somaU / tamanho, somaV / tamanho]);
  }
  const vertices = new Map<string, number>();
  const vertice = (k: number, i: number, lado: 0 | 1): number => {
    const chave = suave[i] ? `${k}:${i}` : `${k}:${i}:${lado}`;
    const existente = vertices.get(chave);
    if (existente !== undefined) return existente;
    const normal2 = suave[i] ? normalSuave[i]! : normais[lado === 0 ? (i - 1 + n) % n : i]!;
    const ponto = anel[i]!;
    const { p, n: nn } = mapa(ponto[0], ponto[1], normal2[0], normal2[1], cortes[k]!);
    const idx = adicionarVertice(m, p, nn);
    vertices.set(chave, idx);
    return idx;
  };
  const faixas = fechado ? cortes.length : cortes.length - 1;
  for (let k = 0; k < faixas; k++) {
    const k2 = (k + 1) % cortes.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const a = vertice(k, i, 1);
      const b = vertice(k, j, 0);
      const c = vertice(k2, j, 0);
      const d = vertice(k2, i, 1);
      adicionarTriangulo(m, a, b, c);
      adicionarTriangulo(m, a, c, d);
    }
  }
}

/**
 * Tampa plana: triangula o externo com os furos (`triangulate`) e leva cada vértice ao mundo por `levar`. Todos os
 * vértices recebem a mesma `normal`; a ordem dos triângulos é ajustada para que ela fique para fora.
 */
export function tampa(m: Malha, aneis: Pt2[][], levar: (u: number, v: number) => Ponto3, normal: Ponto3): void {
  const poligono: Vec2[][] = aneis.map((anel) => anel.map(([x, y]) => ({ x, y })));
  const plana = triangulate(poligono);
  const idx: number[] = [];
  for (let i = 0; i + 1 < plana.positions.length; i += 2) {
    idx.push(adicionarVertice(m, levar(plana.positions[i]!, plana.positions[i + 1]!), normal));
  }
  for (let t = 0; t + 2 < plana.indices.length; t += 3) {
    adicionarTriangulo(m, idx[plana.indices[t]!]!, idx[plana.indices[t + 1]!]!, idx[plana.indices[t + 2]!]!);
  }
}

function posicao(m: Malha, i: number): Ponto3 {
  return [m.positions[i * 3]!, m.positions[i * 3 + 1]!, m.positions[i * 3 + 2]!];
}

function sub(a: Ponto3, b: Ponto3): Ponto3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function cruzado(a: Ponto3, b: Ponto3): Ponto3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
