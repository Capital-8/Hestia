import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_VIEW_3D, DEFAULT_VIEW_GRAPHICS, planGraphicsOf, view3dOf, type Project } from '@hestia/model';
import { editor } from './controller.ts';
import { initialLayout, usePanes } from './paneStore.ts';
import { PANE_STYLE_PRESETS, descreverEstiloAplicado, effectivePlanGraphics, effectiveView3d, projetoDoPainel } from './paneStyle.ts';

const base3d = { ...DEFAULT_VIEW_3D, style: 'shaded' as const, shadows: true, edges: true, background: null };
const basePlan = { ...DEFAULT_VIEW_GRAPHICS, style: 'hiddenLine' as const, thinLines: true };

describe('effectiveView3d', () => {
  it('estilo vazio devolve o mesmo objeto', () => {
    expect(effectiveView3d(base3d, {})).toBe(base3d);
  });
  it('mescla style, shadows, edges e background; ausente herda', () => {
    const e = effectiveView3d(base3d, { style: 'wireframe', shadows: false, background: '#112233' });
    expect(e.style).toBe('wireframe');
    expect(e.shadows).toBe(false);
    expect(e.edges).toBe(true);
    expect(e.background).toBe('#112233');
    expect(base3d.style).toBe('shaded');
  });
  it('valor igual ao base não cria objeto novo', () => {
    expect(effectiveView3d(base3d, { style: 'shaded', edges: true })).toBe(base3d);
  });
});

describe('effectivePlanGraphics', () => {
  it('estilo vazio devolve o mesmo objeto', () => {
    expect(effectivePlanGraphics(basePlan, {})).toBe(basePlan);
  });
  it('aplica estilo de planta e linhas finas', () => {
    const e = effectivePlanGraphics(basePlan, { style: 'wireframe', thinLines: false });
    expect(e.style).toBe('wireframe');
    expect(e.thinLines).toBe(false);
  });
  it('estilo só de 3D é ignorado em planta/corte', () => {
    expect(effectivePlanGraphics(basePlan, { style: 'realistic' })).toBe(basePlan);
    expect(effectivePlanGraphics(basePlan, { style: 'consistentColors' })).toBe(basePlan);
  });
});

describe('presets', () => {
  it('3D tem 5 e 2D tem 3, com chave i18n', () => {
    expect(PANE_STYLE_PRESETS.view3d.map((x) => x.style)).toEqual(['wireframe', 'hiddenLine', 'shaded', 'consistentColors', 'realistic']);
    expect(PANE_STYLE_PRESETS.view2d.map((x) => x.style)).toEqual(['wireframe', 'hiddenLine', 'shaded']);
    expect(PANE_STYLE_PRESETS.view2d[1]!.label).toBe('pane_style_hiddenLine');
  });
});

describe('projetoDoPainel e descreverEstiloAplicado', () => {
  beforeEach(() => {
    usePanes.setState({ layout: initialLayout({ view: '3d', levelId: editor.project.levels[0]!.id, sectionId: null, sheetId: null, planKind: 'floor', areaPlanId: null }) });
  });
  it('sem estilo devolve o próprio projeto; com estilo, cópia estável sem tocar no original', () => {
    const p: Project = editor.project;
    expect(projetoDoPainel(p, {}, { kind: '3d' })).toBe(p);
    const a = projetoDoPainel(p, { style: 'wireframe' }, { kind: '3d' });
    expect(a).not.toBe(p);
    expect(projetoDoPainel(p, { style: 'wireframe' }, { kind: '3d' })).toBe(a);
    expect(view3dOf(a).style).toBe('wireframe');
    expect(view3dOf(p).style).toBe(view3dOf(editor.project).style);
  });
  it('painel de planta de disciplina: o estilo vai para a cópia da planta; a padrão e os níveis seguem os mesmos', () => {
    const lv = editor.project.levels[0]!.id;
    const q: Project = { ...editor.project, planViews: [{ id: 'pv_est', levelId: lv, discipline: 'estrutura', name: 'Estrutura' }] };
    const a = projetoDoPainel(q, { style: 'wireframe' }, { kind: 'plan', levelId: lv, planId: 'pv_est' });
    expect(planGraphicsOf(a, lv, 'pv_est').style).toBe('wireframe');
    expect(a.levels).toBe(q.levels);
    expect(planGraphicsOf(a, lv).style).toBe(planGraphicsOf(q, lv).style);
    // Planta padrão (sem planId): troca o gráfico do nível, como sempre.
    const b = projetoDoPainel(q, { style: 'wireframe' }, { kind: 'plan', levelId: lv });
    expect(planGraphicsOf(b, lv).style).toBe('wireframe');
    expect(b.planViews).toBe(q.planViews);
    // Sem nada a mudar, devolve o próprio projeto.
    expect(projetoDoPainel(q, {}, { kind: 'plan', levelId: lv, planId: 'pv_est' })).toBe(q);
  });
  it('setPaneStyle muda só o painel: projeto inalterado e descrição reflete o estilo', () => {
    const p = editor.project;
    const antes = view3dOf(p).style;
    expect(descreverEstiloAplicado('p1')).toEqual({ style: antes, shadows: view3dOf(p).shadows, edges: view3dOf(p).edges, background: view3dOf(p).background });
    usePanes.getState().setPaneStyle('p1', { style: 'wireframe', shadows: false, edges: true, background: '#abcdef' });
    expect(descreverEstiloAplicado('p1')).toEqual({ style: 'wireframe', shadows: false, edges: true, background: '#abcdef' });
    expect(editor.project).toBe(p);
    expect(view3dOf(editor.project).style).toBe(antes);
    expect(descreverEstiloAplicado('nao-existe')).toBeNull();
  });
  it('painel de planta: estilo 3D ignorado, de planta aplicado', () => {
    const lv = editor.project.levels[0]!.id;
    usePanes.setState({ layout: initialLayout({ view: 'plan', levelId: lv, sectionId: null, sheetId: null, planKind: 'floor', areaPlanId: null }) });
    usePanes.getState().setPaneStyle('p1', { style: 'realistic' });
    expect(descreverEstiloAplicado('p1')?.style).not.toBe('realistic');
    usePanes.getState().setPaneStyle('p1', { style: 'wireframe' });
    expect(descreverEstiloAplicado('p1')).toEqual({ style: 'wireframe', shadows: false, edges: false, background: null });
  });
});
