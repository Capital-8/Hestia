import { describe, expect, it } from 'vitest';
import { createEmptyProject, floorViewId, ProjectStore, roofViewId, sectionMarkGeometry, type SectionView } from '@hestia/model';
import { sectionMarkAt, sectionMarkIdsInBox } from './sectionMarkPick.ts';

const view = (patch: Partial<SectionView> = {}): SectionView => ({
  id: 'v1',
  name: 'Corte A',
  kind: 'section',
  a: { x: 0, y: 0 },
  b: { x: 4, y: 0 },
  depth: 5,
  ...patch,
});

describe('seleção da marca de corte/elevação', () => {
  it('pega a linha, a seta e o rótulo, com tolerância em metros', () => {
    const p = createEmptyProject();
    p.views = [view({ label: 'A' })];
    expect(sectionMarkAt(p, 'lv_0', { x: 2, y: 0 }, 0.01)).toBe('v1');
    expect(sectionMarkAt(p, 'lv_0', { x: 0, y: 0.3 }, 0.01)).toBe('v1');
    // O rótulo fica além da ponta da seta (seta + meia altura do texto + folga): pega-se no ponto onde a geometria o põe.
    const rotulo = sectionMarkGeometry({ x: 0, y: 0 }, { x: 4, y: 0 }, 'section', 'A', 0.1, undefined).labels[0]!.at;
    expect(sectionMarkAt(p, 'lv_0', rotulo, 0.01)).toBe('v1');
    expect(sectionMarkAt(p, 'lv_0', { x: 2, y: 1 }, 0.01)).toBeNull();
  });

  it('não seleciona marca oculta e pega as extremidades na janela', () => {
    const p = createEmptyProject();
    p.views = [view({ mark: { visible: false } })];
    expect(sectionMarkAt(p, 'lv_0', { x: 2, y: 0 }, 0.01)).toBeNull();
    expect(sectionMarkIdsInBox(p, 'lv_0', { x: -1, y: -1 }, { x: 5, y: 1 })).toEqual([]);
    p.views[0]!.mark = { visible: true };
    expect(sectionMarkIdsInBox(p, 'lv_0', { x: -1, y: -1 }, { x: 1, y: 1 })).toEqual(['v1']);
  });
});

describe('seleção da marca segue a vista ativa', () => {
  it('categoria annotation oculta só na cobertura: o piso seleciona, a cobertura não', () => {
    const p = createEmptyProject();
    p.views = [view({ label: 'A' })];
    const s = new ProjectStore(p);
    s.exec({ type: 'updatePlanView', viewId: roofViewId('lv_0'), patch: { graphics: { overrides: { annotation: { visible: false } } } } });
    const q = s.project;
    expect(sectionMarkAt(q, 'lv_0', { x: 2, y: 0 }, 0.01, floorViewId('lv_0'))).toBe('v1');
    expect(sectionMarkAt(q, 'lv_0', { x: 2, y: 0 }, 0.01, roofViewId('lv_0'))).toBeNull();
    expect(sectionMarkAt(q, 'lv_0', { x: 2, y: 0 }, 0.01)).toBe('v1');
    expect(sectionMarkIdsInBox(q, 'lv_0', { x: -1, y: -1 }, { x: 5, y: 1 }, floorViewId('lv_0'))).toEqual(['v1']);
    expect(sectionMarkIdsInBox(q, 'lv_0', { x: -1, y: -1 }, { x: 5, y: 1 }, roofViewId('lv_0'))).toEqual([]);
  });

  it('escala só na cobertura muda a tolerância do rótulo apenas nela', () => {
    const p = createEmptyProject();
    p.views = [view({ label: 'A' })];
    const s = new ProjectStore(p);
    s.exec({ type: 'updatePlanView', viewId: roofViewId('lv_0'), patch: { graphics: { scale: 1000 } } });
    const rotulo = sectionMarkGeometry({ x: 0, y: 0 }, { x: 4, y: 0 }, 'section', 'A', 0.1, undefined).labels[0]!.at;
    // Escala 1:100 (padrão do piso): o rótulo calculado a 1:100 é pego; a 1:1000 a marca encolhe e o ponto cai fora.
    expect(sectionMarkAt(s.project, 'lv_0', rotulo, 0.01, floorViewId('lv_0'))).toBe('v1');
    expect(sectionMarkAt(s.project, 'lv_0', rotulo, 0.01, roofViewId('lv_0'))).toBeNull();
  });
});
