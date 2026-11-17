import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { arcFromSagitta, arcLocal, dist, GerenciadorKernelV2, intersection, multiArea } from '@hestia/geom';
import {
  coreRange,
  createEmptyProject,
  makeWall,
  openingTypeById,
  ProjectStore,
  type LocationLine,
  type Opening,
  type OpeningType,
  type Project,
  type Wall,
} from '@hestia/model';
import { buildOpeningModel } from './openingModel.ts';
import { openingBandRing } from './openingCut.ts';
import { openingPlanPaths } from './openingPlan.ts';
import {
  openingPlanOptionsOf,
  openingPlanPathsAt,
  openingPreviewStrokes,
} from './openingPreview.ts';
import { instalarDespachoKernel, removerDespachoKernel } from './kernelDespacho.ts';
import { frameOfWall, openingGeometry, resolveLevel, resolveLevelTs } from './resolve.ts';

interface CenaCurvaOpts {
  radius: number;
  thickness?: number;
  locationLine?: LocationLine;
  flipped?: boolean;
  sagSign?: 1 | -1;
  baseOpening?: string;
  extraOpening?: Partial<OpeningType>;
  offset?: number;
}

function cenaCurva(opts: CenaCurvaOpts): { p: Project; w: Wall; o: Opening } {
  const s = new ProjectStore(createEmptyProject());
  const {
    radius,
    thickness = 0.14,
    locationLine = 'wallCenter',
    flipped = false,
    sagSign = 1,
    baseOpening = 'ot_p80',
    extraOpening = {},
    offset,
  } = opts;
  const baseWt = s.project.wallTypes.wt_alv14!;
  const layers = baseWt.layers.map((l, i, arr) =>
    i === Math.floor(arr.length / 2) ? { ...l, thickness: Math.max(0.05, thickness - 0.04) } : { ...l, thickness: 0.02 },
  );
  s.exec({ type: 'upsertWallType', wallType: { ...baseWt, id: 'wt_curva', layers } });
  const ot = s.project.openingTypes[baseOpening]!;
  s.exec({ type: 'upsertOpeningType', openingType: { ...ot, id: 'ot_test', ...extraOpening } });
  const wall = makeWall({
    id: 'w',
    typeId: 'wt_curva',
    levelId: 'lv_0',
    a: { x: 0, y: 0 },
    b: { x: 2 * radius, y: 0 },
    sag: sagSign * radius,
    locationLine,
    flipped,
  });
  s.exec({ type: 'addWall', wall });
  const arc = arcFromSagitta(wall.a, wall.b, wall.sag)!;
  const o: Opening = {
    id: 'v',
    kind: ot.kind,
    typeId: 'ot_test',
    hostId: 'w',
    offset: offset ?? arc.length / 2,
    flipHand: false,
    flipFacing: false,
    sillOverride: null,
    mark: '',
  };
  s.exec({ type: 'addOpening', opening: o });
  return { p: s.project, w: s.project.elements.w as Wall, o: s.project.elements.v as Opening };
}

function medirAlinhamento(opts: CenaCurvaOpts) {
  const { p, o } = cenaCurva(opts);
  const f = frameOfWall(p, 'w')!;
  const g = openingGeometry(p, o, f);
  const t = openingTypeById(p, o.typeId)!;
  const m = buildOpeningModel(p, o, g, f);
  const res = resolveLevelTs(p, 'lv_0', new Map());
  const optsPlan = openingPlanOptionsOf(t, m.height, 'high');
  const world = openingPlanPathsAt(g, openingPlanPaths(m, optsPlan));
  const preview = openingPreviewStrokes(p, o, f, 'fine');
  const arc = f.arc!;

  const hw = g.roughWidth / 2;
  const silVerts = res.clusters[0]!.silhouette.flat().flat();

  // 1. Erro máximo de corda das faces curvas da parede em relação ao círculo exato.
  let maxWallChordErrMm = 0;
  for (const ring of res.clusters[0]!.silhouette.flat()) {
    for (let i = 0; i < ring.length; i++) {
      const p1 = ring[i]!;
      const p2 = ring[(i + 1) % ring.length]!;
      if (dist(p1, p2) < 0.05) continue;
      const l1 = arcLocal(arc, p1);
      const l2 = arcLocal(arc, p2);
      if (Math.abs(l1.s - l2.s) < 1e-4 && (Math.abs(l1.s - f.sLo) < 1e-3 || Math.abs(l1.s - f.sHi) < 1e-3)) {
        const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
        const err = Math.abs(arcLocal(arc, mid).s - l1.s) * 1000;
        if (err > maxWallChordErrMm) maxWallChordErrMm = err;
      }
    }
  }

  // 2. Alinhamento do corte da parede nas duas faces (sLo / sHi) contra a face externa do batente / caixilho / vão.
  const cutRight = silVerts
    .map((v) => arcLocal(arc, v))
    .filter((q) => q.t > o.offset + 0.05 && q.t < o.offset + hw + 0.05);
  const nearestOnS = (pts: typeof cutRight, sTarget: number, preferMaxT: boolean) => {
    const onS = pts.filter((q) => Math.abs(q.s - sTarget) < 0.005);
    if (onS.length === 0) return undefined;
    return onS.reduce((best, q) =>
      preferMaxT ? (q.t > best.t ? q : best) : Math.abs(q.t - (o.offset + hw)) < Math.abs(best.t - (o.offset + hw)) ? q : best,
    );
  };
  const cutLo = nearestOnS(cutRight, f.sLo, false);
  const cutHi = nearestOnS(cutRight, f.sHi, false);

  const frameRight = world
    .filter((s) => s.role === 'jamb' || s.role === 'sillFrame' || s.role === 'mark')
    .flatMap((s) => s.pts)
    .map((pt) => arcLocal(arc, pt))
    .filter((q) => q.t > o.offset);
  const fLo = nearestOnS(frameRight, f.sLo, true);
  const fHi = nearestOnS(frameRight, f.sHi, true);

  const cutVsJambLoMm = cutLo && fLo ? Math.abs(cutLo.t - fLo.t) * 1000 : Infinity;
  const cutVsJambHiMm = cutHi && fHi ? Math.abs(cutHi.t - fHi.t) * 1000 : Infinity;

  // 3. Erro radial das marcações de vão livre e faces do batente/caixilho.
  let frameRadialErrMm = 0;
  for (const s of world.filter((x) => x.role === 'mark')) {
    for (const pt of s.pts) {
      const ls = arcLocal(arc, pt).s;
      const err = Math.min(Math.abs(ls - f.sLo), Math.abs(ls - f.sHi)) * 1000;
      if (err > frameRadialErrMm) frameRadialErrMm = err;
    }
  }
  if (fLo) frameRadialErrMm = Math.max(frameRadialErrMm, Math.abs(fLo.s - f.sLo) * 1000);
  if (fHi) frameRadialErrMm = Math.max(frameRadialErrMm, Math.abs(fHi.s - f.sHi) * 1000);

  // 4. Encaixe da folha no batente (portas de giro/duplas) contra a parede reta de referência (< 0,5 mm de desvio por curvatura).
  let hingeDeltaMm = 0;
  const leaves = world.filter((s) => s.role === 'leaf');
  const jambs = world.filter((s) => s.role === 'jamb').flatMap((s) => s.pts);
  if (t.plan !== 'pivot' && leaves.length > 0 && jambs.length > 0 && !t.kind.includes('window')) {
    const curvedGapMm = Math.min(...leaves[0]!.pts.map((lp) => Math.min(...jambs.map((jp) => dist(lp, jp))))) * 1000;
    const sRet = cenaCurva({
      ...opts,
      radius: 3,
      offset: 3,
    });
    const sw: Wall = {
      ...sRet.w,
      a: { x: 0, y: 0 },
      b: { x: 6, y: 0 },
      sag: 0,
      locationLine: opts.locationLine ?? 'wallCenter',
      flipped: opts.flipped ?? false,
    };
    const sp = { ...sRet.p, elements: { ...sRet.p.elements, w: sw, v: { ...sRet.o, offset: 3 } } };
    const sf = frameOfWall(sp, 'w')!;
    const so = sp.elements.v as Opening;
    const sg = openingGeometry(sp, so, sf);
    const sm = buildOpeningModel(sp, so, sg, sf);
    const sWorld = openingPlanPathsAt(sg, openingPlanPaths(sm, optsPlan));
    const sLeaves = sWorld.filter((s) => s.role === 'leaf');
    const sJambs = sWorld.filter((s) => s.role === 'jamb').flatMap((s) => s.pts);
    const straightGapMm =
      sLeaves.length > 0 && sJambs.length > 0
        ? Math.min(...sLeaves[0]!.pts.map((lp) => Math.min(...sJambs.map((jp) => dist(lp, jp))))) * 1000
        : curvedGapMm;
    hingeDeltaMm = Math.abs(curvedGapMm - straightGapMm);
  }

  let maxPreviewPlacedDiffMm = 0;
  expect(preview.length).toBe(world.length);
  for (let i = 0; i < world.length; i++) {
    expect(preview[i]!.pts.length).toBe(world[i]!.pts.length);
    for (let k = 0; k < world[i]!.pts.length; k++) {
      const d = dist(preview[i]!.pts[k]!, world[i]!.pts[k]!) * 1000;
      if (d > maxPreviewPlacedDiffMm) maxPreviewPlacedDiffMm = d;
    }
  }

  // 5. Invasão de qualquer camada no miolo do vão (< 1e-7 m²), descontando apenas o retorno do acabamento em vãos livres.
  const wt = p.wallTypes.wt_curva!;
  const core = coreRange(wt);
  const wrapInset =
    t.leaves === 0 && (t.closure ?? wt.wrapInserts) !== 'none'
      ? wt.layers.reduce((acc, l, i) => acc + (l.wraps && (i < core.first || i > core.last) ? l.thickness : 0), 0) / 2
      : 0;
  const vao = [[openingBandRing(g, g.roughWidth / 2 - wrapInset - 1e-4, g.thickness / 2 + 0.02)]];
  let invasionArea = 0;
  for (const l of res.walls.w!.layers) invasionArea += multiArea(intersection(l.cut, vao));

  return {
    maxWallChordErrMm,
    cutVsJambLoMm,
    cutVsJambHiMm,
    frameRadialErrMm,
    hingeDeltaMm,
    maxPreviewPlacedDiffMm,
    invasionArea,
  };
}

describe('alinhamento de aberturas e desempenho em paredes curvas/circulares', () => {
  const casos: Array<{ nome: string } & CenaCurvaOpts> = [
    { nome: 'porta giro R=3 T=0.14 wallCenter', radius: 3, thickness: 0.14, baseOpening: 'ot_p80' },
    { nome: 'porta giro R=3 T=0.40 wallCenter', radius: 3, thickness: 0.4, baseOpening: 'ot_p80' },
    { nome: 'porta dupla R=5 T=0.30 finishExterior', radius: 5, thickness: 0.3, locationLine: 'finishExterior', baseOpening: 'ot_p160' },
    { nome: 'porta pivotante R=5 T=0.35 sag negativo', radius: 5, thickness: 0.35, sagSign: -1, baseOpening: 'ot_pp80' },
    { nome: 'janela correr R=3 T=0.40 finishExterior', radius: 3, thickness: 0.4, locationLine: 'finishExterior', baseOpening: 'ot_j120' },
    { nome: 'janela abrir R=5 T=0.30 wallCenter', radius: 5, thickness: 0.3, baseOpening: 'ot_ja120' },
    { nome: 'vao livre R=5 T=0.30 wallCenter', radius: 5, thickness: 0.3, baseOpening: 'ot_vao90' },
    { nome: 'vao livre R=3 T=0.40 finishExterior sag -1', radius: 3, thickness: 0.4, locationLine: 'finishExterior', sagSign: -1, baseOpening: 'ot_vao90' },
    { nome: 'porta giro R=10 T=0.30 flipped', radius: 10, thickness: 0.3, flipped: true, baseOpening: 'ot_p80' },
    { nome: 'porta giro R=50 T=0.40 wallCenter', radius: 50, thickness: 0.4, baseOpening: 'ot_p80' },
  ];

  for (const c of casos) {
    it(c.nome, () => {
      const m = medirAlinhamento(c);
      expect(m.maxWallChordErrMm, 'erro de corda da parede (mm)').toBeLessThan(1);
      expect(m.cutVsJambLoMm, 'corte vs batente em sLo (mm)').toBeLessThan(1);
      expect(m.cutVsJambHiMm, 'corte vs batente em sHi (mm)').toBeLessThan(1);
      expect(m.frameRadialErrMm, 'erro radial batente/vão (mm)').toBeLessThan(1);
      expect(m.hingeDeltaMm, 'desvio folha-batente vs parede reta (mm)').toBeLessThan(0.5);
      expect(m.maxPreviewPlacedDiffMm, 'diferença prévia vs colocado (mm)').toBeLessThan(1e-3);
      expect(m.invasionArea, 'invasão de camada no vão (m²)').toBeLessThan(1e-7);
    });
  }

  it('parede circular completa R=50m gera geometria em menos de 50ms', async () => {
    const bytes = readFileSync(new URL('../../geom/assets/geom_wasm.wasm', import.meta.url));
    const ger = await GerenciadorKernelV2.dosBytes(bytes);
    const s10 = new ProjectStore(createEmptyProject());
    s10.exec({ type: 'addWall', wall: makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 20, y: 0 }, sag: 10 }) });
    s10.exec({ type: 'addWall', wall: makeWall({ id: 'w2', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 20, y: 0 }, b: { x: 0, y: 0 }, sag: 10 }) });
    const s = new ProjectStore(createEmptyProject());
    const R = 50;
    s.exec({ type: 'addWall', wall: makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 2 * R, y: 0 }, sag: R }) });
    s.exec({ type: 'addWall', wall: makeWall({ id: 'w2', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 2 * R, y: 0 }, b: { x: 0, y: 0 }, sag: R }) });
    instalarDespachoKernel({ gerenciador: () => ger, config: () => ({ fatiaA: true, fatiaB: true, sombra: false }) });
    try {
      // Aquecimento JIT/WASM antes da medição.
      resolveLevel(s10.project, 'lv_0', new Map());
      const t0 = performance.now();
      const res = resolveLevel(s.project, 'lv_0', new Map());
      const dtMs = performance.now() - t0;
      expect(Object.keys(res.walls)).toHaveLength(2);
      expect(dtMs).toBeLessThan(50);
    } finally {
      removerDespachoKernel();
    }
  });
});
