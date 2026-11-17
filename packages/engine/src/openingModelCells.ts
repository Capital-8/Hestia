import type { CellContent, OpeningType, ResolvedCell, ResolvedLayout } from '@hestia/model';
import { FRAMELESS_CLEARANCE_DEFAULT } from '@hestia/model';
import type { OpeningGeometry } from './types.ts';
import { addPart, box, makeCtx, type Ctx } from './openingModelContext.ts';
import { buildDoor } from './openingModelDoors.ts';
import { buildWindow } from './openingModelWindows.ts';
import { edgeMembers, type Edge } from './openingModelMembers.ts';
import type { LeafOpening, OpeningPart, PartMotion, PartRole } from './openingModelTypes.ts';

/*
 * Conteúdo das células da composição (spec F1 §2.2, §3.6 e §5). A folha reaproveita os builders de família: monta-se um
 * vão sintético do tamanho da luz da célula (batente do conjunto, `frameWidth` = J), constroem-se as peças da folha e
 * desloca-se o resultado para a posição da célula. Vidro, painel e veneziana são montados aqui.
 */

type Leaf = Extract<CellContent, { kind: 'leaf' }>;
const SUB_ID = '__cell';
/** Campos do tipo que NÃO valem para o vão sintético da célula (a composição os trata). */
const DROP = ['transom', 'sidelights', 'composition', 'casing', 'sillBoard', 'lintel', 'sillBeam', 'threshold', 'grid'] as const;
/** Opções de folha: o tipo-pai não as empresta à célula; valem só as da própria célula. */
const OPTION_KEYS = [
  'leafStyle', 'handle', 'glassRatio', 'hinges', 'leafThickness', 'leafMaterialId', 'glassKind', 'glassThickness',
  'tiltAxis', 'leafSide', 'leafUndercut', 'handleHeight', 'handleInset', 'angle2d', 'angle3d', 'showSwing', 'swingStyle', 'leafPlan',
] as const;
/** Peças do batente do vão sintético: descartadas (o quadro único é montado por `buildMembers`). */
const FRAME_ROLES: ReadonlySet<PartRole> = new Set<PartRole>([
  'jamb', 'head', 'sillFrame', 'threshold', 'stop', 'casing', 'sillBoard', 'lintel', 'sillBeam', 'mullion', 'transom', 'bead',
]);

function shiftMotion(m: PartMotion, dt: number, dz: number): PartMotion {
  if (m.kind === 'rotate') return m.axis === 'z' ? { ...m, t: m.t + dt } : { ...m, z: m.z + dz };
  if (m.kind === 'fold') return { ...m, tAnchor: m.tAnchor + dt };
  return m;
}

function shiftPart(p: OpeningPart, id: string, dt: number, dz: number, leafBase: number): OpeningPart {
  const b = p.box;
  const out: OpeningPart = { ...p, id, box: { ...b, t0: b.t0 + dt, t1: b.t1 + dt, z0: b.z0 + dz, z1: b.z1 + dz } };
  if (p.profile) {
    // 'ts' (t, s) desloca t; 'sz' (s, z) desloca z; 'tz' (t, z) desloca t e z.
    const plano = p.profile.plane;
    out.profile = {
      plane: plano,
      pts: p.profile.pts.map(([a, v]) => [plano === 'sz' ? a : a + dt, plano === 'ts' ? v : v + dz]),
    };
  }
  if (p.motion) out.motion = shiftMotion(p.motion, dt, dz);
  if (p.leaf !== undefined) out.leaf = p.leaf + leafBase;
  return out;
}

function shiftOpening(o: LeafOpening, dt: number, dz: number, leafBase: number): LeafOpening {
  const hinged = o.kind === 'side' || o.kind === 'pivot';
  return {
    ...o,
    leaf: o.leaf + leafBase,
    hingeT: hinged ? o.hingeT + dt : o.hingeT,
    latchT: hinged ? o.latchT + dt : o.latchT,
    pivot: { t: o.pivot.t + dt, s: o.pivot.s },
    ...(o.axisZ !== undefined ? { axisZ: o.axisZ + dz } : {}),
    z0: o.z0 + dz,
    z1: o.z1 + dz,
  };
}

/**
 * Nome da peça na composição: o índice local da folha vira o id da célula (`leaf-0` → `leaf-<célula>`, `leaf-0-left` →
 * `leaf-<célula>-left`; com várias folhas o índice fica: `leaf-<célula>-1`). Sem índice, a peça ganha o sufixo da célula.
 */
function cellPartId(id: string, cellId: string, leaves: number): string {
  const m = /^(leaf|glass|handle|hinge|muntin)-(\d+)(.*)$/.exec(id);
  if (!m) return `${id}-${cellId}`;
  return `${m[1]}-${cellId}${leaves > 1 ? `-${m[2]}` : ''}${m[3]}`;
}

/** Tipo sintético da célula: o do pai sem bandeiras/detalhes, no tamanho do vão da luz, com família e opções da célula. */
function subType(c: Ctx, content: Leaf, w: number, h: number): OpeningType {
  const rest: Record<string, unknown> = { ...c.t };
  for (const k of [...DROP, ...OPTION_KEYS]) delete rest[k];
  const kind = content.family.startsWith('door_') ? 'door' : 'window';
  return {
    ...rest,
    ...content.options,
    id: SUB_ID,
    kind,
    plan: content.plan,
    leaves: content.leaves,
    width: w,
    height: h,
    nominalRef: 'opening',
    frameStyle: c.frameStyle,
    frameWidth: c.J,
  } as OpeningType;
}

/**
 * Folha(s) da célula `cell`. `leafBase` é o índice global da primeira folha; devolve quantas folhas a célula usou.
 * A mão da dobradiça é a da instância, invertida quando a célula tem `mirror` (spec §2.2).
 */
export function buildLeafCell(c: Ctx, cell: ResolvedCell, content: Leaf, leafBase: number): number {
  const u = cell.luz;
  const kind = content.family.startsWith('door_') ? 'door' : 'window';
  const J = c.frameStyle === 'block' ? 0 : c.J;
  const w = u.t1 - u.t0 + 2 * J;
  const h = u.z1 - u.z0 + (kind === 'door' ? J : 2 * J);
  const sub = subType(c, content, w, h);
  const g: OpeningGeometry = {
    ...c.g,
    kind,
    width: w,
    height: h,
    leaves: content.leaves as OpeningGeometry['leaves'],
    plan: content.plan as OpeningGeometry['plan'],
    flipHand: content.mirror ? !c.g.flipHand : c.g.flipHand,
  };
  const p = { ...c.p, openingTypes: { ...c.p.openingTypes, [SUB_ID]: sub } };
  const sc = makeCtx(p, { ...c.o, typeId: SUB_ID }, g, c.f);
  if (!sc) return 0;
  if (kind === 'door') buildDoor(sc);
  else buildWindow(sc);
  const dt = (u.t0 + u.t1) / 2;
  const dz = u.z0 - (kind === 'door' ? 0 : J);
  let count = 0;
  for (const x of sc.parts) {
    if (FRAME_ROLES.has(x.role)) continue;
    if (x.leaf !== undefined) count = Math.max(count, x.leaf + 1);
    c.parts.push(shiftPart(x, cellPartId(x.id, cell.id, content.leaves), dt, dz, leafBase));
  }
  for (const o of sc.openings) {
    count = Math.max(count, o.leaf + 1);
    c.openings.push(shiftOpening(o, dt, dz, leafBase));
  }
  return count;
}

const EDGES: readonly Edge[] = ['left', 'right', 'bottom', 'top'];

/**
 * Quanto a placa entra no rebaixo em cada borda (spec §5): `max(0, depth − clearance)` do perfil do membro vizinho; 0 sem rebaixo
 * (perfil migrado, estilo `simple`) e a menor entre os membros que tocam a borda. `bead` = baguete do perfil (0 = sem).
 */
function rebateOf(c: Ctx, l: ResolvedLayout, cell: ResolvedCell): Record<Edge, { ext: number; bead: number }> {
  const out = {} as Record<Edge, { ext: number; bead: number }>;
  const rebate = c.frameStyle === 'rebate' || c.frameStyle === 'aduela';
  for (const e of EDGES) {
    const ms = rebate ? edgeMembers(l, cell, e) : [];
    const rs = ms.map((m) => m.profile.glassRebate);
    if (!ms.length || rs.some((r) => !r)) {
      out[e] = { ext: 0, bead: 0 };
      continue;
    }
    const list = rs as NonNullable<(typeof rs)[number]>[];
    out[e] = {
      ext: Math.min(...list.map((r) => Math.max(0, r.depth - r.clearance))),
      bead: Math.min(...list.map((r) => r.bead)),
    };
  }
  return out;
}

/** Placa (vidro ou painel) no rebaixo: luz + extensão por borda. Devolve as extensões para o baguete. */
function plateBox(c: Ctx, cell: ResolvedCell, thickness: number, ext: Record<Edge, number>) {
  const u = cell.luz;
  return box(u.t0 - ext.left, u.t1 + ext.right, c.Cd - thickness / 2, c.Cd + thickness / 2, u.z0 - ext.bottom, u.z1 + ext.top);
}

/** Baguete na face INTERIOR (a validar): fixa o vidro no rebaixo, dentro da luz, junto a cada borda com rebaixo e `bead` > 0. */
function addBeads(c: Ctx, cell: ResolvedCell, thickness: number, r: Record<Edge, { ext: number; bead: number }>): void {
  const u = cell.luz;
  const iside = Math.sign(c.f.sInt - c.f.sMid) || 1;
  const bt = (e: Edge): number => (r[e].ext > 0 ? r[e].bead : 0);
  const a = c.Cd + iside * (thickness / 2);
  const bs = Math.max(0, Math.min(Math.max(bt('left'), bt('right'), bt('bottom'), bt('top')), c.D / 2 - thickness / 2));
  if (bs <= 0) return;
  const s0 = Math.min(a, a + iside * bs);
  const s1 = Math.max(a, a + iside * bs);
  const L = bt('left');
  const R = bt('right');
  const id = (side: string): string => `bead-${cell.id}-${side}`;
  if (L > 0) addPart(c, id('left'), 'bead', 'frame', box(u.t0, u.t0 + L, s0, s1, u.z0, u.z1));
  if (R > 0) addPart(c, id('right'), 'bead', 'frame', box(u.t1 - R, u.t1, s0, s1, u.z0, u.z1));
  if (bt('bottom') > 0) addPart(c, id('bottom'), 'bead', 'frame', box(u.t0 + L, u.t1 - R, s0, s1, u.z0, u.z0 + bt('bottom')));
  if (bt('top') > 0) addPart(c, id('top'), 'bead', 'frame', box(u.t0 + L, u.t1 - R, s0, s1, u.z1 - bt('top'), u.z1));
}

/**
 * Vidro fixo: `rebate` = placa no rebaixo do perfil vizinho (luz + 2·max(0, rebaixo − folga) por eixo) com baguete;
 * `frameless` = sem perfil, placa = luz − 2·folga (`FRAMELESS_CLEARANCE_DEFAULT`). `grid` vira montantes decorativos.
 */
export function buildGlassCell(c: Ctx, l: ResolvedLayout, cell: ResolvedCell, content: Extract<CellContent, { kind: 'glass' }>): void {
  const g = content.glass;
  const u = cell.luz;
  const r = rebateOf(c, l, cell);
  const k = FRAMELESS_CLEARANCE_DEFAULT;
  const frameless = g.mounting === 'frameless';
  const ext = Object.fromEntries(EDGES.map((e) => [e, frameless ? -k : r[e].ext])) as Record<Edge, number>;
  const b = plateBox(c, cell, g.thickness, ext);
  addPart(c, `glass-${cell.id}`, 'glass', 'glass', b, { glassKind: g.kind });
  if (!frameless) addBeads(c, cell, g.thickness, r);
  if (!g.grid) return;
  const depth = Math.min(c.D * 0.6, c.D - 0.001);
  const half = 0.0125;
  for (let i = 1; i < g.grid.cols; i++) {
    const t = u.t0 + ((u.t1 - u.t0) * i) / g.grid.cols;
    addPart(c, `muntin-${cell.id}-v-${i - 1}`, 'muntin', 'frame', box(t - half, t + half, c.Cd - depth / 2, c.Cd + depth / 2, u.z0, u.z1));
  }
  for (let i = 1; i < g.grid.rows; i++) {
    const z = u.z0 + ((u.z1 - u.z0) * i) / g.grid.rows;
    addPart(c, `muntin-${cell.id}-h-${i - 1}`, 'muntin', 'frame', box(u.t0, u.t1, c.Cd - depth / 2, c.Cd + depth / 2, z - half, z + half));
  }
}

/** Painel cego: placa opaca da espessura do conteúdo, no rebaixo do perfil vizinho (mesma regra do vidro). */
export function buildPanelCell(c: Ctx, l: ResolvedLayout, cell: ResolvedCell, thickness: number): void {
  const r = rebateOf(c, l, cell);
  const ext = Object.fromEntries(EDGES.map((e) => [e, r[e].ext])) as Record<Edge, number>;
  addPart(c, `panel-${cell.id}`, 'leafPanel', 'leaf', plateBox(c, cell, thickness, ext));
}

/** Veneziana: aletas horizontais na luz (`blades` aletas, ou passo de 0,055 como a folha de veneziana). */
export function buildLouverCell(c: Ctx, cell: ResolvedCell, blades?: number): void {
  const u = cell.luz;
  const n = blades && blades > 0 ? Math.floor(blades) : Math.max(1, Math.floor((u.z1 - u.z0) / 0.055));
  const pitch = (u.z1 - u.z0) / n;
  const th = Math.min(0.035, pitch * 0.65);
  for (let k = 0; k < n; k++) {
    const z = u.z0 + k * pitch + (pitch - th) / 2;
    addPart(c, `louver-${cell.id}-${k}`, 'leafPanel', 'leaf', box(u.t0, u.t1, c.Cd - c.L / 2, c.Cd + c.L / 2, z, z + th));
  }
}
