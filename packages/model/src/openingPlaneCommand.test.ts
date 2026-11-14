import { describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, makeWall, labelOf, type Opening } from './index.ts';

const op = (id: string, kind: 'door' | 'window'): Opening => ({ id, kind, typeId: kind === 'door' ? 'ot_p80' : 'ot_j120', hostId: 'w1', offset: kind === 'door' ? 1 : 3, flipHand: false, flipFacing: false, sillOverride: null, mark: '' });

describe('F2.8: setOpeningPlane', () => {
  const mk = () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'addWall', wall: makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 5, y: 0 } }) });
    s.exec({ type: 'addOpening', opening: op('d1', 'door') });
    s.exec({ type: 'addOpening', opening: op('j1', 'window') });
    return s;
  };
  it('muda várias aberturas em um passo de desfazer e null volta ao padrão', () => {
    const s = mk();
    s.exec({ type: 'setOpeningPlane', ids: ['d1', 'j1'], plano: 'inclinado' });
    expect((s.project.elements.d1 as Opening).plano).toBe('inclinado');
    s.undo();
    expect((s.project.elements.d1 as Opening).plano).toBeUndefined();
    expect((s.project.elements.j1 as Opening).plano).toBeUndefined();
    s.exec({ type: 'setOpeningPlane', ids: ['j1'], plano: 'vertical' });
    s.exec({ type: 'setOpeningPlane', ids: ['j1'], plano: null });
    expect('plano' in (s.project.elements.j1 as Opening)).toBe(false);
  });
  it('recusa valor inválido sem alterar nada', () => {
    const s = mk();
    expect(() => s.exec({ type: 'setOpeningPlane', ids: ['d1'], plano: 'torto' as never })).toThrow();
    expect((s.project.elements.d1 as Opening).plano).toBeUndefined();
  });
  it('rótulo de histórico', () => {
    expect(labelOf({ type: 'setOpeningPlane', ids: ['a'], plano: null })).toBe('Mudar plano da abertura');
    expect(labelOf({ type: 'setOpeningPlane', ids: ['a', 'b'], plano: null })).toBe('Mudar plano das aberturas');
  });
});
