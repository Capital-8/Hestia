import { describe, expect, it } from 'vitest';
import { ProjectStore, buildTemplate, createEmptyProject, defaultStairTypeId, makeStair, type Stair, type StairRun } from '@hestia/model';
import { keptStairType, patchStairs, stairBox, stairNote } from './stairActions.ts';

const curve = (ax: number, ay: number, bx: number, by: number) => ({ a: { x: ax, y: ay }, b: { x: bx, y: by }, sag: 0 });
const run = (): StairRun => ({
  id: 'r1',
  kind: 'run',
  boundaryLeft: [curve(0, 0, 0, 3)],
  boundaryRight: [curve(1.2, 0, 1.2, 3)],
  risers: [curve(0, 0.5, 1.2, 0.5), curve(0, 1, 1.2, 1)],
  path: [],
});

function withStair(): ProjectStore {
  const store = new ProjectStore(buildTemplate('house2'));
  store.exec({ type: 'addStair', stair: makeStair({ id: 'st1', typeId: 'stt_monolitica', levelId: 'lv_0', components: [run()] }) });
  return store;
}

describe('caixa e pontos da escada', () => {
  it('envolve os limites e os espelhos (0 a 1,2 em x; 0 a 3 em y)', () => {
    const s = withStair().project.elements.st1 as Stair;
    expect(stairBox(s)).toEqual({ minX: 0, minY: 0, maxX: 1.2, maxY: 3 });
  });

  it('escada sem geometria não tem caixa', () => {
    const s = makeStair({ id: 's', typeId: 'stt_monolitica', levelId: 'lv_0' }) as Stair;
    expect(stairBox({ ...s, order: 0 })).toBeNull();
  });
});

describe('edição em transação única', () => {
  it('alterar vários campos de uma escada volta com um só desfazer', () => {
    const store = withStair();
    patchStairs(store, ['st1'], { baseOffset: 0.2, topOffset: -0.1, mark: 'E-01', openingMode: 'none' }, 'Editar escada');
    expect(store.project.elements.st1).toMatchObject({ baseOffset: 0.2, topOffset: -0.1, mark: 'E-01', openingMode: 'none' });
    store.undo();
    expect(store.project.elements.st1).toMatchObject({ baseOffset: 0, topOffset: 0, mark: '', openingMode: 'headroom' });
  });

  it('lista vazia não grava nada', () => {
    const store = withStair();
    const before = store.project.nextOrder;
    patchStairs(store, [], { mark: 'x' });
    expect(store.project.nextOrder).toBe(before);
  });

  it('mudar o deslocamento do topo estica o lance pela fórmula, mantendo os espelhos (decisão 0041)', () => {
    const store = new ProjectStore(createEmptyProject());
    const curve = (ax: number, ay: number, bx: number, by: number) => ({ a: { x: ax, y: ay }, b: { x: bx, y: by }, sag: 0 });
    const run18: StairRun = {
      id: 'r1',
      kind: 'run',
      boundaryLeft: [curve(0, 0, 0, 4.76)],
      boundaryRight: [curve(1, 0, 1, 4.76)],
      risers: Array.from({ length: 18 }, (_, i) => curve(0, i * 0.28, 1, i * 0.28)),
      path: [],
    };
    store.exec({ type: 'addStair', stair: makeStair({ id: 'st1', typeId: defaultStairTypeId, levelId: 'lv_0', topLevelId: 'lv_1', components: [run18] }) });
    const lastBefore = (run18.risers[17]!.a.y);
    patchStairs(store, ['st1'], { topOffset: -0.1 }, 'Editar escada');
    const after = (store.project.elements.st1 as Stair).components[0] as StairRun;
    expect(after.risers).toHaveLength(18);
    expect(after.risers[17]!.a.y).toBeGreaterThan(lastBefore);
    expect(after.risers[17]!.a.y - after.risers[0]!.a.y).toBeCloseTo(17 * (0.63 - 2 * (2.9 / 18)), 5);
    store.undo();
    const back = (store.project.elements.st1 as Stair).components[0] as StairRun;
    expect(back.risers).toHaveLength(18);
    expect(back.risers[17]!.a.y).toBeCloseTo(lastBefore, 9);
  });
});

describe('nota da barra do croqui', () => {
  it('o 1º erro tem prioridade (cor de erro) sobre avisos', () => {
    const st = { firstError: 'Espelhos se cruzam.', issues: [{ severity: 'warning' as const, code: 'w', message: 'aviso', }, { severity: 'error' as const, code: 'e', message: 'x' }] };
    expect(stairNote({ ...st, firstError: 'Espelhos se cruzam.' })).toEqual({ tone: 'error', text: 'Espelhos se cruzam.' });
  });

  it('sem erro, mostra o 1º aviso; sem nada, null', () => {
    expect(stairNote({ firstError: null, issues: [{ severity: 'warning', code: 'w', message: 'Largura menor.' }] })).toEqual({ tone: 'warning', text: 'Largura menor.' });
    expect(stairNote({ firstError: null, issues: [] })).toBeNull();
  });
});

describe('tipo mostrado na interface', () => {
  it('mantém o escolhido se existe, senão o primeiro do projeto', () => {
    const p = withStair().project;
    expect(keptStairType(p, 'stt_piso_espelho')).toBe('stt_piso_espelho');
    expect(keptStairType(p, 'stt_removido')).toBe('stt_monolitica');
    expect(keptStairType(p, null)).toBe('stt_monolitica');
  });
});
