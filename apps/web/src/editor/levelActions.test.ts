import { describe, expect, it } from 'vitest';
import { planRamp, resolveRamps, type RampPlan } from '@hestia/engine';
import {
  ProjectStore,
  createEmptyProject,
  defaultStairTypeId,
  makeFloor,
  makeStair,
  makeWall,
  stairBaseZ,
  stairTopZ,
  type Floor,
  type Ramp,
  type Stair,
  type StairCurve,
  type StairLanding,
  type StairRun,
  type Wall,
} from '@hestia/model';
import { levelBearingIds, moveLevel, moveToLevel, pinAutoTops, readLevelKeep, writeLevelKeep } from './levelActions.ts';

const square = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }];

function store(): ProjectStore {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'addWall', wall: makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 3, y: 0 } }) });
  s.exec({ type: 'addWall', wall: makeWall({ id: 'w2', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 1 }, b: { x: 3, y: 1 } }) });
  s.exec({ type: 'addFloor', floor: makeFloor({ id: 'f1', typeId: 'ft_ceram', levelId: 'lv_0', boundary: square }) });
  return s;
}

describe('moveToLevel (F6: Mover para o nível)', () => {
  it('move a seleção em um passo e informa a contagem no singular e no plural', () => {
    const s = store();
    const r = moveToLevel(s, ['w1', 'w2', 'f1'], 'lv_1', 'elevation', 'lv_1');
    expect(r).toEqual({ ok: true, moved: 3, message: '3 elementos movidos para Pavimento 2. Ctrl+Z desfaz.' });
    expect((s.project.elements.w1 as Wall).levelId).toBe('lv_1');
    expect((s.project.elements.f1 as Floor).levelId).toBe('lv_1');
    s.undo();
    expect((s.project.elements.w1 as Wall).levelId).toBe('lv_0');
    expect((s.project.elements.f1 as Floor).levelId).toBe('lv_0');
    const um = moveToLevel(s, ['w1'], 'lv_1', 'offset', 'lv_1');
    expect(um.message).toBe('1 elemento movido para Pavimento 2. Ctrl+Z desfaz.');
  });

  it('ids repetidos contam uma vez na mensagem', () => {
    const s = store();
    expect(moveToLevel(s, ['w1', 'w1'], 'lv_1', 'elevation', 'lv_1').message).toBe('1 elemento movido para Pavimento 2. Ctrl+Z desfaz.');
  });

  it('avisa quando o nível novo não é o da vista, sem mudar a vista', () => {
    const s = store();
    const r = moveToLevel(s, ['w1'], 'lv_1', 'elevation', 'lv_0');
    expect(r.message).toBe('1 elemento movido para Pavimento 2, fora do nível da vista. Ctrl+Z desfaz.');
  });

  it('ignora aberturas da seleção (acompanham a parede) e diz isso', () => {
    const s = store();
    const r = moveToLevel(s, ['w1', 'nao_existe_aberta'], 'lv_1', 'elevation', 'lv_1');
    expect(r.moved).toBe(1);
    expect(levelBearingIds(s.project, ['w1', 'nao_existe_aberta'])).toEqual(['w1']);
  });

  it('seleção vazia ou só de aberturas não faz nada', () => {
    const s = store();
    s.exec({ type: 'addOpening', opening: { id: 'd1', kind: 'door', typeId: 'ot_p80', hostId: 'w1', offset: 1, flipHand: false, flipFacing: false, sillOverride: null, mark: '' } });
    expect(moveToLevel(s, [], 'lv_1', 'elevation', 'lv_0')).toMatchObject({ ok: false, moved: 0 });
    expect(moveToLevel(s, ['d1'], 'lv_1', 'elevation', 'lv_0')).toMatchObject({ ok: false, moved: 0 });
    expect(s.undoLabel).toBe('Inserir porta');
  });

  it('nível inexistente é recusado e nada muda', () => {
    const s = store();
    const r = moveToLevel(s, ['w1'], 'lv_x', 'elevation', 'lv_0');
    expect(r).toMatchObject({ ok: false, moved: 0, message: 'Nível inexistente.' });
    expect((s.project.elements.w1 as Wall).levelId).toBe('lv_0');
  });

  it('elementos já no nível dado não são contados nem geram passo de desfazer', () => {
    const s = store();
    const before = s.undoLabel;
    const r = moveToLevel(s, ['w1'], 'lv_0', 'elevation', 'lv_0');
    expect(r).toMatchObject({ ok: true, moved: 0, message: 'Já está em Térreo.' });
    expect(s.undoLabel).toBe(before);
  });
});

describe('moveLevel (editar a cota reajusta escadas e rampas — decisão 0041)', () => {
  const curve = (ax: number, ay: number, bx: number, by: number): StairCurve => ({ a: { x: ax, y: ay }, b: { x: bx, y: by }, sag: 0 });

  /** Lance reto de 16 espelhos (15 pisos de 0,28 m) entre x=0 e x=1. */
  const run16 = (): StairRun => ({
    id: 'r1',
    kind: 'run',
    boundaryLeft: [curve(0, 0, 0, 4.2)],
    boundaryRight: [curve(1, 0, 1, 4.2)],
    risers: Array.from({ length: 16 }, (_, i) => curve(0, i * 0.28, 1, i * 0.28)),
    path: [],
  });

  function stairStore(topLevelId: string | null = 'lv_1'): ProjectStore {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'addStair', stair: makeStair({ id: 'st1', typeId: defaultStairTypeId, levelId: 'lv_0', topLevelId, components: [run16()] }) });
    return s;
  }

  const stairOf = (s: ProjectStore): Stair => s.project.elements.st1 as Stair;
  const risersOf = (s: ProjectStore): number => (stairOf(s).components[0] as StairRun).risers.length;

  it('subir o nível de topo acrescenta espelhos em vez de invalidar a escada, em um passo de desfazer', () => {
    const s = stairStore();
    const r = moveLevel(s, 'lv_1', 3.2);
    expect(r).toMatchObject({ ok: true, adjusted: 1, invalid: 0 });
    expect(risersOf(s)).toBe(18);
    expect(stairTopZ(s.project, stairOf(s)) - stairBaseZ(s.project, stairOf(s))).toBeCloseTo(3.2, 9);
    expect(r.message).toContain('1 escada/rampa reajustada');
    s.undo();
    expect(s.project.levels.find((l) => l.id === 'lv_1')!.elevation).toBe(3);
    expect(risersOf(s)).toBe(16);
  });

  it('sem espaço para o espelho (topo no mesmo nível ou abaixo), a escada continua existindo e é contada como inválida', () => {
    const s = stairStore();
    const r = moveLevel(s, 'lv_0', 3.5);
    expect(r).toMatchObject({ ok: true, adjusted: 0, invalid: 1 });
    expect(s.project.elements.st1).toBeDefined();
    expect(stairTopZ(s.project, stairOf(s)) - stairBaseZ(s.project, stairOf(s))).toBeLessThan(0);
    expect(r.message).toContain('sem altura válida');
  });

  it('com "manter altura", compensa o deslocamento e preserva a cota do topo', () => {
    const s = stairStore();
    const r = moveLevel(s, 'lv_1', 3.2, true);
    expect(r).toMatchObject({ ok: true, adjusted: 0, invalid: 0 });
    expect(stairOf(s).topOffset).toBeCloseTo(-0.2, 9);
    expect(stairTopZ(s.project, stairOf(s))).toBeCloseTo(3, 9);
    expect(risersOf(s)).toBe(16);
  });

  it('fixa o topo automático no nível que era o de cima antes de mexer na cota', () => {
    const s = stairStore(null);
    expect(stairOf(s).topLevelId).toBeNull();
    moveLevel(s, 'lv_1', 3.2);
    expect(stairOf(s).topLevelId).toBe('lv_1');
  });

  it('pinAutoTops fixa todas as escadas/rampas de topo automático', () => {
    const s = stairStore(null);
    expect(pinAutoTops(s)).toBe(1);
    expect(stairOf(s).topLevelId).toBe('lv_1');
    expect(pinAutoTops(s)).toBe(0);
  });

  it('rampa no modo slope: subir o nível de topo regenera o comprimento para manter a inclinação', () => {
    const type = createEmptyProject().rampTypes.rmt_nbr9050!;
    const plan = planRamp({ start: { x: 0, y: 0 }, dir: { x: 1, y: 0 }, H: 3, type, shape: 'straight', turn: 'left', width: 1.5, mode: 'slope', slope: 1 / 12 });
    if ('error' in plan) throw new Error(plan.error);
    const comps = (p: RampPlan): Array<StairRun | StairLanding> =>
      p.parts.map((c, i) => (c.kind === 'run' ? { id: `c${i}`, kind: 'run', ...c.run } : { id: `c${i}`, kind: 'landing', ...c.landing }));
    const s = new ProjectStore(createEmptyProject());
    s.exec({
      type: 'addRamp',
      ramp: {
        id: 'rp1', kind: 'ramp', typeId: type.id, levelId: 'lv_0', topLevelId: 'lv_1',
        baseOffset: 0, topOffset: 0, height: 0.8, components: comps(plan),
        shape: 'straight', turn: 'left', landingDepth: 1.5, inputMode: 'slope', slopeTarget: 1 / 12,
        openingMode: 'headroom', openingHeadroom: null, openingMargin: 0.05, openingRect: false, mark: '', comments: '',
      },
    });
    const before = resolveRamps(s.project)[0]!;
    const r = moveLevel(s, 'lv_1', 3.6);
    expect(r).toMatchObject({ ok: true, adjusted: 1, invalid: 0 });
    const after = resolveRamps(s.project)[0]!;
    expect(after.pathLength).toBeGreaterThan(before.pathLength);
    expect(after.slope).toBeCloseTo(1 / 12, 6);
    expect((s.project.elements.rp1 as Ramp).components).not.toEqual(comps(plan));
  });
});

describe('preferência "Ao trocar" (memorizada no navegador)', () => {
  it('sem armazenamento (ambiente sem localStorage) vale manter a cota e não lança', () => {
    expect(readLevelKeep()).toBe('elevation');
    expect(() => writeLevelKeep('offset')).not.toThrow();
  });
});
