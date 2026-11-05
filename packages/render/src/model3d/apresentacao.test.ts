import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createEmptyProject, makeWall, view3dOf, type Project, type SheetView3DCamera } from '@hestia/model';
import { resolveLevel } from '@hestia/engine';
import { ehElementoDeApresentacao, type MetadadosDeObjeto } from './apresentacao.ts';
import { ModelScene } from './scene3d.ts';

const CAM: SheetView3DCamera = { azimuth: 0.6, elevation: 0.45, distance: 12, target: { x: 2, y: 1, z: 1 }, ortho: false };

function obj(partial: Partial<MetadadosDeObjeto> = {}): MetadadosDeObjeto {
  return { type: 'Mesh', visible: true, userData: {}, parent: null, ...partial };
}

describe('ehElementoDeApresentacao (regra única do modo apresentação)', () => {
  it('T1: datum de nível, grade, chão, picking, realce e auxiliar não passam', () => {
    expect(ehElementoDeApresentacao(obj({ type: 'Group', userData: { levels: true } }))).toBe(false);
    expect(ehElementoDeApresentacao(obj({ userData: { levelsPlane: true } }))).toBe(false);
    expect(ehElementoDeApresentacao(obj({ userData: { chaoDeSombra: true } }))).toBe(false);
    expect(ehElementoDeApresentacao(obj({ type: 'GridHelper' }))).toBe(false);
    expect(ehElementoDeApresentacao(obj({ type: 'AxesHelper' }))).toBe(false);
    expect(ehElementoDeApresentacao(obj({ userData: { caixasPick: true }, visible: true }))).toBe(false);
    expect(ehElementoDeApresentacao(obj({ userData: { reveal: true }, type: 'LineSegments' }))).toBe(false);
    expect(ehElementoDeApresentacao(obj({ userData: { helper: true } }))).toBe(false);
    expect(ehElementoDeApresentacao(obj({ visible: false }))).toBe(false);
  });

  it('T1b: um filho de um grupo marcado (datum) também não passa, nem com visible=true', () => {
    const pai = obj({ type: 'Group', userData: { levels: true } });
    expect(ehElementoDeApresentacao(obj({ parent: pai }))).toBe(false);
  });

  it('T2: parede e piso do usuário passam (malha visível, sem marca, com pai de modelo)', () => {
    const modelo = obj({ type: 'Group', userData: {} });
    const parede = obj({ type: 'Mesh', parent: modelo, userData: { kind: 'wall', ranges: [] } });
    const piso = obj({ type: 'InstancedMesh', parent: modelo, userData: { kind: 'floor' } });
    expect(ehElementoDeApresentacao(parede)).toBe(true);
    expect(ehElementoDeApresentacao(piso)).toBe(true);
  });
});

function parede(): Project {
  const p = createEmptyProject();
  const w = makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } });
  p.elements[w.id] = { ...w, order: 1 };
  return p;
}

describe('exportarCenaDeRender usa a mesma regra (T3)', () => {
  it('um helper dentro do modelo não entra no snapshot', () => {
    const p = parede();
    const realista: Project = { ...p, view3d: { ...view3dOf(p), style: 'realistic', shadows: true, edges: true } };
    const cena = new ModelScene();
    try {
      cena.update(realista, p.levels.map((l) => resolveLevel(realista, l.id)), { dark: false, edges: true, shadows: true });
      const sem = cena.exportarCenaDeRender({ camera: CAM, aspect: 16 / 9 });
      // Malha de auxiliar dentro do modelo (fora da regra): não pode aumentar a geometria exportada.
      const modelo = (cena as unknown as { model: THREE.Group }).model;
      const helper = new THREE.Mesh(new THREE.BoxGeometry(50, 50, 50), new THREE.MeshBasicMaterial());
      helper.userData = { helper: true };
      modelo.add(helper);
      const marcado = new THREE.Mesh(new THREE.BoxGeometry(60, 60, 60), new THREE.MeshBasicMaterial());
      marcado.userData = { reveal: true };
      modelo.add(marcado);
      const com = cena.exportarCenaDeRender({ camera: CAM, aspect: 16 / 9 });
      expect(com.indices.length).toBe(sem.indices.length);
      expect(com.positions.length).toBe(sem.positions.length);
      expect(com.batches.length).toBe(sem.batches.length);
    } finally {
      cena.dispose();
    }
  });

  it('modoApresentacao(true) esconde o que não é construção dentro do modelo e restaura ao sair', () => {
    const p = parede();
    const realista: Project = { ...p, view3d: { ...view3dOf(p), style: 'realistic', shadows: true, edges: true } };
    const cena = new ModelScene();
    try {
      cena.update(realista, p.levels.map((l) => resolveLevel(realista, l.id)), { dark: false, edges: true, shadows: true });
      const modelo = (cena as unknown as { model: THREE.Group }).model;
      const marcado = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
      marcado.userData = { reveal: true };
      modelo.add(marcado);
      cena.modoApresentacao(true);
      expect(marcado.visible).toBe(false);
      expect(ehElementoDeApresentacao(marcado)).toBe(false);
      cena.modoApresentacao(false);
      expect(marcado.visible).toBe(true);
    } finally {
      cena.dispose();
    }
  });
});
