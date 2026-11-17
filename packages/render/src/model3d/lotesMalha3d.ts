import * as THREE from 'three';
import type { GraphicsCategory, Id, Project } from '@hestia/model';
import type { LoteSolido, SolidBatch } from './solids.ts';
import { arestasPorAngulo } from './arestasRapidas3d.ts';

/**
 * Juntada dos lotes de um nível em malhas (desempenho 3D): cada grupo de categoria e material vira uma malha só, em vez de
 * uma por lote. A cena paga uma chamada de desenho por malha, então juntar reduz o trabalho da GPU e da CPU. As faixas de
 * elemento (`ids`, decisão 0016) são deslocadas pelo que já foi juntado: o picking e o realce continuam achando o elemento
 * pelo triângulo, sem mudar `pick3d.ts`.
 */

/** Chave do grupo: a categoria (visibilidade e substituição, decisão 0015) e o material. */
export function chaveDoLote(b: LoteSolido): string {
  return `${b.category}|${b.materialId}`;
}

/** Lote sem triângulo não gera malha nem arestas. */
const comTriangulos = (b: LoteSolido): boolean => b.indices.length > 0;

/** Agrupa os lotes com triângulos pela chave, na ordem da primeira aparição. */
export function agruparLotes<T extends LoteSolido>(lotes: readonly T[]): Map<string, T[]> {
  const grupos = new Map<string, T[]>();
  for (const b of lotes) {
    if (!comTriangulos(b)) continue;
    const k = chaveDoLote(b);
    const g = grupos.get(k);
    if (g) g.push(b);
    else grupos.set(k, [b]);
  }
  return grupos;
}

/**
 * Um lote só com os lotes dados (mesma categoria e material). Os índices de vértice saem deslocados pelos vértices já
 * juntados, e as faixas de elemento pelos índices já juntados (as faixas contam índices, não triângulos).
 */
export function juntarLote(fontes: readonly SolidBatch[]): SolidBatch;
export function juntarLote(fontes: readonly LoteSolido[]): LoteSolido;
export function juntarLote(fontes: readonly LoteSolido[]): LoteSolido {
  // Vetores do tamanho final e preenchidos por posição: milhões de `push` um a um (guarda-corpos, escadas) eram o maior custo da juntada.
  let nPos = 0;
  let nNor = 0;
  let nIdx = 0;
  for (const f of fontes) {
    nPos += f.positions.length;
    nNor += f.normals?.length ?? 0;
    nIdx += f.indices.length;
  }
  // Sem normais em alguma fonte (genéricos, sombreamento chapado no shader), o lote juntado também não tem.
  const comNormais = fontes.every((f) => f.normals);
  const positions = new Array<number>(nPos);
  const normals = new Array<number>(comNormais ? nNor : 0);
  const indices = new Array<number>(nIdx);
  const ids: SolidBatch['ids'] = [];
  let p = 0;
  let n = 0;
  let k = 0;
  for (const f of fontes) {
    const vBase = p / 3;
    const iBase = k;
    for (let j = 0; j < f.positions.length; j++) positions[p++] = f.positions[j]!;
    if (comNormais) for (let j = 0; j < f.normals!.length; j++) normals[n++] = f.normals![j]!;
    for (let j = 0; j < f.indices.length; j++) indices[k++] = f.indices[j]! + vBase;
    for (const r of f.ids) ids.push({ id: r.id, start: r.start + iBase, count: r.count });
  }
  return { materialId: fontes[0]!.materialId, category: fontes[0]!.category, positions, ...(comNormais ? { normals } : {}), indices, ids };
}

/** Os lotes juntados por chave: um lote por grupo (ver `agruparLotes`). Lotes vazios saem. */
export function juntarLotes(lotes: readonly SolidBatch[]): SolidBatch[];
export function juntarLotes(lotes: readonly LoteSolido[]): LoteSolido[];
export function juntarLotes(lotes: readonly LoteSolido[]): LoteSolido[] {
  return [...agruparLotes(lotes).values()].map((g) => juntarLote(g));
}

/** Geometria de um lote (posições, normais e índices), pronta para a malha. */
export function geometriaDoLote(b: LoteSolido): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(b.positions, 3));
  if (b.normals) g.setAttribute('normal', new THREE.Float32BufferAttribute(b.normals, 3));
  g.setIndex(Array.from(b.indices));
  return g;
}

/**
 * Orçamento de arestas dos objetos genéricos (malhas importadas, ex.: IFC): acima deste total de triângulos genéricos numa chamada,
 * os genéricos ficam SEM arestas por ângulo (sombreamento chapado continua). Modelos importados de dezenas de milhões de triângulos
 * gastavam segundos na thread principal só nas arestas; paredes, lajes, escadas e demais categorias não são afetadas, e modelos
 * abaixo do limite saem idênticos.
 */
export const ORCAMENTO_TRIANGULOS_GENERICOS = 1_500_000;

/** Triângulos dos lotes da categoria genérico. */
export function trianguloDosGenericos(lotes: readonly LoteSolido[]): number {
  let n = 0;
  for (const b of lotes) if (b.category === 'generic') n += Math.floor(b.indices.length / 3);
  return n;
}

/** Triângulos dos elementos genéricos do projeto inteiro (todos os níveis). Resultado em cache por referência de `elements`. */
const trianguloDosGenericosDoProjeto = new WeakMap<object, number>();

/**
 * Decide o orçamento de arestas dos genéricos do PROJETO (não de um nível): `true` quando a soma dos triângulos dos genéricos
 * de todos os níveis passa de `ORCAMENTO_TRIANGULOS_GENERICOS`. Nesse caso nenhum lote genérico ganha arestas por ângulo, em
 * nenhum nível. Custa O(n) só na primeira vez para cada `elements`; as chamadas seguintes com a mesma referência são O(1).
 */
export function genericosAcimaDoOrcamento(elements: Project['elements']): boolean {
  let total = trianguloDosGenericosDoProjeto.get(elements);
  if (total === undefined) {
    total = 0;
    for (const e of Object.values(elements)) if (e.kind === 'generic') total += Math.floor(e.mesh.indices.length / 3);
    trianguloDosGenericosDoProjeto.set(elements, total);
  }
  return total > ORCAMENTO_TRIANGULOS_GENERICOS;
}

/**
 * Arestas dos lotes dados, numa geometria só. Cada lote gera as arestas da sua própria geometria (com o mesmo ângulo de
 * antes), para que as juntas entre peças continuem desenhadas. Sem triângulos, devolve null.
 *
 * `semGenericos` (opcional): quando definido, manda — `true` pula todos os lotes genéricos, `false` os mantém (a cena passa
 * a decisão do PROJETO, `genericosAcimaDoOrcamento`). Quando omitido, a decisão é por chamada, pelo total de `lotes` (o
 * comportamento de antes, para quem chama com um conjunto só).
 */
export function arestasDosLotes(lotes: readonly LoteSolido[], angulo: number, semGenericos?: boolean): THREE.BufferGeometry | null {
  const pos: number[] = [];
  const pularGenericos = semGenericos ?? trianguloDosGenericos(lotes) > ORCAMENTO_TRIANGULOS_GENERICOS;
  for (const b of lotes) {
    if (!comTriangulos(b)) continue;
    if (pularGenericos && b.category === 'generic') continue;
    // Mesmo critério e mesma saída do `THREE.EdgesGeometry`, sem o texto por vértice (ver `arestasRapidas3d.ts`).
    for (const x of arestasPorAngulo(b.positions, b.indices, angulo)) pos.push(x);
  }
  if (!pos.length) return null;
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return out;
}

/**
 * Lote de uma geometria indexada já no mundo do nível (ex.: a caixa de uma esquadria fixa, com a transformação do vão
 * aplicada), com uma faixa que cobre a geometria inteira para o elemento `id`.
 */
export function loteDeGeometria(g: THREE.BufferGeometry, materialId: Id, category: GraphicsCategory, id: Id): SolidBatch {
  const posicao = g.getAttribute('position');
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  // Extrusão (batente em L) não é indexada: os índices saem na ordem dos vértices.
  const indices = g.index ? Array.from(g.index.array) : Array.from({ length: posicao.count }, (_, i) => i);
  return {
    materialId,
    category,
    positions: Array.from(posicao.array),
    normals: Array.from(g.getAttribute('normal').array),
    indices,
    ids: [{ id, start: 0, count: indices.length }],
  };
}
