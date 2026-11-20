import { describe, expect, it } from 'vitest';
import { ProjectStore, SchemaError, emptyTitleBlock, SCHEMA_VERSION, createEmptyProject, makeLevel, makePlanView, migrateProject, validateProject } from './index.ts';

/** Arquivo da versão 30: o que o programa anterior gravava (sem `planViews`, fonte de prancha sem `planId`). */
function arquivoV30(): Record<string, unknown> {
  const p = JSON.parse(JSON.stringify(createEmptyProject())) as Record<string, unknown>;
  p.schemaVersion = 30;
  delete p.planViews;
  const levels = p.levels as Array<Record<string, unknown>>;
  levels[0]!.graphics = { scale: 50, detail: 'fine', style: 'hiddenLine', partialStructure: 'entire', overrides: {}, thinLines: false };
  levels[0]!.hidden = { elements: ['w9'], categories: ['slab'] };
  p.sheets = [
    {
      id: 'sh1', number: 'A-101', name: 'Plantas', size: 'A1', orientation: 'landscape', margin: 10,
      titleBlock: emptyTitleBlock(),
      viewports: [{ id: 'v1', view: { kind: 'plan', levelId: levels[0]!.id }, at: { x: 20, y: 20 }, size: { w: 150, h: 100 }, scale: 50 }],
    },
  ];
  return p;
}

describe('esquema 31 (planViews)', () => {
  it('a versão atual é 31 e o projeto novo sai na 31 sem planViews', () => {
    expect(SCHEMA_VERSION).toBe(31);
    const p = createEmptyProject();
    expect(p.schemaVersion).toBe(31);
    expect('planViews' in p).toBe(false);
  });

  it('arquivo 30 abre como 31 e preserva tudo (Level.graphics, Level.hidden, prancha) byte a byte', () => {
    const raw = arquivoV30();
    const antes = JSON.stringify({ levels: raw.levels, sheets: raw.sheets });
    const p = migrateProject(raw);
    expect(p.schemaVersion).toBe(31);
    expect(p.planViews).toBeUndefined();
    expect(JSON.stringify({ levels: p.levels, sheets: p.sheets })).toBe(antes);
  });

  it('o arquivo 30 migrado não ganha campo planViews e não tem problema novo de validação', () => {
    const p = migrateProject(arquivoV30());
    expect('planViews' in p).toBe(false);
    expect(validateProject(p).filter((i) => i.code.startsWith('plan-view') || i.code.startsWith('sheet-plan-view'))).toEqual([]);
  });

  it('ida e volta idempotente com planViews: serializar → abrir → serializar é idêntico (duas vezes)', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'upsertLevel', level: makeLevel({ id: 'lv_1', name: 'Pavimento 2', elevation: 3 }) });
    s.exec({ type: 'addPlanView', plan: makePlanView({ id: 'pv1', levelId: 'lv_0', name: 'Estrutura', discipline: 'estrutura', tones: { arquitetura: 'halftone' } }) });
    s.exec({ type: 'setPlanGraphics', planId: 'pv1', patch: { scale: 50, overrides: { slab: { halftone: true } } } });
    s.exec({ type: 'updatePlanView', id: 'pv1', patch: { hidden: { elements: ['p1'] } } });
    s.exec({ type: 'addPlanView', plan: makePlanView({ id: 'pv2', levelId: 'lv_1', name: 'Hidráulica', discipline: 'hidrossanitario' }) });
    s.exec({
      type: 'addSheet',
      sheet: {
        id: 'sh1', number: 'A-101', name: 'Plantas', size: 'A1', orientation: 'landscape', margin: 10,
        titleBlock: emptyTitleBlock(),
        viewports: [{ id: 'v1', view: { kind: 'plan', levelId: 'lv_0', planId: 'pv1' }, at: { x: 20, y: 20 }, size: { w: 150, h: 100 }, scale: 50 }],
      },
    });
    const texto = JSON.stringify(s.project);
    const volta = migrateProject(JSON.parse(texto));
    expect(volta.schemaVersion).toBe(31);
    expect(JSON.stringify(volta)).toBe(texto);
    expect(JSON.stringify(migrateProject(JSON.parse(JSON.stringify(volta))))).toBe(texto);
    expect(volta.planViews!.map((v) => v.id)).toEqual(['pv1', 'pv2']);
    expect(volta.planViews![0]).toMatchObject({ discipline: 'estrutura', tones: { arquitetura: 'halftone' }, hidden: { elements: ['p1'] } });
    expect(volta.sheets![0]!.viewports[0]!.view).toEqual({ kind: 'plan', levelId: 'lv_0', planId: 'pv1' });
  });

  it('arquivo de versão 32 é recusado com SchemaError citando 32 e 31', () => {
    const raw = { ...(JSON.parse(JSON.stringify(createEmptyProject())) as Record<string, unknown>), schemaVersion: 32 };
    expect(() => migrateProject(raw)).toThrow(SchemaError);
    expect(() => migrateProject(raw)).toThrow('versão 32');
    expect(() => migrateProject(raw)).toThrow('(31)');
  });

  it('arquivo de versão 25 percorre a cadeia até a 31 sem erro', () => {
    const raw = JSON.parse(JSON.stringify(createEmptyProject())) as Record<string, unknown>;
    raw.schemaVersion = 25;
    delete raw.columnTypes;
    delete raw.beamTypes;
    delete raw.footingTypes;
    const p = migrateProject(raw);
    expect(p.schemaVersion).toBe(31);
    expect(p.planViews).toBeUndefined();
  });
});
