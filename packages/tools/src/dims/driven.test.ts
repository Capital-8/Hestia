import { describe, expect, it } from 'vitest';
import { createEmptyProject, dimensionValue, makeFloor, makeWall, ProjectStore, type Dimension, type DrivenEdit, type Project } from '@hestia/model';
import { drivenEditCommands } from './driven.ts';

function cena(): ProjectStore {
  const s = new ProjectStore(createEmptyProject());
  const wall = (id: string, a: [number, number], b: [number, number]) =>
    s.exec({ type: 'addWall', wall: makeWall({ id, typeId: 'wt_alv14', levelId: 'lv_0', a: { x: a[0], y: a[1] }, b: { x: b[0], y: b[1] } }) });
  wall('h', [0, 0], [6, 0]);
  wall('p2', [0, 3], [6, 3]); // paralela à hospedeira
  wall('v1', [0, 0], [0, 3]); // liga h e p2 pela ponta esquerda
  s.exec({ type: 'addOpening', opening: { id: 'd1', kind: 'door', typeId: 'ot_p80', hostId: 'h', offset: 3, flipHand: false, flipFacing: false, sillOverride: null, mark: '' } });
  s.exec({ type: 'addOpening', opening: { id: 'd2', kind: 'door', typeId: 'ot_p80', hostId: 'h', offset: 5, flipHand: false, flipFacing: false, sillOverride: null, mark: '' } });
  return s;
}

const dim = (over: Partial<Dimension>): Dimension => ({ id: 'dm', a: { x: 0, y: 0 }, b: { x: 0, y: 0 }, offset: 0.5, ...over });

function apply(s: ProjectStore, r: DrivenEdit): Project {
  if (!r.ok) throw new Error(`recusado: ${r.reason}`);
  expect(r.commands).toHaveLength(1); // um único batch
  s.exec({ type: 'batch', commands: (r.commands[0] as { commands: never[] }).commands });
  return s.project;
}

/** Valor da cota relido pelos elementos (a cota usa pontos da parede via dimensionPoints). */
describe('cota dirigida', () => {
  it('comprimento da parede: estica a ponta b e a parede ligada acompanha', () => {
    const s = cena();
    const d = dim({ a: { x: 0, y: 0 }, b: { x: 6, y: 0 }, refs: { a: { wallId: 'h', end: 'a' }, b: { wallId: 'h', end: 'b' } } });
    // v2 liga na ponta b de h
    s.exec({ type: 'addWall', wall: makeWall({ id: 'v2', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 6, y: 0 }, b: { x: 6, y: 3 } }) });
    const p = apply(s, drivenEditCommands(s.project, d, 4.5));
    expect(dimensionValue(p, d)).toBeCloseTo(4.5, 3);
    const v2 = p.elements.v2 as { a: { x: number } };
    expect(v2.a.x).toBeCloseTo(4.5, 9);
  });

  it('esquadria x eixo da parede (ref genérica): desloca o offset', () => {
    const s = cena();
    // a: início da parede h (x=0); b: centro da porta d1 (x=3)
    const d = dim({
      a: { x: 0, y: 0 },
      b: { x: 3, y: 0 },
      refs: { a: { elementId: 'h', feature: 'wall-axis-a' }, b: { elementId: 'd1', feature: 'opening-center' } } as never,
    });
    const p = apply(s, drivenEditCommands(s.project, d, 2));
    expect((p.elements.d1 as { offset: number }).offset).toBeCloseTo(2, 6);
  });

  it('esquadria: fixed escolhe a ponta que fica, e mesma esquadria nas duas pontas é recusada', () => {
    const s = cena();
    const d = dim({
      a: { x: 3, y: 0 },
      b: { x: 6, y: 0 },
      refs: { a: { elementId: 'd1', feature: 'opening-center' }, b: { elementId: 'h', feature: 'wall-axis-b' } } as never,
    });
    const p = apply(s, drivenEditCommands(s.project, d, 2));
    expect((p.elements.d1 as { offset: number }).offset).toBeCloseTo(4, 6);
    const same = dim({ a: { x: 2.6, y: 0 }, b: { x: 3.4, y: 0 }, refs: { a: { elementId: 'd1', feature: 'opening-edge-a' }, b: { elementId: 'd1', feature: 'opening-edge-b' } } as never });
    expect(drivenEditCommands(s.project, same, 1).ok).toBe(false);
  });

  it('recusa por colisão com outra esquadria e por sair da parede', () => {
    const s = cena();
    const d = dim({
      a: { x: 0, y: 0 },
      b: { x: 3, y: 0 },
      refs: { a: { elementId: 'h', feature: 'wall-axis-a' }, b: { elementId: 'd1', feature: 'opening-center' } } as never,
    });
    const r = drivenEditCommands(s.project, d, 4.8); // bate na porta d2 (offset 5)
    expect(r.ok).toBe(false);
    expect(drivenEditCommands(s.project, d, 0.2).ok).toBe(false); // sai da parede
    expect(dimensionValue(s.project, dim({ a: { x: 0, y: 0 }, b: { x: 3, y: 0 } }))).toBeCloseTo(3, 9);
  });

  it('parede x parede paralela (ref antiga nos eixos, cota vertical): translada p2 e as ligadas esticam', () => {
    const s = cena();
    const d = dim({
      a: { x: 3, y: 0 },
      b: { x: 3, y: 3 },
      mode: 'vertical',
      refs: { a: { wallId: 'h', end: 'a' }, b: { wallId: 'p2', end: 'a' } },
    });
    const p = apply(s, drivenEditCommands(s.project, d, 4));
    expect(dimensionValue(p, d)).toBeCloseTo(4, 3);
    const v1 = p.elements.v1 as { b: { y: number } };
    expect(v1.b.y).toBeCloseTo(4, 9); // esticou em vez de soltar
    const p2 = p.elements.p2 as { a: { y: number } };
    expect(p2.a.y).toBeCloseTo(4, 9);
  });

  it('piso: move o vértice', () => {
    const s = cena();
    s.exec({ type: 'addFloor', floor: makeFloor({ id: 'f1', typeId: 'ft_ceram', levelId: 'lv_0', boundary: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }] }) });
    const d = dim({
      a: { x: 0, y: 0 },
      b: { x: 4, y: 0 },
      refs: { a: { elementId: 'f1', feature: 'vertex', index: 0 }, b: { elementId: 'f1', feature: 'vertex', index: 1 } } as never,
    });
    const p = apply(s, drivenEditCommands(s.project, d, 5));
    expect((p.elements.f1 as { boundary: { x: number }[] }).boundary[1]!.x).toBeCloseTo(5, 9);
  });

  it('recusas: sem refs, valor inválido, angular, elemento removido', () => {
    const s = cena();
    const livre = dim({ a: { x: 0, y: 0 }, b: { x: 2, y: 0 } });
    expect(drivenEditCommands(s.project, livre, 3).ok).toBe(false);
    const d = dim({ a: { x: 0, y: 0 }, b: { x: 6, y: 0 }, refs: { a: { wallId: 'h', end: 'a' }, b: { wallId: 'h', end: 'b' } } });
    for (const v of [0, -1, NaN, Infinity]) expect(drivenEditCommands(s.project, d, v).ok).toBe(false);
    const ang = dim({ ...d, angular: { center: { x: 0, y: 0 }, from: { x: 1, y: 0 }, to: { x: 0, y: 0 }, radius: 1, value: 1.5, side: 'minor' } as never });
    expect(drivenEditCommands(s.project, ang, 1).ok).toBe(false);
    const gone = dim({ ...d, refs: { a: { wallId: 'zz', end: 'a' }, b: { wallId: 'h', end: 'b' } } });
    const r = drivenEditCommands(s.project, gone, 3);
    expect(r.ok).toBe(false);
  });

  it('é puro: não altera o projeto', () => {
    const s = cena();
    const antes = JSON.stringify(s.project);
    const d = dim({ a: { x: 0, y: 0 }, b: { x: 6, y: 0 }, refs: { a: { wallId: 'h', end: 'a' }, b: { wallId: 'h', end: 'b' } } });
    drivenEditCommands(s.project, d, 4);
    expect(JSON.stringify(s.project)).toBe(antes);
  });
});
