import { describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, sectionGraphicsOf } from '@hestia/model';
import { editSectionGraphics } from './graphicsActions.ts';
import { resolveText } from './i18n.ts';

const store = (): ProjectStore => new ProjectStore(createEmptyProject());

describe('estiloPrancha no corte/elevação (gráficos da vista)', () => {
  it('liga no projeto, em um passo de desfazer, e desfazer volta ao campo ausente', () => {
    const s = store();
    expect(s.project.sectionGraphics).toBeUndefined();
    expect(sectionGraphicsOf(s.project).estiloPrancha).toBeUndefined();
    expect(editSectionGraphics(s, { estiloPrancha: true }, 'eds_undo_change_section_graphics')).toEqual({ ok: true, error: null });
    expect(s.project.sectionGraphics?.estiloPrancha).toBe(true);
    expect(sectionGraphicsOf(s.project).estiloPrancha).toBe(true);
    expect(resolveText(s.undoLabel!, 'pt')).toBe('Alterar gráficos do corte');
    s.undo();
    expect(s.project.sectionGraphics?.estiloPrancha).toBeUndefined();
    expect(sectionGraphicsOf(s.project).estiloPrancha).toBeUndefined();
  });

  it('projeto sem o campo continua com estiloPrancha ausente', () => {
    const s = store();
    expect(sectionGraphicsOf(s.project)).not.toHaveProperty('estiloPrancha');
  });
});
