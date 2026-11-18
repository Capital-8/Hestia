import { describe, expect, it } from 'vitest';
import { createEmptyProject, sectionMarkGeometry, type SectionView } from '@hestia/model';
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
