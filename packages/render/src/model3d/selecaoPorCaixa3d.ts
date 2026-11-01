import * as THREE from 'three';
import type { Id } from '@hestia/model';
import type { ElementRange } from './solids.ts';

/**
 * Seleção por caixa na vista 3D (arrasto com Selecionar e Ctrl+A). Função pura: lê a cena e a câmera, não muda nada.
 *
 * Cada elemento tem a caixa 3D no mundo: a caixa local de cada malha (num `Float32Array`, em cache por versão da geometria)
 * levada ao mundo pela matriz da malha e unida entre as malhas do elemento. Os 8 cantos da caixa vão para NDC com a câmera,
 * tudo em arrays tipados, sem alocar objeto por elemento; o elemento entra se a caixa projetada está TODA dentro do
 * retângulo (janela, arrasto da esquerda para a direita) ou se INTERSECTA o retângulo (cruzamento, da direita para a esquerda).
 *
 * Limites deliberados: a caixa projetada é o retângulo envolvente dos cantos (não a silhueta exata); um elemento que
 * cruza o plano próximo da câmera (alguns cantos atrás dela) não tem projeção confiável, então entra no cruzamento e
 * fica de fora da janela; um elemento com todos os cantos atrás da câmera fica de fora.
 */

/** Janela (dentro do retângulo) ou cruzamento (toca o retângulo), como na planta e no corte. */
export type ModoSelecaoPorCaixa3d = 'janela' | 'cruzamento';

/** Retângulo em coordenadas normalizadas do dispositivo (−1..1), com `x0`/`y0` nas pontas do arrasto. */
export interface RetanguloNdc {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Abaixo disto o canto está no plano da câmera ou atrás dela (w da projeção). */
const W_MINIMO = 1e-9;

// ---- caixas locais por elemento, por malha (cache por versão da geometria) ----

/** Caixas locais dos elementos de uma malha: `ids[i]` tem a caixa `caixas[6i .. 6i+5]` = minx, miny, minz, maxx, maxy, maxz. */
export interface CaixasDaMalha {
  ids: Id[];
  caixas: Float32Array;
}

/**
 * Caixa local de cada elemento a partir das faixas: a união dos vértices de todos os intervalos do índice do elemento.
 * Pura (sem three.js). Elemento sem vértices fica com min > max (vazia). `posicao` é o array de posições (`passo` números
 * por vértice, a partir de `deslocamento`).
 */
export function caixasPorElemento(faixas: readonly ElementRange[], indice: ArrayLike<number>, posicao: ArrayLike<number>, passo = 3, deslocamento = 0): CaixasDaMalha {
  const slot = new Map<Id, number>();
  const ids: Id[] = [];
  for (const r of faixas) {
    if (!slot.has(r.id)) {
      slot.set(r.id, ids.length);
      ids.push(r.id);
    }
  }
  const caixas = new Float32Array(ids.length * 6);
  for (let i = 0; i < ids.length; i++) {
    caixas[6 * i] = caixas[6 * i + 1] = caixas[6 * i + 2] = Infinity;
    caixas[6 * i + 3] = caixas[6 * i + 4] = caixas[6 * i + 5] = -Infinity;
  }
  for (const r of faixas) {
    const b = 6 * slot.get(r.id)!;
    let x0 = caixas[b]!;
    let y0 = caixas[b + 1]!;
    let z0 = caixas[b + 2]!;
    let x1 = caixas[b + 3]!;
    let y1 = caixas[b + 4]!;
    let z1 = caixas[b + 5]!;
    const fim = Math.min(r.start + r.count, indice.length);
    for (let k = r.start; k < fim; k++) {
      const o = indice[k]! * passo + deslocamento;
      const x = posicao[o]!;
      const y = posicao[o + 1]!;
      const z = posicao[o + 2]!;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      if (z < z0) z0 = z;
      if (z > z1) z1 = z;
    }
    caixas[b] = x0;
    caixas[b + 1] = y0;
    caixas[b + 2] = z0;
    caixas[b + 3] = x1;
    caixas[b + 4] = y1;
    caixas[b + 5] = z1;
  }
  return { ids, caixas };
}

interface CacheDasCaixas {
  versao: number;
  faixas: ElementRange[];
  dados: CaixasDaMalha;
}

const cacheDasMalhas = new WeakMap<THREE.BufferGeometry, CacheDasCaixas>();

/** Caixas locais dos elementos da malha, em cache por versão da geometria e lista de faixas. `null` sem posição. */
function caixasDaMalha(geo: THREE.BufferGeometry, index: THREE.BufferAttribute, faixas: ElementRange[]): CaixasDaMalha | null {
  const versao = Number(geo.userData.versao ?? 0);
  const guardado = cacheDasMalhas.get(geo);
  if (guardado && guardado.versao === versao && guardado.faixas === faixas) return guardado.dados;
  const pos = geo.getAttribute('position') as THREE.BufferAttribute | THREE.InterleavedBufferAttribute | undefined;
  if (!pos) return null;
  const intercalado = (pos as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute === true;
  const array = pos.array as ArrayLike<number>;
  const passo = intercalado ? (pos as THREE.InterleavedBufferAttribute).data.stride : pos.itemSize;
  const deslocamento = intercalado ? (pos as THREE.InterleavedBufferAttribute).offset : 0;
  const dados = caixasPorElemento(faixas, index.array as ArrayLike<number>, array, passo, deslocamento);
  cacheDasMalhas.set(geo, { versao, faixas, dados });
  return dados;
}

// ---- acúmulo no mundo e projeção (arrays tipados) ----

/** Caixas no mundo, unidas por id entre as malhas: `ids[i]` tem `mundo[6i .. 6i+5]`. */
class CaixasNoMundo {
  ids: Id[] = [];
  mundo = new Float64Array(6 * 256);
  private slot = new Map<Id, number>();

  /** Une a caixa (min, max) ao elemento `id`. */
  unir(id: Id, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): void {
    const s = this.slot.get(id);
    if (s === undefined) {
      const novo = this.ids.length;
      this.slot.set(id, novo);
      this.ids.push(id);
      if (6 * (novo + 1) > this.mundo.length) {
        const maior = new Float64Array(this.mundo.length * 2);
        maior.set(this.mundo);
        this.mundo = maior;
      }
      const n = 6 * novo;
      this.mundo[n] = x0;
      this.mundo[n + 1] = y0;
      this.mundo[n + 2] = z0;
      this.mundo[n + 3] = x1;
      this.mundo[n + 4] = y1;
      this.mundo[n + 5] = z1;
      return;
    }
    const n = 6 * s;
    const m = this.mundo;
    if (x0 < m[n]!) m[n] = x0;
    if (y0 < m[n + 1]!) m[n + 1] = y0;
    if (z0 < m[n + 2]!) m[n + 2] = z0;
    if (x1 > m[n + 3]!) m[n + 3] = x1;
    if (y1 > m[n + 4]!) m[n + 4] = y1;
    if (z1 > m[n + 5]!) m[n + 5] = z1;
  }

  get quantidade(): number {
    return this.ids.length;
  }
}

/** Caixa local `i` levada ao mundo pela matriz `e` (16 números, coluna a coluna): o envolvente dos 8 cantos. Escreve em `saida[0..5]`. */
function caixaNoMundo(e: ArrayLike<number>, caixas: Float32Array, i: number, saida: Float64Array): void {
  let x0 = Infinity;
  let y0 = Infinity;
  let z0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  let z1 = -Infinity;
  const b = 6 * i;
  for (let c = 0; c < 8; c++) {
    const x = caixas[b + (c & 1 ? 3 : 0)]!;
    const y = caixas[b + (c & 2 ? 4 : 1)]!;
    const z = caixas[b + (c & 4 ? 5 : 2)]!;
    const w = 1 / (e[3]! * x + e[7]! * y + e[11]! * z + e[15]!);
    const X = (e[0]! * x + e[4]! * y + e[8]! * z + e[12]!) * w;
    const Y = (e[1]! * x + e[5]! * y + e[9]! * z + e[13]!) * w;
    const Z = (e[2]! * x + e[6]! * y + e[10]! * z + e[14]!) * w;
    if (X < x0) x0 = X;
    if (X > x1) x1 = X;
    if (Y < y0) y0 = Y;
    if (Y > y1) y1 = Y;
    if (Z < z0) z0 = Z;
    if (Z > z1) z1 = Z;
  }
  saida[0] = x0;
  saida[1] = y0;
  saida[2] = z0;
  saida[3] = x1;
  saida[4] = y1;
  saida[5] = z1;
}

/**
 * Índices (em ordem) das caixas do mundo (`mundo`, 6 números por caixa) cuja projeção com `pv` (projeção × vista, 16 números
 * coluna a coluna) passa no retângulo `r` (já normalizado), conforme o modo. Pura e sem alocação por caixa.
 */
export function indicesNaCaixaDaTela(mundo: ArrayLike<number>, quantidade: number, pv: ArrayLike<number>, r: RetanguloNdc, modo: ModoSelecaoPorCaixa3d): number[] {
  const out: number[] = [];
  for (let i = 0; i < quantidade; i++) {
    const b = 6 * i;
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    let frente = 0;
    for (let c = 0; c < 8; c++) {
      const x = mundo[b + (c & 1 ? 3 : 0)]!;
      const y = mundo[b + (c & 2 ? 4 : 1)]!;
      const z = mundo[b + (c & 4 ? 5 : 2)]!;
      const w = pv[3]! * x + pv[7]! * y + pv[11]! * z + pv[15]!;
      if (w <= W_MINIMO) continue;
      frente++;
      const nx = (pv[0]! * x + pv[4]! * y + pv[8]! * z + pv[12]!) / w;
      const ny = (pv[1]! * x + pv[5]! * y + pv[9]! * z + pv[13]!) / w;
      if (nx < x0) x0 = nx;
      if (nx > x1) x1 = nx;
      if (ny < y0) y0 = ny;
      if (ny > y1) y1 = ny;
    }
    // Todos os cantos atrás da câmera: fora. Cantos atrás não têm projeção: o envolvente é o dos da frente e a caixa não
    // está inteira na frente (entra no cruzamento, não na janela).
    if (frente === 0) continue;
    const toca = x1 >= r.x0 && x0 <= r.x1 && y1 >= r.y0 && y0 <= r.y1;
    const dentro = x0 >= r.x0 && x1 <= r.x1 && y0 >= r.y0 && y1 <= r.y1;
    const passa = frente === 8 ? (modo === 'janela' ? dentro : toca) : modo === 'cruzamento' && toca;
    if (passa) out.push(i);
  }
  return out;
}

/**
 * Ids dos elementos da cena cuja caixa projetada passa no retângulo, conforme o modo. Só entram elementos visíveis:
 * a malha e os ancestrais têm de estar `visible`, exceto as malhas de picking das caixas instanciadas (`userData.caixasPick`),
 * que ficam invisíveis de propósito e valem como visíveis quando o grupo do nível está visível. Malhas sem `userData.ranges`
 * são ignoradas. Ordem: a da primeira aparição na cena.
 */
export function idsNaCaixaDaTela(
  scene: THREE.Object3D,
  camera: THREE.Camera,
  retanguloNdc: RetanguloNdc,
  modo: ModoSelecaoPorCaixa3d,
): Id[] {
  scene.updateMatrixWorld(true);
  camera.updateMatrixWorld(true);
  const acumulado = new CaixasNoMundo();
  const caixa = new Float64Array(6);
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    const faixas = mesh.userData.ranges as ElementRange[] | undefined;
    const geo = mesh.geometry as THREE.BufferGeometry | undefined;
    const index = geo?.index;
    if (!mesh.isMesh || !faixas || !index || !geo || !faixas.length) return;
    if (!visivelNaCena(mesh)) return;
    const locais = caixasDaMalha(geo, index, faixas);
    if (!locais) return;
    const e = mesh.matrixWorld.elements;
    const identidade = ehIdentidade(e);
    const c = locais.caixas;
    for (let i = 0; i < locais.ids.length; i++) {
      const b = 6 * i;
      if (c[b]! > c[b + 3]!) continue;
      if (identidade) acumulado.unir(locais.ids[i]!, c[b]!, c[b + 1]!, c[b + 2]!, c[b + 3]!, c[b + 4]!, c[b + 5]!);
      else {
        caixaNoMundo(e, c, i, caixa);
        acumulado.unir(locais.ids[i]!, caixa[0]!, caixa[1]!, caixa[2]!, caixa[3]!, caixa[4]!, caixa[5]!);
      }
    }
  });

  const pv = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).elements;
  const dentroDe = indicesNaCaixaDaTela(acumulado.mundo, acumulado.quantidade, pv, normalizado(retanguloNdc), modo);
  return dentroDe.map((i) => acumulado.ids[i]!);
}

function ehIdentidade(e: ArrayLike<number>): boolean {
  for (let i = 0; i < 16; i++) if (e[i] !== (i % 5 === 0 ? 1 : 0)) return false;
  return true;
}

/** Visível na cena: a própria malha (salvo a de picking das caixas) e todos os ancestrais. */
function visivelNaCena(mesh: THREE.Object3D): boolean {
  if (!mesh.visible && mesh.userData.caixasPick !== true) return false;
  for (let p: THREE.Object3D | null = mesh.parent; p; p = p.parent) {
    if (!p.visible) return false;
  }
  return true;
}

/** Retângulo com `x0 ≤ x1` e `y0 ≤ y1`, a partir das pontas do arrasto. */
function normalizado(r: RetanguloNdc): RetanguloNdc {
  return { x0: Math.min(r.x0, r.x1), y0: Math.min(r.y0, r.y1), x1: Math.max(r.x0, r.x1), y1: Math.max(r.y0, r.y1) };
}
