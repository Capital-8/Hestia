import { makeRoof, type Id, type RoofType } from '@hestia/model';
import { materialIdOfStyle, slug, styleOfWithMaterial } from './elementTypes.ts';
import { cleanLoop, hull2, type Body } from './geometry.ts';
import { bodyFor, levelAt, toGeneric } from './genericImport.ts';
import type { Pt2 } from './ifc.ts';
import { propertiesOf } from './psets.ts';
import type { Ctx } from './mapping.ts';
import type { StepEntity } from './step.ts';
import { t } from '../i18n.ts';

/**
 * Telhado de uma água plana: `IFCROOF` com corpo próprio ou `IFCSLAB` de `PredefinedType ROOF` cuja face superior é UM plano
 * inclinado (chapa de dupla face ou sólido). Vira `Roof` de forma 'free' com uma água (polígono, subida e percentual
 * exatos). Só se converte quando a dedução é confiável: face superior inteira num plano, contorno convexo (o hull cobre
 * >= 97% da projeção), inclinação entre 1% e 300% e sem vão (`IfcRelVoidsElement`) no telhado. Várias águas num mesmo
 * produto, contorno côncavo ou com furo ficam como estavam: genérico (laje horizontal aproximada seria uma forma errada).
 */

/** Tolerâncias: desvio angular entre triângulos do mesmo plano (cos de 1,5 graus) e distância ao plano (m). */
const COS_TOL = Math.cos((1.5 * Math.PI) / 180);
const OFFSET_TOL = 0.03;
/** Inclinação mínima (%) para ser telhado (abaixo disso é laje plana) e espessura padrão da chapa sem volume (m). */
const MIN_PERCENT = 1;
const MAX_PERCENT = 300;
const SHEET_THICKNESS = 0.05;

export interface RoofPlane {
  /** Contorno convexo em planta (anti-horário). */
  polygon: Pt2[];
  /** Ponto mais baixo do plano e sua cota. */
  origin: Pt2;
  zLow: number;
  /** Direção de subida (unitária) e inclinação (%). */
  up: Pt2;
  percent: number;
  /** Espessura vertical do corpo sob o plano (0 numa chapa). */
  thickness: number;
}

/** Plano único da face superior da malha, ou 'flat' (horizontal) / null (várias águas, côncavo, fora de faixa). */
export function roofPlaneOf(body: Body): RoofPlane | 'flat' | null {
  const v = body.tris;
  if (v.length < 9) return null;
  interface Tri { nx: number; ny: number; nz: number; area: number; i: number }
  const up: Tri[] = [];
  for (let i = 0; i + 8 < v.length; i += 9) {
    const ux = v[i + 3]! - v[i]!;
    const uy = v[i + 4]! - v[i + 1]!;
    const uz = v[i + 5]! - v[i + 2]!;
    const wx = v[i + 6]! - v[i]!;
    const wy = v[i + 7]! - v[i + 1]!;
    const wz = v[i + 8]! - v[i + 2]!;
    const nx = uy * wz - uz * wy;
    const ny = uz * wx - ux * wz;
    const nz = ux * wy - uy * wx;
    const len = Math.hypot(nx, ny, nz);
    if (len < 1e-9) continue;
    // Só a face voltada para cima; a de baixo e as laterais não definem a água.
    if (nz / len > 0.02) up.push({ nx: nx / len, ny: ny / len, nz: nz / len, area: len / 2, i });
  }
  if (!up.length) return null;
  let sx = 0;
  let sy = 0;
  let sz = 0;
  for (const tr of up) {
    sx += tr.nx * tr.area;
    sy += tr.ny * tr.area;
    sz += tr.nz * tr.area;
  }
  const m = Math.hypot(sx, sy, sz);
  const n = { x: sx / m, y: sy / m, z: sz / m };
  const plane = (i: number): number => n.x * v[i]! + n.y * v[i + 1]! + n.z * v[i + 2]!;
  const d0 = plane(up[0]!.i);
  for (const tr of up) {
    const dot = tr.nx * n.x + tr.ny * n.y + tr.nz * n.z;
    if (dot < COS_TOL) return null;
    for (const k of [0, 3, 6]) if (Math.abs(plane(tr.i + k) - d0) > OFFSET_TOL) return null;
  }
  const h = Math.hypot(n.x, n.y);
  const percent = (h / n.z) * 100;
  if (percent < MIN_PERCENT) return 'flat';
  if (percent > MAX_PERCENT) return null;
  // Contorno: hull da projeção, aceito se cobre a projeção das faces (côncavo/furado = recusa).
  const pts: Pt2[] = [];
  let projected = 0;
  for (const tr of up) {
    for (const k of [0, 3, 6]) pts.push({ x: v[tr.i + k]!, y: v[tr.i + k + 1]! });
    projected += tr.area * tr.nz;
  }
  const polygon = cleanLoop(hull2(pts));
  if (polygon.length < 3) return null;
  let hullArea = 0;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!;
    const b = polygon[(i + 1) % polygon.length]!;
    hullArea += a.x * b.y - b.x * a.y;
  }
  hullArea = Math.abs(hullArea) / 2;
  if (!(hullArea > 0.01) || projected < 0.97 * hullArea || projected > 1.03 * hullArea) return null;
  const upDir = { x: -n.x / h, y: -n.y / h };
  // Cota do plano em (x, y): z = (d0 - nx x - ny y) / nz. O ponto mais baixo é o vértice do hull de menor projeção em `up`.
  const zAt = (p: Pt2): number => (d0 - n.x * p.x - n.y * p.y) / n.z;
  let origin = polygon[0]!;
  for (const p of polygon) if (p.x * upDir.x + p.y * upDir.y < origin.x * upDir.x + origin.y * upDir.y) origin = p;
  // Espessura vertical: o quanto o corpo desce abaixo da face superior.
  let below = 0;
  for (let i = 0; i + 2 < v.length; i += 3) below = Math.max(below, zAt({ x: v[i]!, y: v[i + 1]! }) - v[i + 2]!);
  return { polygon, origin, zLow: zAt(origin), up: upDir, percent: Math.round(percent * 1000) / 1000, thickness: below };
}

function roofType(ctx: Ctx, name: string, thickness: number, materialId: Id): Id {
  const mm = Math.max(1, Math.round(thickness * 1000));
  const key = `roof|${name}|${mm}|${materialId}`;
  const hit = ctx.types.get(key);
  if (hit) return hit;
  let id = `irt_${slug(name) || 'telhado'}_${mm}`;
  for (let n = 2; ctx.p.roofTypes[id]; n++) id = `irt_${slug(name) || 'telhado'}_${mm}_${n}`;
  const type: RoofType = {
    id,
    name: name || t(ctx.lang, 'io_ifc_default_roof_type', { mm }),
    code: '',
    description: '',
    layers: [{ function: 'structure', materialId, thickness, wraps: false }],
    cost: 0,
  };
  ctx.p.roofTypes[id] = type;
  ctx.types.set(key, id);
  return id;
}

const isRoofCandidate = (ctx: Ctx, e: StepEntity): boolean => e.type === 'IFCROOF' || (e.type === 'IFCSLAB' && ctx.f.enum(e, 8) === 'ROOF');

/** Tem vão (`IfcRelVoidsElement`) no produto? O telhado nativo não representa o furo. */
const hasVoid = (ctx: Ctx, e: StepEntity): boolean => {
  for (const host of ctx.hostOf.values()) if (host === e.id) return true;
  return false;
};

function convert(ctx: Ctx, e: StepEntity, body: Body): boolean {
  const plane = roofPlaneOf(body);
  if (!plane || plane === 'flat' || hasVoid(ctx, e)) return false;
  const level = levelAt(ctx, plane.zLow);
  const name = ctx.f.text(ctx.typeOf.get(e.id), 2).trim() || ctx.f.text(e, 2).trim();
  const thickness = plane.thickness >= 0.01 ? Math.round(plane.thickness * 1000) / 1000 : SHEET_THICKNESS;
  const typeId = roofType(ctx, name, thickness, materialIdOfStyle(ctx, styleOfWithMaterial(ctx, ctx.f, e)) ?? 'mat_telha_metalica');
  const id = `rf_${ctx.f.text(e, 0) || `#${e.id}`}`;
  ctx.p.elements[id] = {
    ...makeRoof({ id, typeId, levelId: level.id, boundary: plane.polygon }),
    heightOffset: plane.zLow - level.elevation,
    shape: 'free',
    planes: [{ polygon: plane.polygon, origin: plane.origin, up: plane.up, percent: plane.percent, z0: 0 }],
    joinOthers: false,
    mark: ctx.f.text(e, 7),
    // O `Roof` não tem campo para os psets do IFC (mudar o modelo seria mexer no contrato): o nome de origem fica no comentário.
    comments: name,
    order: ctx.order++,
  };
  if (propertiesOf(ctx.f, e, ctx.typeOf.get(e.id)).length) ctx.warn(t(ctx.lang, 'io_ifc_warn_props_dropped', { kind: t(ctx.lang, 'io_ifc_kind_roof') }));
  ctx.handled.add(e.id);
  ctx.bodies.delete(e.id);
  ctx.count('telhados');
  return true;
}

/** Converte águas planas; produto inclinado que não coube vira genérico (a laje horizontal aproximada seria errada). */
export function addRoofs(ctx: Ctx): void {
  for (const e of ctx.f.step.entities.values()) {
    if (ctx.handled.has(e.id) || !isRoofCandidate(ctx, e)) continue;
    if (!ctx.f.ref(e, 5) || ctx.f.ent(e, 6)?.type !== 'IFCPRODUCTDEFINITIONSHAPE') continue;
    const body = bodyFor(ctx, e);
    if (convert(ctx, e, body)) continue;
    const plane = roofPlaneOf(body);
    if (plane === 'flat') continue;
    // A laje de telhado inclinada sai do caminho da laje (viraria um prisma horizontal errado); o IFCROOF cai no genérico no fim.
    ctx.warn(t(ctx.lang, 'io_ifc_warn_roof_fallback', { name: ctx.f.text(e, 2).trim() || e.type }));
    if (e.type === 'IFCSLAB') toGeneric(ctx, e, body);
  }
}
