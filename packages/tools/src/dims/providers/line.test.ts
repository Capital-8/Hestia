import { describe, expect, it } from 'vitest';
import { arcFromSagitta } from '@hestia/geom';
import { createEmptyProject, dimensionSettingsOf, floorViewId, ProjectStore, roofViewId, viewAnnotationsOf } from '@hestia/model';
import { detailLineDimProvider, perimeterLineDimProvider } from './line.ts';
import type { DimContext } from '../types.ts';

function projectWithLine(): ProjectStore {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'addDetailLine', levelId: 'lv_0', item: { id: 'dl1', a: { x: 1, y: 2 }, b: { x: 4, y: 6 } } });
  return s;
}

const ctxOf = (s: ProjectStore, levelId = 'lv_0'): DimContext => ({
  project: s.project,
  levelId,
  settings: dimensionSettingsOf(s.project),
  overrides: {},
});

describe('provedor de cotas da linha de detalhe', () => {
  it('mede o comprimento e seleciona a linha do nível ativo', () => {
    const s = projectWithLine();
    const [dim] = detailLineDimProvider.compute(ctxOf(s), { lineId: 'dl1' });
    expect(dim?.value).toBeCloseTo(5, 9);
    expect(detailLineDimProvider.selectionSubject!(s.project, 'dl1', 'lv_0')).toEqual({ lineId: 'dl1' });
    expect(detailLineDimProvider.selectionSubject!(s.project, 'dl1', 'lv_1')).toBeNull();
    expect(detailLineDimProvider.selectionSubject!(s.project, 'nada', 'lv_0')).toBeNull();
  });

  it('editar move o fim na direção atual; valor inválido não muda nada', () => {
    const s = projectWithLine();
    const [dim] = detailLineDimProvider.compute(ctxOf(s), { lineId: 'dl1' });
    const r = dim!.edit!(10);
    expect('commands' in r && r.commands[0]).toMatchObject({
      type: 'updateDetailLine',
      levelId: 'lv_0',
      id: 'dl1',
      patch: { b: { x: 7, y: 10 } },
    });
    expect(dim!.edit!(0)).toEqual({ error: expect.stringContaining('maior que zero') });
  });
});

describe('provedor de cotas do trecho do Perímetro', () => {
  it('cota cada trecho, usando o arco quando há flecha', () => {
    const s = projectWithLine();
    const dims = perimeterLineDimProvider.compute(ctxOf(s), {
      segs: [
        { id: 's1', a: { x: 0, y: 0 }, b: { x: 3, y: 0 } },
        { id: 's2', a: { x: 0, y: 0 }, b: { x: 2, y: 0 }, sag: 1 },
      ],
    });
    expect(dims.map((d) => d.key)).toEqual(['perimeter:s1', 'perimeter:s2']);
    expect(dims[0]!.value).toBeCloseTo(3, 9);
    expect(dims[1]!.value).toBeCloseTo(arcFromSagitta({ x: 0, y: 0 }, { x: 2, y: 0 }, 1)!.length, 9);
    expect(dims[1]!.value).toBeGreaterThan(2);
    expect(dims.every((d) => d.edit === undefined)).toBe(true);
  });

  it('trecho sem comprimento não gera cota', () => {
    const s = projectWithLine();
    expect(perimeterLineDimProvider.compute(ctxOf(s), { segs: [{ id: 'z', a: { x: 1, y: 1 }, b: { x: 1, y: 1 } }] })).toEqual([]);
  });
});

describe('linha de detalhe: distância lateral até a paralela', () => {
  const add = (s: ProjectStore, id: string, ay: number, by = ay) =>
    s.exec({ type: 'addDetailLine', levelId: 'lv_0', item: { id, a: { x: 0, y: ay }, b: { x: 5, y: by } } });

  it('mede até a paralela mais próxima de cada lado e ignora a transversal', () => {
    const s = new ProjectStore(createEmptyProject());
    add(s, 'dl', 0);
    add(s, 'up', 2);
    add(s, 'up2', 6);
    add(s, 'dn', -1.5);
    add(s, 'x', 1, 4);
    const dims = detailLineDimProvider.compute(ctxOf(s), { lineId: 'dl' });
    expect(dims.map((d) => [d.key.split(':')[2], d.value])).toEqual([['left', 1.5], ['right', 2]]);
  });

  it('ida e volta: digitar v deixa exatamente v', () => {
    for (const v of [0.3, 2, 7]) {
      const s = new ProjectStore(createEmptyProject());
      add(s, 'dl', 0);
      add(s, 'up', 2);
      const dim = detailLineDimProvider.compute(ctxOf(s), { lineId: 'dl' })[0]!;
      const r = dim.edit!(v);
      if (!('commands' in r)) throw new Error('esperava comandos');
      s.exec(r.commands[0]!);
      expect(detailLineDimProvider.compute(ctxOf(s), { lineId: 'dl' })[0]!.value).toBeCloseTo(v, 9);
      expect(dim.edit!(0)).toEqual({ error: expect.stringContaining('maior que zero') });
    }
  });
});

describe('linha de detalhe da cobertura', () => {
  it('é achada na vista da cobertura, a edição leva o viewId e o piso não é tocado', () => {
    const s = projectWithLine();
    s.exec({ type: 'addDetailLine', levelId: 'lv_0', viewId: roofViewId('lv_0'), item: { id: 'dlc', a: { x: 0, y: 0 }, b: { x: 3, y: 0 } } });
    expect(detailLineDimProvider.selectionSubject!(s.project, 'dlc', 'lv_0')).toEqual({ lineId: 'dlc' });
    const [dim] = detailLineDimProvider.compute(ctxOf(s), { lineId: 'dlc' });
    expect(dim?.value).toBeCloseTo(3, 9);
    const r = dim!.edit!(5);
    if (!('commands' in r)) throw new Error('sem comandos');
    expect(r.commands[0]).toMatchObject({ type: 'updateDetailLine', levelId: 'lv_0', viewId: roofViewId('lv_0'), id: 'dlc' });
    s.exec(r.commands[0]!);
    expect(viewAnnotationsOf(s.project, roofViewId('lv_0')).detailLines[0]!.b).toEqual({ x: 5, y: 0 });
    expect(viewAnnotationsOf(s.project, floorViewId('lv_0')).detailLines[0]!.b).toEqual({ x: 4, y: 6 });
  });

  it('a cota paralela só considera as linhas da mesma vista', () => {
    const s = projectWithLine();
    s.exec({ type: 'addDetailLine', levelId: 'lv_0', viewId: roofViewId('lv_0'), item: { id: 'c1', a: { x: 0, y: 0 }, b: { x: 3, y: 0 } } });
    s.exec({ type: 'addDetailLine', levelId: 'lv_0', item: { id: 'p1', a: { x: 0, y: 1 }, b: { x: 3, y: 1 } } });
    // c1 está sozinha na cobertura (p1 é do piso): sem paralela vizinha, cai no comprimento da própria linha.
    const dims = detailLineDimProvider.compute(ctxOf(s), { lineId: 'c1' });
    expect(dims).toHaveLength(1);
    expect(dims[0]!.key).toContain(':length');
  });
});
