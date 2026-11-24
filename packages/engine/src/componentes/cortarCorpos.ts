import { difference, intersection, ringArea, union, type MultiPolygon, type Ring } from '@hestia/geom';
import { isComponent, levelElevation, matrizDoComponente, resolverMaterialVisualPeca, type Component, type Id, type Project } from '@hestia/model';
import type { CorpoResolvido } from './corposTipos.ts';
import { malhaDosCorpos } from './corposMalha.ts';
import { resolverComponente } from './instancia.ts';
import { rect, sectionFrame, type SectionLine } from '../sectionGeom.ts';

/*
 * Corte e elevação dos corpos (ficha B4, CONTRATO §4). MÉTODO do corte: cada triângulo da malha sólida é cortado pelo plano
 * (um segmento por triângulo que atravessa) e os segmentos são encadeados em laços fechados por posição quantizada. O segmento
 * é orientado por `normal_plano × normal_do_triângulo`: o laço externo sai anti-horário visto de +normal e o furo, horário
 * (o material fica sempre à esquerda). Vértice sobre o plano conta como "acima" (perturbação simbólica), então todo triângulo
 * tem 0 ou 2 cruzamentos e os laços sempre fecham. MÉTODO da silhueta: igual ao da planta (B3), união de triângulos projetados.
 * Tudo em metros, no sistema da família (ou no mundo, quando se passa `matriz`). Nunca lança: malha com erro devolve vazio.
 */

export interface PlanoDeCorte {
  origem: [number, number, number];
  /** Normal do plano (não precisa ser unitária; nula devolve vazio). */
  normal: [number, number, number];
}

export interface CorteDosCorpos {
  /** Por corpo da entrada (mesmo índice): laços fechados, cada um uma lista de pontos [x, y, z]. Furos têm orientação oposta à dos externos. */
  cortado: number[][][];
  /** Silhueta dos corpos projetada no plano, contornos externos em pares (u, v) planos: u = `normal.y, −normal.x, 0` normalizado, v = z. */
  projetado: number[][];
}

/** Matriz 4×4 em ordem de coluna (como `matrizDoComponente`), local → destino. */
export type MatrizColuna = readonly number[];

const EPS_PLANO = 1e-12;
const GRADE = 1e-7;
const AREA_MINIMA = 1e-12;
const MAX_LACOS_POR_CORPO = 4096;

type P3 = [number, number, number];
type Triangulo = [P3, P3, P3];

const chavePonto = (p: P3): string => `${Math.round(p[0] / GRADE)},${Math.round(p[1] / GRADE)},${Math.round(p[2] / GRADE)}`;

function aplicar(m: MatrizColuna | undefined, x: number, y: number, z: number): P3 {
  if (!m) return [x, y, z];
  const g = (i: number): number => m[i] ?? 0;
  return [g(0) * x + g(4) * y + g(8) * z + g(12), g(1) * x + g(5) * y + g(9) * z + g(13), g(2) * x + g(6) * y + g(10) * z + g(14)];
}

/** Determinante da parte 3×3: negativo = espelhamento, que inverte o sentido dos triângulos. */
function espelha(m: MatrizColuna | undefined): boolean {
  if (!m) return false;
  const g = (i: number): number => m[i] ?? 0;
  const det = g(0) * (g(5) * g(10) - g(9) * g(6)) - g(4) * (g(1) * g(10) - g(9) * g(2)) + g(8) * (g(1) * g(6) - g(5) * g(2));
  return det < 0;
}

/** Triângulos da malha SÓLIDA agrupados por corpo (índice da entrada), já na matriz, com sentido externo preservado. */
function triangulosPorCorpo(corpos: CorpoResolvido[], matriz?: MatrizColuna): Map<number, Triangulo[]> {
  const { solidas } = malhaDosCorpos(corpos);
  const inverte = espelha(matriz);
  const porCorpo = new Map<number, Triangulo[]>();
  const ponto = (i: number): P3 => aplicar(matriz, solidas.positions[i * 3] ?? 0, solidas.positions[i * 3 + 1] ?? 0, solidas.positions[i * 3 + 2] ?? 0);
  for (let t = 0; t * 3 + 2 < solidas.indices.length; t++) {
    const a = ponto(solidas.indices[t * 3] ?? 0);
    const b = ponto(solidas.indices[t * 3 + 1] ?? 0);
    const c = ponto(solidas.indices[t * 3 + 2] ?? 0);
    const corpo = solidas.pecaDoTriangulo[t] ?? 0;
    const lista = porCorpo.get(corpo) ?? [];
    lista.push(inverte ? [a, c, b] : [a, b, c]);
    porCorpo.set(corpo, lista);
  }
  return porCorpo;
}

const sub = (a: P3, b: P3): P3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cruz = (a: P3, b: P3): P3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: P3, b: P3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Ponto do cruzamento da aresta (a, b) com o plano; a ordem canônica faz as duas faces vizinhas chegarem ao mesmo número. */
function cruzamento(a: P3, da: number, b: P3, db: number): P3 {
  if (Math.abs(da) <= EPS_PLANO) return a;
  if (Math.abs(db) <= EPS_PLANO) return b;
  const ordem = a[0] !== b[0] ? a[0] - b[0] : a[1] !== b[1] ? a[1] - b[1] : a[2] - b[2];
  const [p, dp, q, dq] = ordem <= 0 ? [a, da, b, db] : [b, db, a, da];
  const k = dp / (dp - dq);
  return [p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k, p[2] + (q[2] - p[2]) * k];
}

interface Segmento {
  de: P3;
  para: P3;
  deChave: string;
  paraChave: string;
}

function segmentosDoCorte(triangulos: Triangulo[], origem: P3, normal: P3): Segmento[] {
  const segmentos: Segmento[] = [];
  for (const tri of triangulos) {
    const d = tri.map((v) => dot(sub(v, origem), normal));
    const acima = d.map((x) => x > -EPS_PLANO);
    if (acima[0] === acima[1] && acima[1] === acima[2]) continue;
    // O vértice isolado (o único de um lado) define as duas arestas que cruzam.
    const solo = acima[0] !== acima[1] ? (acima[0] === acima[2] ? 1 : 0) : 2;
    const v0 = tri[solo]!;
    const v1 = tri[(solo + 1) % 3]!;
    const v2 = tri[(solo + 2) % 3]!;
    const d0 = d[solo]!;
    const p = cruzamento(v0, d0, v1, d[(solo + 1) % 3]!);
    const q = cruzamento(v0, d0, v2, d[(solo + 2) % 3]!);
    const chaveP = chavePonto(p);
    const chaveQ = chavePonto(q);
    if (chaveP === chaveQ) continue;
    const nTri = cruz(sub(tri[1], tri[0]), sub(tri[2], tri[0]));
    const direcao = cruz(normal, nTri);
    const reto = dot(sub(q, p), direcao) >= 0;
    segmentos.push(reto ? { de: p, para: q, deChave: chaveP, paraChave: chaveQ } : { de: q, para: p, deChave: chaveQ, paraChave: chaveP });
  }
  return segmentos;
}

/** Encadeia segmentos em laços fechados; cadeias que não fecham (malha aberta) são descartadas. */
function encadear(segmentos: Segmento[]): P3[][] {
  const porInicio = new Map<string, Segmento[]>();
  for (const s of segmentos) {
    const l = porInicio.get(s.deChave) ?? [];
    l.push(s);
    porInicio.set(s.deChave, l);
  }
  const usados = new Set<Segmento>();
  const lacos: P3[][] = [];
  for (const inicio of segmentos) {
    if (usados.has(inicio)) continue;
    usados.add(inicio);
    const pontos: P3[] = [inicio.de];
    let atual = inicio;
    let fechou = false;
    for (let passo = 0; passo <= segmentos.length; passo++) {
      if (atual.paraChave === inicio.deChave) { fechou = true; break; }
      pontos.push(atual.para);
      const proximo = (porInicio.get(atual.paraChave) ?? []).find((s) => !usados.has(s));
      if (!proximo) break;
      usados.add(proximo);
      atual = proximo;
    }
    if (fechou && pontos.length >= 3) lacos.push(pontos);
    if (lacos.length >= MAX_LACOS_POR_CORPO) break;
  }
  return lacos;
}

/** Tira os pontos colineares (o corte atravessa a diagonal de cada face em quadrilátero e deixa vértices no meio da aresta). */
function semColineares(laco: P3[]): P3[] {
  let atual = laco;
  for (let rodada = 0; rodada < 2; rodada++) {
    atual = atual.filter((p, i) => {
      const a = atual[(i + atual.length - 1) % atual.length]!;
      const b = atual[(i + 1) % atual.length]!;
      const ab = sub(b, a);
      const comp = Math.hypot(...ab);
      if (comp < GRADE) return false;
      return Math.hypot(...cruz(ab, sub(p, a))) / comp > 1e-9;
    });
    if (atual.length < 3) return [];
  }
  return atual;
}

type VistaCorte = 'corte' | 'elevacao';

function corpoNaVista(c: CorpoResolvido, vista: VistaCorte): boolean {
  return !c.vazio && (c.vistas === null || c.vistas.includes(vista));
}

/** Os corpos que não entram nas vistas dadas viram "vazios" (a malha sólida os ignora). */
const filtrarPorVista = (corpos: CorpoResolvido[], vistas: VistaCorte[]): CorpoResolvido[] =>
  corpos.map((c) => (vistas.some((v) => corpoNaVista(c, v)) ? c : { ...c, vazio: true }));

/** Laços do corte de cada corpo pelo plano (índices da entrada; corpo fora da vista `corte`, vazio ou que não toca fica `[]`). */
export function lacosDoCorte(corpos: CorpoResolvido[], plano: PlanoDeCorte, matriz?: MatrizColuna): number[][][] {
  const saida: number[][][] = corpos.map(() => []);
  const modulo = Math.hypot(...plano.normal);
  if (corpos.length === 0 || modulo < 1e-12) return saida;
  const normal: P3 = [plano.normal[0] / modulo, plano.normal[1] / modulo, plano.normal[2] / modulo];
  for (const [indice, triangulos] of triangulosPorCorpo(filtrarPorVista(corpos, ['corte']), matriz)) {
    if (corpos[indice] === undefined) continue;
    saida[indice] = encadear(segmentosDoCorte(triangulos, plano.origem, normal)).map(semColineares).filter((l) => l.length >= 3).map((laco) => laco.flatMap((p) => [p[0], p[1], p[2]]));
  }
  return saida;
}

type Mapa = (p: P3) => [number, number];

function aneisProjetados(triangulos: Triangulo[], mapa: Mapa): Ring[] {
  const vistos = new Set<string>();
  const saida: Ring[] = [];
  const arredonda = (v: number): number => Math.round(v / GRADE) * GRADE;
  for (const tri of triangulos) {
    const [a, b, c] = tri.map((p) => {
      const [u, v] = mapa(p);
      return { x: arredonda(u), y: arredonda(v) };
    }) as [Ring[number], Ring[number], Ring[number]];
    const area = ((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y)) / 2;
    if (Math.abs(area) < AREA_MINIMA) continue;
    const anel: Ring = area > 0 ? [a, b, c] : [a, c, b];
    const chave = anel.map((v) => `${Math.round(v.x / GRADE)},${Math.round(v.y / GRADE)}`).sort().join('|');
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    saida.push(anel);
  }
  return saida;
}

function uniaoEmArvore(partes: MultiPolygon[]): MultiPolygon {
  let nivel = partes;
  while (nivel.length > 1) {
    const prox: MultiPolygon[] = [];
    for (let i = 0; i < nivel.length; i += 2) {
      const a = nivel[i] ?? [];
      const b = nivel[i + 1];
      prox.push(b === undefined ? a : union(a, b));
    }
    nivel = prox;
  }
  return nivel[0] ?? [];
}

function silhueta(triangulos: Triangulo[], mapa: Mapa): number[][] {
  const aneis = aneisProjetados(triangulos, mapa);
  if (aneis.length === 0) return [];
  const saida: number[][] = [];
  for (const poligono of uniaoEmArvore(aneis.map((t): MultiPolygon => [[t]]))) {
    const externo = poligono[0];
    if (externo !== undefined && externo.length >= 3) saida.push(externo.flatMap((v) => [v.x, v.y]));
  }
  return saida;
}

function triangulosDaVista(corpos: CorpoResolvido[], vistas: VistaCorte[], matriz?: MatrizColuna): Triangulo[] {
  return [...triangulosPorCorpo(filtrarPorVista(corpos, vistas), matriz).values()].flat();
}

/** Mapa (x, y, z) → (t, z) com t ao longo da linha de corte, a direção `normal.y, −normal.x`. */
function mapaDoPlano(normal: readonly number[]): Mapa | null {
  const m = Math.hypot(normal[0] ?? 0, normal[1] ?? 0);
  if (m < 1e-12) return null;
  const ux = (normal[1] ?? 0) / m;
  const uy = -(normal[0] ?? 0) / m;
  return (p) => [p[0] * ux + p[1] * uy, p[2]];
}

/**
 * Corte dos corpos por um plano: `cortado` (laços por corpo, 3D) e `projetado` (silhueta de todos os corpos no plano, em (u, v)).
 * `matriz` opcional leva os corpos da família ao mundo antes de cortar (a instância no projeto); o plano então está no mundo.
 */
export function cortarCorpos(corpos: CorpoResolvido[], plano: PlanoDeCorte, matriz?: MatrizColuna): CorteDosCorpos {
  const cortado = lacosDoCorte(corpos, plano, matriz);
  const mapa = mapaDoPlano(plano.normal);
  return { cortado, projetado: mapa ? silhueta(triangulosDaVista(corpos, ['corte'], matriz), mapa) : [] };
}

/**
 * Silhueta dos corpos numa elevação (CONTRATO §4): `eixo` é o eixo ao longo do qual se olha. `'y'` = elevação frontal (plano xz:
 * u = x, v = z); `'x'` = elevação lateral (plano yz: u = y, v = z). Contornos externos em pares (u, v) planos, em m. Corpos
 * vazios ou com `vistas` sem `elevacao` não entram.
 */
export function projetarCorposElevacao(corpos: CorpoResolvido[], eixo: 'x' | 'y'): number[][] {
  return silhueta(triangulosDaVista(corpos, ['elevacao']), (p) => [eixo === 'y' ? p[0] : p[1], p[2]]);
}

/**
 * Silhueta, na vista de corte, do que fica ATRÁS do plano (do lado de +normal, até `profundidade`): triângulos cujo centro está
 * nessa faixa, projetados em (t, z) com t = `normal.y, −normal.x` (a direção da linha de corte). Vale `corte` ou `elevacao`.
 */
export function projetarCorposAlemDoPlano(corpos: CorpoResolvido[], plano: PlanoDeCorte, profundidade: number, matriz?: MatrizColuna): number[][] {
  return alemDoPlano(corpos, plano, profundidade, matriz).contornos;
}

function alemDoPlano(corpos: CorpoResolvido[], plano: PlanoDeCorte, profundidade: number, matriz?: MatrizColuna): { contornos: number[][]; distMin: number } {
  const modulo = Math.hypot(...plano.normal);
  const mapa = mapaDoPlano(plano.normal);
  if (modulo < 1e-12 || !mapa) return { contornos: [], distMin: 0 };
  const n = plano.normal.map((v) => v / modulo);
  let distMin = Infinity;
  const faixa = triangulosDaVista(corpos, ['corte', 'elevacao'], matriz).filter((tri) => {
    const c = [0, 1, 2].map((k) => (tri[0][k]! + tri[1][k]! + tri[2][k]!) / 3 - plano.origem[k]!);
    const dist = c[0]! * n[0]! + c[1]! * n[1]! + c[2]! * n[2]!;
    const dentro = dist >= -EPS_PLANO && dist <= profundidade;
    if (dentro) distMin = Math.min(distMin, Math.max(0, dist));
    return dentro;
  });
  return { contornos: silhueta(faixa, mapa), distMin: Number.isFinite(distMin) ? distMin : 0 };
}

/** Corpos de um componente no corte (t, z): `cut` por corpo (já com furos) e `beyond` (silhueta atrás do plano). */
export interface CorposNoCorte {
  cut: Array<{ componentId: Id; materialId: Id; polygons: MultiPolygon }>;
  beyond: Array<{ componentId: Id; materialId: Id; depth: number; polygons: MultiPolygon }>;
}

/** Laços 3D → polígono (t, z): ordena por área, externo (horário em tela, ver o método) soma e furo subtrai. */
function poligonoDosLacos(lacos: number[][], line: SectionLine, d: { x: number; y: number }, length: number): MultiPolygon {
  const aneis = lacos
    .map((l): Ring => {
      const r: Ring = [];
      for (let k = 0; k + 2 < l.length; k += 3) r.push({ x: (l[k]! - line.a.x) * d.x + (l[k + 1]! - line.a.y) * d.y, y: l[k + 2]! });
      return r;
    })
    .map((r) => ({ r, a: ringArea(r) }))
    .filter((x) => Math.abs(x.a) > AREA_MINIMA)
    .sort((x, y) => Math.abs(y.a) - Math.abs(x.a));
  let res: MultiPolygon = [];
  for (const { r, a } of aneis) {
    const anel: Ring = a < 0 ? [...r].reverse() : r;
    res = a < 0 ? union(res, [[anel]]) : difference(res, [[anel]]);
  }
  return res.length === 0 ? res : intersection(res, [[rect(0, length, -1e4, 1e4)]]);
}

/**
 * Corte e projeção dos corpos de todas as instâncias do projeto pela linha de corte (ficha B4), em (t, z) como o resto do
 * corte. Componente sem corpos (famílias antigas) não gera nada. Sem oclusão entre si e com o resto (a pintura por profundidade resolve).
 */
export function corposNoCorte(p: Project, line: SectionLine): CorposNoCorte {
  const saida: CorposNoCorte = { cut: [], beyond: [] };
  const { length, d, n } = sectionFrame(line);
  if (length < 1e-6) return saida;
  const plano: PlanoDeCorte = { origem: [line.a.x, line.a.y, 0], normal: [n.x, n.y, 0] };
  const componentes = Object.values(p.elements).filter((e): e is Component => isComponent(e)).sort((a, b) => a.order - b.order);
  for (const c of componentes) {
    const corpos = resolverComponente(p, c).corpos ?? [];
    if (corpos.length === 0) continue;
    const matriz = matrizDoComponente(c);
    matriz[14] = (matriz[14] ?? 0) + levelElevation(p, c.levelId);
    const material = (corpo: CorpoResolvido): Id => resolverMaterialVisualPeca(c, 'generica', corpo.material ?? undefined);
    lacosDoCorte(corpos, plano, matriz).forEach((lacos, i) => {
      const polygons = lacos.length > 0 ? poligonoDosLacos(lacos, line, d, length) : [];
      if (polygons.length > 0) saida.cut.push({ componentId: c.id, materialId: material(corpos[i]!), polygons });
    });
    const alem = alemDoPlano(corpos, plano, line.depth, matriz);
    const materialAlem = material(corpos.find((x) => !x.vazio) ?? corpos[0]!);
    const polygons: MultiPolygon = alem.contornos.map((flat) => {
      const anel: Ring = [];
      for (let k = 0; k + 1 < flat.length; k += 2) anel.push({ x: flat[k]!, y: flat[k + 1]! });
      return [anel];
    });
    if (polygons.length > 0) saida.beyond.push({ componentId: c.id, materialId: materialAlem, depth: alem.distMin, polygons });
  }
  return saida;
}
