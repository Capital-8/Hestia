import { describe, expect, it } from 'vitest';
import { ProjectStore, SCHEMA_VERSION, SchemaError, createEmptyProject, makeWall, migrateProject, type Project, type WallType } from './index.ts';

// Migração 24 → 25 (decisão 0056, §4.8): nada a converter; só avança a versão. Um arquivo 24 não tem os campos novos.

const projetoV24 = (): Record<string, unknown> => {
  const p = JSON.parse(JSON.stringify(createEmptyProject())) as Record<string, unknown>;
  delete p.mullionTypes;
  delete p.curtainPanelTypes;
  // Arquivo da versão 24 não tinha as predefinições de cortina (elas entraram na fase 1).
  const tipos = p.wallTypes as Record<string, { family?: string }>;
  for (const id of Object.keys(tipos)) if (tipos[id]!.family === 'curtain') delete tipos[id];
  return { ...p, schemaVersion: 24 };
};

const projetoComCortina = (): Project => {
  const s = new ProjectStore(createEmptyProject());
  const tipo: WallType = {
    ...s.project.wallTypes.wt_alv14!,
    id: 'wt_ct',
    name: 'Cortina',
    family: 'curtain',
    layers: [],
    strips: [],
    wrapInserts: 'none',
    wrapEnds: 'none',
    curtain: {
      depth: 0.1,
      u: { mode: 'fixedDistance', distance: 1.5, justify: 'start' },
      v: { mode: 'fixedNumber', count: 2 },
      mullions: {
        interiorVertical: 'mul_ret_50x100',
        interiorHorizontal: null,
        borderStart: 'mul_ret_50x100',
        borderEnd: 'mul_ret_50x100',
        borderBottom: null,
        borderTop: null,
        corner: null,
        joinPriority: 'vertical',
      },
      defaultPanelTypeId: 'pnl_vidro_10',
    },
  };
  s.exec({ type: 'upsertWallType', wallType: tipo });
  s.exec({ type: 'addWall', wall: makeWall({ id: 'w_ct', typeId: 'wt_ct', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 3, y: 0 } }) });
  return s.project;
};

describe('migração 24 → 25 (parede cortina)', () => {
  it('SCHEMA_VERSION é 25', () => {
    expect(SCHEMA_VERSION).toBe(25);
  });

  it('arquivo 24 abre, vira 25 e não ganha mapas nem família (ausente = parede básica)', () => {
    const antigo = projetoV24();
    const p = migrateProject(antigo);
    expect(p.schemaVersion).toBe(25);
    expect('mullionTypes' in p).toBe(false);
    expect('curtainPanelTypes' in p).toBe(false);
    for (const t of Object.values(p.wallTypes)) {
      expect(t.family).toBeUndefined();
      expect(t.curtain).toBeUndefined();
    }
    expect(p.wallTypes).toEqual((antigo as unknown as Project).wallTypes);
  });

  it('arquivo 25 com cortina abre sem alterar a cortina, a instância nem os mapas', () => {
    const p = projetoComCortina();
    const volta = migrateProject(JSON.parse(JSON.stringify(p)));
    expect(volta.schemaVersion).toBe(25);
    expect(volta.wallTypes.wt_ct).toEqual(p.wallTypes.wt_ct);
    expect(volta.elements.w_ct).toEqual(p.elements.w_ct);
  });

  it('arquivo de versão maior que a deste programa é recusado', () => {
    expect(() => migrateProject({ ...projetoV24(), schemaVersion: 26 })).toThrow(SchemaError);
    expect(() => migrateProject({ ...projetoV24(), schemaVersion: 26 })).toThrow('versão 26');
  });
});
