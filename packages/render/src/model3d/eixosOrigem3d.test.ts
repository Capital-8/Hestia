import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ProjectStore, createEmptyProject, type Project } from '@hestia/model';
import { EixosDaOrigem3d, escalaDosEixos } from './eixosOrigem3d.ts';
import { ModelScene } from './scene3d.ts';
import { pickElement } from './pick3d.ts';

const vazio = (): Project => new ProjectStore(createEmptyProject()).project;
const cenaVazia = (): ModelScene => {
  const ms = new ModelScene({ instanciar: false });
  ms.update(vazio(), [], { edges: false, shadows: false, dark: false });
  return ms;
};

describe('EixosDaOrigem3d', () => {
  it('tem 3 linhas X vermelho, Y verde e Z azul', () => {
    const e = new EixosDaOrigem3d();
    const linhas = e.group.children as THREE.LineSegments[];
    expect(linhas).toHaveLength(3);
    expect(linhas.map((l) => '#' + (l.material as THREE.LineBasicMaterial).color.getHexString())).toEqual(['#e5484d', '#30a46c', '#3e63dd']);
    expect(linhas.every((l) => (l.material as THREE.LineBasicMaterial).depthTest === false && l.renderOrder >= 1000)).toBe(true);
  });

  it('o eixo Z aponta para cima do mundo do projeto (+Z, como o up da câmera) e X/Y ficam no plano horizontal', () => {
    const e = new EixosDaOrigem3d();
    const ponta = (l: THREE.LineSegments): number[] => Array.from((l.geometry.getAttribute('position') as THREE.BufferAttribute).array).slice(3, 6);
    expect(ponta(e.x)).toEqual([1, 0, 0]);
    expect(ponta(e.y)).toEqual([0, 1, 0]);
    expect(ponta(e.z)).toEqual([0, 0, 1]);
    expect(ponta(e.z)).toEqual(new THREE.Vector3(0, 0, 1).toArray());
    const cena = cenaVazia();
    expect(cena.orbit.perspective.up.toArray()).toEqual([0, 0, 1]);
  });

  it('não é pickável: raycast vazio', () => {
    const e = new EixosDaOrigem3d();
    const rc = new THREE.Raycaster(new THREE.Vector3(0.5, 0, 5), new THREE.Vector3(0, 0, -1));
    rc.params.Line.threshold = 10;
    expect(rc.intersectObject(e.group, true)).toEqual([]);
  });

  it('desligado não desenha (invisível) e não escala', () => {
    const e = new EixosDaOrigem3d();
    expect(e.visivel).toBe(false);
    e.atualizar(new THREE.PerspectiveCamera(), 600);
    expect(e.group.scale.x).toBe(1);
    e.definir(true);
    expect(e.visivel).toBe(true);
  });

  it('tamanho constante na tela: perspectiva a 10 m, fov 38, tela de 800 px, 80 px = 0,8 * visível/10', () => {
    const cam = new THREE.PerspectiveCamera(60, 1);
    cam.position.set(0, -10, 0);
    // altura visível = 2 * 10 * tan(30°) = 11,547 m; 80/800 = 0,1 -> 1,1547 m
    expect(escalaDosEixos(cam, 800)).toBeCloseTo(1.1547, 4);
    cam.position.set(0, -20, 0);
    expect(escalaDosEixos(cam, 800)).toBeCloseTo(2.3094, 4);
    const o = new THREE.OrthographicCamera(-5, 5, 4, -4, 0.1, 100);
    expect(escalaDosEixos(o, 800)).toBeCloseTo(0.8, 9);
  });
});

describe('eixos da origem na cena', () => {
  it('ficam fora do modelo e do enquadramento: o fit de projeto vazio é o mesmo ligado ou desligado', () => {
    const ms = cenaVazia();
    ms.fit();
    const alvo = ms.orbit.target.toArray();
    const dist = ms.orbit.distance;
    ms.eixosOrigem.definir(true);
    ms.eixosOrigem.group.scale.setScalar(1000);
    expect(ms.bounds().isEmpty()).toBe(true);
    ms.fit();
    expect(ms.orbit.target.toArray()).toEqual(alvo);
    expect(ms.orbit.distance).toBe(dist);
    expect(ms.eixosOrigem.group.parent).toBe(ms.scene);
    expect(ms.eixosOrigem.group.parent).not.toBe(ms.scene.children.find((c) => c.name === 'model'));
  });

  it('o picking de elementos não os acerta (projeto vazio, raio sobre o eixo)', () => {
    const ms = cenaVazia();
    ms.eixosOrigem.definir(true);
    ms.scene.updateMatrixWorld(true);
    const cam = new THREE.PerspectiveCamera(38, 1, 0.05, 100);
    cam.up.set(0, 0, 1);
    cam.position.set(0, -6, 0.5);
    cam.lookAt(0, 0, 0.5);
    cam.updateMatrixWorld(true);
    expect(pickElement(ms.scene, cam, { x: 0, y: 0 })).toBeNull();
  });
});
