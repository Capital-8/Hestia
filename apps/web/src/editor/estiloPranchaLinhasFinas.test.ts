import { describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, levelGraphicsOf, sectionGraphicsOf } from '@hestia/model';
import { applyPenSet } from './penSetActions.ts';

const store = (): ProjectStore => new ProjectStore(createEmptyProject());

describe('Linhas finas (tela): ligadas por padrão em todas as vistas', () => {
  it('a planta de todos os níveis e o corte leem linhas finas ligadas quando nada foi salvo', () => {
    const s = createEmptyProject();
    for (const l of s.levels) expect(levelGraphicsOf(s, l.id).thinLines).toBe(true);
    expect(sectionGraphicsOf(s).thinLines).toBe(true);
  });

  it('aplicar um conjunto de penas não mexe nas linhas finas', () => {
    const s = store();
    for (const id of ['heavy', 'light', 'standard']) {
      expect(applyPenSet(s, id).ok).toBe(true);
      expect(levelGraphicsOf(s.project, 'lv_0').thinLines).toBe(true);
      expect(sectionGraphicsOf(s.project).thinLines).toBe(true);
    }
  });

  it('desligar as linhas finas numa vista vale só para ela e um conjunto de penas aplicado depois não as religa', () => {
    const s = store();
    s.exec({ type: 'setLevelGraphics', levelId: 'lv_0', patch: { thinLines: false } });
    expect(levelGraphicsOf(s.project, 'lv_0').thinLines).toBe(false);
    expect(sectionGraphicsOf(s.project).thinLines).toBe(true);
    applyPenSet(s, 'heavy');
    expect(levelGraphicsOf(s.project, 'lv_0').thinLines).toBe(false);
  });
});
