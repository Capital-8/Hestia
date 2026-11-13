import { describe, expect, it } from 'vitest';
import { createEmptyProject } from './defaults.ts';
import { ProjectStore } from './history.ts';
import { migrateProject, SchemaError } from './migrate.ts';
import { makeBeam } from './beam.ts';
import { DEFAULT_COLUMN_TYPES, makeColumn } from './column.ts';
import { makeFooting } from './footing.ts';
import { labelOf } from './historyRotulos.ts';
import { elementLevelId } from './elementLevel.ts';
import { GRAPHICS_CATEGORIES, graphicsCategoryLabels } from './graphics.ts';
import { SCHEMA_VERSION, type Project, type SlabType } from './types.ts';
import type { Beam, Column, Footing } from './estrTypes.ts';

/** Projeto no formato da versão 25, sem estrutura. */
function legacyV25(): Record<string, unknown> {
  const p = JSON.parse(JSON.stringify(createEmptyProject())) as Record<string, unknown>;
  p.schemaVersion = 25;
  return p;
}

function comEstrutura(): ProjectStore {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'addColumn', column: makeColumn({ id: 'c1', typeId: 'pil_est_25x25', levelId: 'lv_0', pos: { x: 1, y: 2 }, rotation: 0.4 }) });
  s.exec({ type: 'addBeam', beam: makeBeam({ id: 'b1', typeId: 'vig_15x40', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 5, y: 0 }, zOffsetB: 0.2 }) });
  s.exec({ type: 'addFooting', footing: makeFooting({ id: 'f1', typeId: 'sap_80x80x30', levelId: 'lv_0', pos: { x: 1, y: 2 } }) });
  s.exec({ type: 'addFooting', footing: makeFooting({ id: 'f2', typeId: 'bal_40x30', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 6, y: 0 }, topOffset: -0.2 }) });
  return s;
}

describe('migração 25 → 26 (pilar, viga e fundação)', () => {
  it('SCHEMA_VERSION é 26', () => {
    expect(SCHEMA_VERSION).toBe(26);
  });

  it('só avança a versão e não altera nenhum dado; não grava tipos de estrutura', () => {
    const antigo = legacyV25();
    const m = migrateProject(JSON.parse(JSON.stringify(antigo)));
    expect(m.schemaVersion).toBe(26);
    const { schemaVersion: _v, ...resto } = m as unknown as Record<string, unknown>;
    const { schemaVersion: _a, ...restoAntigo } = antigo;
    expect(resto).toEqual(restoAntigo);
    expect('columnTypes' in m || 'beamTypes' in m || 'footingTypes' in m).toBe(false);
  });

  it('ida e volta: projeto com pilar, viga, fundações e tipos próprios salva e reabre igual, com desfazer', () => {
    const s = comEstrutura();
    s.exec({ type: 'upsertColumnType', columnType: { ...DEFAULT_COLUMN_TYPES.pil_est_25x25!, id: 'pil_circ', perfil: { forma: 'circular', d: 0.3 } } });
    const json = JSON.parse(JSON.stringify(s.project));
    expect(json.schemaVersion).toBe(26);
    const volta = migrateProject(json);
    expect(volta.elements.c1).toEqual(s.project.elements.c1);
    expect(volta.elements.b1).toEqual(s.project.elements.b1);
    expect(volta.elements.f1).toEqual(s.project.elements.f1);
    expect(volta.elements.f2).toEqual(s.project.elements.f2);
    expect(volta.columnTypes).toEqual(s.project.columnTypes);
    const relido = migrateProject(JSON.parse(JSON.stringify(volta)));
    expect(relido).toEqual(volta);
    s.undo();
    s.undo();
    s.undo();
    s.undo();
    s.undo();
    expect(Object.keys(s.project.elements)).toHaveLength(0);
  });

  it('arquivo mais novo que o programa continua recusado', () => {
    expect(() => migrateProject({ ...legacyV25(), schemaVersion: 27 })).toThrow(SchemaError);
  });

  it('laje com uso de fundação (radier) sobrevive à ida e volta; ausente continua ausente', () => {
    const s = new ProjectStore(createEmptyProject());
    const base = Object.values(s.project.slabTypes)[0]!;
    const radier: SlabType = { ...base, id: 'ls_radier', name: 'Radier', uso: 'fundacao' };
    s.exec({ type: 'upsertSlabType', slabType: radier });
    const volta: Project = migrateProject(JSON.parse(JSON.stringify(s.project)));
    expect(volta.slabTypes.ls_radier?.uso).toBe('fundacao');
    expect('uso' in volta.slabTypes[base.id]!).toBe(false);
  });
});

describe('estrutura nos pontos de registro do modelo', () => {
  it('as três categorias gráficas existem, com rótulo nos sete idiomas e estilo próprio', () => {
    for (const c of ['columns', 'beams', 'footings'] as const) {
      expect(GRAPHICS_CATEGORIES).toContain(c);
      for (const lang of ['pt', 'en', 'es', 'de', 'fr', 'it', 'pl'] as const) expect(graphicsCategoryLabels(lang)[c].length).toBeGreaterThan(0);
    }
  });

  it('rótulos do histórico de desfazer para os 15 comandos', () => {
    const rotulos = [
      labelOf({ type: 'addColumn', column: makeColumn({ id: 'x', typeId: 't', levelId: 'l', pos: { x: 0, y: 0 } }) }),
      labelOf({ type: 'updateColumn', id: 'x', patch: {} }),
      labelOf({ type: 'setColumnType', ids: [], typeId: 't' }),
      labelOf({ type: 'deleteColumnType', id: 't' }),
      labelOf({ type: 'updateBeam', id: 'x', patch: {} }),
      labelOf({ type: 'setBeamType', ids: [], typeId: 't' }),
      labelOf({ type: 'deleteBeamType', id: 't' }),
      labelOf({ type: 'updateFooting', id: 'x', patch: {} }),
      labelOf({ type: 'setFootingType', ids: [], typeId: 't' }),
      labelOf({ type: 'deleteFootingType', id: 't' }),
    ];
    for (const r of rotulos) expect(r).toMatch(/pilar|viga|fundação/);
    expect(new Set(rotulos).size).toBe(rotulos.length);
  });

  it('setElementLevel leva pilar, viga e fundação: manter a cota compensa o deslocamento (nível 2 a 3 m)', () => {
    const s = comEstrutura();
    s.exec({ type: 'setElementLevel', ids: ['c1', 'b1', 'f1'], levelId: 'lv_1', keep: 'elevation' });
    expect(elementLevelId(s.project.elements.c1)).toBe('lv_1');
    expect((s.project.elements.c1 as Column).baseOffset).toBe(-3);
    expect(s.project.elements.b1 as Beam).toMatchObject({ levelId: 'lv_1', zOffsetA: -3, zOffsetB: -2.8 });
    expect((s.project.elements.f1 as Footing).topOffset).toBe(-3);
    s.undo();
    expect((s.project.elements.c1 as Column).baseOffset).toBe(0);
    s.exec({ type: 'setElementLevel', ids: ['c1', 'b1', 'f1'], levelId: 'lv_1', keep: 'offset' });
    expect((s.project.elements.c1 as Column).baseOffset).toBe(0);
    expect((s.project.elements.b1 as Beam).zOffsetB).toBe(0.2);
  });

  it('deleteElements apaga os três kinds e desfaz', () => {
    const s = comEstrutura();
    s.exec({ type: 'deleteElements', ids: ['c1', 'b1', 'f1', 'f2'] });
    expect(Object.keys(s.project.elements)).toHaveLength(0);
    s.undo();
    expect(Object.keys(s.project.elements).sort()).toEqual(['b1', 'c1', 'f1', 'f2']);
  });
});
