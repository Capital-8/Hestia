import { describe, expect, it } from 'vitest';
import { FAMILIA_ARMARIO, SchemaError, SCHEMA_VERSION, createEmptyProject, migrateProject } from './index.ts';

/**
 * Arquivo da versão 29 com os campos que a versão 30 passa a declarar: terreno com `tipoId` (tipo com suavização),
 * móvel da Biblioteca (`component` com a família em `componentFamilies`) e móvel importado (`furniture` mínimo).
 */
function arquivoV29(): Record<string, unknown> {
  const p = JSON.parse(JSON.stringify(createEmptyProject())) as Record<string, unknown>;
  p.schemaVersion = 29;
  const settings = p.settings as Record<string, unknown>;
  settings.terrainTypes = [
    { id: 'tt_suave', name: 'Suave', intervaloCurvas: 1, mestraCada: 5, curvaPeso: 1, mestraPeso: 2, suavizarCurvas: true, toleranciaSuavizacao: 0.05 },
  ];
  const elements = p.elements as Record<string, Record<string, unknown>>;
  elements.tn1 = {
    kind: 'terrain',
    id: 'tn1',
    levelId: 'lv_0',
    name: 'Terreno',
    pontos: [0, 0, 1, 10, 0, 2, 5, 8, 3],
    curvas: [],
    quebras: [],
    intervaloCurvas: 1,
    mestraCada: 5,
    espessuraBase: 3,
    mostrarExistente: false,
    linhasRotulo: [],
    pontosCotados: [],
    tipoId: 'tt_suave',
    order: 1,
  };
  elements.c1 = {
    kind: 'component',
    id: 'c1',
    familyId: 'fam_armario_baixo',
    typeId: null,
    levelId: 'lv_0',
    order: 2,
    x: 1,
    y: 2,
    z: 0,
    rotation: 0.5,
    mirrored: false,
  };
  elements.f1 = {
    kind: 'furniture',
    id: 'f1',
    assetId: 'fa1',
    levelId: 'lv_0',
    x: 3,
    y: 4,
    z: 0,
    rotation: 0,
    scale: 1,
    mirrored: false,
    name: 'Mesa',
    order: 3,
  };
  p.componentFamilies = { fam_armario_baixo: JSON.parse(JSON.stringify(FAMILIA_ARMARIO)) };
  p.furniture = {
    assets: {
      fa1: {
        id: 'fa1',
        name: 'Mesa',
        sourceFileName: 'mesa.glb',
        sourceFormat: 'glb',
        contentHash: 'a'.repeat(64),
        defs: [],
        materials: [],
        textures: [],
        bbox: { min: [0, 0, 0], max: [1, 1, 1] },
        stats: { vertices: 0, triangles: 0, definitions: 0, textures: 0, sourceBytes: 0, assetBytes: 0 },
      },
    },
  };
  return p;
}

describe('esquema 30 (campos aditivos da versão 30)', () => {
  it('a versão atual é 32 e o projeto novo sai na 32', () => {
    expect(SCHEMA_VERSION).toBe(32);
    expect(createEmptyProject().schemaVersion).toBe(32);
  });

  it('arquivo 29 com terreno, componente, móvel e família abre, vira 32 e preserva esses campos byte a byte', () => {
    const raw = arquivoV29();
    const p = migrateProject(raw);
    expect(p.schemaVersion).toBe(32);
    const elements = raw.elements as Record<string, unknown>;
    expect(JSON.stringify(p.elements.tn1)).toBe(JSON.stringify(elements.tn1));
    expect(JSON.stringify(p.elements.c1)).toBe(JSON.stringify(elements.c1));
    expect(JSON.stringify(p.elements.f1)).toBe(JSON.stringify(elements.f1));
    expect(JSON.stringify(p.componentFamilies)).toBe(JSON.stringify(raw.componentFamilies));
    expect(JSON.stringify(p.furniture)).toBe(JSON.stringify(raw.furniture));
    expect(JSON.stringify(p.settings.terrainTypes)).toBe(JSON.stringify((raw.settings as Record<string, unknown>).terrainTypes));
  });

  it('projeto salvo na 32 fecha o ciclo serializar → abrir → serializar idêntico', () => {
    const p = migrateProject(arquivoV29());
    const texto = JSON.stringify(p);
    const volta = migrateProject(JSON.parse(texto));
    expect(volta.schemaVersion).toBe(32);
    expect(JSON.stringify(volta)).toBe(texto);
  });

  it('arquivo de versão 33 é recusado, com a mensagem citando 33 e 32', () => {
    const raw = { ...(JSON.parse(JSON.stringify(createEmptyProject())) as Record<string, unknown>), schemaVersion: 33 };
    expect(() => migrateProject(raw)).toThrow(SchemaError);
    expect(() => migrateProject(raw)).toThrow('versão 33');
    expect(() => migrateProject(raw)).toThrow('(32)');
  });

  it('arquivo de versão 25 percorre a cadeia 25 → 32 sem erro', () => {
    const raw = JSON.parse(JSON.stringify(createEmptyProject())) as Record<string, unknown>;
    raw.schemaVersion = 25;
    delete raw.columnTypes;
    delete raw.beamTypes;
    delete raw.footingTypes;
    let p = migrateProject(raw);
    expect(p.schemaVersion).toBe(32);
    expect(Object.keys(p.columnTypes ?? {}).length).toBeGreaterThan(0);
    expect(Object.keys(p.beamTypes ?? {}).length).toBeGreaterThan(0);
    p = migrateProject(JSON.parse(JSON.stringify(p)));
    expect(p.schemaVersion).toBe(32);
  });
});
