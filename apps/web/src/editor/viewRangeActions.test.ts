import { describe, expect, it } from 'vitest';
import { DEFAULT_VIEW_RANGE, ProjectStore, createEmptyProject, makeWall, planViewRangeOf, floorViewId, type Wall } from '@hestia/model';
import { viewRangeWarnings } from '@hestia/engine';
import { editViewRange, restoreViewRangeDefault } from './viewRangeActions.ts';

function store(): ProjectStore {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'addWall', wall: makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 3, y: 0 } }) });
  // Parede do Pavimento 2 (cota 3 m) com base 2 m acima: cota 5 m. Visível com o topo padrão (2,30 m → 5,30 m);
  // some quando o topo desce abaixo dela (1,90 m → 4,90 m).
  s.exec({ type: 'addWall', wall: makeWall({ id: 'w2', typeId: 'wt_alv14', levelId: 'lv_1', baseOffset: 2, a: { x: 0, y: 1 }, b: { x: 3, y: 1 } }) });
  return s;
}

describe('editViewRange (intervalo de vista, decisão 0013 §5)', () => {
  it('aplica o patch ao nível e registra um passo de desfazer', () => {
    const s = store();
    const r = editViewRange(s, 'lv_0', { cut: 1.1 });
    expect(r).toEqual({ ok: true, error: null });
    expect(planViewRangeOf(s.project, floorViewId('lv_0'))).toEqual({ ...DEFAULT_VIEW_RANGE, cut: 1.1 });
    expect(s.undoLabel).toBe('Alterar intervalo de vista');
    s.undo();
    expect(planViewRangeOf(s.project, floorViewId('lv_0'))).toEqual(DEFAULT_VIEW_RANGE);
    s.redo();
    expect(planViewRangeOf(s.project, floorViewId('lv_0')).cut).toBe(1.1);
  });

  it('cada nível guarda o próprio intervalo', () => {
    const s = store();
    editViewRange(s, 'lv_1', { top: 3.5 });
    expect(planViewRangeOf(s.project, floorViewId('lv_1')).top).toBe(3.5);
    expect(planViewRangeOf(s.project, floorViewId('lv_0'))).toEqual(DEFAULT_VIEW_RANGE);
  });

  it('recusa valor que quebra topo ≥ corte: devolve a mensagem e não grava nem entra no histórico', () => {
    const s = store();
    const before = s.project;
    const label = s.undoLabel;
    const r = editViewRange(s, 'lv_0', { top: 1.0 });
    expect(r).toEqual({ ok: false, error: 'O topo do intervalo de vista deve estar acima ou no plano de corte.' });
    expect(s.project).toBe(before);
    expect(s.undoLabel).toBe(label);
    expect(planViewRangeOf(s.project, floorViewId('lv_0'))).toEqual(DEFAULT_VIEW_RANGE);
  });

  it('recusa profundidade acima da base e informa a regra', () => {
    const s = store();
    const r = editViewRange(s, 'lv_0', { depth: 0.5 });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('A profundidade de vista deve estar abaixo ou na base do intervalo de vista.');
    expect(planViewRangeOf(s.project, floorViewId('lv_0')).depth).toBe(0);
  });

  it('recusa cota não finita sem gravar', () => {
    const s = store();
    const r = editViewRange(s, 'lv_0', { top: Number.NaN });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('As cotas do intervalo de vista devem ser números finitos, em metros.');
    expect(planViewRangeOf(s.project, floorViewId('lv_0'))).toEqual(DEFAULT_VIEW_RANGE);
  });

  it('nível inexistente é recusado com a mensagem do comando', () => {
    const s = store();
    expect(editViewRange(s, 'lv_nao_existe', { cut: 1 })).toEqual({ ok: false, error: 'Nível inexistente' });
  });

  it('a direção "up" é aceita pelo comando (guardada para o futuro), mas a interface não a oferece', () => {
    const s = store();
    expect(editViewRange(s, 'lv_0', { direction: 'up' })).toEqual({ ok: true, error: null });
    expect(planViewRangeOf(s.project, floorViewId('lv_0')).direction).toBe('up');
  });

  it('sem mudança real não cria passo de desfazer', () => {
    const s = store();
    const label = s.undoLabel;
    expect(editViewRange(s, 'lv_0', { cut: DEFAULT_VIEW_RANGE.cut })).toEqual({ ok: true, error: null });
    expect(s.undoLabel).toBe(label);
  });
});

describe('restoreViewRangeDefault (Restaurar padrão)', () => {
  it('volta todas as cotas e a direção ao padrão do Revit, em um passo de desfazer', () => {
    const s = store();
    editViewRange(s, 'lv_0', { top: 3.1, cut: 1.0, bottom: -0.5, depth: -1, direction: 'up' });
    expect(restoreViewRangeDefault(s, 'lv_0')).toEqual({ ok: true, error: null });
    expect(planViewRangeOf(s.project, floorViewId('lv_0'))).toEqual(DEFAULT_VIEW_RANGE);
    expect(planViewRangeOf(s.project, floorViewId('lv_0')).direction).toBe('down');
    s.undo();
    expect(planViewRangeOf(s.project, floorViewId('lv_0'))).toMatchObject({ top: 3.1, cut: 1.0, bottom: -0.5, depth: -1, direction: 'up' });
  });

  it('já no padrão: nada muda e não há passo de desfazer novo', () => {
    const s = store();
    const label = s.undoLabel;
    expect(restoreViewRangeDefault(s, 'lv_0')).toEqual({ ok: true, error: null });
    expect(s.undoLabel).toBe(label);
  });

  it('restaura só o nível dado', () => {
    const s = store();
    editViewRange(s, 'lv_0', { cut: 1.0 });
    editViewRange(s, 'lv_1', { cut: 1.5 });
    restoreViewRangeDefault(s, 'lv_0');
    expect(planViewRangeOf(s.project, floorViewId('lv_0'))).toEqual(DEFAULT_VIEW_RANGE);
    expect(planViewRangeOf(s.project, floorViewId('lv_1')).cut).toBe(1.5);
  });
});

describe('avisos do intervalo (viewRangeWarnings) na edição', () => {
  it('parede acima do topo padrão aparece como oculta; ao subir o topo, o aviso some', () => {
    const s = store();
    const warnAt = () => viewRangeWarnings(s.project, 'lv_1', planViewRangeOf(s.project, floorViewId('lv_1')));
    expect(warnAt()).toEqual([]);

    editViewRange(s, 'lv_1', { top: 1.9, cut: 1.2 });
    const hidden = warnAt();
    expect(hidden).toHaveLength(1);
    expect(hidden[0]).toMatchObject({ category: 'wall', kind: 'hidden', count: 1, ids: ['w2'] });
    expect(hidden[0]!.message).toBe('1 parede fora do intervalo de vista.');

    editViewRange(s, 'lv_1', { top: 2.3 });
    expect(warnAt()).toEqual([]);
  });

  it('elementos de outro nível não entram nos avisos do nível', () => {
    const s = store();
    editViewRange(s, 'lv_0', { top: 1.0, cut: 0.5 });
    const ids = viewRangeWarnings(s.project, 'lv_0', planViewRangeOf(s.project, floorViewId('lv_0'))).flatMap((w) => w.ids);
    expect(ids).not.toContain('w2');
    expect((s.project.elements.w2 as Wall).levelId).toBe('lv_1');
  });
});
