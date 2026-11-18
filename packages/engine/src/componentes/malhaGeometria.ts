import { triangulate, type Vec2 } from '@hestia/geom';
import type { Malha } from './malha.ts';
import type { PecaResolvida } from './pecas.ts';

/*
 * Geometria da malha triangular das peças (ficha E3-malha): mapeamento do plano da chapa (u, v) e da espessura w para o
 * mundo, tampas e paredes. Só números e `triangulate`; o Rust espelha as mesmas contas.
 */

type Ponto3 = [number, number, number];

/** Vetores unitários (u, v, w) de cada eixo da espessura, no mundo. */
const EIXOS: Record<PecaResolvida['eixo'], { u: Ponto3; v: Ponto3; w: Ponto3 }> = {
  x: { u: [0, 1, 0], v: [0, 0, 1], w: [1, 0, 0] },
  y: { u: [1, 0, 0], v: [0, 0, 1], w: [0, 1, 0] },
  z: { u: [1, 0, 0], v: [0, 1, 0], w: [0, 0, 1] },
};

/** Contorno da peça no plano da chapa; sem contorno, o retângulo `tamanho`. */
export function pontosDoPlano(p: PecaResolvida): readonly number[] {
  if (p.contorno !== null) return p.contorno;
  const [a, b] = p.tamanho;
  return [0, 0, a, 0, a, b, 0, b];
}

/** Ponto (u, v) do plano da chapa, na espessura w, para o mundo. */
export function paraMundo(eixo: PecaResolvida['eixo'], origem: readonly [number, number, number], u: number, v: number, w: number): Ponto3 {
  const e = EIXOS[eixo];
  return [origem[0] + w * e.w[0] + u * e.u[0] + v * e.v[0], origem[1] + w * e.w[1] + u * e.u[1] + v * e.v[1], origem[2] + w * e.w[2] + u * e.u[2] + v * e.v[2]];
}

/** Direção (nu, nv, nw) no espaço do plano para direção no mundo (sem translação). */
export function direcaoParaMundo(eixo: PecaResolvida['eixo'], nu: number, nv: number, nw: number): Ponto3 {
  const e = EIXOS[eixo];
  return [nw * e.w[0] + nu * e.u[0] + nv * e.v[0], nw * e.w[1] + nu * e.u[1] + nv * e.v[1], nw * e.w[2] + nu * e.u[2] + nv * e.v[2]];
}

function normalizar(v: Ponto3): Ponto3 {
  const comprimento = Math.hypot(v[0], v[1], v[2]);
  if (comprimento === 0) return [0, 0, 1];
  return [v[0] / comprimento, v[1] / comprimento, v[2] / comprimento];
}

/** Emite um triângulo com vértices próprios e normal unitária; corrige a ordem para a normal sair para fora. */
function empurrarTriangulo(m: Malha, a: Ponto3, b: Ponto3, c: Ponto3, normal: Ponto3, indicePeca: number): void {
  const u: Ponto3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const v: Ponto3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const cruz: Ponto3 = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const alinhado = cruz[0] * normal[0] + cruz[1] * normal[1] + cruz[2] * normal[2] >= 0;
  const segundo = alinhado ? b : c;
  const terceiro = alinhado ? c : b;
  const base = m.positions.length / 3;
  for (const p of [a, segundo, terceiro]) {
    m.positions.push(p[0], p[1], p[2]);
    m.normals.push(normal[0], normal[1], normal[2]);
  }
  m.indices.push(base, base + 1, base + 2);
  m.pecaDoTriangulo.push(indicePeca);
}

/** Tampas inferior (w = 0, normal −w) e superior (w = espessura, normal +w), trianguladas por `triangulate`. */
export function tampas(m: Malha, p: PecaResolvida, pontos: readonly number[], indicePeca: number): void {
  const anel: Vec2[] = [];
  for (let i = 0; i + 1 < pontos.length; i += 2) anel.push({ x: pontos[i]!, y: pontos[i + 1]! });
  if (anel.length < 3) return;
  const plana = triangulate([anel]);
  const normalInferior = normalizar(direcaoParaMundo(p.eixo, 0, 0, -1));
  const normalSuperior = normalizar(direcaoParaMundo(p.eixo, 0, 0, 1));
  const inferior: Ponto3[] = [];
  const superior: Ponto3[] = [];
  for (let i = 0; i + 1 < plana.positions.length; i += 2) {
    const u = plana.positions[i]!;
    const v = plana.positions[i + 1]!;
    inferior.push(paraMundo(p.eixo, p.origem, u, v, 0));
    superior.push(paraMundo(p.eixo, p.origem, u, v, p.espessura));
  }
  for (let t = 0; t + 2 < plana.indices.length; t += 3) {
    const a = plana.indices[t]!;
    const b = plana.indices[t + 1]!;
    const c = plana.indices[t + 2]!;
    empurrarTriangulo(m, inferior[a]!, inferior[b]!, inferior[c]!, normalInferior, indicePeca);
    empurrarTriangulo(m, superior[a]!, superior[b]!, superior[c]!, normalSuperior, indicePeca);
  }
}

/** Uma parede (2 triângulos) por aresta do contorno, com a normal para fora do polígono. */
export function paredes(m: Malha, p: PecaResolvida, pontos: readonly number[], indicePeca: number): void {
  const n = Math.floor(pontos.length / 2);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const pu = pontos[i * 2]!;
    const pv = pontos[i * 2 + 1]!;
    const qu = pontos[j * 2]!;
    const qv = pontos[j * 2 + 1]!;
    const du = qu - pu;
    const dv = qv - pv;
    const comprimento = Math.hypot(du, dv);
    if (comprimento < 1e-12) continue;
    const normal = normalizar(direcaoParaMundo(p.eixo, dv / comprimento, -du / comprimento, 0));
    const a = paraMundo(p.eixo, p.origem, pu, pv, 0);
    const b = paraMundo(p.eixo, p.origem, qu, qv, 0);
    const c = paraMundo(p.eixo, p.origem, qu, qv, p.espessura);
    const d = paraMundo(p.eixo, p.origem, pu, pv, p.espessura);
    empurrarTriangulo(m, a, b, c, normal, indicePeca);
    empurrarTriangulo(m, a, c, d, normal, indicePeca);
  }
}

/** Acrescenta à malha o prisma de uma peça, com o índice dela na lista de entrada. */
export function adicionarPeca(m: Malha, p: PecaResolvida, indicePeca: number): void {
  const pontos = pontosDoPlano(p);
  tampas(m, p, pontos, indicePeca);
  paredes(m, p, pontos, indicePeca);
}
