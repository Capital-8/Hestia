import { makeWall, mullionTypesOf, curtainPanelTypesOf, CURTAIN_LIMITS, type CurtainPanelType, type CurtainSpec, type GridAxisSpec, type Id, type MullionType, type Wall, type WallType } from '@hestia/model';
import { materialIdOfStyle, slug, styleOfWithMaterial } from './elementTypes.ts';
import { hull2, rectangleAxis, type Body } from './geometry.ts';
import { bodyFor, levelAt } from './genericImport.ts';
import { attachCurtainOpenings } from './curtainOpenings.ts';
import { aggregateIndex, withoutHestiaProperties } from './hestia.ts';
import type { Pt2 } from './ifc.ts';
import { propertiesOf } from './psets.ts';
import type { Ctx } from './mapping.ts';
import type { StepEntity } from './step.ts';
import { t } from '../i18n.ts';

/**
 * `IFCCURTAINWALL` como parede cortina nativa. O Revit (e outros) exporta a cortina sem geometria própria, agregando por
 * `IFCRELAGGREGATES` os montantes (`IFCMEMBER`) e os painéis (`IFCPLATE`). Deduz-se a linha de base (eixo maior da caixa em
 * planta), a altura, a espessura e a grade (montantes agrupados por posição; sem montantes, os painéis). Grade regular vira
 * `fixedNumber`; irregular vira `manual`. Falha de dedução = nada é convertido, as peças seguem para o fallback genérico.
 */

/** Tolerância para considerar duas posições a mesma linha de grade e para "encostar" nas bordas (m). */
const TOL = 0.03;
/** Passo de arredondamento das seções de montante e painel (m), para reaproveitar tipos. */
const STEP = 0.005;

interface Part {
  e: StepEntity;
  /** Extensões no referencial da parede: u ao longo do eixo (de `a`), v para fora, z de mundo. */
  u0: number;
  u1: number;
  v0: number;
  v1: number;
  z0: number;
  z1: number;
}

const round = (x: number, step: number): number => Math.max(step, Math.round(x / step) * step);
const mm = (x: number): number => Math.round(x * 1000);

/** Peças agregadas (recursivo, sem repetir); cortinas aninhadas entram como contêiner. */
function collectParts(ctx: Ctx, root: StepEntity, agg: Map<number, number[]>): StepEntity[] {
  const out: StepEntity[] = [];
  const seen = new Set<number>([root.id]);
  const stack = [...(agg.get(root.id) ?? [])];
  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const child = ctx.f.entity(id);
    if (!child) continue;
    out.push(child);
    stack.push(...(agg.get(id) ?? []));
  }
  return out.sort((a, b) => a.id - b.id);
}

/** Vértices do corpo (planos x, y, z): triângulos, ou o contorno dos prismas quando não há malha. */
function vertices(body: Body): number[] {
  if (body.tris.length) return body.tris;
  const out: number[] = [];
  for (const prism of body.prisms) for (const loop of prism.loops) for (const p of loop) out.push(p.x, p.y, prism.z0, p.x, p.y, prism.z1);
  return out;
}

/** Agrupa valores próximos (tolerância `tol`) e devolve o centro de cada grupo, em ordem. */
function cluster(values: number[], tol: number): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const groups: number[][] = [];
  for (const v of sorted) {
    const g = groups[groups.length - 1];
    if (g && v - g[g.length - 1]! <= tol) g.push(v);
    else groups.push([v]);
  }
  return groups.map((g) => (g[0]! + g[g.length - 1]!) / 2);
}

/** Eixo da grade a partir das linhas internas (posições desde a origem) e do comprimento total. */
function axisOf(lines: number[], total: number): GridAxisSpec | null {
  const inner = cluster(lines, TOL).filter((p) => p > TOL && p < total - TOL);
  if (inner.length >= CURTAIN_LIMITS.linesPerAxis) return null;
  if (inner.length === 0) return { mode: 'fixedNumber', count: 1 };
  const cuts = [0, ...inner, total];
  const widths = cuts.slice(1).map((c, i) => c - cuts[i]!);
  const mean = total / widths.length;
  if (widths.every((w) => Math.abs(w - mean) <= 0.02)) return { mode: 'fixedNumber', count: widths.length };
  return { mode: 'manual', positions: inner.map((p) => Math.round(p * 1000) / 1000) };
}

/** Linhas internas deduzidas dos painéis: ponto médio da fresta entre colunas (ou fileiras) vizinhas de painel. */
function linesFromPanels(spans: Array<[number, number]>): number[] {
  const sorted = [...spans].sort((a, b) => a[0] - b[0]);
  const cols: Array<[number, number]> = [];
  for (const s of sorted) {
    const c = cols[cols.length - 1];
    if (c && s[0] <= c[1] - TOL) c[1] = Math.max(c[1], s[1]);
    else cols.push([s[0], s[1]]);
  }
  return cols.slice(1).map((c, i) => (cols[i]![1] + c[0]) / 2);
}

function mullionType(ctx: Ctx, width: number, depth: number, materialId: Id): Id {
  const w = round(width, STEP);
  const d = round(depth, STEP);
  const id = `imul_${mm(w)}x${mm(d)}${materialId === 'mat_aluminio' ? '' : `_${materialId}`}`;
  const tipos = mullionTypesOf(ctx.p);
  if (!tipos[id]) {
    const type: MullionType = { id, name: `Montante ${mm(w)}x${mm(d)} mm`, code: '', profile: { shape: 'rect', width: w, depth: d }, materialId };
    ctx.p.mullionTypes = { ...tipos, [id]: type };
  }
  return id;
}

function panelType(ctx: Ctx, glass: boolean, thickness: number, materialId: Id): Id {
  const th = round(thickness, 0.002);
  const id = `ipnl_${glass ? 'g' : 's'}_${mm(th)}_${materialId}`;
  const tipos = curtainPanelTypesOf(ctx.p);
  if (!tipos[id]) {
    const type: CurtainPanelType = {
      id,
      name: `${glass ? 'Vidro' : 'Painel'} ${mm(th)} mm`,
      code: '',
      kind: glass ? 'glass' : 'solid',
      thickness: th,
      materialId,
      ...(glass ? { glassKind: 'clear' as const } : {}),
    };
    ctx.p.curtainPanelTypes = { ...tipos, [id]: type };
  }
  return id;
}

/** Valor mais frequente (empate: o primeiro). */
function mode<T>(items: T[]): T | undefined {
  const count = new Map<T, number>();
  let best: T | undefined;
  for (const it of items) {
    const n = (count.get(it) ?? 0) + 1;
    count.set(it, n);
    if (best === undefined || n > count.get(best)!) best = it;
  }
  return best;
}

const isGlass = (ctx: Ctx, e: StepEntity, opacity: number | undefined): boolean =>
  (opacity !== undefined && opacity < 0.999) || ctx.f.enum(e, 8) === 'CURTAIN_PANEL' || /glaz|glass|vidro|vidrio|verre|glas/i.test(`${ctx.f.text(e, 2)} ${ctx.f.text(ctx.typeOf.get(e.id), 2)}`);

/** Tenta converter uma `IFCCURTAINWALL`; devolve falso quando a dedução falha (nada é marcado como tratado). */
function convert(ctx: Ctx, cw: StepEntity, agg: Map<number, number[]>): boolean {
  const all = collectParts(ctx, cw, agg);
  const geo = all.filter((e) => e.type === 'IFCMEMBER' || e.type === 'IFCPLATE');
  const pts: Array<{ e: StepEntity; v: number[] }> = [];
  for (const e of geo) {
    const v = vertices(bodyFor(ctx, e));
    if (v.length >= 9) pts.push({ e, v });
  }
  if (pts.length === 0) return false;
  const plan: Pt2[] = [];
  let zMin = Infinity;
  let zMax = -Infinity;
  for (const { v } of pts) {
    for (let i = 0; i + 2 < v.length; i += 3) {
      plan.push({ x: v[i]!, y: v[i + 1]! });
      zMin = Math.min(zMin, v[i + 2]!);
      zMax = Math.max(zMax, v[i + 2]!);
    }
  }
  const rect = rectangleAxis(hull2(plan));
  const height = zMax - zMin;
  if (!rect || !(height >= 0.3) || rect.length < 0.3) return false;
  // Cortina em curva ou em L: a caixa deixaria de ser uma linha reta; fica genérica em vez de uma parede errada.
  if (rect.thickness > 0.5 && rect.thickness > 0.1 * rect.length) return false;
  const length = rect.length;
  const dx = (rect.b.x - rect.a.x) / length;
  const dy = (rect.b.y - rect.a.y) / length;
  const parts: Part[] = pts.map(({ e, v }) => {
    const p: Part = { e, u0: Infinity, u1: -Infinity, v0: Infinity, v1: -Infinity, z0: Infinity, z1: -Infinity };
    for (let i = 0; i + 2 < v.length; i += 3) {
      const x = v[i]! - rect.a.x;
      const y = v[i + 1]! - rect.a.y;
      const u = x * dx + y * dy;
      const w = -x * dy + y * dx;
      p.u0 = Math.min(p.u0, u);
      p.u1 = Math.max(p.u1, u);
      p.v0 = Math.min(p.v0, w);
      p.v1 = Math.max(p.v1, w);
      p.z0 = Math.min(p.z0, v[i + 2]!);
      p.z1 = Math.max(p.z1, v[i + 2]!);
    }
    return p;
  });
  const members = parts.filter((p) => p.e.type === 'IFCMEMBER');
  const plates = parts.filter((p) => p.e.type === 'IFCPLATE');
  const vertical: Part[] = [];
  const horizontal: Part[] = [];
  for (const m of members) {
    const du = m.u1 - m.u0;
    const dz = m.z1 - m.z0;
    // Pelo maior lado: montante curto entre travessas ainda é vertical, e travessa de vão é horizontal.
    if (dz >= du) vertical.push(m);
    else horizontal.push(m);
  }
  const uLines = vertical.length ? vertical.filter((m) => m.u0 > TOL && m.u1 < length - TOL).map((m) => (m.u0 + m.u1) / 2) : linesFromPanels(plates.map((p) => [p.u0, p.u1]));
  const vLines = horizontal.length ? horizontal.filter((m) => m.z0 > zMin + TOL && m.z1 < zMax - TOL).map((m) => (m.z0 + m.z1) / 2 - zMin) : linesFromPanels(plates.map((p) => [p.z0 - zMin, p.z1 - zMin]));
  const u = axisOf(uLines, length);
  const v = axisOf(vLines, height);
  if (!u || !v) return false;

  const depth = round(Math.max(rect.thickness, 0.05), 0.001);
  const matOf = (e: StepEntity, fallback: Id): Id => materialIdOfStyle(ctx, styleOfWithMaterial(ctx, ctx.f, e)) ?? fallback;
  const typeOfMembers = (list: Part[], role: 'v' | 'h'): Id | null => {
    if (list.length === 0) return null;
    const keyOf = (m: Part): string => {
      const w = role === 'v' ? m.u1 - m.u0 : m.z1 - m.z0;
      return [w, Math.min(m.v1 - m.v0, depth), matOf(m.e, 'mat_aluminio')].join('|');
    };
    const best = mode(list.map(keyOf))!;
    const m = list.find((x) => keyOf(x) === best)!;
    const w = role === 'v' ? m.u1 - m.u0 : m.z1 - m.z0;
    return mullionType(ctx, w, Math.min(m.v1 - m.v0, depth), matOf(m.e, 'mat_aluminio'));
  };
  const interiorV = vertical.filter((m) => m.u0 > TOL && m.u1 < length - TOL);
  const interiorH = horizontal.filter((m) => m.z0 > zMin + TOL && m.z1 < zMax - TOL);
  const borderS = vertical.filter((m) => m.u0 <= TOL);
  const borderE = vertical.filter((m) => m.u1 >= length - TOL);
  const borderB = horizontal.filter((m) => m.z0 <= zMin + TOL);
  const borderT = horizontal.filter((m) => m.z1 >= zMax - TOL);
  const mullions: CurtainSpec['mullions'] = {
    interiorVertical: typeOfMembers(interiorV, 'v'),
    interiorHorizontal: typeOfMembers(interiorH, 'h'),
    borderStart: typeOfMembers(borderS, 'v'),
    borderEnd: typeOfMembers(borderE, 'v'),
    borderBottom: typeOfMembers(borderB, 'h'),
    borderTop: typeOfMembers(borderT, 'h'),
    corner: null,
    joinPriority: 'vertical',
  };

  // Painel padrão: o tipo mais frequente (vidro/sólido, espessura e material). Sem painel, vidro de 10 mm.
  const panelKeys = plates.map((pl) => {
    const th = Math.max(0.002, Math.min(pl.u1 - pl.u0, pl.v1 - pl.v0, pl.z1 - pl.z0));
    const style = styleOfWithMaterial(ctx, ctx.f, pl.e);
    const glass = isGlass(ctx, pl.e, style?.opacity);
    return { glass, th, mat: materialIdOfStyle(ctx, style) ?? (glass ? 'mat_vidro' : 'mat_aluminio') };
  });
  const topPanel = mode(panelKeys.map((k) => `${k.glass}|${mm(round(k.th, 0.002))}|${k.mat}`));
  const pk = panelKeys.find((k) => `${k.glass}|${mm(round(k.th, 0.002))}|${k.mat}` === topPanel);
  const defaultPanelTypeId = pk ? panelType(ctx, pk.glass, pk.th, pk.mat) : 'pnl_vidro_10';

  const curtain: CurtainSpec = { depth, u, v, mullions, defaultPanelTypeId };
  const name = ctx.f.text(ctx.typeOf.get(cw.id), 2).trim() || ctx.f.text(cw, 2).trim() || t(ctx.lang, 'io_ifc_slug_wall');
  const sig = `curtain|${name}|${JSON.stringify(curtain)}`;
  let typeId = ctx.types.get(sig);
  if (!typeId) {
    let n = 1;
    const base = `iwt_ct_${slug(name) || 'cortina'}`;
    typeId = base;
    while (ctx.p.wallTypes[typeId]) typeId = `${base}_${++n}`;
    const first = mullions.interiorVertical ?? mullions.interiorHorizontal ?? mullions.borderStart ?? mullions.borderEnd ?? mullions.borderBottom ?? mullions.borderTop;
    const wt: WallType = {
      id: typeId,
      name,
      description: '',
      code: '',
      layers: [{ function: 'structure', materialId: (first ? mullionTypesOf(ctx.p)[first]?.materialId : undefined) ?? curtainPanelTypesOf(ctx.p)[defaultPanelTypeId]?.materialId ?? 'mat_aluminio', thickness: depth, wraps: false }],
      family: 'curtain',
      curtain,
      wrapInserts: 'none',
      wrapEnds: 'none',
      strips: [],
      cost: 0,
      thermalU: null,
      acousticRw: null,
      fireRating: null,
      manufacturer: 'IFC',
    };
    ctx.p.wallTypes[typeId] = wt;
    ctx.types.set(sig, typeId);
  }

  const level = levelAt(ctx, zMin);
  const id = `w_${ctx.f.text(cw, 0) || `#${cw.id}`}`;
  const props = withoutHestiaProperties(propertiesOf(ctx.f, cw, ctx.typeOf.get(cw.id)));
  ctx.p.elements[id] = {
    ...makeWall({ id, typeId, levelId: level.id, a: rect.a, b: rect.b }),
    baseOffset: zMin - level.elevation,
    height,
    mark: ctx.f.text(cw, 7),
    order: ctx.order++,
    ...(props.length ? { ifcProperties: props } : {}),
  };
  ctx.walls.set(cw.id, id);
  ctx.handled.add(cw.id);
  // Portas/janelas filhas viram esquadria de célula quando cabem na grade; as demais seguem para o fallback genérico.
  const wall = ctx.p.elements[id] as Wall;
  const placed = new Set(attachCurtainOpenings(ctx, wall, all, { wallId: id, a: rect.a, dx, dy, length, height, zMin, u, v }));
  for (const e of all) {
    if ((e.type === 'IFCDOOR' || e.type === 'IFCWINDOW') && !placed.has(e.id)) continue;
    ctx.handled.add(e.id);
    ctx.bodies.delete(e.id);
  }
  ctx.count('paredes');
  return true;
}

/** Converte cada `IFCCURTAINWALL` com peças agregadas em parede cortina nativa; as que falham ficam para o fallback genérico. */
export function addCurtainWalls(ctx: Ctx): void {
  const agg = aggregateIndex(ctx.f);
  for (const cw of ctx.f.byType('IFCCURTAINWALL')) {
    if (ctx.handled.has(cw.id)) continue;
    if (convert(ctx, cw, agg)) continue;
    ctx.warn(t(ctx.lang, 'io_ifc_warn_curtain_fallback', { name: ctx.f.text(cw, 2).trim() || cw.type }));
  }
}
