import { describe, expect, it } from 'vitest';
import { annotationRemovals, makeWall, wallOverlap } from '@hestia/model';
import { SelectTool } from './selectTool.ts';
import { WallTool } from './wallTool.ts';
import { MirrorTool } from './transformTools.ts';
import { NorthArrowTool, RevisionCloudTool, SpotCoordinateTool, SpotElevationTool } from './annotationExtraTools.ts';
import { makeEnv } from './testEnv.ts';

function ptr(x: number, y: number) {
  return { raw: { x, y }, shift: false, ctrl: false, alt: false };
}

describe('Paredes circulares, etiquetas editáveis e ferramentas extras de anotação', () => {
  it('permite espelhar parede semicircular sem falsos positivos de sobreposição', () => {
    const a = makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, sag: 2, height: 2.8, locationLine: 'wallCenter' });
    const b = makeWall({ id: 'w2', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, sag: -2, height: 2.8, locationLine: 'wallCenter' });
    expect(wallOverlap(a, b)).toBeNull();

    const { store, env } = makeEnv();
    store.exec({ type: 'addWall', wall: a });
    env.setSelection(['w1']);
    const mirror = new MirrorTool(env);
    mirror.click(ptr(0, 0));
    mirror.click(ptr(4, 0));
    const walls = Object.values(store.project.elements).filter((e) => e.kind === 'wall');
    expect(walls).toHaveLength(1);
    expect(walls[0]!.sag).toBe(-2);
  });

  it('WallTool no modo circle cria duas paredes semicirculares fechando um círculo', () => {
    const { store, env, options } = makeEnv();
    options.wallShape = 'circle';
    const tool = new WallTool(env);
    tool.click(ptr(0, 0));
    tool.move(ptr(3, 0));
    tool.click(ptr(3, 0));
    const walls = Object.values(store.project.elements).filter((e) => e.kind === 'wall');
    expect(walls).toHaveLength(2);
    expect(walls.every((w) => Math.abs(w.sag) > 2.9)).toBe(true);
  });

  it('ElementTag pode ser selecionada, arrastada e apagada na planta', () => {
    const { store, env } = makeEnv();
    const wall = makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, sag: 2, height: 2.8, locationLine: 'wallCenter' });
    store.exec({ type: 'addWall', wall });
    store.exec({ type: 'addTag', levelId: 'lv_0', item: { id: 'tg1', hostId: 'w1', at: { x: 2, y: 3 }, property: 'type', leader: true, orientation: 'horizontal' } });

    env.setSelection(['tg1']);
    const sel = new SelectTool(env);
    sel.down(ptr(2, 3));
    sel.drag(ptr(3.5, 4.2));
    sel.up(ptr(3.5, 4.2));
    const movedTag = store.project.levels[0]!.tags![0]!;
    expect(movedTag.at.x).toBeCloseTo(3.5, 3);
    expect(movedTag.at.y).toBeCloseTo(4.2, 3);

    const removals = annotationRemovals(store.project, 'lv_0', ['tg1']);
    expect(removals).toEqual([{ type: 'removeTag', levelId: 'lv_0', id: 'tg1' }]);
    for (const cmd of removals) store.exec(cmd);
    expect(store.project.levels[0]!.tags).toHaveLength(0);
  });

  it('SpotElevationTool, SpotCoordinateTool, NorthArrowTool e RevisionCloudTool inserem entidades paramétricas válidas em planta e corte', () => {
    const { store, env } = makeEnv();
    store.project.levels[0]!.elevation = 3.2;

    const elev = new SpotElevationTool(env);
    elev.click(ptr(1, 1));
    elev.click(ptr(2, 2));

    const coord = new SpotCoordinateTool(env);
    coord.click(ptr(2, 3));
    coord.click(ptr(3, 4));

    const north = new NorthArrowTool(env);
    north.click(ptr(5, 5));

    const cloud = new RevisionCloudTool(env);
    cloud.click(ptr(0, 0));
    cloud.click(ptr(4, 2));

    const lv = store.project.levels[0]!;
    expect(lv.spots).toHaveLength(2);
    expect(lv.spots![0]!.kind).toBe('elevation');
    expect(lv.spots![0]!.target).toEqual({ x: 1, y: 1 });
    expect(lv.spots![1]!.kind).toBe('coordinate');
    expect(lv.spots![1]!.target).toEqual({ x: 2, y: 3 });

    expect(lv.symbols).toHaveLength(1);
    expect(lv.symbols![0]!.kind).toBe('northArrow');

    expect(lv.revisionClouds).toHaveLength(1);
    expect(lv.revisionClouds![0]!.points).toHaveLength(4);
    expect(lv.detailLines ?? []).toHaveLength(0);

    // Seleção, arraste e exclusão da seta norte
    const symId = lv.symbols![0]!.id;
    env.setSelection([symId]);
    const sel = new SelectTool(env);
    sel.down(ptr(5, 5));
    sel.drag(ptr(7, 6));
    sel.up(ptr(7, 6));
    expect(store.project.levels[0]!.symbols![0]!.at).toEqual({ x: 7, y: 6 });

    for (const cmd of annotationRemovals(store.project, 'lv_0', [symId])) store.exec(cmd);
    expect(store.project.levels[0]!.symbols).toHaveLength(0);

    // SpotElevationTool em corte lê Z diretamente de pt.y
    const secId = 'sec_1';
    store.exec({
      type: 'addView',
      view: {
        id: secId,
        name: 'Corte AA',
        kind: 'section',
        a: { x: 0, y: 0 },
        b: { x: 5, y: 0 },
        depth: 4,
        annotations: { dimensions: [], texts: [], detailLines: [], detailRegions: [], tags: [] },
      },
    });
    const secEnv = {
      ...env,
      isSectionView: () => true,
      section: () => ({
        id: secId,
        annotations: () => store.project.views.find((v) => v.id === secId)!.annotations!,
        setAnnotations: () => {},
        inferContext: () => ({ project: store.project, levelId: 'lv_0', mpp: 0.01, gridStep: 0.1, snap: { endpoint: false, midpoint: false, perpendicular: false, intersection: false, intersections: false, nearest: false, grid: false, axis: false, faces: false, core: false, angleIncrementDeg: 15, polar: false, alignment: false, center: false, tangent: false }, orthoLock: false }),
        result: () => ({ length: 5, levels: [], walls: [], slabs: [], openings: [], stairs: [], ramps: [], roofs: [], beams: [], columns: [], footings: [], cuts: [], beyond: [] }) as never,
      }),
    };
    const secElev = new SpotElevationTool(secEnv);
    secElev.click(ptr(2, 2.45));
    secElev.click(ptr(3, 2.8));
    const secSpots = store.project.views.find((v) => v.id === secId)!.annotations!.spots ?? [];
    expect(secSpots).toHaveLength(1);
    expect(secSpots[0]!.target.y).toBeCloseTo(2.45, 3);

    // Comandos de famílias de anotação
    store.exec({ type: 'upsertTextFamily', family: { id: 'tf_custom', name: 'Título', font: 'sans-serif', textMm: 5, bold: true, italic: false, underline: false, frame: false, opaqueBackground: true, leaderArrow: 'arrow' } });
    expect(store.project.settings.textFamilies?.some((f) => f.id === 'tf_custom')).toBe(true);
  });
});
