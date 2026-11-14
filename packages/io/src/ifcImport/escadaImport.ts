import { defaultStairTypeId, makeStair, type Id, type Project, type Stair, type StairCurve } from '@hestia/model';
import { hull2, rectangleAxis, type Body } from './geometry.ts';
import { bodyFor, levelAt } from './genericImport.ts';
import { aggregateIndex } from './hestia.ts';
import type { Pt2 } from './ifc.ts';
import type { Ctx } from './mapping.ts';
import type { StepEntity } from './step.ts';
import { t } from '../i18n.ts';

/**
 * `IFCSTAIRFLIGHT` como escada nativa de um lance reto. Os degraus saem da malha: as faces horizontais voltadas para cima
 * (uma cota por degrau) dão o espelho (diferença de cotas, uniforme) e o piso (avanço em planta de um degrau ao seguinte,
 * uniforme); a largura vem da caixa da planta. Segue a convenção do Hestia: N linhas de espelho = N espelhos e N-1 pisos,
 * o último espelho leva ao piso de chegada, então a base fica um espelho abaixo do primeiro piso e o topo um espelho
 * acima do último. Recusa (fica genérico, com aviso) quando: há menos de 3 degraus, cotas ou avanços não uniformes,
 * lance curvo/em L (a caixa em planta não cobre o contorno), largura fora de 0,6-3 m ou espelho fora de 0,10-0,25 m.
 * Escada com mais de um lance (`IFCSTAIR` agregando lances) é tudo-ou-nada: se um lance não for dedutível, nenhum vira nativo,
 * para não separar uma escada em parte nativa e parte genérica. Patamares (`IFCSLAB LANDING`) seguem como laje.
 */

const Z_TOL = 0.01;
const MIN_TREADS = 3;

interface Flight {
  e: StepEntity;
  /** Linhas de espelho (uma por espelho) em mundo, da esquerda para a direita no sentido de subida. */
  lines: StairCurve[];
  left: StairCurve;
  right: StairCurve;
  baseZ: number;
  topZ: number;
}

const horizontalUp = (v: number[], i: number): boolean => {
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
  return len > 1e-9 && nz / len > 0.999;
};

/** Dedução geométrica de um lance reto; null quando não é confiável. */
export function straightFlightOf(body: Body): Omit<Flight, 'e'> | null {
  const v = body.tris;
  if (v.length < 9 * 6) return null;
  // Faces de piso: cota, e vértices (x, y).
  const byZ = new Map<number, Pt2[]>();
  const all: Pt2[] = [];
  for (let i = 0; i + 8 < v.length; i += 9) {
    if (!horizontalUp(v, i)) continue;
    const z = Math.round(v[i + 2]! / Z_TOL);
    const list = byZ.get(z) ?? [];
    for (const k of [0, 3, 6]) {
      const p = { x: v[i + k]!, y: v[i + k + 1]! };
      list.push(p);
      all.push(p);
    }
    byZ.set(z, list);
  }
  // Cotas vizinhas (arredondamento) pertencem ao mesmo degrau.
  const keys = [...byZ.keys()].sort((a, b) => a - b);
  const groups: Array<{ z: number; pts: Pt2[] }> = [];
  for (const k of keys) {
    const g = groups[groups.length - 1];
    if (g && k - Math.round(g.z / Z_TOL) <= 1) g.pts.push(...byZ.get(k)!);
    else groups.push({ z: k * Z_TOL, pts: [...byZ.get(k)!] });
  }
  const m = groups.length;
  if (m < MIN_TREADS) return null;
  const rect = rectangleAxis(hull2(all));
  if (!rect || rect.length < 0.6 || rect.thickness < 0.6 || rect.thickness > 3) return null;
  const len = rect.length;
  const ux = (rect.b.x - rect.a.x) / len;
  const uy = (rect.b.y - rect.a.y) / len;
  const U = (p: Pt2): number => (p.x - rect.a.x) * ux + (p.y - rect.a.y) * uy;
  const V = (p: Pt2): number => -(p.x - rect.a.x) * uy + (p.y - rect.a.y) * ux;
  const ext = groups.map((g) => {
    let u0 = Infinity;
    let u1 = -Infinity;
    let v0 = Infinity;
    let v1 = -Infinity;
    for (const p of g.pts) {
      u0 = Math.min(u0, U(p));
      u1 = Math.max(u1, U(p));
      v0 = Math.min(v0, V(p));
      v1 = Math.max(v1, V(p));
    }
    return { z: g.z, u0, u1, v0, v1 };
  });
  const riser = (ext[m - 1]!.z - ext[0]!.z) / (m - 1);
  if (!(riser >= 0.1 && riser <= 0.25)) return null;
  for (let k = 1; k < m; k++) if (Math.abs(ext[k]!.z - ext[k - 1]!.z - riser) > Math.max(Z_TOL * 2, riser * 0.06)) return null;
  // Avanço em planta: sempre no mesmo sentido e uniforme. Sentido = o da subida.
  const forward = ext[m - 1]!.u0 > ext[0]!.u0;
  const key = (e: (typeof ext)[number]): number => (forward ? e.u0 : e.u1);
  const tread = (key(ext[m - 1]!) - key(ext[0]!)) / (m - 1) * (forward ? 1 : -1);
  if (!(tread >= 0.18 && tread <= 0.45)) return null;
  for (let k = 1; k < m; k++) {
    const step = (key(ext[k]!) - key(ext[k - 1]!)) * (forward ? 1 : -1);
    if (Math.abs(step - tread) > 0.025) return null;
  }
  for (const e of ext) {
    const w = e.u1 - e.u0;
    if (w < tread * 0.5 || w > tread * 2.2) return null;
  }
  // Largura: mesma em todos os degraus (tolerância de 5 cm).
  const v0 = Math.min(...ext.map((e) => e.v0));
  const v1 = Math.max(...ext.map((e) => e.v1));
  for (const e of ext) if (Math.abs(e.v0 - v0) > 0.05 || Math.abs(e.v1 - v1) > 0.05) return null;
  const width = v1 - v0;
  if (width < 0.6 || width > 3) return null;
  // Linhas de espelho: M + 1 (= N espelhos), do início do 1º piso ao fim do último.
  const sgn = forward ? 1 : -1;
  const start = key(ext[0]!);
  // `v` cresce para a esquerda de `u`: com a subida no sentido de `u` a esquerda é v1; com a subida invertida, é v0.
  const vLeft = forward ? v1 : v0;
  const vRight = forward ? v0 : v1;
  const at = (s: number, vv: number): Pt2 => ({
    x: rect.a.x + s * ux + vv * -uy,
    y: rect.a.y + s * uy + vv * ux,
  });
  const lines: StairCurve[] = [];
  for (let k = 0; k <= m; k++) {
    const s = start + sgn * tread * k;
    lines.push({ a: at(s, vLeft), b: at(s, vRight), sag: 0 });
  }
  const last = lines[lines.length - 1]!;
  const first = lines[0]!;
  return {
    lines,
    left: { a: first.a, b: last.a, sag: 0 },
    right: { a: first.b, b: last.b, sag: 0 },
    baseZ: ext[0]!.z - riser,
    topZ: ext[m - 1]!.z + riser,
  };
}

const stairTypeOf = (p: Project): Id | null => (p.stairTypes[defaultStairTypeId] ? defaultStairTypeId : (Object.keys(p.stairTypes)[0] ?? null));

function place(ctx: Ctx, f: Flight, typeId: Id): void {
  const base = levelAt(ctx, f.baseZ);
  // Topo: o nível cuja cota coincide (3 cm) com o topo do lance; senão o nível da base com a diferença como `topOffset`.
  const topLevel = ctx.levels.find((l) => Math.abs(l.elevation - f.topZ) <= 0.03) ?? base;
  const id = `st_${ctx.f.text(f.e, 0) || `#${f.e.id}`}`;
  const stair: Stair = {
    ...makeStair({ id, typeId, levelId: base.id }),
    baseOffset: f.baseZ - base.elevation,
    topLevelId: topLevel.id,
    topOffset: f.topZ - topLevel.elevation,
    height: f.topZ - f.baseZ,
    riserMode: 'fixed',
    // As lajes do arquivo já trazem os vãos próprios (IfcRelVoidsElement): a escada não recorta de novo.
    openingMode: 'none',
    components: [{ id: `${id}_lance`, kind: 'run', boundaryLeft: [f.left], boundaryRight: [f.right], risers: f.lines, path: [], generatedBy: 'straight' }],
    mark: ctx.f.text(f.e, 7),
    // A `Stair` não tem campo para o nome/psets do IFC (mudar o modelo seria mexer no contrato): o nome de origem fica no comentário.
    comments: ctx.f.text(f.e, 2).trim(),
    order: ctx.order++,
  };
  ctx.p.elements[id] = stair;
  ctx.handled.add(f.e.id);
  ctx.bodies.delete(f.e.id);
  ctx.count('escadas');
}

/** Converte os lances retos dedutíveis; escada com lance não dedutível fica toda genérica (com aviso). */
export function addStairs(ctx: Ctx): void {
  const typeId = stairTypeOf(ctx.p);
  if (!typeId) return;
  const agg = aggregateIndex(ctx.f);
  const parentOf = new Map<number, number>();
  for (const [parent, kids] of agg) for (const k of kids) parentOf.set(k, parent);
  const flights = ctx.f.byType('IFCSTAIRFLIGHT').filter((e) => !ctx.handled.has(e.id) && ctx.f.ref(e, 5) && ctx.f.ent(e, 6)?.type === 'IFCPRODUCTDEFINITIONSHAPE');
  const groups = new Map<number, StepEntity[]>();
  for (const e of flights) {
    const key = parentOf.get(e.id) ?? -e.id;
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }
  for (const [key, list] of groups) {
    const siblings = key > 0 ? (agg.get(key) ?? []).map((id) => ctx.f.entity(id)).filter((x): x is StepEntity => !!x && x.type === 'IFCSTAIRFLIGHT') : list;
    const deduced = siblings.map((e) => ({ e, geo: straightFlightOf(bodyFor(ctx, e)) }));
    const failed = deduced.find((d) => !d.geo);
    if (failed) {
      ctx.warn(t(ctx.lang, 'io_ifc_warn_stair_fallback', { name: ctx.f.text(failed.e, 2).trim() || failed.e.type }));
      continue;
    }
    for (const d of deduced) place(ctx, { e: d.e, ...d.geo! }, typeId);
  }
}
