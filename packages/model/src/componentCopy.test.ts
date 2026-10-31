import { describe, expect, it } from 'vitest';
import {
  ProjectStore,
  createEmptyProject,
  defaultRampTypeId,
  defaultStairTypeId,
  makeRamp,
  makeStair,
  type Ramp,
  type Stair,
  type StairCurve,
  type StairLanding,
  type StairRun,
} from './index.ts';

const curve = (ax: number, ay: number, bx: number, by: number): StairCurve => ({ a: { x: ax, y: ay }, b: { x: bx, y: by }, sag: 0 });

const run = (id: string): StairRun => ({
  id,
  kind: 'run',
  boundaryLeft: [curve(0, 0, 0, 3)],
  boundaryRight: [curve(1, 0, 1, 3)],
  risers: [curve(0, 0, 1, 0)],
  path: [],
});

const landing = (id: string): StairLanding => ({
  id,
  kind: 'landing',
  boundary: [curve(0, 3, 0, 4), curve(0, 4, 1, 4), curve(1, 4, 1, 3), curve(1, 3, 0, 3)],
});

function storeWithComponents(): ProjectStore {
  const s = new ProjectStore(createEmptyProject());
  s.exec({
    type: 'addStair',
    stair: makeStair({ id: 'st1', typeId: defaultStairTypeId, levelId: 'lv_0', components: [run('r1'), landing('p1'), run('r2')] }),
  });
  s.exec({
    type: 'addRamp',
    ramp: makeRamp({ id: 'rp1', typeId: defaultRampTypeId, levelId: 'lv_0', components: [run('rc1'), landing('rcp1')] }),
  });
  return s;
}

const componentIds = (e: Stair | Ramp): string[] => e.components.map((c) => c.id);

describe('cópia por transformação: ids dos componentes do croqui', () => {
  it('escada copiada reminta os componentes (prefixos r/p) sem repetir os ids do original', () => {
    const s = storeWithComponents();
    s.exec({
      type: 'transform',
      ids: ['st1'],
      transform: { kind: 'translate', d: { x: 5, y: 0 } },
      copy: { idMap: { st1: 'st2' } },
    });
    const original = s.project.elements['st1'] as Stair;
    const copia = s.project.elements['st2'] as Stair;
    expect(componentIds(original)).toEqual(['r1', 'p1', 'r2']);
    expect(componentIds(copia)).toHaveLength(3);
    expect(new Set(componentIds(copia)).size).toBe(3);
    for (const id of componentIds(copia)) expect(componentIds(original)).not.toContain(id);
    // Prefixos iguais aos do Copiar/Colar: lance 'r', patamar 'p'.
    expect(componentIds(copia)[0]).toMatch(/^r_/);
    expect(componentIds(copia)[1]).toMatch(/^p_/);
  });

  it('rampa copiada reminta os componentes com prefixo rc', () => {
    const s = storeWithComponents();
    s.exec({
      type: 'transform',
      ids: ['rp1'],
      transform: { kind: 'translate', d: { x: 5, y: 0 } },
      copy: { idMap: { rp1: 'rp2' } },
    });
    const original = s.project.elements['rp1'] as Ramp;
    const copia = s.project.elements['rp2'] as Ramp;
    expect(componentIds(original)).toEqual(['rc1', 'rcp1']);
    expect(componentIds(copia)).toHaveLength(2);
    expect(new Set(componentIds(copia)).size).toBe(2);
    for (const id of componentIds(copia)) {
      expect(componentIds(original)).not.toContain(id);
      expect(id).toMatch(/^rc_/);
    }
  });

  it('escada e rampa copiadas juntas não colidem entre si', () => {
    const s = storeWithComponents();
    s.exec({
      type: 'transform',
      ids: ['st1', 'rp1'],
      transform: { kind: 'translate', d: { x: 5, y: 0 } },
      copy: { idMap: { st1: 'st2', rp1: 'rp2' } },
    });
    const escada = componentIds(s.project.elements['st2'] as Stair);
    const rampa = componentIds(s.project.elements['rp2'] as Ramp);
    const todos = [...escada, ...rampa];
    expect(new Set(todos).size).toBe(todos.length);
  });

  it('mover sem cópia mantém os ids dos componentes', () => {
    const s = storeWithComponents();
    s.exec({ type: 'transform', ids: ['st1', 'rp1'], transform: { kind: 'translate', d: { x: 1, y: 1 } } });
    expect(componentIds(s.project.elements['st1'] as Stair)).toEqual(['r1', 'p1', 'r2']);
    expect(componentIds(s.project.elements['rp1'] as Ramp)).toEqual(['rc1', 'rcp1']);
  });
});
