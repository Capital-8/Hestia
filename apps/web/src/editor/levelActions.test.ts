import { describe, expect, it } from 'vitest';
import { planRamp, resolveRamps, resolveStairs, stairQuantities, type RampPlan } from '@hestia/engine';
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
import { levelBearingIds, moveLevel, moveToLevel, pinAutoTops, readLevelKeep, riserBandNote, writeLevelKeep } from './levelActions.ts';

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

  /** Lance reto com `n` espelhos, pisos de 0,28 m entre x=0 e x=1. */
  const runN = (n: number): StairRun => ({
    id: 'r1',
    kind: 'run',
    boundaryLeft: [curve(0, 0, 0, (n - 1) * 0.28)],
    boundaryRight: [curve(1, 0, 1, (n - 1) * 0.28)],
    risers: Array.from({ length: n }, (_, i) => curve(0, i * 0.28, 1, i * 0.28)),
    path: [],
  });

  function stairStore(n = 18, topLevelId: string | null = 'lv_1', top = 3): ProjectStore {
    const s = new ProjectStore(createEmptyProject());
    if (top !== 3) s.exec({ type: 'upsertLevel', level: { ...s.project.levels.find((l) => l.id === 'lv_1')!, elevation: top } });
    s.exec({ type: 'addStair', stair: makeStair({ id: 'st1', typeId: defaultStairTypeId, levelId: 'lv_0', topLevelId, components: [runN(n)] }) });
    return s;
  }

  const stairOf = (s: ProjectStore): Stair => s.project.elements.st1 as Stair;
  const runOf = (s: ProjectStore): StairRun => stairOf(s).components[0] as StairRun;
  const risersOf = (s: ProjectStore): number => runOf(s).risers.length;
  const quantities = (s: ProjectStore) => stairQuantities(resolveStairs(s.project).find((x) => x.id === 'st1')!);

  it('subir o nível de topo estica os lances pela fórmula do tipo, mantendo o nº de espelhos, em um passo de desfazer', () => {
    const s = stairStore(18, 'lv_1', 2.8);
    const firstBefore = runOf(s).risers[0]!.a.y;
    const lastBefore = runOf(s).risers[17]!.a.y;
    const r = moveLevel(s, 'lv_1', 3);
    expect(r).toMatchObject({ ok: true, adjusted: 1, invalid: 0 });
    expect(risersOf(s)).toBe(18);
    expect(stairTopZ(s.project, stairOf(s)) - stairBaseZ(s.project, stairOf(s))).toBeCloseTo(3, 9);
    // R = 3 ÷ 18; T = 0,63 − 2R (regra 2R + T do tipo padrão).
    expect(quantities(s).riserHeight).toBeCloseTo(3 / 18, 9);
    expect(quantities(s).treadMean).toBeCloseTo(0.63 - 2 * (3 / 18), 5);
    // O primeiro espelho fica parado; o último estica com o lance.
    expect(runOf(s).risers[0]!.a.y).toBeCloseTo(firstBefore, 9);
    expect(runOf(s).risers[17]!.a.y).toBeGreaterThan(lastBefore);
    expect(runOf(s).risers[17]!.a.y - runOf(s).risers[0]!.a.y).toBeCloseTo(17 * (0.63 - 2 * (3 / 18)), 5);
    expect(r.message).toContain('1 escada/rampa reajustada');
    s.undo();
    expect(s.project.levels.find((l) => l.id === 'lv_1')!.elevation).toBe(2.8);
    expect(risersOf(s)).toBe(18);
    expect(runOf(s).risers[17]!.a.y).toBeCloseTo(lastBefore, 9);
  });

  it('espelho acima do máximo: N sobe, mas agora pede resumo + confirmação antes de gravar (mudança deliberada)', () => {
    // 16 espelhos em 3,2 m dariam R = 0,20 m (> 0,18 m do tipo): N vai para 18 e 2 degraus entram no fim.
    // Antes desta mudança o reajuste era gravado direto; agora, como N muda, devolve o plano sem aplicar nada.
    const s = stairStore(16);
    const pend = moveLevel(s, 'lv_1', 3.2);
    expect(pend).toMatchObject({ ok: true, adjusted: 0, needsDecision: true });
    expect(pend.plan!.conflicts).toBe(0);
    expect(pend.plan!.confirmations).toBe(1);
    expect(s.project.levels.find((l) => l.id === 'lv_1')!.elevation).toBe(3);
    expect(risersOf(s)).toBe(16);
    const st = pend.plan!.stairs[0]!;
    expect(st).toMatchObject({ from: 16, to: 18, added: 2, removed: 0, needsConfirm: true });
    expect(st.summary).toMatch(/^N 16 → 18 · espelho 0,188 → 0,178 m · piso 0,2\d → 0,28 m · alonga 0,56 m$/);
    const r = moveLevel(s, 'lv_1', 3.2, { decision: 'add' });
    expect(r).toMatchObject({ ok: true, adjusted: 1, invalid: 0, added: 2, removed: 0 });
    expect(risersOf(s)).toBe(18);
    expect(quantities(s).riserHeight).toBeCloseTo(3.2 / 18, 9);
    // T = 0,63 − 2R = 0,2744 m, limitado ao piso mínimo do tipo (0,28 m).
    expect(quantities(s).treadMean).toBeCloseTo(0.28, 5);
    expect(runOf(s).risers[17]!.a.y).toBeCloseTo(17 * 0.28, 5);
    expect(r.message).toContain('2 degraus acrescentados');
  });

  it('reduzir a cota: espelho abaixo do mínimo remove degraus (resumo "encurta"), com confirmação e desfazer', () => {
    // 18 espelhos em 2,6 m: R = 0,144 < 0,16 → N = floor(2,6 ÷ 0,16) = 16, 2 degraus saem do fim.
    const s = stairStore(18);
    const pend = moveLevel(s, 'lv_1', 2.6);
    expect(pend.needsDecision).toBe(true);
    const st = pend.plan!.stairs[0]!;
    expect(st).toMatchObject({ from: 18, to: 16, added: 0, removed: 2, needsConfirm: true, status: 'ok' });
    expect(st.summary).toContain('N 18 → 16');
    expect(st.summary).toMatch(/encurta \d,\d\d m/);
    expect(risersOf(s)).toBe(18);
    const r = moveLevel(s, 'lv_1', 2.6, { decision: 'add' });
    expect(r).toMatchObject({ ok: true, adjusted: 1, removed: 2, added: 0 });
    expect(r.message).toContain('2 degraus removidos');
    expect(risersOf(s)).toBe(16);
    expect(quantities(s).riserHeight).toBeCloseTo(2.6 / 16, 9);
    s.undo();
    expect(risersOf(s)).toBe(18);
    expect(s.project.levels.find((l) => l.id === 'lv_1')!.elevation).toBe(3);
  });

  it('cancelar o reajuste que pede confirmação não grava nada', () => {
    const s = stairStore(18);
    const c = moveLevel(s, 'lv_1', 2.6, { decision: 'cancel' });
    expect(c.cancelled).toBe(true);
    expect(risersOf(s)).toBe(18);
    expect(s.project.levels.find((l) => l.id === 'lv_1')!.elevation).toBe(3);
  });

  it('N mantido: aplica direto e a mensagem explica o espelho dentro da faixa do tipo', () => {
    // 3,0 → 3,1 m com 18 espelhos: R = 0,172 (dentro de 0,16–0,18), N não muda.
    const s = stairStore(18);
    const r = moveLevel(s, 'lv_1', 3.1);
    expect(r.needsDecision).toBeUndefined();
    expect(r).toMatchObject({ ok: true, adjusted: 1 });
    expect(r.message).toContain('N mantido em 18; espelho 0,167 → 0,172 m (dentro de 0,16–0,18)');
  });

  it('N mantido com o espelho ainda dentro da faixa ao reduzir a cota (0,167 → 0,161)', () => {
    const s = stairStore(18);
    const r = moveLevel(s, 'lv_1', 2.9);
    expect(r.needsDecision).toBeUndefined();
    expect(r.message).toContain('N mantido em 18; espelho 0,167 → 0,161 m (dentro de 0,16–0,18)');
  });

  it('inserir patamar (NBR 9050, lance > 3,20 m) pede confirmação e o resumo cita o patamar', () => {
    // 3,6 m: N = 20, lance contínuo de 3,6 m > 3,2 m → o reajuste insere patamar de 1,20 m.
    const s = stairStore(18);
    const pend = moveLevel(s, 'lv_1', 3.6);
    expect(pend.needsDecision).toBe(true);
    const st = pend.plan!.stairs[0]!;
    expect(st.landingsInserted).toBe(1);
    expect(st.needsConfirm).toBe(true);
    expect(st.summary).toContain('patamar inserido (NBR 9050)');
    const r = moveLevel(s, 'lv_1', 3.6, { decision: 'add' });
    expect(r.ok).toBe(true);
    expect(stairOf(s).components.some((c) => c.kind === 'landing')).toBe(true);
  });

  it('espelho fixo: a escada é mantida (sem confirmação) e a mensagem diz quanto o espelho saiu da faixa', () => {
    const s = stairStore(18);
    s.exec({ type: 'updateElements', ids: ['st1'], patch: { riserMode: 'fixed' } });
    const r = moveLevel(s, 'lv_1', 3.6);
    expect(r.needsDecision).toBeUndefined();
    expect(risersOf(s)).toBe(18);
    expect(r.message).toContain('Escada de espelho fixo mantida: N 18, espelho 0,200 m, 0,020 m acima do máximo (0,16–0,18 m)');
  });

  it('riserBandNote: dentro, acima do máximo e abaixo do mínimo; sem minRiser vale 0,16', () => {
    const t = { maxRiser: 0.18, minRiser: 0.16 };
    expect(riserBandNote(0.17, t)).toEqual({ inside: true, text: 'dentro de 0,16–0,18' });
    expect(riserBandNote(0.19, t)).toMatchObject({ inside: false });
    expect(riserBandNote(0.15, { maxRiser: 0.18 })!.text).toContain('abaixo do mínimo');
    expect(riserBandNote(0, t)).toBeNull();
  });

  it('sem espaço para o espelho (topo no mesmo nível ou abaixo), não aplica nada sem decisão; com "add" fica inválida e existente', () => {
    const s = stairStore(18);
    const r = moveLevel(s, 'lv_0', 3.5);
    expect(r).toMatchObject({ ok: true, adjusted: 0, invalid: 1, needsDecision: true });
    expect(s.project.levels.find((l) => l.id === 'lv_0')!.elevation).toBe(0);
    const forced = moveLevel(s, 'lv_0', 3.5, { decision: 'add' });
    expect(forced).toMatchObject({ ok: true, adjusted: 0, invalid: 1 });
    expect(s.project.elements.st1).toBeDefined();
    expect(stairTopZ(s.project, stairOf(s)) - stairBaseZ(s.project, stairOf(s))).toBeLessThan(0);
    expect(forced.message).toContain('sem altura válida');
  });

  it('extensão que invade parede pede decisão; cancelar mantém tudo e excluir aplica a cota e remove a escada', () => {
    const s = stairStore(16);
    s.exec({ type: 'addWall', wall: makeWall({ id: 'wX', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: -1, y: 4.5 }, b: { x: 2, y: 4.5 } }) });
    const r = moveLevel(s, 'lv_1', 3.2);
    expect(r.needsDecision).toBe(true);
    expect(s.project.levels.find((l) => l.id === 'lv_1')!.elevation).toBe(3);
    expect(r.plan!.stairs[0]!.status).toBe('conflict');
    expect(r.plan!.stairs[0]!.reason).toContain('invade a parede');
    const c = moveLevel(s, 'lv_1', 3.2, { decision: 'cancel' });
    expect(c.cancelled).toBe(true);
    expect(s.project.levels.find((l) => l.id === 'lv_1')!.elevation).toBe(3);
    const d = moveLevel(s, 'lv_1', 3.2, { decision: 'delete' });
    expect(d).toMatchObject({ deleted: 1 });
    expect(s.project.elements.st1).toBeUndefined();
    expect(s.project.levels.find((l) => l.id === 'lv_1')!.elevation).toBe(3.2);
  });

  it('com "manter altura", compensa o deslocamento e preserva a cota do topo', () => {
    const s = stairStore(18);
    const r = moveLevel(s, 'lv_1', 3.2, true);
    expect(r).toMatchObject({ ok: true, adjusted: 0, invalid: 0 });
    expect(stairOf(s).topOffset).toBeCloseTo(-0.2, 9);
    expect(stairTopZ(s.project, stairOf(s))).toBeCloseTo(3, 9);
    expect(risersOf(s)).toBe(18);
  });

  it('fixa o topo automático no nível que era o de cima antes de mexer na cota', () => {
    const s = stairStore(18, null);
    expect(stairOf(s).topLevelId).toBeNull();
    moveLevel(s, 'lv_1', 3.2);
    expect(stairOf(s).topLevelId).toBe('lv_1');
  });

  it('pinAutoTops fixa todas as escadas/rampas de topo automático', () => {
    const s = stairStore(18, null);
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
