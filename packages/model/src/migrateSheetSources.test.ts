import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createEmptyProject, emptyTitleBlock, floorViewId, migrateProject, roofViewId, type Project } from './index.ts';
import { normalizeSheetSourcesRaw } from './migrateSheetSources.ts';

/**
 * Compatibilidade de ARQUIVO: a forma antiga das fontes de viewport (`{ plan, levelId }`, `{ areaPlan, planId }`) e o
 * `roofHidden` do nível (antes do esquema 24) continuam abrindo e viram a forma única. Os projetos do ouro são v23.
 */
const DIR = new URL('../../../tests/vistas-ouro/projetos/', import.meta.url);
const bruto = (f: string): Record<string, any> => JSON.parse(readFileSync(new URL(f, DIR), 'utf8')) as Record<string, any>;

const folha = (views: unknown[]): Record<string, unknown> => ({
  id: 'sh1', number: 'A-01', name: 'Plantas', size: 'A3', orientation: 'landscape', margin: 10, titleBlock: emptyTitleBlock(),
  viewports: views.map((view, i) => ({ id: `v${i}`, view, at: { x: 20, y: 20 }, size: { w: 100, h: 80 }, scale: 100 })),
});

describe('normalizeSheetSourcesRaw', () => {
  it('forma antiga vira { plan, viewId }; o resto passa intacto', () => {
    const raw = { sheets: [folha([{ kind: 'plan', levelId: 'lv_0' }, { kind: 'areaPlan', planId: 'ap1' }, { kind: 'areaTable' }, { kind: 'section', sectionId: 's' }, { kind: 'plan', viewId: 'ap1' }])] };
    const out = normalizeSheetSourcesRaw(raw) as { sheets: Array<{ viewports: Array<{ view: unknown }> }> };
    expect(out.sheets[0]!.viewports.map((v) => v.view)).toEqual([
      { kind: 'plan', viewId: floorViewId('lv_0') },
      { kind: 'plan', viewId: 'ap1' },
      { kind: 'areaTable' },
      { kind: 'section', sectionId: 's' },
      { kind: 'plan', viewId: 'ap1' },
    ]);
  });

  it('é idempotente e devolve o próprio objeto quando não há o que mudar', () => {
    const raw = { sheets: [folha([{ kind: 'plan', viewId: 'ap1' }])] };
    expect(normalizeSheetSourcesRaw(raw)).toBe(raw);
    const antigo = { sheets: [folha([{ kind: 'plan', levelId: 'lv_0' }])] };
    const uma = normalizeSheetSourcesRaw(antigo);
    expect(normalizeSheetSourcesRaw(uma)).toBe(uma);
  });
});

describe('arquivo antigo abre pela migração', () => {
  it('v23 com prancha em forma antiga (projeto 07 do ouro): as viewports de planta viram viewId', () => {
    const b = bruto('07-pranchas.json');
    expect(b.schemaVersion).toBe(23);
    const antes = (b.sheets as Array<{ viewports: Array<{ view: { kind: string; levelId?: string; planId?: string } }> }>).flatMap((s) => s.viewports.map((v) => v.view));
    expect(antes.some((v) => v.kind === 'plan' && v.levelId !== undefined)).toBe(true);
    expect(antes.some((v) => v.kind === 'areaPlan' && v.planId !== undefined)).toBe(true);
    const p = migrateProject(b) as Project;
    const depois = p.sheets!.flatMap((s) => s.viewports.map((v) => v.view));
    expect(depois.every((v) => v.kind !== 'plan' || ('viewId' in v && typeof v.viewId === 'string'))).toBe(true);
    expect(depois).toContainEqual({ kind: 'plan', viewId: floorViewId('lv_0') });
    expect(depois).toContainEqual({ kind: 'plan', viewId: 'ap_prancha' });
    for (const v of depois) expect(JSON.stringify(v)).not.toMatch(/levelId|areaPlan|planId/);
  });

  it('v23 com roofHidden com ids (projeto 05 do ouro): vira o hidden da vista de cobertura e o campo antigo some', () => {
    const b = bruto('05-ocultos.json');
    expect(b.schemaVersion).toBe(23);
    const comRoofHidden = (b.levels as Array<{ id: string; roofHidden?: { elements?: string[]; categories?: string[] } }>).filter((l) => l.roofHidden);
    expect(comRoofHidden.length).toBeGreaterThan(0);
    const p = migrateProject(b) as Project;
    for (const l of comRoofHidden) {
      const hidden = p.planViews.find((v) => v.id === roofViewId(l.id))?.hidden;
      expect(hidden?.categories, l.id).toEqual(l.roofHidden!.categories);
      expect(hidden?.elements, l.id).toEqual(l.roofHidden!.elements);
    }
    for (const l of p.levels) expect(l as unknown as Record<string, unknown>).not.toHaveProperty('roofHidden');
  });

  it('projeto vazio salvo antes da 24 segue abrindo', () => {
    const v23 = JSON.parse(JSON.stringify(createEmptyProject())) as Record<string, any>;
    v23.schemaVersion = 23;
    delete v23.planViews;
    const p = migrateProject(v23) as Project;
    expect(p.planViews.some((v) => v.id === floorViewId(p.levels[0]!.id))).toBe(true);
  });
});
