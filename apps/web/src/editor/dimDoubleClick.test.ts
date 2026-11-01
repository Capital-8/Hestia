import { describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject } from '@hestia/model';
import { cotaParaEditar, ehDuploClique } from './dimDoubleClick.ts';

const loja = () => {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'addDimension', levelId: 'lv_0', dimension: { id: 'd1', a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, offset: 1 } });
  s.exec({ type: 'addText', levelId: 'lv_0', text: { id: 't1', at: { x: 10, y: 10 }, text: 'Sala', height: 2.5, rotation: 0 } } as never);
  return s;
};

describe('duplo clique em cota', () => {
  it('detecta dois cliques próximos no tempo e no espaço', () => {
    const a = { t: 1000, x: 10, y: 10 };
    expect(ehDuploClique(a, { t: 1200, x: 12, y: 11 })).toBe(true);
    expect(ehDuploClique(a, { t: 1600, x: 10, y: 10 })).toBe(false);
    expect(ehDuploClique(a, { t: 1100, x: 40, y: 10 })).toBe(false);
    expect(ehDuploClique(null, a)).toBe(false);
  });

  it('na planta, o alvo na cota devolve o id (dimEditId)', () => {
    const s = loja();
    expect(cotaParaEditar(s.project, { vista: 'plan', levelId: 'lv_0', mpp: 0.01 }, { x: 2, y: 1 })).toBe('d1');
  });

  it('na planta, vazio ou outro elemento não devolve cota', () => {
    const s = loja();
    expect(cotaParaEditar(s.project, { vista: 'plan', levelId: 'lv_0', mpp: 0.01 }, { x: 30, y: 30 })).toBeNull();
    expect(cotaParaEditar(s.project, { vista: 'plan', levelId: 'lv_0', mpp: 0.01 }, { x: 10, y: 10 })).toBeNull();
  });

  it('no corte, id que não é cota (ou sem hit) devolve null', () => {
    const s = loja();
    expect(cotaParaEditar(s.project, { vista: 'section', sectionId: 'nada', hitId: 'w1' }, { x: 0, y: 0 })).toBeNull();
    expect(cotaParaEditar(s.project, { vista: 'section', sectionId: 'nada', hitId: null }, { x: 0, y: 0 })).toBeNull();
  });
});
