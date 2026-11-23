import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { resolveLevel, type ResolvedLevel } from '@hestia/engine';
import { buildTemplate, view3dOf, type Element, type Material, type Project } from '@hestia/model';
import { Materiais3D } from './materiais3d.ts';
import { ModelScene, viewComTons, type Scene3DOptions } from './scene3d.ts';

/**
 * Apresentação da disciplina no 3D (plano de UX de 2026-11-23): material transparente por opacidade, cor clareada e
 * referência (`halftone`) fora do picking. Valores literais da ficha.
 */

const BASE: Scene3DOptions = { edges: false, shadows: false, dark: false };

function cena(p: Project, opt: Partial<Scene3DOptions> = {}): ModelScene {
  const levels: ResolvedLevel[] = p.levels.map((l) => resolveLevel(p, l.id));
  const ms = new ModelScene({ instanciar: false });
  ms.update(p, levels, { ...BASE, ...opt });
  return ms;
}

function malhas(ms: ModelScene): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  const modelo = ms.scene.children.find((c): c is THREE.Group => c instanceof THREE.Group)!;
  modelo.traverse((o) => {
    if (o instanceof THREE.Mesh) out.push(o);
  });
  return out;
}

describe('Materiais3D.face com apresentação', () => {
  const material = { id: 'mat_teste', color: '#ff0000' } as unknown as Material;

  it('opaco: sem apresentação o material continua opaco e com a cor do material', () => {
    const mats = new Materiais3D();
    mats.marco = { view: view3dOf({}), dark: false };
    const m = mats.face(material, 'wall') as THREE.MeshStandardMaterial;
    expect(m.opacity).toBe(1);
    expect(m.transparent).toBe(false);
    expect(m.depthWrite).toBe(true);
    expect(m.color.getHexString()).toBe('ff0000');
  });

  it('transparente: clareamento 0,5 e opacidade 0,5 misturam a cor com o papel e desligam o depthWrite', () => {
    const mats = new Materiais3D();
    mats.marco = { view: view3dOf({}), dark: false, apresentacoes: { wall: { tone: 'normal', clareamento: 0.5, opacidade: 0.5 } } };
    const m = mats.face(material, 'wall') as THREE.MeshStandardMaterial;
    expect(m.color.getHexString()).toBe('ff8080');
    expect(m.opacity).toBe(0.5);
    expect(m.transparent).toBe(true);
    expect(m.depthWrite).toBe(false);
  });
});

describe('viewComTons com apresentação', () => {
  it('aplica o tom halftone e combina a opacidade com a transparência da vista', () => {
    const view = viewComTons(view3dOf({}), undefined, { wall: { tone: 'halftone', clareamento: 0.2, opacidade: 0.5 } });
    expect(view.overrides.wall.halftone).toBe(true);
    expect(view.overrides.wall.transparency).toBe(0.5);
  });

  it('sem apresentação, devolve a mesma vista', () => {
    const base = view3dOf({});
    expect(viewComTons(base)).toBe(base);
  });
});

describe('cena 3D com apresentação', () => {
  it('parede halftone/0,5 fica transparente e fora do picking; outra categoria continua selecionável', () => {
    const p = buildTemplate('house2');
    const parede = Object.values(p.elements).find((e): e is Element => e.kind === 'wall')!;
    const porta = Object.values(p.elements).find((e): e is Element => e.kind === 'door')!;
    const ms = cena(p, { apresentacoes: { wall: { tone: 'halftone', clareamento: 0.2, opacidade: 0.5 } } });
    const paredes = malhas(ms).filter((m) => m.userData.kind === 'wall');
    expect(paredes.length).toBeGreaterThan(0);
    for (const m of paredes) {
      const mat = m.material as THREE.MeshStandardMaterial;
      expect(mat.opacity).toBe(0.5);
      expect(mat.transparent).toBe(true);
      expect(mat.depthWrite).toBe(false);
    }
    expect(ms.selectionBounds([parede.id])).toBeNull();
    expect(ms.selectionBounds([porta.id])).not.toBeNull();
  });

  it('normal/opacidade 0,5 é translúcido (não é referência) e continua no picking', () => {
    const p = buildTemplate('house2');
    const parede = Object.values(p.elements).find((e): e is Element => e.kind === 'wall')!;
    const ms = cena(p, { apresentacoes: { wall: { tone: 'normal', opacidade: 0.5 } } });
    const m = malhas(ms).find((x) => x.userData.kind === 'wall')!;
    expect((m.material as THREE.MeshStandardMaterial).opacity).toBe(0.5);
    expect(ms.selectionBounds([parede.id])).not.toBeNull();
  });
});
