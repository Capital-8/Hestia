import { beforeEach, describe, expect, it } from 'vitest';
import { createEmptyProject } from '@hestia/model';
import { editor } from './controller.ts';
import { ownViewport, type OwnCameraRef } from './paneCamera2d.ts';
import { DEFAULT_OPTIONS, useUi } from './state.ts';

const plan = (levelId: string) => ({ view: 'plan' as const, levelId, sectionId: null, planKind: 'floor' as const, areaPlanId: null });

describe('câmera 2D de painel inativo', () => {
  beforeEach(() => {
    useUi.setState({ options: DEFAULT_OPTIONS });
    editor.load(createEmptyProject(), 'teste.hestia.json');
  });

  it('sem câmera guardada: enquadra a vista dele sem tocar na do controlador', () => {
    const lv = useUi.getState().levelId;
    const ref: OwnCameraRef = { current: null };
    const antes = editor.viewport();
    const v = ownViewport(ref, plan(lv), 800, 600, null);
    expect(v.width).toBe(800);
    expect(v.height).toBe(600);
    expect(ref.current?.key).toBe(lv);
    expect(editor.viewport()).toBe(antes);
  });

  it('câmera guardada é restaurada (centro e zoom literais) e o tamanho acompanha', () => {
    const lv = useUi.getState().levelId;
    const ref: OwnCameraRef = { current: null };
    const v = ownViewport(ref, plan(lv), 400, 300, { zoom: 80, center: { x: 2, y: 3 } });
    expect(v).toEqual({ cx: 2, cy: 3, zoom: 80, width: 400, height: 300 });
    expect(ownViewport(ref, plan(lv), 500, 300, null)).toEqual({ cx: 2, cy: 3, zoom: 80, width: 500, height: 300 });
  });

  it('trocar a vista do painel refaz a câmera (chave nova)', () => {
    const ref: OwnCameraRef = { current: null };
    ownViewport(ref, plan('lv_a'), 400, 300, { zoom: 80, center: { x: 2, y: 3 } });
    const v = ownViewport(ref, plan('lv_b'), 400, 300, { zoom: 10, center: { x: 0, y: 0 } });
    expect(ref.current?.key).toBe('lv_b');
    expect(v.zoom).toBe(10);
  });

  it('controlador: viewport(f) e setViewport(v, f) usam a chave da vista dada, não a da ativa', () => {
    const f = plan('lv_x');
    const vp = { cx: 1, cy: 2, zoom: 30, width: 10, height: 10 };
    editor.setViewport(vp, f);
    expect(editor.viewport(f)).toEqual(vp);
    expect(editor.viewport(plan('lv_y'))).toBeNull();
    expect(editor.viewScale(plan('lv_x'))).toBe(100);
  });
});
