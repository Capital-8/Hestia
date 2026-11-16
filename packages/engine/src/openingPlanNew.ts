import { union, type MultiPolygon } from '@hestia/geom';
import { partTransformed, slicePartsAtZ } from './openingModel.ts';
import {
  CLOSED,
  type LeafOpening,
  type OpeningModel,
  type OpeningPart,
  type PartBox,
  type PartMotion,
  type PartRole,
} from './openingModelTypes.ts';

/** Tom do traço na planta: `cut` é o perfil cortado (tinta forte), `ink` o desenho de tinta e `soft` o secundário. */
export type OpeningPlanTone = 'cut' | 'ink' | 'soft';

/** Papel do traço: o da peça do modelo, ou um símbolo da planta (arco, seta, marca). */
export type OpeningPlanRole = PartRole | 'swing' | 'arrow' | 'mark';

/** Ponto no sistema local do vão (`t` ao longo da parede, `s` na profundidade). */
export interface OpeningPlanPoint {
  t: number;
  s: number;
}

/** Âncora no sistema local do vão para manter peças articuladas/arcos rígidos alinhados ao batente curvo. */
export interface OpeningPlanAnchor {
  t: number;
  s: number;
  refT?: number;
}

/** Um traço da planta da esquadria, em coordenadas locais do vão. */
export interface OpeningPlanPath {
  pts: OpeningPlanPoint[];
  closed: boolean;
  /** Fator sobre a espessura base do desenho (1 = traço principal). */
  weight: number;
  tone: OpeningPlanTone;
  dash?: [number, number];
  role: OpeningPlanRole;
  anchor?: OpeningPlanAnchor;
}

/** Opções da planta: nível de detalhe, abertura, convenção de exibição e cota de corte (z local do modelo). */
export interface OpeningPlanOptions {
  detail: 'low' | 'mid' | 'high';
  /** Ângulo de abertura em planta (radianos), como `OpenState.angle`. */
  angle: number;
  planDisplay: 'symbolic' | 'projected';
  showSwing: boolean;
  swingStyle: 'arc' | 'dash' | 'line';
  /** Cota de corte no z local do modelo (0 = soleira do vão). */
  cutZ: number;
  /** Folha em planta: 'open' (padrão), 'closed' ou 'both'. */
  leafPlan?: 'open' | 'closed' | 'both';
}

const EPS = 1e-9;
const ARC_STEP = Math.PI / 18;

/** Peças do quadro cortadas em planta como o batente; `mullion`/`transom` são os divisores internos da composição. */
const FRAME_ROLES: ReadonlySet<PartRole> = new Set<PartRole>([
  'jamb',
  'stop',
  'head',
  'sillFrame',
  'threshold',
  'track',
  'muntin',
  'mullion',
  'transom',
]);

export const line = (pts: OpeningPlanPoint[], role: OpeningPlanRole, tone: OpeningPlanTone = 'ink', weight = 1, dash?: [number, number], anchor?: OpeningPlanAnchor): OpeningPlanPath => ({
  pts,
  closed: false,
  weight,
  tone,
  ...(dash ? { dash } : {}),
  role,
  ...(anchor ? { anchor } : {}),
});

export const polygon = (pts: OpeningPlanPoint[], role: OpeningPlanRole, tone: OpeningPlanTone = 'cut', weight = 1, dash?: [number, number], anchor?: OpeningPlanAnchor): OpeningPlanPath => ({
  pts,
  closed: true,
  weight,
  tone,
  ...(dash ? { dash } : {}),
  role,
  ...(anchor ? { anchor } : {}),
});

/** Anel do retângulo da caixa (t0,s0) → (t1,s0) → (t1,s1) → (t0,s1). */
export function boxRing(b: PartBox): OpeningPlanPoint[] {
  return [
    { t: b.t0, s: b.s0 },
    { t: b.t1, s: b.s0 },
    { t: b.t1, s: b.s1 },
    { t: b.t0, s: b.s1 },
  ];
}

function unionBox(a: PartBox | null, b: PartBox): PartBox {
  if (!a) return { ...b };
  return {
    t0: Math.min(a.t0, b.t0),
    t1: Math.max(a.t1, b.t1),
    s0: Math.min(a.s0, b.s0),
    s1: Math.max(a.s1, b.s1),
    z0: Math.min(a.z0, b.z0),
    z1: Math.max(a.z1, b.z1),
  };
}

/** Caixa da folha `index` (união das peças `leaf` dela); null se não houver. */
export function leafBox(m: OpeningModel, index: number): PartBox | null {
  let out: PartBox | null = null;
  for (const part of m.parts) {
    if (part.role === 'leaf' && part.leaf === index) out = unionBox(out, part.box);
  }
  return out;
}

/** Movimento da folha `index` (a primeira peça com movimento), ou undefined. */
export function leafMotion(m: OpeningModel, index: number): PartMotion | undefined {
  return m.parts.find((p) => p.role === 'leaf' && p.leaf === index && p.motion)?.motion;
}

/** Anel da caixa depois do movimento (face inferior; para giro em z e deslizamento é a mesma planta). */
export function transformedRing(box: PartBox, motion: PartMotion | undefined, angle: number): OpeningPlanPoint[] {
  const synthetic: OpeningPart = { id: '__leaf', role: 'leaf', material: 'leaf', box, ...(motion ? { motion } : {}) };
  const ob = partTransformed(synthetic, { angle, slide: 0 });
  return ob.corners.slice(0, 4).map((p) => ({ t: p.t, s: p.s }));
}

function rotatePoint(p: OpeningPlanPoint, center: OpeningPlanPoint, phi: number): OpeningPlanPoint {
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dt = p.t - center.t;
  const ds = p.s - center.s;
  return { t: center.t + dt * cos - ds * sin, s: center.s + dt * sin + ds * cos };
}

/** Arco de `from` em torno de `center`, varrendo `sweep` radianos (o sinal define o sentido). */
function arcPoints(center: OpeningPlanPoint, from: OpeningPlanPoint, sweep: number): OpeningPlanPoint[] {
  const r = Math.hypot(from.t - center.t, from.s - center.s);
  if (r < EPS) return [];
  const a0 = Math.atan2(from.s - center.s, from.t - center.t);
  const steps = Math.max(8, Math.ceil(Math.abs(sweep) / ARC_STEP));
  const pts: OpeningPlanPoint[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = a0 + (sweep * i) / steps;
    pts.push({ t: center.t + Math.cos(a) * r, s: center.s + Math.sin(a) * r });
  }
  return pts;
}

/** Sinal do giro da folha, o mesmo de `partTransformed`: peça em `z` com movimento, ou a regra do lado. */
export function openingSign(o: LeafOpening, motion: PartMotion | undefined): 1 | -1 {
  if (motion && motion.kind === 'rotate' && motion.axis === 'z') return motion.sign;
  return (o.side * (o.latchT > o.hingeT ? 1 : -1)) as 1 | -1;
}

/** Arco (ou reta) do fecho de `closedEnd` até a folha aberta, no estilo pedido. */
export function addOpeningArc(out: OpeningPlanPath[], center: OpeningPlanPoint, closedEnd: OpeningPlanPoint, sweep: number, style: 'arc' | 'dash' | 'line', anchor?: OpeningPlanAnchor): void {
  if (Math.abs(sweep) < EPS) return;
  const openEnd = rotatePoint(closedEnd, center, sweep);
  if (style === 'line') {
    out.push(line([closedEnd, openEnd], 'swing', 'soft', 0.7, undefined, anchor));
    return;
  }
  const pts = arcPoints(center, closedEnd, sweep);
  if (pts.length >= 2) out.push(line(pts, 'swing', 'soft', 0.7, style === 'dash' ? [4, 3] : undefined, anchor));
}

/** Perfis do batente/caixilho cortados na cota `z` (peças fixas). */
export function addFrameCut(out: OpeningPlanPath[], m: OpeningModel, z: number): void {
  for (const { part, ring } of slicePartsAtZ(m, z, CLOSED)) {
    if (FRAME_ROLES.has(part.role)) out.push(polygon(ring, part.role, 'cut', 1));
  }
}

/**
 * Soleira em planta (níveis médio e alto): duas linhas da peça entre as ombreiras. A soleira fica abaixo do plano de corte,
 * então `addFrameCut` não a corta; sem este traço ela não aparece na planta.
 */
export function addThresholdPlan(out: OpeningPlanPath[], m: OpeningModel): void {
  for (const part of m.parts) {
    if (part.role !== 'threshold') continue;
    out.push(line([{ t: part.box.t0, s: part.box.s0 }, { t: part.box.t1, s: part.box.s0 }], 'threshold', 'ink', 1));
    out.push(line([{ t: part.box.t0, s: part.box.s1 }, { t: part.box.t1, s: part.box.s1 }], 'threshold', 'ink', 1));
  }
}

/** Pistas dos trilhos: duas linhas por trilho, ao longo do vão. */
export function addTracks(out: OpeningPlanPath[], m: OpeningModel): void {
  for (const part of m.parts) {
    if (part.role !== 'track') continue;
    out.push(line([{ t: part.box.t0, s: part.box.s0 }, { t: part.box.t1, s: part.box.s0 }], 'track', 'soft', 0.6));
    out.push(line([{ t: part.box.t0, s: part.box.s1 }, { t: part.box.t1, s: part.box.s1 }], 'track', 'soft', 0.6));
  }
}

/** Peças fora do corte que o nível alto mostra: alizar, peitoril, verga/contraverga e o vidro duplo. */
export function addHighExtras(out: OpeningPlanPath[], m: OpeningModel, z: number): void {
  // Alizar: uma silhueta unida por `group` (uma por face), não retângulos soltos sobrepostos (spec E3 §4).
  const grupos = new Map<string, MultiPolygon>();
  for (const { part, ring } of slicePartsAtZ(m, z, CLOSED)) {
    if (part.role !== 'casing') continue;
    const chave = part.group ?? part.id;
    const lista: MultiPolygon = grupos.get(chave) ?? [];
    lista.push([ring.map((p) => ({ x: p.t, y: p.s }))]);
    grupos.set(chave, lista);
  }
  for (const aneis of grupos.values()) {
    for (const poly of union(aneis)) {
      const contorno = poly[0];
      if (contorno && contorno.length >= 3) out.push(polygon(contorno.map((p) => ({ t: p.x, s: p.y })), 'casing', 'ink', 0.8));
    }
  }
  for (const part of m.parts) {
    if (part.role === 'sillBoard') {
      out.push(polygon(boxRing(part.box), 'sillBoard', 'soft', 0.7, [6, 3]));
    } else if (part.role === 'lintel' || part.role === 'sillBeam') {
      const above = part.box.z0 >= z - EPS;
      const below = part.box.z1 <= z + EPS;
      if (above || below) out.push(polygon(boxRing(part.box), part.role, 'soft', 0.7, [6, 3]));
      else out.push(polygon(boxRing(part.box), part.role, 'cut', 1));
    } else if (part.role === 'glass') {
      out.push(line([{ t: part.box.t0, s: part.box.s0 }, { t: part.box.t1, s: part.box.s0 }], 'glass', 'soft', 0.5));
      out.push(line([{ t: part.box.t0, s: part.box.s1 }, { t: part.box.t1, s: part.box.s1 }], 'glass', 'soft', 0.5));
    } else if (part.role === 'leaf' && part.leaf === undefined) {
      out.push(polygon(boxRing(part.box), 'leaf', 'cut', 1));
    }
  }
}

/** Seta com ponta entre dois pontos da planta. */
export function addPlanArrow(out: OpeningPlanPath[], from: OpeningPlanPoint, to: OpeningPlanPoint): void {
  out.push(line([from, to], 'arrow', 'ink', 0.8));
  const dt = to.t - from.t;
  const ds = to.s - from.s;
  const len = Math.hypot(dt, ds);
  if (len < EPS) return;
  const ut = dt / len;
  const us = ds / len;
  const head = Math.min(0.12, len * 0.35);
  const base = { t: to.t - ut * head, s: to.s - us * head };
  out.push(line([{ t: base.t - us * head * 0.6, s: base.s + ut * head * 0.6 }, to, { t: base.t + us * head * 0.6, s: base.s - ut * head * 0.6 }], 'arrow', 'ink', 0.8));
}

/** Família nova de porta inferida do modelo único (o modelo não guarda o nome da família). */
function newDoorFamily(m: OpeningModel): 'dblact' | 'pocket' | 'fold' | 'garage' | null {
  if (m.openings.some((o) => o.kind === 'overhead')) return 'garage';
  if (m.parts.some((p) => p.role === 'pocket')) return 'pocket';
  if (m.openings.some((o) => o.kind === 'fold')) return 'fold';
  if (m.openings.some((o) => o.kind === 'side' && o.both)) return 'dblact';
  return null;
}

/** Folhas fechadas como linha no plano médio (nível baixo das famílias novas). */
function addNewDoorLow(out: OpeningPlanPath[], m: OpeningModel): void {
  const vistas = new Set<string>();
  for (const part of m.parts) {
    if (part.role !== 'leaf') continue;
    const s = (part.box.s0 + part.box.s1) / 2;
    const chave = `${part.box.t0};${part.box.t1};${s}`;
    if (vistas.has(chave)) continue;
    vistas.add(chave);
    out.push(line([{ t: part.box.t0, s }, { t: part.box.t1, s }], 'leaf', 'ink', 1));
  }
}

/** Linhas dos trilhos no sentido da profundidade (portão seccionado). */
function addDeepTracks(out: OpeningPlanPath[], m: OpeningModel): void {
  for (const part of m.parts) {
    if (part.role !== 'track') continue;
    const t = (part.box.t0 + part.box.t1) / 2;
    out.push(line([{ t, s: part.box.s0 }, { t, s: part.box.s1 }], 'track', 'soft', 0.6, [4, 3]));
  }
}

/** Planta das cinco famílias novas (spec E §4.1 e §3.5); false quando a porta é de outra família. */
export function addNewDoorPlan(out: OpeningPlanPath[], m: OpeningModel, opts: OpeningPlanOptions): boolean {
  const family = newDoorFamily(m);
  if (!family) return false;
  const level = opts.planDisplay === 'projected' ? 'high' : opts.detail;
  // Vai-e-vem é família de giro e a sanfonada mostra só as folhas dobradas: ambos desenham a folha aberta em todos os
  // níveis (spec E3 §6). Embutir e garagem não têm "aberta" em planta: o nível baixo é a linha da folha.
  if (level === 'low' && family !== 'dblact' && family !== 'fold') {
    addNewDoorLow(out, m);
    return true;
  }
  addFrameCut(out, m, opts.cutZ);
  if (level !== 'low') addThresholdPlan(out, m);
  if (family === 'pocket') {
    for (const part of m.parts.filter((x) => x.role === 'leaf')) out.push(polygon(boxRing(part.box), 'leaf', 'cut', 1));
    for (const part of m.parts.filter((x) => x.role === 'pocket')) out.push(polygon(boxRing(part.box), 'pocket', 'soft', 0.8, [6, 3]));
    const movel = m.parts.find((x) => x.role === 'leaf' && x.motion?.kind === 'slide')?.motion;
    if (movel && movel.kind === 'slide') {
      const s = (m.core.s0 + m.core.s1) / 2;
      addPlanArrow(out, { t: 0, s }, { t: movel.dt * movel.travel, s });
    }
    if (level === 'high') addHighExtras(out, m, opts.cutZ);
    return true;
  }
  if (family === 'garage') {
    let t0 = Infinity;
    let t1 = -Infinity;
    let sFolha = 0;
    for (const part of m.parts.filter((x) => x.role === 'leaf')) {
      t0 = Math.min(t0, part.box.t0);
      t1 = Math.max(t1, part.box.t1);
      sFolha = (part.box.s0 + part.box.s1) / 2;
    }
    if (Number.isFinite(t0) && Number.isFinite(t1)) {
      out.push(line([{ t: t0, s: sFolha }, { t: t1, s: sFolha }], 'leaf', 'ink', 1));
    }
    const opening = m.openings.find((x) => x.kind === 'overhead');
    const side = opening?.side || 1;
    const face = side * (m.thickness / 2);
    const comprimento = Math.min(m.height, 2.5);
    if (Number.isFinite(t0) && Number.isFinite(t1)) {
      out.push(polygon(boxRing({ t0, t1, s0: face, s1: face + side * comprimento, z0: 0, z1: 1 }), 'leaf', 'soft', 0.7, [6, 3], { t: t0, s: face, refT: t1 }));
    }
    addDeepTracks(out, m);
    if (level === 'high') addHighExtras(out, m, opts.cutZ);
    return true;
  }
  if (family === 'fold') {
    for (const part of m.parts.filter((x) => x.role === 'leaf')) {
      const motion = part.motion;
      const anchor = motion?.kind === 'rotate' && motion.axis === 'z' ? { t: motion.t, s: motion.s } : undefined;
      out.push(polygon(transformedRing(part.box, motion, opts.angle), 'leaf', 'cut', 1, undefined, anchor));
    }
    addTracks(out, m);
    if (level === 'high') addHighExtras(out, m, opts.cutZ);
    return true;
  }
  // Vai-e-vem: folha aberta dos dois lados, arco principal contínuo e o outro tracejado.
  for (const o of m.openings) {
    const box = leafBox(m, o.leaf);
    if (!box) continue;
    const motion = leafMotion(m, o.leaf);
    const sign = openingSign(o, motion);
    const anchor: OpeningPlanAnchor = { t: o.pivot.t, s: o.pivot.s, refT: o.latchT };
    out.push(polygon(transformedRing(box, motion, opts.angle), 'leaf', 'cut', 1, undefined, anchor));
    out.push(polygon(transformedRing(box, motion, -opts.angle), 'leaf', 'cut', 1, undefined, anchor));
    if (!opts.showSwing) continue;
    const center = { t: o.pivot.t, s: o.pivot.s };
    const closedEnd = { t: o.latchT, s: o.pivot.s };
    addOpeningArc(out, center, closedEnd, sign * opts.angle, opts.swingStyle, anchor);
    addOpeningArc(out, center, closedEnd, -sign * opts.angle, 'dash', anchor);
  }
  if (level === 'high') addHighExtras(out, m, opts.cutZ);
  return true;
}

/** Guilhotina: as duas folhas aparecem como linhas defasadas, cada uma na sua pista. */
export function addHungLines(out: OpeningPlanPath[], m: OpeningModel): void {
  for (const o of m.openings) {
    const box = leafBox(m, o.leaf);
    if (!box) continue;
    const s = (box.s0 + box.s1) / 2;
    out.push(line([{ t: box.t0, s }, { t: box.t1, s }], 'leaf', 'ink', 1));
  }
}

/** Veneziana: três linhas do caixilho e traços diagonais curtos das aletas, tracejados. */
export function addLouverPlan(out: OpeningPlanPath[], m: OpeningModel): void {
  const hw = m.width / 2;
  const s = (m.core.s0 + m.core.s1) / 2;
  let t = -hw + 0.08;
  while (t + 0.06 <= hw - 0.06) {
    out.push(line([{ t, s: s - 0.025 }, { t: t + 0.06, s: s + 0.025 }], 'leafPanel', 'soft', 0.7, [4, 3]));
    t += 0.12;
  }
}

/** Janela de abrir: folha aberta com espessura no `angle2d` e arco tracejado até a posição fechada. */
export function addHingedPlan(out: OpeningPlanPath[], m: OpeningModel, opts: OpeningPlanOptions): void {
  for (const o of m.openings) {
    if (o.kind !== 'side') continue;
    const box = leafBox(m, o.leaf);
    if (!box) continue;
    const motion = leafMotion(m, o.leaf);
    const anchor: OpeningPlanAnchor = { t: o.pivot.t, s: o.pivot.s, refT: o.latchT };
    out.push(polygon(transformedRing(box, motion, opts.angle), 'leaf', 'cut', 1, undefined, anchor));
    if (!opts.showSwing) continue;
    const sign = openingSign(o, motion);
    const center = { t: o.pivot.t, s: o.pivot.s };
    addOpeningArc(out, center, { t: o.latchT, s: o.pivot.s }, sign * opts.angle, 'dash', anchor);
  }
}

/** Janela pivotante: folha girada no eixo central e arcos curtos tracejados nas duas pontas. */
export function addPivotWinPlan(out: OpeningPlanPath[], m: OpeningModel, opts: OpeningPlanOptions): void {
  for (const o of m.openings) {
    if (o.kind !== 'pivot') continue;
    const box = leafBox(m, o.leaf);
    if (!box) continue;
    const motion = leafMotion(m, o.leaf);
    const anchor: OpeningPlanAnchor = { t: o.pivot.t, s: o.pivot.s };
    out.push(polygon(transformedRing(box, motion, opts.angle), 'leaf', 'cut', 1, undefined, anchor));
    if (!opts.showSwing) continue;
    const sign = openingSign(o, motion);
    const center = { t: o.pivot.t, s: o.pivot.s };
    addOpeningArc(out, center, { t: box.t0, s: o.pivot.s }, sign * opts.angle, 'dash', anchor);
    addOpeningArc(out, center, { t: box.t1, s: o.pivot.s }, sign * opts.angle, 'dash', anchor);
  }
}
