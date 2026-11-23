import { describe, expect, it } from 'vitest';
import { DEFAULT_AREA_GRAPHICS, DEFAULT_TAG_FIELDS, SchemaError, SCHEMA_VERSION, createEmptyProject, emptyTitleBlock, makeLevel, makeWall, migrateProject, ProjectStore, type AreaPlan, type Project, type Sheet } from './index.ts';

/*
 * Fixtures de esquema (decisão 0060, fase 1B): um projeto com os campos que a fase 2 vai mexer (`Level.graphics`,
 * `Level.hidden`, pranchas com vista, anotações do nível e da planta de área) e os da fase 1B (`disciplines`,
 * `disciplineProfiles`, `categoryDiscipline`). A ida e volta serializar → abrir → serializar tem de ser idêntica no
 * esquema atual (33). Hoje o programa recusa arquivo de versão mais nova (34).
 */

const sheet: Sheet = {
  id: 'sh1',
  number: 'A-101',
  name: 'Planta baixa',
  size: 'A3',
  orientation: 'landscape',
  margin: 10,
  titleBlock: emptyTitleBlock(),
  viewports: [{ id: 'v1', view: { kind: 'plan', levelId: 'lv_0' }, at: { x: 20, y: 20 }, size: { w: 150, h: 100 }, scale: 50 }],
};

const areaPlan: AreaPlan = {
  id: 'ap1',
  name: 'Planta de área',
  levelId: 'lv_0',
  scale: 50,
  graphics: { ...DEFAULT_AREA_GRAPHICS, tagDefault: { ...DEFAULT_AREA_GRAPHICS.tagDefault, fields: [...DEFAULT_TAG_FIELDS] } },
  tags: [],
  annotations: {
    dimensions: [{ id: 'dA', a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, offset: 1.5 }],
    texts: [{ id: 'tA', at: { x: 2, y: 4 }, text: 'NOTA DA AREA', height: 3, rotation: 0 }],
    detailLines: [],
    detailRegions: [],
    tags: [],
  },
};

/** Projeto com Level.graphics (lv_0), Level.hidden (lv_1), cotas e textos do nível, planta de área, prancha e 2 níveis. */
function projetoComCampos() {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'upsertLevel', level: makeLevel({ id: 'lv_1', name: 'Pavimento 2', elevation: 3 }) });
  const quadro: Array<[number, number]> = [[0, 0], [0, 5], [4, 5], [4, 0]];
  quadro.forEach((p, i) => {
    const q = quadro[(i + 1) % quadro.length]!;
    s.exec({ type: 'addWall', wall: makeWall({ id: `w${i}`, typeId: 'wt_alv14', levelId: 'lv_0', a: { x: p[0], y: p[1] }, b: { x: q[0], y: q[1] }, locationLine: 'finishInterior' }) });
  });
  s.exec({ type: 'setLevelGraphics', levelId: 'lv_0', patch: { scale: 50, detail: 'fine', overrides: { slab: { halftone: true, transparency: 0.25 } } } });
  s.exec({ type: 'addWall', wall: makeWall({ id: 'm0', typeId: 'wt_alv14', levelId: 'lv_1', a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, locationLine: 'finishInterior' }) });
  s.exec({ type: 'setViewHidden', target: { kind: 'plan', levelId: 'lv_1' }, hidden: { elements: ['m0'], categories: ['slab'] } });
  s.exec({ type: 'addDimension', levelId: 'lv_0', dimension: { id: 'dn', a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, offset: 1 } });
  s.exec({ type: 'addText', levelId: 'lv_0', text: { id: 'tn', at: { x: 2, y: 3 }, text: 'NOTA DO NIVEL', height: 3, rotation: 0 } });
  s.exec({ type: 'addAreaPlan', plan: areaPlan });
  s.exec({ type: 'addSheet', sheet });
  const p = JSON.parse(JSON.stringify(s.project)) as Project;
  p.disciplines = [{ id: 'paisagismo', name: 'Paisagismo', color: '#33aa55' }];
  p.disciplineProfiles = {
    estrutura: { wall: 'halftone', slab: 'normal' },
    paisagismo: { wall: 'normal', site: { tone: 'halftone', clareamento: 0.2, opacidade: 0.5 } },
  };
  p.categoryDiscipline = { wall: 'paisagismo' };
  return p;
}

describe('esquema: fixtures de ida e volta (esquema 33)', () => {
  it('projeto com graphics, hidden, prancha, anotações e perfis: serializar → abrir → serializar é idêntico', () => {
    const texto = JSON.stringify(projetoComCampos());
    const volta = migrateProject(JSON.parse(texto));
    expect(volta.schemaVersion).toBe(33);
    expect(JSON.stringify(volta)).toBe(texto);
    // Segunda volta: a estabilidade vale para mais de uma ida e volta.
    expect(JSON.stringify(migrateProject(JSON.parse(JSON.stringify(volta))))).toBe(texto);
  });

  it('os campos chegam à volta com os valores gravados (graphics, hidden, cota, texto, planta de área, prancha, disciplinas)', () => {
    const p = migrateProject(JSON.parse(JSON.stringify(projetoComCampos())));
    const lv0 = p.levels.find((l) => l.id === 'lv_0')!;
    const lv1 = p.levels.find((l) => l.id === 'lv_1')!;
    expect(lv0.graphics?.scale).toBe(50);
    expect(lv0.graphics?.detail).toBe('fine');
    expect(lv0.graphics?.overrides.slab).toMatchObject({ halftone: true, transparency: 0.25 });
    expect(lv1.graphics).toBeUndefined();
    expect(lv1.hidden).toEqual({ elements: ['m0'], categories: ['slab'] });
    expect(lv0.hidden).toBeUndefined();
    expect(lv0.dimensions?.map((d) => d.id)).toEqual(['dn']);
    expect(lv0.texts?.map((t) => t.text)).toEqual(['NOTA DO NIVEL']);
    expect(p.areaPlans?.[0]?.annotations?.dimensions.map((d) => d.id)).toEqual(['dA']);
    expect(p.areaPlans?.[0]?.annotations?.texts.map((t) => t.text)).toEqual(['NOTA DA AREA']);
    expect(p.sheets?.[0]).toMatchObject({ number: 'A-101', viewports: [expect.objectContaining({ id: 'v1', scale: 50 })] });
    expect(p.disciplines).toEqual([{ id: 'paisagismo', name: 'Paisagismo', color: '#33aa55' }]);
    expect(p.disciplineProfiles).toEqual({
      estrutura: { wall: 'halftone', slab: 'normal' },
      paisagismo: { wall: 'normal', site: { tone: 'halftone', clareamento: 0.2, opacidade: 0.5 } },
    });
    expect(p.categoryDiscipline).toEqual({ wall: 'paisagismo' });
  });

  it('a versão atual é 33 e um arquivo de versão 33 abre e permanece na 33', () => {
    expect(SCHEMA_VERSION).toBe(33);
    const raw = JSON.parse(JSON.stringify(projetoComCampos())) as Record<string, unknown>;
    expect(raw.schemaVersion).toBe(33);
    expect(migrateProject(raw).schemaVersion).toBe(33);
  });

  it('versão futura (34 = atual + 1) é recusada com SchemaError citando 34 e 33 (migrate.ts:319)', () => {
    const raw = { ...(JSON.parse(JSON.stringify(projetoComCampos())) as Record<string, unknown>), schemaVersion: 34 };
    expect(() => migrateProject(raw)).toThrow(SchemaError);
    expect(() => migrateProject(raw)).toThrow('versão 34');
    expect(() => migrateProject(raw)).toThrow('(33)');
  });
});
