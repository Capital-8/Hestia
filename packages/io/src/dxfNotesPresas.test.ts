import { describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, floorViewId, makeWall, withViewPatchOfTest, type Project } from '@hestia/model';
import { notesDxfOf, viewNotesDxfOf } from './dxfNotes.ts';

/** Etapa 7 no DXF: cota e etiqueta somem com o elemento que não aparece na vista. */

const LV0 = 'lv_0';

function comPresas(): Project {
  const s = new ProjectStore(createEmptyProject());
  for (const [id, y] of [['w1', 0], ['w2', 3]] as const) s.exec({ type: 'addWall', wall: makeWall({ id, typeId: 'wt_alv14', levelId: LV0, a: { x: 0, y }, b: { x: 4, y } }) });
  s.exec({ type: 'addDimension', levelId: LV0, dimension: { id: 'd_w1', a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, offset: 1, text: 'PRESA_W1', refs: { a: { wallId: 'w1', end: 'a' } } } });
  s.exec({ type: 'addDimension', levelId: LV0, dimension: { id: 'd_livre', a: { x: 0, y: 0 }, b: { x: 3, y: 0 }, offset: 1, text: 'LIVRE' } });
  s.exec({ type: 'addTag', levelId: LV0, item: { id: 'tg_w1', hostId: 'w1', at: { x: 1, y: 1 }, property: 'type' } });
  s.exec({ type: 'addTag', levelId: LV0, item: { id: 'tg_w2', hostId: 'w2', at: { x: 1, y: 2 }, property: 'type' } });
  return s.project;
}

const textos = (p: Project, layer: string, fora?: ReadonlySet<string>): string[] =>
  viewNotesDxfOf(p, floorViewId(LV0), 100, fora).texts.filter((t) => t.layer === layer).map((t) => t.text);

describe('etapa 7 no DXF da planta', () => {
  it('sem ocultos saem as duas cotas e as duas etiquetas', () => {
    const p = comPresas();
    expect(textos(p, 'COTAS')).toEqual(['PRESA_W1', 'LIVRE']);
    expect(textos(p, 'ETIQUETAS')).toHaveLength(2);
  });

  it('parede em hidden.elements da vista: some a cota presa e a etiqueta dela; ficam a livre e a da outra parede', () => {
    const p = withViewPatchOfTest(comPresas(), floorViewId(LV0), { hidden: { elements: ['w1'] } });
    expect(textos(p, 'COTAS')).toEqual(['LIVRE']);
    expect(textos(p, 'ETIQUETAS')).toHaveLength(1);
    // As linhas da cota presa também saem: só restam as 5 da cota livre (linha, 2 chamadas, 2 marcas).
    expect(viewNotesDxfOf(p, floorViewId(LV0), 100).lines).toHaveLength(5);
  });

  it('parede de categoria oculta na vista também esconde', () => {
    const p = withViewPatchOfTest(comPresas(), floorViewId(LV0), { hidden: { categories: ['wall'] } });
    expect(textos(p, 'COTAS')).toEqual(['LIVRE']);
    expect(textos(p, 'ETIQUETAS')).toHaveLength(0);
  });

  it('parede fora do alcance da vista (`outOfRange`, que o web informa) esconde a cota e a etiqueta dela', () => {
    const p = comPresas();
    expect(textos(p, 'COTAS', new Set(['w1']))).toEqual(['LIVRE']);
    expect(textos(p, 'ETIQUETAS', new Set(['w2']))).toHaveLength(1);
  });

  it('notesDxfOf(nível) repassa o alcance à vista de piso', () => {
    const p = comPresas();
    expect(notesDxfOf(p, LV0, 100, new Set(['w1'])).texts.filter((x) => x.layer === 'COTAS').map((x) => x.text)).toEqual(['LIVRE']);
  });
});
