import { describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject } from '@hestia/model';
import { projetoTerreno } from '@hestia/engine';
import { addSheetAction, addViewAction, pranchaDaPlantaAtual, sheetsPdfOf } from './sheetActions.ts';

describe('PDF sem prancha', () => {
  it('sem pranchas não há PDF; com a planta atual vira uma prancha e o PDF sai não vazio', () => {
    const s = new ProjectStore(createEmptyProject());
    const lv = s.project.levels[0]!.id;
    expect(sheetsPdfOf(s.project)).toBeNull();

    const id = pranchaDaPlantaAtual(s, lv);
    expect(s.project.sheets?.some((sh) => sh.id === id)).toBe(true);
    const pdf = sheetsPdfOf(s.project);
    expect(pdf).not.toBeNull();
    expect(new TextDecoder().decode(pdf!.slice(0, 5))).toBe('%PDF-');
  });

  it('a criação automática é desfeita com Ctrl+Z (undo)', () => {
    const s = new ProjectStore(createEmptyProject());
    const lv = s.project.levels[0]!.id;
    pranchaDaPlantaAtual(s, lv);
    expect(s.project.sheets?.length ?? 0).toBe(1);
    // Um só Ctrl+Z desfaz a prancha e a vista juntas (não sobra prancha vazia).
    s.undo();
    expect(s.project.sheets?.length ?? 0).toBe(0);
  });
});

describe('PDF de prancha com terreno (T5): planta, corte e 3D vetorial', () => {
  /** Prancha com a planta, o corte por y = 10 e o 3D vetorial de um projeto que só tem o terreno T5. */
  function pranchaDoTerreno(): ProjectStore {
    const s = new ProjectStore(projetoTerreno('T5'));
    s.exec({ type: 'addView', view: { id: 'corte_t5', name: 'Corte T5', kind: 'section', a: { x: -2, y: 10 }, b: { x: 22, y: 10 }, depth: 12 } });
    const sheet = addSheetAction(s);
    addViewAction(s, sheet, { kind: 'plan', levelId: 'lv_0' }, 100);
    addViewAction(s, sheet, { kind: 'section', sectionId: 'corte_t5' }, 100);
    addViewAction(s, sheet, { kind: '3d' }, 100);
    return s;
  }

  it('sem o kernel pronto o terreno não é desenhado e o PDF sai sem erro, com as três vistas', () => {
    const s = pranchaDoTerreno();
    expect(s.project.sheets?.[0]?.viewports).toHaveLength(3);
    const pdf = sheetsPdfOf(s.project);
    expect(pdf).not.toBeNull();
    expect(new TextDecoder().decode(pdf!.slice(0, 5))).toBe('%PDF-');
  });
});
