import { describe, expect, it } from 'vitest';
import { multiArea } from '@hestia/geom';
import { resolveFloors } from '@hestia/engine';
import { ProjectStore, createEmptyProject, makeFloor, makeWall, totalThickness, type Floor } from '@hestia/model';
import { outlineReferenceOf, outlineView, runOutlineAction, runOutlineReference, type OutlineHolder } from './OutlineGroup.tsx';

const linked = (id: string, mode: 'walls-finish' | 'walls-core' | 'perimeter' = 'walls-finish'): OutlineHolder => ({ id, outlineSource: { mode, seed: { x: 1, y: 1 }, linked: true } });
const stat = (id: string): OutlineHolder => ({ id, outlineSource: { mode: 'walls-finish', seed: { x: 1, y: 1 }, linked: false } });
const croqui = (id: string): OutlineHolder => ({ id });

describe('grupo Contorno do piso e da laje (decisão 0023 §8.2)', () => {
  it('vinculado mostra o modo e habilita só Desvincular', () => {
    const v = outlineView([linked('f1', 'walls-core')]);
    expect(v.text).toBe('Vinculado às paredes (modo: núcleo)');
    expect(v.detachIds).toEqual(['f1']);
    expect(v.relinkIds).toEqual([]);
  });

  it('estático (editado à mão) habilita só Revincular às paredes', () => {
    const v = outlineView([stat('f1')]);
    expect(v.text).toBe('Estático (editado à mão)');
    expect(v.relinkIds).toEqual(['f1']);
    expect(v.detachIds).toEqual([]);
  });

  it('piso desenhado por croqui (sem origem) fica sem vínculo e com os botões desabilitados', () => {
    const v = outlineView([croqui('f1')]);
    expect(v.text).toBe('Sem vínculo (desenhado por croqui)');
    expect(v.detachIds).toEqual([]);
    expect(v.relinkIds).toEqual([]);
  });

  it('seleção mista: separa os ids de cada ação e nomeia modos variados', () => {
    const v = outlineView([linked('a', 'walls-finish'), linked('b', 'perimeter'), stat('c'), croqui('d')]);
    expect(v.text).toBe('Vinculado às paredes (modos variados) · Estático (editado à mão) · Sem vínculo (desenhado por croqui)');
    expect(v.detachIds).toEqual(['a', 'b']);
    expect(v.relinkIds).toEqual(['c']);
  });

  it('Desvincular em vários pisos é um passo só de desfazer', () => {
    const store = new ProjectStore(createEmptyProject());
    for (const id of ['f1', 'f2']) {
      store.exec({ type: 'addFloor', floor: makeFloor({ id, typeId: 'ft_ceram', levelId: 'lv_0', boundary: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }], outlineSource: { mode: 'walls-finish', seed: { x: 0.5, y: 0.5 }, linked: true } }) });
    }
    runOutlineAction(store, 'detach', ['f1', 'f2']);
    expect((store.project.elements.f1 as Floor).outlineSource!.linked).toBe(false);
    expect((store.project.elements.f2 as Floor).outlineSource!.linked).toBe(false);
    store.undo();
    expect((store.project.elements.f1 as Floor).outlineSource!.linked).toBe(true);
    expect((store.project.elements.f2 as Floor).outlineSource!.linked).toBe(true);
  });

  it('Revincular volta a acompanhar, com um passo de desfazer; lista vazia não faz nada', () => {
    const store = new ProjectStore(createEmptyProject());
    store.exec({ type: 'addFloor', floor: makeFloor({ id: 'f1', typeId: 'ft_ceram', levelId: 'lv_0', boundary: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }], outlineSource: { mode: 'walls-finish', seed: { x: 0.5, y: 0.5 }, linked: true } }) });
    runOutlineAction(store, 'detach', ['f1']);
    const before = store.project;
    runOutlineAction(store, 'relink', []);
    expect(store.project).toBe(before);
    runOutlineAction(store, 'relink', ['f1']);
    expect((store.project.elements.f1 as Floor).outlineSource!.linked).toBe(true);
    store.undo();
    expect((store.project.elements.f1 as Floor).outlineSource!.linked).toBe(false);
  });

  it('T-F: Seguir base/topo grava a referência dos vinculados num passo só de desfazer; igual ao atual não faz nada', () => {
    const store = new ProjectStore(createEmptyProject());
    const boundary = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }];
    store.exec({ type: 'addFloor', floor: makeFloor({ id: 'f1', typeId: 'ft_ceram', levelId: 'lv_0', boundary, outlineSource: { mode: 'perimeter', seed: { x: 0.5, y: 0.5 }, linked: true } }) });
    store.exec({ type: 'addFloor', floor: makeFloor({ id: 'f2', typeId: 'ft_ceram', levelId: 'lv_0', boundary, outlineSource: { mode: 'walls-core', seed: { x: 0.5, y: 0.5 }, linked: true, reference: 'top' } }) });
    store.exec({ type: 'addFloor', floor: makeFloor({ id: 'f3', typeId: 'ft_ceram', levelId: 'lv_0', boundary, outlineSource: { mode: 'walls-core', seed: { x: 0.5, y: 0.5 }, linked: false } }) });
    const els = ['f1', 'f2'].map((id) => store.project.elements[id] as Floor);
    expect(outlineReferenceOf(els)).toBeNull();
    runOutlineReference(store, ['f1', 'f2', 'f3'], 'top');
    const ref = (id: string) => (store.project.elements[id] as Floor).outlineSource!.reference;
    expect(ref('f1')).toBe('top');
    expect(ref('f2')).toBe('top');
    expect(ref('f3')).toBeUndefined();
    expect((store.project.elements.f2 as Floor).outlineSource!.mode).toBe('walls-core');
    const before = store.project;
    runOutlineReference(store, ['f1', 'f2'], 'top');
    expect(store.project).toBe(before);
    store.undo();
    expect(ref('f1')).toBeUndefined();
    expect(ref('f2')).toBe('top');
  });

  it('Desvincular congela o circuito visto: mover parede depois não muda a área; revincular volta a acompanhar', () => {
    const store = new ProjectStore(createEmptyProject());
    const seg = (id: string, a: { x: number; y: number }, b: { x: number; y: number }) => store.exec({ type: 'addWall', wall: makeWall({ id, typeId: 'wt_alv14', levelId: 'lv_0', a, b }) });
    seg('wb', { x: 0, y: 0 }, { x: 4, y: 0 });
    seg('wr', { x: 4, y: 0 }, { x: 4, y: 3 });
    seg('wt', { x: 4, y: 3 }, { x: 0, y: 3 });
    seg('wl', { x: 0, y: 3 }, { x: 0, y: 0 });
    store.exec({ type: 'addFloor', floor: makeFloor({ id: 'f1', typeId: 'ft_ceram', levelId: 'lv_0', boundary: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }], outlineSource: { mode: 'walls-finish', seed: { x: 2, y: 1.5 }, linked: true } }) });
    const t = totalThickness(store.project.wallTypes.wt_alv14!);
    const area = (): number => multiArea(resolveFloors(store.project, 'lv_0').find((r) => r.floorId === 'f1')!.polygon);
    const moveRight = (x: number) => {
      store.exec({ type: 'updateElements', ids: ['wr'], patch: { a: { x, y: 0 }, b: { x, y: 3 } } });
      store.exec({ type: 'updateElements', ids: ['wb'], patch: { b: { x, y: 0 } } });
      store.exec({ type: 'updateElements', ids: ['wt'], patch: { a: { x, y: 3 } } });
    };
    moveRight(5);
    expect(area()).toBeCloseTo((5 - t) * (3 - t), 6);
    runOutlineAction(store, 'detach', ['f1']);
    const solto = area();
    expect(solto).toBeCloseTo((5 - t) * (3 - t), 6);
    moveRight(6);
    expect(area()).toBeCloseTo(solto, 6);
    runOutlineAction(store, 'relink', ['f1']);
    expect(area()).toBeCloseTo((6 - t) * (3 - t), 6);
  });
});
