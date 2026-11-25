import { describe, expect, it } from 'vitest';
import { computeSection } from '@hestia/engine';
import { ProjectStore, createEmptyProject, makeWall, type DeepPartial, type ViewGraphics } from '@hestia/model';
import { buildSectionDrawList, type SectionInput } from './build.ts';
import { hexToRgb } from '../plan/color.ts';
import { LIGHT } from '../plan/types.ts';
import { sectionStyleOf } from './style.ts';

const PAPER = '#ffffff';

/** Corte transversal de uma parede de alvenaria (linha em x = 3): parede cortada com preenchimento e hachura. */
function corte(patch?: DeepPartial<ViewGraphics>): SectionInput {
  const store = new ProjectStore(createEmptyProject());
  store.exec({ type: 'addWall', wall: makeWall({ id: 'w', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 6, y: 0 }, height: 3 }) });
  if (patch) store.exec({ type: 'setSectionGraphics', patch });
  const project = store.project;
  return { project, section: computeSection(project, { a: { x: 3, y: -1 }, b: { x: 3, y: 1 }, depth: 3 }), viewport: { cx: 0, cy: 1.5, zoom: 60, width: 800, height: 600 }, theme: LIGHT, dark: false, showGrid: false };
}

const oculto = (extra: DeepPartial<ViewGraphics> = {}): DeepPartial<ViewGraphics> => ({ style: 'hiddenLine', detail: 'medium', ...extra });

describe('corte em estilo de prancha (linha oculta)', () => {
  it('todo preenchimento fica no papel e toda hachura fica em cinza neutro', () => {
    const d = buildSectionDrawList(corte(oculto({ estiloPrancha: true })));
    expect(d.fills.length).toBeGreaterThan(0);
    for (const f of d.fills) expect(f.color).toBe(PAPER);
    const comHachura = d.fills.filter((f) => f.hatch);
    expect(comHachura.length).toBeGreaterThan(0);
    for (const f of comHachura) {
      expect(f.hatch!.color).toBe('#454649');
      const [r, g, b] = hexToRgb(f.hatch!.color);
      expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThanOrEqual(8);
    }
  });

  it('sem o campo, o corte já sai em papel e hachura cinza: o campo antigo é ignorado', () => {
    const semCampo = buildSectionDrawList(corte(oculto()));
    expect(semCampo.fills.length).toBeGreaterThan(0);
    for (const f of semCampo.fills) expect(f.color).toBe(PAPER);
    const comHachura = semCampo.fills.filter((f) => f.hatch);
    expect(comHachura.length).toBeGreaterThan(0);
    for (const f of comHachura) expect(f.hatch!.color).toBe('#454649');
    // Desligar explicitamente não muda nada: a linha oculta é sempre o visual de prancha.
    expect(buildSectionDrawList(corte(oculto({ estiloPrancha: false })))).toEqual(semCampo);
  });

  it('sombreado com o campo ligado mantém as cores de material', () => {
    const semCampo = buildSectionDrawList(corte({ style: 'shaded', detail: 'medium' }));
    const comCampo = buildSectionDrawList(corte({ style: 'shaded', detail: 'medium', estiloPrancha: true }));
    expect(comCampo).toEqual(semCampo);
    expect(comCampo.fills.some((f) => f.color === '#c0693f')).toBe(true);
    expect(comCampo.fills.some((f) => f.color === PAPER)).toBe(false);
  });

  it('contornos de corte saem em tinta cheia', () => {
    const entrada = corte(oculto({ estiloPrancha: true }));
    const d = buildSectionDrawList(entrada);
    const cut = sectionStyleOf(entrada.project, entrada.viewport.zoom).paint.wall.cut;
    const deCorte = d.strokes.filter((s) => s.widthPx === cut.widthPx && JSON.stringify(s.papel) === JSON.stringify(cut.papel));
    expect(deCorte.length).toBeGreaterThan(0);
    for (const s of deCorte) expect(s.color).toBe('#16181c');
  });

  it('sem o campo, os contornos de corte já saem com os pesos de pena e a tinta (silhueta inclusa)', () => {
    const sem = buildSectionDrawList(corte(oculto()));
    // O campo antigo não altera mais nada.
    expect(sem.strokes).toEqual(buildSectionDrawList(corte(oculto({ estiloPrancha: true }))).strokes);
    // Peso 5 da parede em 1:100 = 0,5 mm de papel; a silhueta externa usa o mesmo peso.
    const deCorte = sem.strokes.filter((s) => s.closed && s.papel?.mm === 0.5);
    expect(deCorte.length).toBeGreaterThan(0);
    for (const s of deCorte) {
      expect(s.color).toBe('#16181c');
      expect(s.papel).toEqual({ mm: 0.5, escala: 100 });
    }
    // Não sobram os traços fixos de antes (silhueta de 2,2 px).
    expect(sem.strokes.some((s) => s.widthPx === 2.2)).toBe(false);
  });

  it('sombreado com o campo ligado não muda as cores de traço', () => {
    const semCampo = buildSectionDrawList(corte({ style: 'shaded', detail: 'medium' }));
    const comCampo = buildSectionDrawList(corte({ style: 'shaded', detail: 'medium', estiloPrancha: true }));
    expect(comCampo.strokes).toEqual(semCampo.strokes);
  });

  it('sectionStyleOf marca a prancha em qualquer vista, com ou sem gráficos salvos (o campo antigo é ignorado)', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'setSectionGraphics', patch: oculto({ estiloPrancha: true }) });
    expect(sectionStyleOf(s.project, 60).paint.wall.prancha).toBe(true);
    expect(new ProjectStore(createEmptyProject()).project).not.toHaveProperty('sectionGraphics');
    expect(sectionStyleOf(createEmptyProject(), 60).paint.wall.prancha).toBe(true);
    const desligado = new ProjectStore(createEmptyProject());
    desligado.exec({ type: 'setSectionGraphics', patch: oculto({ estiloPrancha: false }) });
    expect(sectionStyleOf(desligado.project, 60).paint.wall.prancha).toBe(true);
  });
});
