import * as THREE from 'three';
import type { View3DSettings } from '@hestia/model';
import type { ElementRange } from './solids.ts';
import type { Materiais3D } from './materiais3d.ts';
import type { LoteDeMassas } from './massa3d.ts';

/**
 * Desenho da massa no 3D (A.3 decisão 2, A.8 item 6): a geometria do lote com um material por massa (cor da massa ou padrão neutro), transparente
 * a 0,35, sem escrita de profundidade e em ordem posterior aos opacos, como o vidro da cortina (`cortinaGrupo3d.ts`). Assim a massa não esconde o que
 * está atrás dela e não treme com as lajes. A faixa de cada massa vai em `userData.ranges` (seleção, realce e picking, decisão 0016).
 */

/** Ordem de desenho da massa: depois dos opacos (renderOrder 0) e do vidro (4). */
export const ORDEM_MASSA = 6;
/** Opacidade da massa no 3D (A.3, decisão 2). */
export const OPACIDADE_MASSA = 0.35;
/** Cor da massa que não tem `color`. */
export const COR_NEUTRA_MASSA = '#b8c4d0';

/**
 * Material de uma massa: o da face da categoria `mass` (estilo, tema, cor e meio-tom da vista, `Materiais3D.face`) com a transparência da massa. A
 * transparência da categoria (`overrides.mass.transparency`) soma-se à da massa: a opacidade é `OPACIDADE_MASSA · (1 − transparência)`.
 */
export function materialDaMassa(mats: Materiais3D, view: View3DSettings, cor: string | undefined): THREE.Material {
  const base = mats.face(undefined, 'mass', cor ?? COR_NEUTRA_MASSA);
  const t = Math.min(1, Math.max(0, view.overrides.mass.transparency));
  const opacidade = OPACIDADE_MASSA * (1 - t);
  return mats.cached(`massa-material|${base.uuid}|${opacidade}`, () => {
    const m = base.clone();
    m.transparent = true;
    m.opacity = opacidade;
    m.depthWrite = false;
    return m;
  });
}

/** Um material por faixa do lote, na ordem das faixas (cor de cada massa, `undefined` = padrão). */
export function materiaisDoLote(mats: Materiais3D, view: View3DSettings, cores: ReadonlyArray<string | undefined>): THREE.Material[] {
  return cores.map((c) => materialDaMassa(mats, view, c));
}

/** Geometria do lote: posições, normais e índices, com um grupo de material por faixa (o índice do grupo é a posição da faixa). */
export function geometriaDoLoteDeMassas(l: LoteDeMassas): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(l.positions, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(l.normals, 3));
  g.setIndex(new THREE.BufferAttribute(l.indices, 1));
  l.faixas.forEach((f, i) => g.addGroup(f.start, f.count, i));
  return g;
}

/** Malha do lote: uma só, com um material por grupo. Sem sombra (a massa é translúcida); a faixa de cada massa fica em `userData.ranges`. */
export function malhaDeMassas(geo: THREE.BufferGeometry, materiais: THREE.Material[], faixas: readonly ElementRange[]): THREE.Mesh {
  const mesh = new THREE.Mesh(geo, materiais);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.renderOrder = ORDEM_MASSA;
  mesh.userData = { kind: 'mass', ranges: [...faixas] };
  return mesh;
}

/**
 * Reserva sem kernel: o contorno da base da massa em linhas (`contornoDaBase`). Não é pick nem realce: só mostra onde a massa está enquanto o
 * kernel não entrega a malha (A.5, "Kernel desligado ou com erro").
 */
export function reservaDaBase(segmentos: Float32Array, linhas: THREE.Material): THREE.LineSegments {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(segmentos, 3));
  const l = new THREE.LineSegments(g, linhas);
  l.frustumCulled = false;
  l.userData = { kind: 'mass', reserva: true };
  return l;
}
