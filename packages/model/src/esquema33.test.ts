import { describe, expect, it } from 'vitest';
import { ProjectStore, SchemaError, emptyTitleBlock, SCHEMA_VERSION, createEmptyProject, makeLevel, makePlanView, migrateProject, validateProject } from './index.ts';

/** Arquivo da versão 31: o que o programa anterior gravava (com `planViews`, mas sem perfis, disciplinas do projeto, `Level.discipline` e `view3d.discipline`). */
function arquivoV31(): Record<string, unknown> {
  const p = JSON.parse(JSON.stringify(createEmptyProject())) as Record<string, unknown>;
  p.schemaVersion = 31;
  const levels = p.levels as Array<Record<string, unknown>>;
  levels[0]!.graphics = { scale: 50, detail: 'fine', style: 'hiddenLine', partialStructure: 'entire', overrides: {}, thinLines: false };
  levels[0]!.hidden = { elements: ['w9'], categories: ['slab'] };
  p.planViews = [{ id: 'pv1', levelId: levels[0]!.id, discipline: 'estrutura', name: 'Estrutura', tones: { arquitetura: 'halftone' } }];
  p.sheets = [
    {
      id: 'sh1', number: 'A-101', name: 'Plantas', size: 'A1', orientation: 'landscape', margin: 10,
      titleBlock: emptyTitleBlock(),
      viewports: [{ id: 'v1', view: { kind: 'plan', levelId: levels[0]!.id, planId: 'pv1' }, at: { x: 20, y: 20 }, size: { w: 150, h: 100 }, scale: 50 }],
    },
  ];
  return p;
}

/** Arquivo da versão 32 com perfis (tom legado e apresentação), disciplinas do projeto, remapeamento e disciplina do nível/3D. */
function arquivoV32(): Record<string, unknown> {
  const p = JSON.parse(JSON.stringify(createEmptyProject())) as Record<string, unknown>;
  p.schemaVersion = 32;
  const levels = p.levels as Array<Record<string, unknown>>;
  levels[0]!.discipline = 'estrutura';
  levels[1]!.discipline = 'paisagismo';
  p.disciplines = [{ id: 'paisagismo', name: 'Paisagismo', color: '#33aa55' }];
  p.disciplineProfiles = {
    estrutura: { wall: 'halftone', slab: 'normal' },
    paisagismo: { wall: { tone: 'halftone', clareamento: 0.2, opacidade: 0.5 }, door: 'hidden' },
  };
  p.categoryDiscipline = { wall: 'paisagismo', slab: 'estrutura' };
  p.view3d = { discipline: 'estrutura' };
  return p;
}

describe('esquema 33 (apresentação por disciplina)', () => {
  it('a versão atual é 33 e o projeto novo sai na 33 sem planViews', () => {
    expect(SCHEMA_VERSION).toBe(34);
    const p = createEmptyProject();
    expect(p.schemaVersion).toBe(34);
    expect('planViews' in p).toBe(false);
  });

  it('arquivo 31 abre como 33 e preserva levels, sheets e planViews byte a byte', () => {
    const raw = arquivoV31();
    const antes = JSON.stringify({ levels: raw.levels, sheets: raw.sheets, planViews: raw.planViews });
    const p = migrateProject(raw);
    expect(p.schemaVersion).toBe(34);
    expect(JSON.stringify({ levels: p.levels, sheets: p.sheets, planViews: p.planViews })).toBe(antes);
    expect(p.disciplines).toBeUndefined();
    expect(p.disciplineProfiles).toBeUndefined();
    expect(p.categoryDiscipline).toBeUndefined();
    expect(p.levels[0]!.discipline).toBeUndefined();
    expect(p.view3d?.discipline).toBeUndefined();
  });

  it('o arquivo 31 migrado não tem problema novo de validação de planta', () => {
    const p = migrateProject(arquivoV31());
    expect(validateProject(p).filter((i) => i.code.startsWith('plan-view') || i.code.startsWith('sheet-plan-view'))).toEqual([]);
  });

  it('arquivo 32 com perfis (tom e apresentação), disciplinas e remapeamento: migra para 33 preservando os dados', () => {
    const raw = arquivoV32();
    const esperado = JSON.stringify({ ...raw, schemaVersion: 34 });
    const volta = migrateProject(JSON.parse(JSON.stringify(raw)));
    expect(volta.schemaVersion).toBe(34);
    expect(JSON.stringify(volta)).toBe(esperado);
    expect(JSON.stringify(migrateProject(JSON.parse(JSON.stringify(volta))))).toBe(esperado);
    expect(volta.disciplines).toEqual([{ id: 'paisagismo', name: 'Paisagismo', color: '#33aa55' }]);
    expect(volta.disciplineProfiles?.estrutura).toEqual({ wall: 'halftone', slab: 'normal' });
    expect(volta.disciplineProfiles?.paisagismo).toEqual({ wall: { tone: 'halftone', clareamento: 0.2, opacidade: 0.5 }, door: 'hidden' });
    expect(volta.categoryDiscipline).toEqual({ wall: 'paisagismo', slab: 'estrutura' });
    expect(volta.levels[0]!.discipline).toBe('estrutura');
    expect(volta.levels[1]!.discipline).toBe('paisagismo');
    expect(volta.view3d?.discipline).toBe('estrutura');
  });

  it('ida e volta idempotente com planViews e apresentação: serializar → abrir → serializar é idêntico (duas vezes)', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'upsertLevel', level: makeLevel({ id: 'lv_1', name: 'Pavimento 2', elevation: 3 }) });
    s.exec({
      type: 'addPlanView',
      plan: makePlanView({
        id: 'pv1', levelId: 'lv_0', name: 'Estrutura', discipline: 'estrutura',
        tones: { arquitetura: { tone: 'halftone', clareamento: 0.2, opacidade: 0.5 } },
      }),
    });
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
    expect(volta.schemaVersion).toBe(34);
    expect(JSON.stringify(volta)).toBe(texto);
    expect(JSON.stringify(migrateProject(JSON.parse(JSON.stringify(volta))))).toBe(texto);
    expect(volta.planViews!.map((v) => v.id)).toEqual(['pv1', 'pv2']);
    expect(volta.planViews![0]).toMatchObject({
      discipline: 'estrutura',
      tones: { arquitetura: { tone: 'halftone', clareamento: 0.2, opacidade: 0.5 } },
      hidden: { elements: ['p1'] },
    });
    expect(volta.sheets![0]!.viewports[0]!.view).toEqual({ kind: 'plan', levelId: 'lv_0', planId: 'pv1' });
  });

  it('arquivo de versão 35 é recusado com SchemaError citando 35 e 34', () => {
    const raw = { ...(JSON.parse(JSON.stringify(createEmptyProject())) as Record<string, unknown>), schemaVersion: 35 };
    expect(() => migrateProject(raw)).toThrow(SchemaError);
    expect(() => migrateProject(raw)).toThrow('versão 35');
    expect(() => migrateProject(raw)).toThrow('(34)');
  });

  it('arquivo de versão 25 percorre a cadeia até a 34 sem erro', () => {
    const raw = JSON.parse(JSON.stringify(createEmptyProject())) as Record<string, unknown>;
    raw.schemaVersion = 25;
    delete raw.columnTypes;
    delete raw.beamTypes;
    delete raw.footingTypes;
    const p = migrateProject(raw);
    expect(p.schemaVersion).toBe(34);
    expect(p.planViews).toBeUndefined();
  });
});
