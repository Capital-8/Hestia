import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { FAMILIA_ARMARIO, createEmptyProject, type Component, type Corpo, type Familia, type Project } from '@hestia/model';
import { buildComponentSolids } from './componentSolids.ts';
import { pickElement } from './pick3d.ts';

/*
 * Pick 3D de corpos (ficha B5): o triângulo do corpo carrega a faixa do id da INSTÂNCIA (`ofElement` em componentSolids),
 * então o raio que atravessa o tubo devolve o id da instância, como as peças. Tubo Ø100 × 1000 mm em pé, instância em (2, 3).
 */

const tubo = (): Corpo => ({
  id: 'tubo',
  nome: 'Tubo',
  papel: 'tubo',
  forma: { tipo: 'extrusao', perfil: { tipo: 'circulo', diametro: '100' }, comprimento: '1000' },
  quadro: { origem: ['0', '0', '0'] },
});

function projeto(): { p: Project; levelId: string } {
  const p = createEmptyProject('t');
  const familia: Familia = { ...structuredClone(FAMILIA_ARMARIO), id: 'tubo-l', pecas: [], corpos: [tubo()] };
  p.componentFamilies = { 'tubo-l': familia };
  const levelId = p.levels[0]!.id;
  const comp: Component = {
    id: 'c1', kind: 'component', familyId: 'tubo-l', typeId: null, levelId, order: 1, x: 2, y: 3, z: 0, rotation: 0, mirrored: false, mark: 'c1',
  };
  p.elements[comp.id] = comp;
  return { p, levelId };
}

/** Cena só com as malhas dos corpos, montadas como a cena do modelo: `ranges` = faixas por elemento de cada lote. */
function cenaDosCorpos(p: Project, levelId: string): THREE.Scene {
  const scene = new THREE.Scene();
  for (const lote of buildComponentSolids(p, levelId)) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(Array.from(lote.positions), 3));
    if (lote.normals) g.setAttribute('normal', new THREE.Float32BufferAttribute(Array.from(lote.normals), 3));
    g.setIndex(Array.from(lote.indices));
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
    m.userData = { kind: lote.category, ranges: lote.ids };
    scene.add(m);
  }
  return scene;
}

/** Câmera de lado, olhando de −y para +y, a 5 m de distância, à altura do meio do tubo. */
function ladoCamera(): THREE.PerspectiveCamera {
  const cam = new THREE.PerspectiveCamera(40, 1, 0.1, 500);
  cam.position.set(2, -5, 0.5);
  cam.up.set(0, 0, 1);
  cam.lookAt(2, 3, 0.5);
  cam.updateMatrixWorld();
  return cam;
}

/** Coordenadas normalizadas (−1..1) do ponto do mundo na câmera. */
const ndcDe = (cam: THREE.Camera, x: number, y: number, z: number): { x: number; y: number } => {
  const v = new THREE.Vector3(x, y, z).project(cam);
  return { x: v.x, y: v.y };
};

describe('pickElement com corpos (ficha B5, 3D)', () => {
  it('raio que atravessa o tubo seleciona a instância, na face voltada para a câmera', () => {
    const { p, levelId } = projeto();
    const cam = ladoCamera();
    const hit = pickElement(cenaDosCorpos(p, levelId), cam, ndcDe(cam, 2, 3, 0.5));
    expect(hit?.id).toBe('c1');
    // Face de −y do cilindro: y = 3 − 0,05 m.
    expect(hit?.point.y).toBeCloseTo(2.95, 2);
  });

  it('raio ao lado do tubo (20 cm além do raio) não seleciona nada', () => {
    const { p, levelId } = projeto();
    const cam = ladoCamera();
    expect(pickElement(cenaDosCorpos(p, levelId), cam, ndcDe(cam, 2.2, 3, 0.5))).toBeNull();
  });

  it('família sem corpos não gera malha de corpos: o pick é o de sempre', () => {
    const { p, levelId } = projeto();
    const sem = { ...p, componentFamilies: { 'tubo-l': { ...structuredClone(FAMILIA_ARMARIO), id: 'tubo-l', pecas: [] } } } as Project;
    const cam = ladoCamera();
    expect(pickElement(cenaDosCorpos(sem, levelId), cam, ndcDe(cam, 2, 3, 0.5))).toBeNull();
  });
});
