import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PROJECT_GRAPHICS,
  ProjectStore,
  createEmptyProject,
  graphicsOf,
  levelGraphicsOf,
  sectionGraphicsOf,
} from '@hestia/model';
import { applyPenSet } from './penSetActions.ts';

const store = (): ProjectStore => new ProjectStore(createEmptyProject());

describe('aplicar conjunto de penas', () => {
  it('copia os pesos e estilos por categoria do anteprojeto para o projeto', () => {
    const s = store();
    expect(applyPenSet(s, 'light')).toEqual({ ok: true, error: null });
    expect(graphicsOf(s.project).categories.wall.cutWeight).toBe(4);
    expect(graphicsOf(s.project).categories.wall.projectionWeight).toBe(1);
  });

  it('aplicar o executivo grava o peso de corte 6 e não grava estilo de prancha nas vistas', () => {
    const s = store();
    expect(applyPenSet(s, 'heavy')).toEqual({ ok: true, error: null });
    expect(graphicsOf(s.project).categories.wall.cutWeight).toBe(6);
    expect(levelGraphicsOf(s.project, 'lv_0')).not.toHaveProperty('estiloPrancha');
    expect(sectionGraphicsOf(s.project)).not.toHaveProperty('estiloPrancha');
  });

  it('recusa id desconhecido sem alterar o projeto', () => {
    const s = store();
    const antes = s.project;
    const r = applyPenSet(s, 'nao-existe');
    expect(r.ok).toBe(false);
    expect(r.error).toBeTruthy();
    expect(s.project).toBe(antes);
    expect(s.canUndo).toBe(false);
  });

  it('aplicar o mesmo conjunto duas vezes não cria segundo passo de desfazer', () => {
    const s = store();
    applyPenSet(s, 'light');
    expect(s.undoLabel).toBe('eds_undo_apply_pen_set');
    applyPenSet(s, 'light');
    expect(s.undoLabel).toBe('eds_undo_apply_pen_set');
    s.undo();
    expect(graphicsOf(s.project)).toEqual(DEFAULT_PROJECT_GRAPHICS);
    expect(s.canUndo).toBe(false);
  });

  it('um desfazer volta aos pesos anteriores', () => {
    const s = store();
    const antes = graphicsOf(s.project);
    applyPenSet(s, 'heavy');
    expect(graphicsOf(s.project).categories.wall.cutWeight).toBe(6);
    s.undo();
    expect(graphicsOf(s.project)).toEqual(antes);
  });
});
