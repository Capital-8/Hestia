import {
  DEFAULT_AREA_GRAPHICS,
  ProjectStore,
  createEmptyProject,
  defaultStairTypeId,
  makeFloor,
  makeLevel,
  makeRoof,
  makeRoom,
  makeSlab,
  makeStair,
  makeTerrain,
  makeWall,
  newSheetId,
  newViewportId,
  type Id,
  type Project,
  type Sheet,
  type SheetViewSource,
  type SheetViewport,
  type StairCurve,
  type StairRun,
} from '@hestia/model';
import { buildSheetDrawList, type SheetDrawList } from '@hestia/render';
import { sheetInnerBox, sheetOf } from '@hestia/model';
import { autoScaleForView, contentSizeMm, freeSpotFor } from './sheetInsert.ts';
import { newSheet } from './sheetActions.ts';

/**
 * Gerador de projetos GRANDES para os testes de estabilidade das pranchas: muitos níveis, centenas ou milhares de
 * elementos (paredes, lajes, pisos, telhado, escadas, esquadrias, ambientes, terreno), cortes, elevações, planta de área
 * e as pranchas que mostram tudo isso em vários formatos e escalas. Determinístico: sem aleatório, sem relógio.
 */
export interface BigProjectSpec {
  /** Níveis (pavimentos), de 3 m em 3 m. */
  levels: number;
  /** Ambientes por lado, em cada nível: `rooms x rooms` salas de 4 x 4 m. */
  rooms: number;
  /** Com terreno (malha de pontos) no nível 0. */
  terrain?: boolean;
  /** Pontos do terreno por lado (malha). */
  terrainGrid?: number;
}

const CELL = 4;
const v2 = (x: number, y: number) => ({ x, y });
const ln = (ax: number, ay: number, bx: number, by: number): StairCurve => ({ a: v2(ax, ay), b: v2(bx, by), sag: 0 });
const stairRun = (x0: number, y0: number): StairRun => ({
  id: 'run',
  kind: 'run',
  boundaryLeft: [ln(x0, y0 + 0.6, x0 + 4.5, y0 + 0.6)],
  boundaryRight: [ln(x0, y0 - 0.6, x0 + 4.5, y0 - 0.6)],
  risers: Array.from({ length: 16 }, (_, k) => ln(x0 + k * 0.28, y0 - 1, x0 + k * 0.28, y0 + 1)),
  path: [],
});

/** Monta o projeto grande num `ProjectStore` (cada elemento por comando, como a tela faz). */
export function buildBigProject(spec: BigProjectSpec): ProjectStore {
  const base = createEmptyProject();
  const store = new ProjectStore({ ...base, name: 'Projeto grande' });
  for (let i = 0; i < spec.levels; i++) {
    store.exec({ type: 'upsertLevel', level: makeLevel({ id: `lv_${i}`, name: `Pavimento ${i + 1}`, elevation: i * 3 }) });
  }
  const n = spec.rooms;
  const side = n * CELL;
  for (let lv = 0; lv < spec.levels; lv++) {
    const levelId = `lv_${lv}`;
    let k = 0;
    const wall = (ax: number, ay: number, bx: number, by: number): string => {
      const id = `w_${lv}_${k++}`;
      store.exec({ type: 'addWall', wall: makeWall({ id, typeId: 'wt_alv14', levelId, a: v2(ax, ay), b: v2(bx, by), height: 3 }) });
      return id;
    };
    for (let j = 0; j <= n; j++) {
      for (let i = 0; i < n; i++) {
        const hx = wall(i * CELL, j * CELL, (i + 1) * CELL, j * CELL);
        const vy = wall(j * CELL, i * CELL, j * CELL, (i + 1) * CELL);
        if (i % 2 === 0 && j % 2 === 0) {
          store.exec({ type: 'addOpening', opening: { id: `o_${hx}`, kind: 'door', typeId: 'ot_p90', hostId: hx, offset: 1.5, flipHand: false, flipFacing: false, sillOverride: null, mark: '' } });
        } else if (j % 2 === 1) {
          store.exec({ type: 'addOpening', opening: { id: `o_${vy}`, kind: 'window', typeId: 'ot_jc2_120x100', hostId: vy, offset: 1.4, flipHand: false, flipFacing: false, sillOverride: null, mark: '' } });
        }
      }
    }
    const boundary = [v2(0, 0), v2(side, 0), v2(side, side), v2(0, side)];
    store.exec({ type: 'addFloor', floor: makeFloor({ id: `f_${lv}`, typeId: 'ft_laje12', levelId, boundary }) });
    if (lv > 0) store.exec({ type: 'addSlab', slab: makeSlab({ id: `sl_${lv}`, typeId: Object.keys(store.project.slabTypes)[0]!, levelId, boundary }) });
    for (let a = 0; a < n; a++) {
      for (let b = 0; b < n; b++) {
        store.exec({ type: 'addRoom', room: makeRoom({ id: `rm_${lv}_${a}_${b}`, levelId, name: `Sala ${a}.${b}`, number: `${lv}${a}${b}`, point: v2(a * CELL + 2, b * CELL + 2) }) });
      }
    }
    if (lv < spec.levels - 1) {
      store.exec({ type: 'addStair', stair: makeStair({ id: `st_${lv}`, typeId: defaultStairTypeId, levelId, topLevelId: `lv_${lv + 1}`, components: [stairRun(0.5, 2)] }) });
    }
  }
  const top = `lv_${spec.levels - 1}`;
  store.exec({
    type: 'addRoof',
    roof: makeRoof({ id: 'rf_1', typeId: 'rt_ceramica', levelId: top, boundary: [v2(-0.5, -0.5), v2(side + 0.5, -0.5), v2(side + 0.5, side + 0.5), v2(-0.5, side + 0.5)], shape: 'hip', slopePercent: 30 }),
  });
  if (spec.terrain) {
    const g = spec.terrainGrid ?? 12;
    const pts: number[] = [];
    for (let i = 0; i < g; i++) for (let j = 0; j < g; j++) pts.push(-10 + (i * (side + 20)) / (g - 1), -10 + (j * (side + 20)) / (g - 1), 0.4 * Math.sin(i / 2) + 0.3 * Math.cos(j / 3));
    store.exec({ type: 'addTerrain', terrain: makeTerrain({ id: 'tr_1', levelId: 'lv_0', pontos: pts }) });
  }
  // Cortes e elevações (retas atravessando o prédio) e uma planta de área do térreo.
  store.exec({ type: 'addView', view: { id: 'sec_a', name: 'Corte AA', kind: 'section', a: v2(-2, side / 2), b: v2(side + 2, side / 2), depth: side } });
  store.exec({ type: 'addView', view: { id: 'sec_b', name: 'Corte BB', kind: 'section', a: v2(side / 2, -2), b: v2(side / 2, side + 2), depth: side } });
  store.exec({ type: 'addView', view: { id: 'el_s', name: 'Elevação Sul', kind: 'elevation', a: v2(-1, -2), b: v2(side + 1, -2), depth: side + 4 } });
  store.exec({ type: 'addView', view: { id: 'el_n', name: 'Elevação Norte', kind: 'elevation', a: v2(side + 1, side + 2), b: v2(-1, side + 2), depth: side + 4 } });
  store.exec({ type: 'addAreaPlan', plan: { id: 'ap_0', name: 'Áreas · Pav. 1', levelId: 'lv_0', scale: 100, graphics: { ...DEFAULT_AREA_GRAPHICS }, tags: [] } });
  return store;
}

/** Uma prancha de cada tipo, com várias vistas em formatos e escalas diferentes. Devolve os ids em ordem. */
export interface SheetPlan {
  size: Sheet['size'];
  orientation: Sheet['orientation'];
  name: string;
  views: { view: SheetViewSource; scale?: number }[];
}

export function standardSheetPlans(p: Project): SheetPlan[] {
  const levels = p.levels.map((l) => l.id);
  const top = levels[levels.length - 1]!;
  return [
    { size: 'A1', orientation: 'landscape', name: 'Plantas', views: levels.slice(0, 3).map((levelId) => ({ view: { kind: 'plan' as const, levelId } })) },
    { size: 'A2', orientation: 'portrait', name: 'Cobertura', views: [{ view: { kind: 'plan', levelId: top }, scale: 200 }] },
    { size: 'A3', orientation: 'landscape', name: 'Áreas', views: [{ view: { kind: 'areaPlan', planId: 'ap_0' } }, { view: { kind: 'areaTable' } }] },
    { size: 'A0', orientation: 'landscape', name: 'Cortes e elevações', views: [{ view: { kind: 'section', sectionId: 'sec_a' }, scale: 100 }, { view: { kind: 'section', sectionId: 'sec_b' }, scale: 100 }, { view: { kind: 'section', sectionId: 'el_s' }, scale: 100 }, { view: { kind: 'section', sectionId: 'el_n' }, scale: 100 }] },
    { size: 'A3', orientation: 'portrait', name: '3D', views: [{ view: { kind: '3d' } }] },
    { size: 'A4', orientation: 'landscape', name: 'Mista pequena', views: [{ view: { kind: 'areaTable' } }] },
  ];
}

/**
 * Cria as pranchas pelos comandos, cada vista na maior escala que cabe (ou na pedida, se couber). Devolve os ids e quantas
 * vistas foram recusadas por não caberem (a recusa é esperada em A4/A3 com prédio grande, nunca uma exceção estranha).
 */
export function createSheets(store: ProjectStore, plans: SheetPlan[]): { ids: Id[]; refused: number } {
  const ids: Id[] = [];
  let refused = 0;
  for (const pl of plans) {
    const sheet: Sheet = { ...newSheet(store.project), id: newSheetId(), name: pl.name, size: pl.size, orientation: pl.orientation, number: `T-${ids.length + 101}` };
    store.exec({ type: 'addSheet', sheet });
    ids.push(sheet.id);
    for (const { view, scale } of pl.views) {
      const cur = sheetOf(store.project, sheet.id)!;
      const inner = sheetInnerBox(cur);
      const box = { w: inner.x1 - inner.x0, h: inner.y1 - inner.y0 };
      let sc = scale ?? autoScaleForView(store.project, view, box);
      let size = contentSizeMm(store.project, view, sc);
      if (size.w > box.w || size.h > box.h) {
        sc = autoScaleForView(store.project, view, box);
        size = contentSizeMm(store.project, view, sc);
      }
      const at = size.w <= box.w && size.h <= box.h ? freeSpotFor(cur, [], size) : null;
      if (!at) {
        refused++;
        continue;
      }
      const viewport: SheetViewport = { id: newViewportId(), view, at, size, scale: sc };
      store.exec({ type: 'addViewport', sheetId: sheet.id, viewport });
    }
  }
  return { ids, refused };
}

/** Resumo numérico e determinístico de uma lista de desenho (para comparar execuções sem guardar o JSON inteiro). */
export function drawSummary(d: SheetDrawList | null): string {
  if (!d) return 'null';
  let paths = 0;
  let fills = 0;
  let texts = 0;
  let pts = 0;
  let sum = 0;
  for (const g of d.groups) {
    paths += g.paths.length;
    fills += g.fills.length;
    texts += g.texts.length;
    for (const s of g.paths) for (const q of s.pts) {
      pts++;
      sum += q.x * 1.3 + q.y * 0.7;
    }
  }
  // units-ok: resumo interno de comparação do desenho (não é exibido ao usuário)
  return `${d.groups.length}g/${paths}p/${fills}f/${texts}t/${pts}pt/${sum.toFixed(3)}`;
}

/** Todos os números do desenho são finitos? (NaN/Infinity no PDF/DXF quebram o arquivo.) */
export function drawIsFinite(d: SheetDrawList): boolean {
  const ok = (n: number): boolean => Number.isFinite(n);
  for (const g of d.groups) {
    if (g.clip && !(ok(g.clip.x) && ok(g.clip.y) && ok(g.clip.w) && ok(g.clip.h))) return false;
    for (const s of g.paths) {
      if (!ok(s.widthMm)) return false;
      for (const q of s.pts) if (!ok(q.x) || !ok(q.y)) return false;
    }
    for (const f of g.fills) for (const poly of f.polygons) for (const ring of poly) for (const q of ring) if (!ok(q.x) || !ok(q.y)) return false;
    for (const t of g.texts) if (!ok(t.at.x) || !ok(t.at.y) || !ok(t.sizeMm)) return false;
  }
  return true;
}

export const drawOf = (p: Project, sheetId: Id): SheetDrawList | null => buildSheetDrawList(p, sheetId, 'pt');
