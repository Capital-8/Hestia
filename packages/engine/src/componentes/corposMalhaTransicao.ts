import type { Malha } from './malha.ts';
import type { PerfilResolvido } from './corposTipos.ts';
import { adicionarTriangulo, aneisDoPerfil, malhaVazia, tampa, type Pt2 } from './corposMalhaApoio.ts';

/*
 * Malha da transição (CONTRATO.md §2.3 "Transição"): dois perfis SEM furos ligados ao longo de +Z, de z = 0 (perfil A)
 * até z = `comprimento` (perfil B, deslocado por `desvio`, em m). Cada perfil é reamostrado em M = 64 pontos por
 * comprimento de arco, anti-horário, a partir do ponto de referência: onde o raio que sai do centro da caixa do perfil
 * em ângulo 0 (+u) cruza o contorno ((r, 0) no círculo; meio da face direita no retângulo). Ligação ponto a ponto, com
 * normais suaves ao longo do anel e vértices próprios nos cantos vivos (> 60°), como nas outras formas; tampas planas
 * (−Z em z = 0, +Z em z = comprimento). Perfil com furo, comprimento não positivo ou entrada degenerada: malha vazia.
 */

const PONTOS = 64;
const COS_SUAVE = 0.5;
type V3 = [number, number, number];

/** Reamostra o contorno em `PONTOS` pontos por comprimento de arco, a partir do cruzamento do raio de ângulo 0. */
export function reamostrarContorno(anel: Pt2[]): Pt2[] | null {
  const n = anel.length;
  if (n < 3) return null;
  let uMin = Infinity;
  let uMax = -Infinity;
  let vMin = Infinity;
  let vMax = -Infinity;
  for (const [u, v] of anel) {
    uMin = Math.min(uMin, u);
    uMax = Math.max(uMax, u);
    vMin = Math.min(vMin, v);
    vMax = Math.max(vMax, v);
  }
  const cu = (uMin + uMax) / 2;
  const cv = (vMin + vMax) / 2;
  // aresta que o raio (cu + s, cv), s > 0, cruza; entre várias, a de maior u
  let inicio = -1;
  let inicioU = -Infinity;
  for (let i = 0; i < n; i++) {
    const a = anel[i]!;
    const b = anel[(i + 1) % n]!;
    if ((a[1] - cv) * (b[1] - cv) > 0 || a[1] === b[1]) continue;
    const t = (cv - a[1]) / (b[1] - a[1]);
    if (t < 0 || t > 1) continue;
    const u = a[0] + t * (b[0] - a[0]);
    if (u > cu && u > inicioU) {
      inicioU = u;
      inicio = i;
    }
  }
  if (inicio < 0) return null;
  const p0: Pt2 = [inicioU, cv];
  // contorno recomeçado em p0: p0, vértices inicio+1 .. inicio+n (cíclico), p0
  const fechado: Pt2[] = [p0];
  for (let k = 1; k <= n; k++) fechado.push(anel[(inicio + k) % n]!);
  fechado.push(p0);
  const acumulado: number[] = [0];
  for (let i = 1; i < fechado.length; i++) {
    acumulado.push(acumulado[i - 1]! + Math.hypot(fechado[i]![0] - fechado[i - 1]![0], fechado[i]![1] - fechado[i - 1]![1]));
  }
  const total = acumulado[acumulado.length - 1]!;
  if (!(total > 0)) return null;
  const saida: Pt2[] = [];
  let seg = 1;
  for (let k = 0; k < PONTOS; k++) {
    const alvo = (total * k) / PONTOS;
    while (seg < fechado.length - 1 && acumulado[seg]! < alvo) seg++;
    const a = fechado[seg - 1]!;
    const b = fechado[seg]!;
    const dist = acumulado[seg]! - acumulado[seg - 1]!;
    const f = dist > 0 ? (alvo - acumulado[seg - 1]!) / dist : 0;
    saida.push([a[0] + f * (b[0] - a[0]), a[1] + f * (b[1] - a[1])]);
  }
  return saida;
}

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const soma = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const cruz = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
function unit(a: V3): V3 {
  const n = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / n, a[1] / n, a[2] / n];
}

export function malhaTransicao(a: PerfilResolvido, b: PerfilResolvido, comprimento: number, desvio: [number, number]): Malha {
  const m = malhaVazia();
  if (!(comprimento > 0) || !Number.isFinite(comprimento) || !desvio.every(Number.isFinite)) return m;
  if (a.furos.length > 0 || b.furos.length > 0) return m;
  const anelA = aneisDoPerfil(a)[0];
  const anelB = aneisDoPerfil(b)[0];
  if (!anelA || !anelB) return m;
  const ra = reamostrarContorno(anelA);
  const rb = reamostrarContorno(anelB);
  if (!ra || !rb) return m;
  const base: V3[] = ra.map(([u, v]) => [u, v, 0]);
  const topo: V3[] = rb.map(([u, v]) => [u + desvio[0], v + desvio[1], comprimento]);
  // normal de cada aresta i (de i até i+1), para fora: aresta × geratriz média
  const normais: V3[] = [];
  for (let i = 0; i < PONTOS; i++) {
    const j = (i + 1) % PONTOS;
    const aresta = soma(sub(base[j]!, base[i]!), sub(topo[j]!, topo[i]!));
    const geratriz = soma(sub(topo[i]!, base[i]!), sub(topo[j]!, base[j]!));
    normais.push(unit(cruz(aresta, geratriz)));
  }
  const vertices = new Map<string, number>();
  const vertice = (nivel: 0 | 1, i: number, lado: 0 | 1): number => {
    const anterior = normais[(i - 1 + PONTOS) % PONTOS]!;
    const atual = normais[i]!;
    const suave = anterior[0] * atual[0] + anterior[1] * atual[1] + anterior[2] * atual[2] >= COS_SUAVE;
    const chave = suave ? `${nivel}:${i}` : `${nivel}:${i}:${lado}`;
    const existente = vertices.get(chave);
    if (existente !== undefined) return existente;
    const n = suave ? unit(soma(anterior, atual)) : lado === 0 ? anterior : atual;
    const p = nivel === 0 ? base[i]! : topo[i]!;
    m.positions.push(p[0], p[1], p[2]);
    m.normals.push(n[0], n[1], n[2]);
    const idx = m.positions.length / 3 - 1;
    vertices.set(chave, idx);
    return idx;
  };
  for (let i = 0; i < PONTOS; i++) {
    const j = (i + 1) % PONTOS;
    const p0 = vertice(0, i, 1);
    const p1 = vertice(0, j, 0);
    const p2 = vertice(1, j, 0);
    const p3 = vertice(1, i, 1);
    adicionarTriangulo(m, p0, p1, p2);
    adicionarTriangulo(m, p0, p2, p3);
  }
  tampa(m, [ra], (u, v) => [u, v, 0], [0, 0, -1]);
  tampa(m, [rb], (u, v) => [u + desvio[0], v + desvio[1], comprimento], [0, 0, 1]);
  return m;
}
