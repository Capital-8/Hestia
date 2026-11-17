import { describe, expect, it } from 'vitest';
import {
  ProjectStore,
  createEmptyProject,
  makeLevel,
  type Beam,
  type BeamType,
  type Column,
  type ColumnType,
  type Footing,
  type FootingType,
} from '@hestia/model';
import type { SectionResult } from '@hestia/engine';
import {
  beamIdsInBox,
  columnIdsInBox,
  footingIdsInBox,
  pickBeamAt,
  pickColumnAt,
  pickFootingAt,
  selectedBeams,
  selectedColumns,
  selectedFootings,
} from './structuralPick.ts';
import { gripHoldAt, ringHandlePreview } from './selectGrips.ts';
import { ghostBands, makeIdMap, selectedMovables } from './edit.ts';
import { arraySet, commitRadial, radialGhosts } from './arrayRadial.ts';
import { clipboardFrom, copyableIds, pasteAlignedCommand } from './clipboard.ts';
import { pasteAlignedToLevelsCommand } from './pasteLevels/command.ts';
import { alignFeaturesAt, beamFeatures, columnFeatures, footingFeatures } from './alignFeatures.ts';
import { solveAlign } from './alignSolve.ts';
import { applyAlign } from './alignApply.ts';
import {
  aceitaVerticalNoCorte,
  comandosMoverNoCorte,
  moveisDoCorte,
} from './sectionMoverElementos.ts';
import { resultPieces } from './sectionEditTools.ts';
import { SelectTool } from './selectTool.ts';
import { makeEnv, P } from './testEnv.ts';

function buildStructuralProject(): ProjectStore {
  const store = new ProjectStore(createEmptyProject());
  store.exec({ type: 'upsertLevel', level: makeLevel({ id: 'lv_1', name: 'Pav. 1', elevation: 3.0 }) });
  store.exec({ type: 'upsertLevel', level: makeLevel({ id: 'lv_2', name: 'Pav. 2', elevation: 6.0 }) });

  const colType: ColumnType = {
    id: 'col_rect_30x30',
    name: 'Pilar 30x30',
    shape: 'rect',
    width: 0.3,
    depth: 0.3,
    materialId: 'mat_conc',
    code: 'P1',
    description: 'Pilar retangular',
    cost: 0,
  };
  const bmType: BeamType = {
    id: 'bm_rect_20x40',
    name: 'Viga 20x40',
    shape: 'rect',
    width: 0.2,
    depth: 0.4,
    materialId: 'mat_conc',
    code: 'V1',
    description: 'Viga retangular',
    cost: 0,
  };
  const ftType: FootingType = {
    id: 'ft_iso_100x100',
    name: 'Sapata 100x100',
    width: 1.0,
    length: 1.0,
    thickness: 0.4,
    materialId: 'mat_conc',
    code: 'S1',
    description: 'Sapata isolada',
    cost: 0,
  };

  store.exec({ type: 'upsertColumnType', columnType: colType });
  store.exec({ type: 'upsertBeamType', beamType: bmType });
  store.exec({ type: 'upsertFootingType', footingType: ftType });

  const col: Column = {
    id: 'col1',
    kind: 'column',
    levelId: 'lv_0',
    typeId: 'col_rect_30x30',
    at: { x: 2, y: 3 },
    rotation: 0,
    baseOffset: 0,
    topLevelId: 'lv_1',
    topOffset: 0,
    height: 3.0,
    mark: '',
    comments: '',
    order: 10,
  };

  const bm: Beam = {
    id: 'bm1',
    kind: 'beam',
    levelId: 'lv_0',
    typeId: 'bm_rect_20x40',
    a: { x: 0, y: 3 },
    b: { x: 4, y: 3 },
    zOffset: 0,
    justify: 'center',
    mark: '',
    comments: '',
    order: 11,
  };

  const ft: Footing = {
    id: 'ft1',
    kind: 'footing',
    levelId: 'lv_0',
    typeId: 'ft_iso_100x100',
    at: { x: 2, y: 3 },
    rotation: 0,
    heightOffset: 0,
    columnId: 'col1',
    mark: '',
    comments: '',
    order: 12,
  };

  store.exec({ type: 'addColumn', column: col });
  store.exec({ type: 'addBeam', beam: bm });
  store.exec({ type: 'addFooting', footing: ft });

  return store;
}

describe('structuralPick & SelectTool', () => {
  it('identifica pilar, viga e sapata por clique e tolerância', () => {
    const store = buildStructuralProject();
    const p = store.project;
    const mpp = 0.01;

    expect(pickColumnAt(p, 'lv_0', { x: 2, y: 3 }, mpp)).toBe('col1');
    expect(pickColumnAt(p, 'lv_0', { x: 2.14, y: 3.0 }, mpp)).toBe('col1');
    expect(pickColumnAt(p, 'lv_0', { x: 10, y: 10 }, mpp)).toBeNull();

    expect(pickBeamAt(p, 'lv_0', { x: 1, y: 3 }, mpp)).toBe('bm1');
    expect(pickBeamAt(p, 'lv_0', { x: 2, y: 3.08 }, mpp)).toBe('bm1');
    expect(pickBeamAt(p, 'lv_0', { x: 2, y: 5 }, mpp)).toBeNull();

    expect(pickFootingAt(p, 'lv_0', { x: 2, y: 3 }, mpp)).toBe('ft1');
    expect(pickFootingAt(p, 'lv_0', { x: 2.45, y: 3.45 }, mpp)).toBe('ft1');
    expect(pickFootingAt(p, 'lv_0', { x: 5, y: 5 }, mpp)).toBeNull();
  });

  it('seleciona elementos estruturais por janela e cruzamento', () => {
    const store = buildStructuralProject();
    const p = store.project;

    // Janela inteira (esq -> dir) englobando (2,3)
    const colsInside = columnIdsInBox(p, 'lv_0', { x: 1, y: 2 }, { x: 3, y: 4 });
    expect(colsInside).toEqual(['col1']);

    // Janela pequena não engloba
    const colsPartial = columnIdsInBox(p, 'lv_0', { x: 1.9, y: 2.9 }, { x: 2.1, y: 3.1 });
    expect(colsPartial).toEqual([]);

    // Cruzamento (dir -> esq) captura mesmo parcial
    const colsCrossing = columnIdsInBox(p, 'lv_0', { x: 2.1, y: 3.1 }, { x: 1.9, y: 2.9 });
    expect(colsCrossing).toEqual(['col1']);

    // Vigas
    expect(beamIdsInBox(p, 'lv_0', { x: -1, y: 2 }, { x: 5, y: 4 })).toEqual(['bm1']);
    expect(beamIdsInBox(p, 'lv_0', { x: 3, y: 4 }, { x: 1, y: 2 })).toEqual(['bm1']);

    // Sapatas
    expect(footingIdsInBox(p, 'lv_0', { x: 1, y: 2 }, { x: 3, y: 4 })).toEqual(['ft1']);
  });

  it('SelectTool hitAt e selectionBox tratam coluna, viga e sapata', () => {
    const store = buildStructuralProject();
    const ctx = makeEnv(store);
    const select = new SelectTool(ctx.env);

    select.move(P(2, 3));
    // Click at beam and column
    ctx.env.setSelection(['col1', 'bm1', 'ft1']);
    const box = select.selectionBox();
    expect(box).not.toBeNull();
    expect(box!.minX).toBeLessThanOrEqual(0);
    expect(box!.maxX).toBeGreaterThanOrEqual(4);
  });
});

describe('selectGrips estruturais', () => {
  it('alça central de pilar move a coordenada at', () => {
    const store = buildStructuralProject();
    const ctx = makeEnv(store);
    ctx.env.setSelection(['col1']);

    const hold = gripHoldAt(ctx.env, { x: 2, y: 3 });
    expect(hold).not.toBeNull();
    expect(hold!.at).toEqual({ x: 2, y: 3 });

    hold!.drag(P(2.5, 3.5), () => ({ x: 2.5, y: 3.5 }));
    hold!.release(P(2.5, 3.5), () => {});

    const col = store.project.elements.col1 as Column;
    expect(col.at).toEqual({ x: 2.5, y: 3.5 });
  });

  it('alça de rotação de pilar altera rotation', () => {
    const store = buildStructuralProject();
    const ctx = makeEnv(store);
    ctx.env.setSelection(['col1']);

    const rotGripPt = { x: 2.45, y: 3 };
    const hold = gripHoldAt(ctx.env, rotGripPt);
    expect(hold).not.toBeNull();

    // arrasta para 90 graus (x=2, y=3.45)
    hold!.drag(P(2, 3.45), () => ({ x: 2, y: 3.45 }));
    hold!.release(P(2, 3.45), () => {});

    const col = store.project.elements.col1 as Column;
    expect(col.rotation).toBeCloseTo(Math.PI / 2, 2);
  });

  it('alças de viga (ponta a, ponta b e meio)', () => {
    const store = buildStructuralProject();
    const ctx = makeEnv(store);
    ctx.env.setSelection(['bm1']);

    // Alça ponta A
    const holdA = gripHoldAt(ctx.env, { x: 0, y: 3 });
    expect(holdA).not.toBeNull();
    holdA!.drag(P(-1, 3), () => ({ x: -1, y: 3 }));
    holdA!.release(P(-1, 3), () => {});
    expect((store.project.elements.bm1 as Beam).a).toEqual({ x: -1, y: 3 });

    // Alça meio (translada a e b juntos)
    const midPt = { x: 1.5, y: 3 }; // (-1 + 4)/2 = 1.5
    const holdMid = gripHoldAt(ctx.env, midPt);
    expect(holdMid).not.toBeNull();
    holdMid!.drag(P(1.5, 4), () => ({ x: 1.5, y: 4 }));
    holdMid!.release(P(1.5, 4), () => {});
    const moved = store.project.elements.bm1 as Beam;
    expect(moved.a).toEqual({ x: -1, y: 4 });
    expect(moved.b).toEqual({ x: 4, y: 4 });
  });

  it('ringHandlePreview exibe alças de coluna, viga e sapata', () => {
    const store = buildStructuralProject();
    const p = store.project;

    const colPreview = ringHandlePreview(p, ['col1'], null);
    expect(colPreview.length).toBeGreaterThanOrEqual(2);

    const bmPreview = ringHandlePreview(p, ['bm1'], null);
    expect(bmPreview.length).toBeGreaterThanOrEqual(3);

    const ftPreview = ringHandlePreview(p, ['ft1'], null);
    expect(ftPreview.length).toBeGreaterThanOrEqual(2);
  });
});

describe('edit.ts & arrayRadial', () => {
  it('selectedMovables inclui pilar, viga e sapata', () => {
    const store = buildStructuralProject();
    const p = store.project;
    const mov = selectedMovables(p, ['col1', 'bm1', 'ft1']);
    expect(mov).toContain('col1');
    expect(mov).toContain('bm1');
    expect(mov).toContain('ft1');

    expect(selectedColumns(p, ['col1', 'bm1'])).toEqual(['col1']);
    expect(selectedBeams(p, ['col1', 'bm1'])).toEqual(['bm1']);
    expect(selectedFootings(p, ['ft1', 'bm1'])).toEqual(['ft1']);
  });

  it('makeIdMap gera novos ids col, bm e ft', () => {
    const store = buildStructuralProject();
    const p = store.project;
    const map = makeIdMap(p, ['col1', 'bm1', 'ft1']);
    expect(map.col1).toMatch(/^col/);
    expect(map.bm1).toMatch(/^bm/);
    expect(map.ft1).toMatch(/^ft/);
  });

  it('ghostBands gera prévias poligonais tracejadas para elementos estruturais', () => {
    const store = buildStructuralProject();
    const p = store.project;
    const ghosts = ghostBands(p, ['col1', 'bm1', 'ft1'], { kind: 'translate', d: { x: 1, y: 1 } });
    expect(ghosts.filter((g) => g.kind === 'polygon')).toHaveLength(3);
  });

  it('transform do modelo translada, gira e espelha elementos estruturais', () => {
    const store = buildStructuralProject();

    // Translada
    store.exec({ type: 'transform', ids: ['col1', 'bm1', 'ft1'], transform: { kind: 'translate', d: { x: 5, y: 2 } } });
    const col = store.project.elements.col1 as Column;
    const bm = store.project.elements.bm1 as Beam;
    const ft = store.project.elements.ft1 as Footing;
    expect(col.at).toEqual({ x: 7, y: 5 });
    expect(bm.a).toEqual({ x: 5, y: 5 });
    expect(bm.b).toEqual({ x: 9, y: 5 });
    expect(ft.at).toEqual({ x: 7, y: 5 });

    // Copia com idMap
    const idMap = makeIdMap(store.project, ['col1']);
    store.exec({ type: 'transform', ids: ['col1'], transform: { kind: 'translate', d: { x: 1, y: 0 } }, copy: { idMap } });
    const copiedCol = store.project.elements[idMap.col1!] as Column;
    expect(copiedCol).toBeDefined();
    expect(copiedCol.at).toEqual({ x: 8, y: 5 });
  });

  it('matriz radial copia elementos estruturais com radialGhosts e commitRadial', () => {
    const store = buildStructuralProject();
    const ctx = makeEnv(store);
    const set = arraySet(store.project, ['col1', 'bm1']);
    expect(set.els).toContain('col1');
    expect(set.els).toContain('bm1');

    const ghosts = radialGhosts(ctx.env, set, { x: 0, y: 0 }, [0, Math.PI / 2]);
    expect(ghosts.length).toBeGreaterThan(0);

    commitRadial(ctx.env, set, { x: 0, y: 0 }, [0, Math.PI / 2]);
    const cols = Object.values(store.project.elements).filter((e) => e.kind === 'column');
    expect(cols).toHaveLength(2);
  });
});

describe('clipboard & pasteLevels', () => {
  it('clipboardFrom e copyableIds incluem pilar, viga e sapata', () => {
    const store = buildStructuralProject();
    const p = store.project;

    const ids = copyableIds(p, ['col1', 'bm1', 'ft1']);
    expect(ids).toEqual(['col1', 'bm1', 'ft1']);

    const clip = clipboardFrom(p, ['col1', 'bm1', 'ft1']);
    expect(clip).not.toBeNull();
    expect(clip?.columns).toHaveLength(1);
    expect(clip?.beams).toHaveLength(1);
    expect(clip?.footings).toHaveLength(1);
  });

  it('pasteAlignedCommand cola no nível de destino com novos ids', () => {
    const store = buildStructuralProject();
    const p = store.project;
    const clip = clipboardFrom(p, ['col1', 'bm1', 'ft1'])!;

    const r = pasteAlignedCommand(p, clip, 'lv_1');
    expect(r).not.toBeNull();
    expect(r?.columnIds).toHaveLength(1);
    expect(r?.beamIds).toHaveLength(1);
    expect(r?.footingIds).toHaveLength(1);

    store.exec(r!.command);
    const col2 = store.project.elements[r!.columnIds[0]!] as Column;
    const bm2 = store.project.elements[r!.beamIds[0]!] as Beam;
    const ft2 = store.project.elements[r!.footingIds[0]!] as Footing;

    expect(col2.levelId).toBe('lv_1');
    expect(bm2.levelId).toBe('lv_1');
    expect(ft2.levelId).toBe('lv_1');
    expect(ft2.columnId).toBe(col2.id); // remapeou o columnId da sapata!
  });

  it('pasteAlignedToLevelsCommand remapeia topLevelId da coluna e trata overflow', () => {
    const store = buildStructuralProject();
    const p = store.project;
    const clip = clipboardFrom(p, ['col1'])!;

    // Colado no lv_1: de lv_0->lv_1 vira lv_1->lv_2
    const res = pasteAlignedToLevelsCommand(p, clip, ['lv_1']);
    expect(res).not.toBeNull();
    const colOnLv1Id = res!.byLevel.lv_1!.columns[0]!;
    store.exec(res!.command);
    const colLv1 = store.project.elements[colOnLv1Id] as Column;
    expect(colLv1.topLevelId).toBe('lv_2');

    // Colado no lv_2: passa do último nível -> overflow, topLevelId vira null
    const resOverflow = pasteAlignedToLevelsCommand(store.project, clip, ['lv_2']);
    expect(resOverflow).not.toBeNull();
    expect(resOverflow!.warnings.some((w) => w.kind === 'top-overflow')).toBe(true);
    store.exec(resOverflow!.command);
    const colLv2 = store.project.elements[resOverflow!.byLevel.lv_2!.columns[0]!] as Column;
    expect(colLv2.topLevelId).toBeNull();
  });
});

describe('alignFeatures, alignSolve & alignApply estruturais', () => {
  it('fornece eixos e faces para pilar, viga e sapata', () => {
    const store = buildStructuralProject();
    const p = store.project;
    const mpp = 0.01;

    const colFeats = columnFeatures(p, 'lv_0', { x: 2, y: 3 }, mpp);
    expect(colFeats.some((f) => f.kind === 'eixoPilar')).toBe(true);
    const colFaceFeats = columnFeatures(p, 'lv_0', { x: 2.15, y: 3 }, mpp);
    expect(colFaceFeats.some((f) => f.kind === 'facePilar')).toBe(true);

    const bmFeats = beamFeatures(p, 'lv_0', { x: 2, y: 3 }, mpp);
    expect(bmFeats.some((f) => f.kind === 'eixoViga')).toBe(true);
    const bmFaceFeats = beamFeatures(p, 'lv_0', { x: 2, y: 3.1 }, mpp);
    expect(bmFaceFeats.some((f) => f.kind === 'faceViga')).toBe(true);

    const ftFeats = footingFeatures(p, 'lv_0', { x: 2, y: 3 }, mpp);
    expect(ftFeats.some((f) => f.kind === 'eixoSapata')).toBe(true);
    const ftFaceFeats = footingFeatures(p, 'lv_0', { x: 2.5, y: 3 }, mpp);
    expect(ftFaceFeats.some((f) => f.kind === 'faceSapata')).toBe(true);

    const all = alignFeaturesAt({ project: p, levelId: 'lv_0', at: { x: 2, y: 3 }, metersPerPixel: mpp });
    expect(all.some((f) => f.ownerId === 'col1')).toBe(true);
    expect(all.some((f) => f.ownerId === 'bm1')).toBe(true);
    expect(all.some((f) => f.ownerId === 'ft1')).toBe(true);
  });

  it('solveAlign e applyAlign alinham pilar, viga e sapata', () => {
    const store = buildStructuralProject();
    const ctx = makeEnv(store);
    const p = store.project;

    // Feição de eixo do pilar col1 (x=2, y=3, eixo horizontal dx=1, dy=0)
    const colFeat = columnFeatures(p, 'lv_0', { x: 2, y: 3 }, 0.01).find((f) => f.key === 'col1:eixo:1')!;
    expect(colFeat).toBeDefined();

    // Reta de referência em y = 4 (direção dx=1, dy=0)
    const refLine = { p: { x: 0, y: 4 }, d: { x: 1, y: 0 } };
    const sol = solveAlign(refLine, colFeat, p);
    expect(sol.kind).toBe('transladar');
    if (sol.kind === 'transladar') {
      expect(sol.target).toBe('pilar');
      expect(sol.d.y).toBeCloseTo(1, 4);

      const applied = applyAlign(ctx.env, sol);
      expect(applied).toBe(true);
      expect((store.project.elements.col1 as Column).at.y).toBeCloseTo(4, 4);
    }
  });
});

describe('modificação em corte e elevação', () => {
  it('moveisDoCorte e aceitaVerticalNoCorte reconhecem elementos estruturais', () => {
    const store = buildStructuralProject();
    const p = store.project;

    expect(moveisDoCorte(p, ['col1', 'bm1', 'ft1'])).toEqual(['col1', 'bm1', 'ft1']);
    expect(aceitaVerticalNoCorte(p, 'col1')).toBe(true);
    expect(aceitaVerticalNoCorte(p, 'bm1')).toBe(true);
    expect(aceitaVerticalNoCorte(p, 'ft1')).toBe(true);
  });

  it('comandosMoverNoCorte translada horizontalmente e ajusta offsets na vertical', () => {
    const store = buildStructuralProject();
    const p = store.project;
    const u = { x: 1, y: 0 };

    const mover = comandosMoverNoCorte(p, ['col1', 'bm1', 'ft1'], u, 2.0, 0.5);
    expect(mover.commands.length).toBeGreaterThanOrEqual(4); // 1 transform horizontal + 3 updates verticais

    for (const cmd of mover.commands) store.exec(cmd);

    const col = store.project.elements.col1 as Column;
    const bm = store.project.elements.bm1 as Beam;
    const ft = store.project.elements.ft1 as Footing;

    expect(col.at.x).toBe(4);
    expect(col.baseOffset).toBe(0.5);
    expect(col.topOffset).toBe(0.5);

    expect(bm.a.x).toBe(2);
    expect(bm.b.x).toBe(6);
    expect(bm.zOffset).toBe(0.5);

    expect(ft.at.x).toBe(4);
    expect(ft.heightOffset).toBe(0.5);
  });

  it('buildResultPieces mapeia columnId, beamId e footingId', () => {
    const fakeResult = {
      cut: [
        {
          sources: [
            { columnId: 'col1' },
            { beamId: 'bm1' },
            { footingId: 'ft1' },
          ],
          polygons: [[[ { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 } ]]],
        },
      ],
      beyond: [],
    } as unknown as SectionResult;

    const pieces = resultPieces(fakeResult);
    expect(pieces.some((p) => p.hostId === 'col1')).toBe(true);
    expect(pieces.some((p) => p.hostId === 'bm1')).toBe(true);
    expect(pieces.some((p) => p.hostId === 'ft1')).toBe(true);
  });
});
