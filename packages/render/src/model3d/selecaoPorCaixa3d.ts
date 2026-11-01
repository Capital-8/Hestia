import * as THREE from 'three';
import type { Id } from '@hestia/model';
import type { ElementRange } from './solids.ts';
import { caixaDoIntervaloNoMundo, intervalosDeDesenho } from './indiceDeElementos3d.ts';

/**
 * Seleção por caixa na vista 3D (arrasto com Selecionar e Ctrl+A). Função pura: lê a cena e a câmera, não muda nada.
 *
 * Cada elemento tem a caixa 3D no mundo (união das caixas dos seus intervalos, em cache por versão da geometria). Os 8
 * cantos da caixa vão para NDC com a câmera; o elemento entra se a caixa projetada está TODA dentro do retângulo (janela,
 * arrasto da esquerda para a direita) ou se INTERSECTA o retângulo (cruzamento, da direita para a esquerda).
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
  const caixas = new Map<Id, THREE.Box3>();
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    const faixas = mesh.userData.ranges as ElementRange[] | undefined;
    const geo = mesh.geometry as THREE.BufferGeometry | undefined;
    const index = geo?.index;
    if (!mesh.isMesh || !faixas || !index || !geo || !faixas.length) return;
    if (!visivelNaCena(mesh)) return;
    const porId = new Map<Id, ElementRange[]>();
    for (const r of faixas) {
      const atual = porId.get(r.id);
      if (atual) atual.push(r);
      else porId.set(r.id, [r]);
    }
    for (const [id, rs] of porId) {
      const caixa = caixaDoElementoNoMundo(geo, index, rs, mesh.matrixWorld);
      if (!caixa) continue;
      const acumulada = caixas.get(id);
      if (acumulada) acumulada.union(caixa);
      else caixas.set(id, caixa);
    }
  });

  const pv = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  const r = normalizado(retanguloNdc);
  const out: Id[] = [];
  for (const [id, caixa] of caixas) {
    const proj = projetarCaixa(caixa, pv);
    if (!proj) continue;
    const passa = proj.todaNaFrente
      ? modo === 'janela'
        ? dentro(proj.ndc, r)
        : intersecta(proj.ndc, r)
      : modo === 'cruzamento' && intersecta(proj.ndc, r);
    if (passa) out.push(id);
  }
  return out;
}

/** Visível na cena: a própria malha (salvo a de picking das caixas) e todos os ancestrais. */
function visivelNaCena(mesh: THREE.Object3D): boolean {
  if (!mesh.visible && mesh.userData.caixasPick !== true) return false;
  for (let p: THREE.Object3D | null = mesh.parent; p; p = p.parent) {
    if (!p.visible) return false;
  }
  return true;
}

/**
 * Caixa no mundo de um elemento numa malha: a união das caixas dos seus intervalos (`caixaDoIntervaloNoMundo`, em cache
 * por versão). `null` quando não há vértices.
 */
function caixaDoElementoNoMundo(geo: THREE.BufferGeometry, index: THREE.BufferAttribute, faixas: readonly ElementRange[], matriz: THREE.Matrix4): THREE.Box3 | null {
  const box = new THREE.Box3();
  for (const s of intervalosDeDesenho(faixas)) {
    const c = caixaDoIntervaloNoMundo(geo, index, s.start, s.count, matriz);
    if (c) box.union(c);
  }
  return box.isEmpty() ? null : box;
}

interface Projecao {
  /** Retângulo envolvente, em NDC, dos cantos projetados. */
  ndc: RetanguloNdc;
  /** Todos os 8 cantos estão na frente da câmera (a projeção é confiável). */
  todaNaFrente: boolean;
}

const CANTOS = [0, 1, 2, 3, 4, 5, 6, 7] as const;
const canto = new THREE.Vector4();

/**
 * Projeta os 8 cantos da caixa com a matriz `pv` (projeção × vista). Devolve null quando todos estão atrás da câmera.
 * Com a câmera ortográfica, w é 1 em todos os cantos e a conta é a mesma.
 */
function projetarCaixa(caixa: THREE.Box3, pv: THREE.Matrix4): Projecao | null {
  const { min, max } = caixa;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  let frente = 0;
  for (const i of CANTOS) {
    canto.set(i & 1 ? max.x : min.x, i & 2 ? max.y : min.y, i & 4 ? max.z : min.z, 1).applyMatrix4(pv);
    if (canto.w <= W_MINIMO) continue;
    frente++;
    const x = canto.x / canto.w;
    const y = canto.y / canto.w;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  if (frente === 0) return null;
  // Cantos atrás da câmera não têm projeção: o envolvente é o dos cantos da frente, e a caixa não está inteira na frente.
  return { ndc: { x0, y0, x1, y1 }, todaNaFrente: frente === CANTOS.length };
}

/** Retângulo com `x0 ≤ x1` e `y0 ≤ y1`, a partir das pontas do arrasto. */
function normalizado(r: RetanguloNdc): RetanguloNdc {
  return { x0: Math.min(r.x0, r.x1), y0: Math.min(r.y0, r.y1), x1: Math.max(r.x0, r.x1), y1: Math.max(r.y0, r.y1) };
}

/** A projeção inteira está dentro do retângulo (janela). */
function dentro(p: RetanguloNdc, r: RetanguloNdc): boolean {
  return p.x0 >= r.x0 && p.x1 <= r.x1 && p.y0 >= r.y0 && p.y1 <= r.y1;
}

/** A projeção toca o retângulo (cruzamento). */
function intersecta(p: RetanguloNdc, r: RetanguloNdc): boolean {
  return p.x1 >= r.x0 && p.x0 <= r.x1 && p.y1 >= r.y0 && p.y0 <= r.y1;
}
