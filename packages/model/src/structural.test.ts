import { describe, expect, it } from 'vitest';
import { createEmptyProject } from './defaults.ts';
import {
  columnTypes,
  DEFAULT_COLUMN_TYPES,
  columnTypeMap,
  findColumnType,
  makeColumn,
  columnsOnLevel,
  columnPolygon,
  columnSectionArea,
  columnSectionPerimeter,
  columnElevationSpan,
} from './column.ts';
import {
  beamTypes,
  DEFAULT_BEAM_TYPES,
  beamTypeMap,
  findBeamType,
  makeBeam,
  beamsOnLevel,
  beamLength,
  beamPolygon,
  beamElevationSpan,
  beamProfileRingSZ,
  beamSectionArea,
} from './beam.ts';
import {
  footingTypes,
  DEFAULT_FOOTING_TYPES,
  footingTypeMap,
  findFootingType,
  makeFooting,
  footingsOnLevel,
  footingPolygon,
  footingElevationSpan,
} from './footing.ts';
import {
  transformColumn,
  transformBeam,
  transformFooting,
  structuralIssues,
} from './structuralCommands.ts';
import { applyCommand } from './commands.ts';
import { labelOf } from './historyRotulos.ts';
import { migrateProject } from './migrate.ts';
import { SCHEMA_VERSION, isColumn, isBeam, isFooting } from './types.ts';

describe('domínio de pilares (Column)', () => {
  it('retorna os 4 tipos padrão em PT e EN com material correto', () => {
    const pt = columnTypes('pt');
    expect(pt).toHaveLength(4);
    expect(pt[0]!.id).toBe('ct_conc_20x40');
    expect(pt[0]!.name).toBe('Pilar Concreto 20×40 cm');
    expect(pt[0]!.shape).toBe('rect');
    expect(pt[0]!.materialId).toBe('mat_concreto');

    const en = columnTypes('en');
    expect(en[0]!.name).toBe('Concrete Column 20×40 cm');
    expect(en[3]!.id).toBe('ct_steel_w250');
    expect(en[3]!.shape).toBe('i-section');
    expect(en[3]!.materialId).toBe('mat_aco');
  });

  it('columnTypeMap e findColumnType com fallback', () => {
    const p = createEmptyProject();
    const map = columnTypeMap(p);
    expect(map.ct_conc_20x40).toBeDefined();
    expect(findColumnType(p, 'ct_conc_20x40').code).toBe('PL-01');
    expect(findColumnType(p, 'inexistente').id).toBe('ct_conc_20x40');
  });

  it('makeColumn e columnsOnLevel', () => {
    const c = makeColumn({ id: 'c1', typeId: 'ct_conc_20x40', levelId: 'lv_0', at: { x: 1, y: 2 } });
    expect(c.kind).toBe('column');
    expect(c.height).toBe(2.8);
    expect(c.baseOffset).toBe(0);

    const p = createEmptyProject();
    p.elements[c.id] = { ...c, order: 1 };
    expect(columnsOnLevel(p, 'lv_0')).toHaveLength(1);
    expect(columnsOnLevel(p, 'lv_1')).toHaveLength(0);
  });

  it('columnPolygon para retangular, circular e perfil I', () => {
    const c = makeColumn({ id: 'c1', typeId: 'ct_conc_20x40', levelId: 'lv_0', at: { x: 0, y: 0 }, rotation: 0 });
    const rectPoly = columnPolygon(c, { shape: 'rect', width: 0.2, depth: 0.4 });
    expect(rectPoly).toHaveLength(4);

    const roundPoly = columnPolygon(c, { shape: 'round', width: 0.3, depth: 0.3 });
    expect(roundPoly).toHaveLength(16);

    const iPoly = columnPolygon(c, {
      shape: 'i-section',
      width: 0.146,
      depth: 0.258,
      flangeThickness: 0.0091,
      webThickness: 0.0061,
    });
    expect(iPoly).toHaveLength(12);
  });

  it('columnSectionArea e columnSectionPerimeter calculam área e perímetro exatos', () => {
    const rect = DEFAULT_COLUMN_TYPES[0]!;
    expect(columnSectionArea(rect)).toBeCloseTo(0.2 * 0.4);
    expect(columnSectionPerimeter(rect)).toBeCloseTo(2 * (0.2 + 0.4));

    const round = DEFAULT_COLUMN_TYPES[2]!;
    expect(columnSectionArea(round)).toBeCloseTo(Math.PI * 0.15 * 0.15);
    expect(columnSectionPerimeter(round)).toBeCloseTo(Math.PI * 0.3);

    const iSec = DEFAULT_COLUMN_TYPES[3]!;
    const tf = iSec.flangeThickness!;
    const tw = iSec.webThickness!;
    const expectedArea = 2 * (iSec.width * tf) + (iSec.depth - 2 * tf) * tw;
    expect(columnSectionArea(iSec)).toBeCloseTo(expectedArea);
    expect(columnSectionPerimeter(iSec)).toBeCloseTo(4 * iSec.width + 2 * iSec.depth - 2 * tw);
  });

  it('columnElevationSpan calcula cotas com ou sem topLevelId', () => {
    const p = createEmptyProject();
    const cNoTop = makeColumn({ id: 'c1', typeId: 'ct_conc_20x40', levelId: 'lv_0', at: { x: 0, y: 0 }, height: 3 });
    const span1 = columnElevationSpan(p, { ...cNoTop, order: 1 });
    expect(span1.z0).toBe(0);
    expect(span1.z1).toBe(3);
    expect(span1.height).toBe(3);

    const cWithTop = makeColumn({
      id: 'c2',
      typeId: 'ct_conc_20x40',
      levelId: 'lv_0',
      at: { x: 0, y: 0 },
      topLevelId: 'lv_1',
      topOffset: 0.2,
      baseOffset: 0.1,
    });
    const span2 = columnElevationSpan(p, { ...cWithTop, order: 2 });
    expect(span2.z0).toBe(0.1);
    expect(span2.z1).toBe(3.2);
    expect(span2.height).toBeCloseTo(3.1);
  });
});

describe('domínio de vigas (Beam)', () => {
  it('retorna os 3 tipos padrão com materiais e propriedades', () => {
    const pt = beamTypes('pt');
    expect(pt).toHaveLength(3);
    expect(pt[0]!.id).toBe('bt_conc_15x40');
    expect(pt[0]!.materialId).toBe('mat_concreto');
    expect(pt[2]!.id).toBe('bt_steel_w310');
    expect(pt[2]!.materialId).toBe('mat_aco');
    expect(DEFAULT_BEAM_TYPES).toHaveLength(3);

    const p = createEmptyProject();
    expect(beamTypeMap(p)['bt_conc_15x40']).toBeDefined();
    expect(findBeamType(p, 'bt_conc_15x40').code).toBe('VG-01');
    expect(beamsOnLevel(p, 'lv_0')).toHaveLength(0);
  });

  it('beamLength e beamPolygon com justificativas center, left e right', () => {
    const b = makeBeam({
      id: 'b1',
      typeId: 'bt_conc_15x40',
      levelId: 'lv_0',
      a: { x: 0, y: 0 },
      b: { x: 4, y: 0 },
      justify: 'center',
    });
    expect(beamLength(b)).toBe(4);

    const polyCenter = beamPolygon(b, { width: 0.2 });
    expect(polyCenter).toHaveLength(4);
    // a = (0,0), b = (4,0). normal = (0, 1). center = [-0.1, 0.1]
    expect(polyCenter[0]!.y).toBeCloseTo(-0.1);
    expect(polyCenter[3]!.y).toBeCloseTo(0.1);

    const polyLeft = beamPolygon({ ...b, justify: 'left' }, { width: 0.2 });
    expect(polyLeft[0]!.y).toBeCloseTo(0);
    expect(polyLeft[3]!.y).toBeCloseTo(0.2);

    const polyRight = beamPolygon({ ...b, justify: 'right' }, { width: 0.2 });
    expect(polyRight[0]!.y).toBeCloseTo(-0.2);
    expect(polyRight[3]!.y).toBeCloseTo(0);
  });

  it('beamElevationSpan calcula topo e base da viga', () => {
    const p = createEmptyProject();
    const b = makeBeam({
      id: 'b1',
      typeId: 'bt_conc_15x40',
      levelId: 'lv_1',
      a: { x: 0, y: 0 },
      b: { x: 3, y: 0 },
      zOffset: -0.1,
    });
    const span = beamElevationSpan(p, { ...b, order: 1 }, { depth: 0.4 });
    // lv_1 tem cota 3
    expect(span.z1).toBeCloseTo(2.9);
    expect(span.z0).toBeCloseTo(2.5);
    expect(span.depth).toBe(0.4);
  });
});

describe('domínio de fundações/sapatas (Footing)', () => {
  it('retorna os 3 tipos padrão', () => {
    const pt = footingTypes('pt');
    expect(pt).toHaveLength(3);
    expect(pt[0]!.id).toBe('ft_iso_100x100');
    expect(pt[2]!.id).toBe('ft_bloco_80x80');
    expect(DEFAULT_FOOTING_TYPES).toHaveLength(3);

    const p = createEmptyProject();
    expect(footingTypeMap(p)['ft_iso_100x100']).toBeDefined();
    expect(findFootingType(p, 'ft_iso_100x100').code).toBe('SP-01');
    expect(footingsOnLevel(p, 'lv_0')).toHaveLength(0);
  });

  it('footingPolygon e footingElevationSpan', () => {
    const p = createEmptyProject();
    const f = makeFooting({
      id: 'f1',
      typeId: 'ft_iso_100x100',
      levelId: 'lv_0',
      at: { x: 2, y: 3 },
      rotation: 0,
      heightOffset: -0.5,
    });
    const poly = footingPolygon(f, { width: 1.0, length: 1.0 });
    expect(poly).toHaveLength(4);
    expect(poly[0]).toEqual({ x: 1.5, y: 2.5 });
    expect(poly[2]).toEqual({ x: 2.5, y: 3.5 });

    const span = footingElevationSpan(p, { ...f, order: 1 }, { thickness: 0.4 });
    expect(span.z1).toBe(-0.5);
    expect(span.z0).toBeCloseTo(-0.9);
  });
});

describe('comandos estruturais (StructuralCommand)', () => {
  it('executa comandos addColumn, upsertColumnType e deleteColumnType com validações', () => {
    const p = createEmptyProject();
    const c = makeColumn({ id: 'col1', typeId: 'ct_conc_20x40', levelId: 'lv_0', at: { x: 1, y: 1 } });
    applyCommand(p, { type: 'addColumn', column: c });
    expect(isColumn(p.elements.col1)).toBe(true);

    // Tipo em uso não pode ser deletado
    expect(() => applyCommand(p, { type: 'deleteColumnType', id: 'ct_conc_20x40' })).toThrow();

    // Inserir novo tipo
    const newType = { ...DEFAULT_COLUMN_TYPES[0]!, id: 'ct_custom', name: 'Custom' };
    applyCommand(p, { type: 'upsertColumnType', columnType: newType });
    expect(p.columnTypes?.ct_custom).toBeDefined();

    // Deletar tipo customizado sem uso
    applyCommand(p, { type: 'deleteColumnType', id: 'ct_custom' });
    expect(p.columnTypes?.ct_custom).toBeUndefined();
  });

  it('executa comandos de viga e sapata', () => {
    const p = createEmptyProject();
    const b = makeBeam({
      id: 'bm1',
      typeId: 'bt_conc_15x40',
      levelId: 'lv_0',
      a: { x: 0, y: 0 },
      b: { x: 2, y: 0 },
    });
    applyCommand(p, { type: 'addBeam', beam: b });
    expect(isBeam(p.elements.bm1)).toBe(true);

    const f = makeFooting({
      id: 'ft1',
      typeId: 'ft_iso_100x100',
      levelId: 'lv_0',
      at: { x: 0, y: 0 },
      columnId: 'col1',
    });
    applyCommand(p, { type: 'addFooting', footing: f });
    expect(isFooting(p.elements.ft1)).toBe(true);
  });

  it('transformações de pilar, viga e sapata (translate, rotate, mirror)', () => {
    const col = makeColumn({ id: 'c1', typeId: 'ct_conc_20x40', levelId: 'lv_0', at: { x: 2, y: 3 }, rotation: 0 });
    const colRot = transformColumn({ ...col, order: 1 }, { kind: 'rotate', about: { x: 0, y: 0 }, angle: Math.PI / 2 });
    expect(colRot.rotation).toBeCloseTo(Math.PI / 2);

    const bm = makeBeam({
      id: 'b1',
      typeId: 'bt_conc_15x40',
      levelId: 'lv_0',
      a: { x: 0, y: 0 },
      b: { x: 2, y: 0 },
      justify: 'left',
    });
    // Espelho inverte justify left <-> right
    const bmMirror = transformBeam({ ...bm, order: 1 }, { kind: 'mirror', a: { x: 0, y: 0 }, b: { x: 1, y: 0 } });
    expect(bmMirror.justify).toBe('right');

    const ft = makeFooting({ id: 'f1', typeId: 'ft_iso_100x100', levelId: 'lv_0', at: { x: 1, y: 1 }, rotation: 0 });
    const ftRot = transformFooting({ ...ft, order: 1 }, { kind: 'rotate', about: { x: 0, y: 0 }, angle: 0.5 });
    expect(ftRot.rotation).toBeCloseTo(0.5);
  });

  it('validações de projeto (structuralIssues)', () => {
    const p = createEmptyProject();
    // Pilar sem tipo e pilar com altura inválida
    p.elements.c_bad = {
      ...makeColumn({ id: 'c_bad', typeId: 'tipo_inexistente', levelId: 'lv_0', at: { x: 0, y: 0 }, height: 0.01 }),
      order: 1,
    };
    // Viga muito curta
    p.elements.b_short = {
      ...makeBeam({ id: 'b_short', typeId: 'bt_conc_15x40', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 0.01, y: 0 } }),
      order: 2,
    };
    const issues = structuralIssues(p);
    expect(issues.some((i) => i.code === 'column-missing-type')).toBe(true);
    expect(issues.some((i) => i.code === 'column-too-short')).toBe(true);
    expect(issues.some((i) => i.code === 'beam-too-short')).toBe(true);
  });

  it('rótulos do histórico labelOf cobrem todos os comandos estruturais', () => {
    expect(labelOf({ type: 'addColumn', column: {} as never })).toBe('Criar pilar');
    expect(labelOf({ type: 'upsertColumnType', columnType: {} as never })).toBe('Editar tipo de pilar');
    expect(labelOf({ type: 'deleteColumnType', id: '1' })).toBe('Excluir tipo de pilar');
    expect(labelOf({ type: 'addBeam', beam: {} as never })).toBe('Criar viga');
    expect(labelOf({ type: 'upsertBeamType', beamType: {} as never })).toBe('Editar tipo de viga');
    expect(labelOf({ type: 'deleteBeamType', id: '1' })).toBe('Excluir tipo de viga');
    expect(labelOf({ type: 'addFooting', footing: {} as never })).toBe('Criar sapata');
    expect(labelOf({ type: 'upsertFootingType', footingType: {} as never })).toBe('Editar tipo de sapata');
    expect(labelOf({ type: 'deleteFootingType', id: '1' })).toBe('Excluir tipo de sapata');
  });

  it('migração 27 → 28 povoa columnTypes, beamTypes, footingTypes preservando os existentes', () => {
    const raw = JSON.parse(JSON.stringify(createEmptyProject())) as Record<string, unknown>;
    raw.schemaVersion = 27;
    delete raw.columnTypes;
    delete raw.beamTypes;
    delete raw.footingTypes;
    const migrated = migrateProject(raw);
    expect(migrated.schemaVersion).toBe(SCHEMA_VERSION);
    expect(migrated.columnTypes).toBeDefined();
    expect(migrated.beamTypes).toBeDefined();
    expect(migrated.footingTypes).toBeDefined();
    expect(migrated.columnTypes!['ct_conc_20x40']).toBeDefined();
  });

  it('sapata excêntrica desloca footingPolygon em relação a at e rotaciona ao redor do ponto de carga', () => {
    const p = createEmptyProject();
    const ft = findFootingType(p, 'ft_iso_100x100');
    const f0 = makeFooting({
      id: 'fe0',
      typeId: ft.id,
      levelId: 'lv_0',
      at: { x: 2, y: 3 },
      rotation: 0,
      eccentricityX: 0.25,
      eccentricityY: -0.15,
    });
    const poly0 = footingPolygon(f0, ft);
    expect(poly0).toHaveLength(4);
    const cx0 = poly0.reduce((s, q) => s + q.x, 0) / 4;
    const cy0 = poly0.reduce((s, q) => s + q.y, 0) / 4;
    expect(cx0).toBeCloseTo(2.25, 9);
    expect(cy0).toBeCloseTo(2.85, 9);

    const fRot = makeFooting({
      id: 'fe1',
      typeId: ft.id,
      levelId: 'lv_0',
      at: { x: 2, y: 3 },
      rotation: Math.PI / 2,
      eccentricityX: 0.25,
      eccentricityY: 0,
    });
    const polyRot = footingPolygon(fRot, ft);
    const cxR = polyRot.reduce((s, q) => s + q.x, 0) / 4;
    const cyR = polyRot.reduce((s, q) => s + q.y, 0) / 4;
    expect(cxR).toBeCloseTo(2, 9);
    expect(cyR).toBeCloseTo(3.25, 9);
  });

  it('sapata vinculada acompanha transform, updateElements do pilar e desvincula ao excluir o pilar', () => {
    const p = createEmptyProject();
    const col = makeColumn({ id: 'c_link', typeId: 'ct_conc_20x40', levelId: 'lv_0', at: { x: 1, y: 1 }, rotation: 0 });
    const foot = makeFooting({
      id: 'f_link',
      typeId: 'ft_iso_100x100',
      levelId: 'lv_0',
      at: { x: 1, y: 1 },
      rotation: 0,
      eccentricityX: 0.2,
      eccentricityY: 0.15,
      columnId: 'c_link',
    });
    applyCommand(p, { type: 'addColumn', column: col });
    applyCommand(p, { type: 'addFooting', footing: foot });

    applyCommand(p, { type: 'transform', ids: ['c_link'], transform: { kind: 'translate', d: { x: 2, y: -1 } } });
    const fAfterT = p.elements.f_link;
    if (!isFooting(fAfterT)) throw new Error('expected footing');
    expect(fAfterT.at.x).toBeCloseTo(3, 9);
    expect(fAfterT.at.y).toBeCloseTo(0, 9);

    applyCommand(p, { type: 'transform', ids: ['c_link'], transform: { kind: 'rotate', about: { x: 0, y: 0 }, angle: Math.PI / 2 } });
    const fAfterR = p.elements.f_link;
    if (!isFooting(fAfterR)) throw new Error('expected footing');
    expect(fAfterR.at.x).toBeCloseTo(0, 9);
    expect(fAfterR.at.y).toBeCloseTo(3, 9);
    expect(fAfterR.rotation).toBeCloseTo(Math.PI / 2, 9);

    applyCommand(p, { type: 'transform', ids: ['c_link'], transform: { kind: 'mirror', a: { x: 0, y: 0 }, b: { x: 1, y: 0 } } });
    const fAfterM = p.elements.f_link;
    if (!isFooting(fAfterM)) throw new Error('expected footing');
    expect(fAfterM.at.x).toBeCloseTo(0, 9);
    expect(fAfterM.at.y).toBeCloseTo(-3, 9);
    expect(fAfterM.eccentricityY).toBeCloseTo(-0.15, 9);

    applyCommand(p, { type: 'updateElements', ids: ['c_link'], patch: { at: { x: 5, y: 5 }, rotation: 0 } });
    const fAfterU = p.elements.f_link;
    if (!isFooting(fAfterU)) throw new Error('expected footing');
    expect(fAfterU.at.x).toBeCloseTo(5, 9);
    expect(fAfterU.at.y).toBeCloseTo(5, 9);
    expect(fAfterU.rotation).toBeCloseTo(0, 9);

    applyCommand(p, { type: 'deleteElements', ids: ['c_link'] });
    expect(p.elements.c_link).toBeUndefined();
    const fAfterDel = p.elements.f_link;
    if (!isFooting(fAfterDel)) throw new Error('expected footing');
    expect(fAfterDel.columnId).toBeNull();
  });

  it('beamProfileRingSZ e beamSectionArea calculam contornos e área líquida para rect, i-section e t-section', () => {
    const p = createEmptyProject();
    const rectType = findBeamType(p, 'bt_conc_15x40');
    const wType = findBeamType(p, 'bt_steel_w310');
    const tType = {
      id: 'bt_t_test',
      name: 'Viga T',
      shape: 't-section' as const,
      width: 0.4,
      depth: 0.5,
      flangeWidth: 0.4,
      flangeThickness: 0.1,
      webThickness: 0.12,
      materialId: 'mat_concreto',
    };

    const ringRect = beamProfileRingSZ({ justify: 'center' }, rectType, -rectType.depth, 0);
    expect(ringRect).toHaveLength(4);
    expect(beamSectionArea(rectType)).toBeCloseTo(rectType.width * rectType.depth, 9);

    const ringW = beamProfileRingSZ({ justify: 'center' }, wType, -wType.depth, 0);
    expect(ringW).toHaveLength(12);
    const wArea = beamSectionArea(wType);
    const fw = wType.flangeWidth ?? wType.width;
    const tf = wType.flangeThickness ?? 0.015;
    const tw = wType.webThickness ?? 0.01;
    expect(wArea).toBeCloseTo(2 * fw * tf + (wType.depth - 2 * tf) * tw, 9);
    expect(wArea).toBeLessThan(fw * wType.depth);

    const ringT = beamProfileRingSZ({ justify: 'center' }, tType, -tType.depth, 0);
    expect(ringT).toHaveLength(8);
    const tArea = beamSectionArea(tType);
    expect(tArea).toBeCloseTo(0.4 * 0.1 + 0.4 * 0.12, 9);
    expect(tArea).toBeLessThan(tType.width * tType.depth);
  });
});
