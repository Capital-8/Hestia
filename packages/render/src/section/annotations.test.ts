import { computeSection } from '@hestia/engine';
import { ProjectStore, createEmptyProject, dimensionText, makeWall, unitsOf, type Dimension, type SectionAnnotations } from '@hestia/model';
import type { Vec2 } from '@hestia/geom';
import { describe, expect, it } from 'vitest';
import { LIGHT } from '../plan/types.ts';
import { buildSectionDrawList, type SectionInput } from './build.ts';
import { SectionFrame, type SectionFrameInput } from './frame.ts';

const v = (x: number, y: number): Vec2 => ({ x, y });

/** Anotações vazias, com os campos pedidos por cada teste. */
function annotations(patch: Partial<SectionAnnotations> = {}): SectionAnnotations {
  return { dimensions: [], texts: [], detailLines: [], detailRegions: [], tags: [], ...patch };
}

/**
 * Corte vertical numa parede de 6 m: o plano da vista usa `x = t` (distância ao longo do corte) e `y = z` (cota), o
 * mesmo par `(t,z)` em que as anotações da seção são gravadas.
 */
function baseInput(withAnnotations = false, patch: Partial<SectionAnnotations> = {}): SectionInput {
  const store = new ProjectStore(createEmptyProject());
  store.exec({ type: 'addWall', wall: makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: 'lv_0', a: v(0, 0), b: v(6, 0), height: 3 }) });
  const project = store.project;
  return {
    project,
    section: computeSection(project, { a: v(0, -2), b: v(6, -2), depth: 8 }),
    viewport: { cx: 3, cy: 1.5, zoom: 60, width: 800, height: 600 },
    theme: LIGHT,
    dark: false,
    showGrid: false,
    ...(withAnnotations ? { annotations: annotations(patch) } : {}),
  };
}

const near = (a: Vec2, b: Vec2, eps = 1e-9): boolean => Math.abs(a.x - b.x) <= eps && Math.abs(a.y - b.y) <= eps;

describe('anotações da vista de corte/elevação', () => {
  it('a cota desloca a linha, as chamadas e o valor, e entra no draw list', () => {
    const input = baseInput(true, { dimensions: [{ id: 'd1', a: v(0, 0.2), b: v(3, 0.2), offset: 0.4 }] });
    const d = input.annotations!.dimensions[0] as Dimension;
    const draw = buildSectionDrawList(input);
    const base = buildSectionDrawList(baseInput());
    // A linha fica a `offset` da normal de a→b (z = 0,2 + 0,4) e o tick slash a ultrapassa 0,98 mm de papel (0,098 m em 1:100).
    expect(draw.strokes.length).toBeGreaterThan(base.strokes.length);
    expect(draw.strokes.some((s) => !s.closed && s.pts.length === 2 && near(s.pts[0]!, v(-0.098, 0.6), 1e-6) && near(s.pts[1]!, v(3.098, 0.6), 1e-6))).toBe(true);
    const expected = dimensionText(input.project, d, unitsOf(input.project));
    const label = draw.labels.find((l) => l.text === expected);
    expect(label).toBeDefined();
    expect(label!.at.y).toBeGreaterThan(0.6);
    expect(base.labels.some((l) => l.text === expected)).toBe(false);
  });

  it('o texto da seção aparece nos rótulos, com o corpo em mm de papel', () => {
    const draw = buildSectionDrawList(baseInput(true, { texts: [{ id: 't1', at: v(2, 1.5), text: 'Nota da seção', height: 2.5, rotation: 0 }] }));
    const label = draw.labels.find((l) => l.text === 'Nota da seção');
    expect(label).toBeDefined();
    expect(near(label!.at, v(2, 1.5))).toBe(true);
    expect(label!.papel).toMatchObject({ escala: 100, fontMm: 2.5 });
  });

  it('linhas e regiões de detalhe entram como traço e preenchimento', () => {
    const boundary = [v(1, 0.5), v(2.5, 0.5), v(2.5, 1.5), v(1, 1.5)];
    const draw = buildSectionDrawList(baseInput(true, {
      detailLines: [{ id: 'l1', a: v(0.5, 2), b: v(4.5, 2), style: 'dashed' }],
      detailRegions: [{ id: 'r1', boundary }],
    }));
    expect(draw.strokes.some((s) => !s.closed && s.dash?.[0] === 7 && s.pts.length === 2 && near(s.pts[0]!, v(0.5, 2)) && near(s.pts[1]!, v(4.5, 2)))).toBe(true);
    expect(draw.fills.some((f) => f.polygons.length === 1 && f.polygons[0]!.length === 1 && f.polygons[0]![0]!.length === boundary.length && f.color === '#f5d782')).toBe(true);
    expect(draw.strokes.some((s) => s.closed && s.pts.length === boundary.length && near(s.pts[0]!, boundary[0]!))).toBe(true);
  });

  it('a etiqueta de elemento aparece com o valor consultado no modelo', () => {
    const input = baseInput(true, { tags: [{ id: 'tag1', hostId: 'w1', at: v(3, 2), property: 'type' }] });
    const code = input.project.wallTypes['wt_alv14']!.code;
    const draw = buildSectionDrawList(input);
    const label = draw.labels.find((l) => l.text === code && near(l.at, v(3, 2)));
    expect(code).not.toBe('');
    expect(label).toBeDefined();
    // O líder da etiqueta ligaria o ponto do elemento em planta (x,y) ao texto em (t,z): fica desligado nesta vista.
    expect(draw.strokes.some((s) => near(s.pts[0]!, v(3, 2)) || near(s.pts[1]!, v(3, 2)))).toBe(false);
  });

  it('sem annotations, ou com anotações vazias, a lista é idêntica à atual', () => {
    const input = baseInput();
    const base = buildSectionDrawList(input);
    expect(buildSectionDrawList(input)).toEqual(base);
    expect(buildSectionDrawList({ ...input, annotations: annotations() })).toEqual(base);
  });

  it('a chave do SectionFrame muda quando as anotações mudam', () => {
    const input = baseInput();
    const frameInput = (a?: SectionAnnotations): SectionFrameInput => ({
      project: input.project,
      version: 1,
      sectionId: 'sv1',
      section: input.section,
      theme: LIGHT,
      dark: false,
      showGrid: false,
      ...(a ? { annotations: a } : {}),
    });
    const text = { id: 't1', at: v(2, 1.5), text: 'Cota do pé-direito', height: 2.5, rotation: 0 };
    expect(SectionFrame.keyOf(frameInput(annotations({ texts: [text] })))).not.toBe(SectionFrame.keyOf(frameInput()));
    const frame = new SectionFrame();
    const view = input.viewport;
    const sem = frame.drawList(frameInput(), view, true);
    const com = frame.drawList(frameInput(annotations({ texts: [text] })), view, true);
    expect(com).not.toBe(sem);
    expect(com.labels.some((l) => l.text === text.text)).toBe(true);
    expect(sem.labels.some((l) => l.text === text.text)).toBe(false);
  });
});

describe('cotas do corte: hover, seleção e escala', () => {
  it('hoverId/selectedIds colorem a cota inteira e a escala informada muda as medidas de papel', async () => {
    const { sectionAnnotationOps } = await import('./annotations.ts');
    const input = baseInput(true, { dimensions: [{ id: 'd1', a: v(0, 0.2), b: v(3, 0.2), offset: 0.4 }] });
    const hover = sectionAnnotationOps(input, { hoverId: 'd1' });
    const sel = sectionAnnotationOps(input, { selectedIds: ['d1'] });
    expect(hover.strokes.every((s) => s.color === (input.theme.selectHover ?? input.theme.select))).toBe(true);
    expect(sel.strokes.every((s) => s.color === input.theme.select)).toBe(true);
    const a = sectionAnnotationOps(input, { scale: 50 });
    const b = sectionAnnotationOps(input);
    expect(a.labels[0]!.papel!.escala).toBe(50);
    expect(b.labels[0]!.papel!.escala).toBe(100);
  });

  it('hover e seleção da UI chegam ao desenho do corte pelo id da cota (buildSectionDrawList)', () => {
    const dim = { id: 'd1', a: v(0, 0.2), b: v(3, 0.2), offset: 0.4 };
    const base = baseInput(true, { dimensions: [dim] });
    const semRealce = buildSectionDrawList(base);
    const hover = buildSectionDrawList({ ...base, highlight: { selection: [], hover: 'd1' } });
    const sel = buildSectionDrawList({ ...base, highlight: { selection: ['d1'], hover: null } });
    const cor = (list: typeof semRealce): string[] => list.strokes.map((s) => s.color);
    expect(cor(hover)).toContain(LIGHT.selectHover ?? LIGHT.select);
    expect(cor(sel)).toContain(LIGHT.select);
    expect(cor(semRealce)).not.toContain(LIGHT.select);
    // Sem realce, a cota sai na cor de tinta (não na de seleção).
    expect(cor(semRealce).some((c) => c === LIGHT.ink)).toBe(true);
  });

  it('o estilo global do projeto chega ao desenho do corte (dimensionStyle em settings)', () => {
    const store = new ProjectStore(createEmptyProject());
    store.exec({ type: 'addWall', wall: makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: 'lv_0', a: v(0, 0), b: v(6, 0), height: 3 }) });
    store.exec({ type: 'setDimensionStyle', patch: { textHeight: 9 } });
    const base = baseInput(true, { dimensions: [{ id: 'd1', a: v(0, 0.2), b: v(3, 0.2), offset: 0.4 }] });
    const comEstilo = buildSectionDrawList({ ...base, project: store.project });
    const padrao = buildSectionDrawList(base);
    expect(JSON.stringify(comEstilo.labels)).not.toEqual(JSON.stringify(padrao.labels));
  });
});
