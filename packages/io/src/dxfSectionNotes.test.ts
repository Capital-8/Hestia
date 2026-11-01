import { describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, makeWall, type Project } from '@hestia/model';
import { DXF_LAYER_COTAS, DXF_LAYER_TEXTOS } from './dxfNotes.ts';
import { DXF_SECTION_LAYER_LEVELS, dxfSectionLayerStyleOf, dxfSectionLayersOf, dxfSectionLineRoleOf, sectionDxfDocOf } from './dxfSection.ts';
import { sectionNotesDxfOf } from './dxfSectionNotes.ts';

const v = (x: number, y: number): { x: number; y: number } => ({ x, y });

/** Projeto com parede e uma vista de corte com cotas, texto e detalhe no plano (t,z). */
function corte(): { store: ProjectStore; p: Project } {
  const store = new ProjectStore(createEmptyProject());
  store.exec({ type: 'addWall', wall: makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: 'lv_0', a: v(0, 0), b: v(6, 0), height: 3 }) });
  store.exec({ type: 'addView', view: { id: 'sv1', name: 'Corte AA', kind: 'section', a: v(0, -2), b: v(6, -2), depth: 8 } });
  store.exec({ type: 'addDimension', levelId: 'lv_0', sectionId: 'sv1', dimension: { id: 'd1', a: v(0, 0), b: v(3, 0), offset: 0.4 } });
  store.exec({ type: 'addText', levelId: 'lv_0', sectionId: 'sv1', text: { id: 't1', at: v(1, 2.4), text: 'Pé-direito', height: 2.5, rotation: 0 } });
  store.exec({ type: 'addDetailLine', levelId: 'lv_0', sectionId: 'sv1', item: { id: 'l1', a: v(0, 1), b: v(4, 1) } });
  return { store, p: store.project };
}

describe('DXF das anotações do corte/elevação', () => {
  it('cota entra em COTAS com linhas e valor, texto em TEXTOS e detalhe em DETALHE', () => {
    const { p } = corte();
    const notes = sectionNotesDxfOf(p, 'sv1', 100)!;
    expect(notes).toBeDefined();
    const cotas = notes.texts.filter((t) => t.layer === DXF_LAYER_COTAS);
    expect(cotas).toHaveLength(1);
    expect(cotas[0]!.text).toBe('3,00 m');
    // Altura em metros de desenho: 2,5 mm de papel na escala 1:100 = 0,25 m.
    expect(cotas[0]!.height).toBeCloseTo(0.25, 9);
    // Linha de cota, 2 linhas de chamada e 2 marcas de 45° (um segmento cada).
    expect(notes.lines.length).toBe(1 + 2 + 2);
    expect(notes.texts.some((t) => t.layer === DXF_LAYER_TEXTOS && t.text === 'Pé-direito')).toBe(true);
    expect(notes.otherLines!.some((l) => l.layer === 'DETALHE')).toBe(true);
  });

  it('a escala da vista muda o tamanho de papel do texto e das marcas', () => {
    const { p } = corte();
    const at100 = sectionNotesDxfOf(p, 'sv1', 100)!;
    const at50 = sectionNotesDxfOf(p, 'sv1', 50)!;
    const h = (n: typeof at100): number => n.texts.find((t) => t.layer === DXF_LAYER_COTAS)!.height;
    expect(h(at50)).toBeCloseTo(h(at100) / 2, 9);
  });

  it('fonte da família muda o valor e a altura do texto da cota do corte', () => {
    const { store, p } = corte();
    expect(sectionNotesDxfOf(p, 'sv1', 100)!.texts.find((t) => t.layer === DXF_LAYER_COTAS)!.text).toBe('3,00 m');
    store.exec({ type: 'upsertDimensionFamily', family: { id: 'fam_cm', name: 'Centímetros', tick: 'slash', tickSize: 2.8, textHeight: 4, font: 'Arial', extensionGap: 1.5, extensionOvershoot: 2, textPlacement: 'above', textGap: 1.5, readConvention: 'aligned', textFit: 'leader', leaderWhenNoFit: true, stackSpacing: 7, unit: 'cm', precision: 0, prefix: '', suffix: '' } });
    store.exec({ type: 'updateDimension', levelId: 'lv_0', sectionId: 'sv1', id: 'd1', patch: { familyId: 'fam_cm' } });
    const nota = sectionNotesDxfOf(store.project, 'sv1', 100)!.texts.find((t) => t.layer === DXF_LAYER_COTAS)!;
    expect(nota.text).toBe('300 cm');
    expect(nota.height).toBeCloseTo(0.4, 9);
  });

  it('vista sem anotações devolve undefined; vista inexistente também', () => {
    const { p, store } = corte();
    store.exec({ type: 'addView', view: { id: 'sv2', name: 'Corte BB', kind: 'section', a: v(0, 0), b: v(2, 0), depth: 4 } });
    expect(sectionNotesDxfOf(store.project, 'sv2', 100)).toBeUndefined();
    expect(sectionNotesDxfOf(p, 'nao', 100)).toBeUndefined();
  });

  it('o documento do corte recebe as entidades e as camadas de anotação, com peso 0 (anotação)', () => {
    const { p } = corte();
    const notes = sectionNotesDxfOf(p, 'sv1', 100)!;
    const camadas = dxfSectionLayersOf({ cut: [], beyond: [], notes });
    expect(camadas).toContain(DXF_LAYER_COTAS);
    expect(camadas).toContain(DXF_LAYER_TEXTOS);
    expect(dxfSectionLineRoleOf(DXF_LAYER_COTAS)).toBe('annotation');
    expect(dxfSectionLineRoleOf(DXF_LAYER_TEXTOS)).toBe('annotation');
    expect(dxfSectionLayerStyleOf(DXF_LAYER_COTAS, 0)).toMatchObject({ color: 7, lineWeight: 0 });
    const doc = sectionDxfDocOf({ cut: [], beyond: [], notes });
    expect(doc.layers.map((l) => l.name)).toEqual(expect.arrayContaining([DXF_LAYER_COTAS, DXF_LAYER_TEXTOS]));
    expect(doc.entities.some((e) => e.kind === 'text' && e.layer === DXF_LAYER_COTAS)).toBe(true);
    expect(doc.entities.some((e) => e.kind === 'line' && e.layer === DXF_LAYER_COTAS)).toBe(true);
  });

  it('os níveis continuam sendo anotação (peso 0)', () => {
    expect(dxfSectionLineRoleOf(DXF_SECTION_LAYER_LEVELS)).toBe('annotation');
  });
});
