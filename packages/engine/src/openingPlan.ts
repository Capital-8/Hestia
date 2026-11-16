import { machineNumber } from '@hestia/geom';
import type { LeafOpening, OpeningModel } from './openingModelTypes.ts';
import {
  addFrameCut,
  addHighExtras,
  addThresholdPlan,
  addHingedPlan,
  addHungLines,
  addLouverPlan,
  addNewDoorPlan,
  addOpeningArc,
  addPivotWinPlan,
  addTracks,
  boxRing,
  leafBox,
  leafMotion,
  line,
  openingSign,
  polygon,
  transformedRing,
  type OpeningPlanAnchor,
  type OpeningPlanOptions,
  type OpeningPlanPath,
  type OpeningPlanPoint,
} from './openingPlanNew.ts';

export type {
  OpeningPlanAnchor,
  OpeningPlanOptions,
  OpeningPlanPath,
  OpeningPlanPoint,
  OpeningPlanRole,
  OpeningPlanTone,
} from './openingPlanNew.ts';

/** Três linhas da janela (faces do caixilho e plano médio), de `-W/2` a `+W/2`. */
function addWindowLines(out: OpeningPlanPath[], m: OpeningModel): void {
  let s0 = -m.thickness / 2;
  let s1 = m.thickness / 2;
  const jamb = m.parts.find((p) => p.role === 'jamb') ?? m.parts.find((p) => p.role === 'sillFrame');
  if (jamb) {
    s0 = jamb.box.s0;
    s1 = jamb.box.s1;
  }
  const hw = m.width / 2;
  out.push(line([{ t: -hw, s: s0 }, { t: hw, s: s0 }], 'jamb', 'ink', 1));
  out.push(line([{ t: -hw, s: s1 }, { t: hw, s: s1 }], 'jamb', 'ink', 1));
  out.push(line([{ t: -hw, s: (s0 + s1) / 2 }, { t: hw, s: (s0 + s1) / 2 }], 'glass', 'ink', 0.8));
}

/** Seta de deslocamento das folhas de correr, no sentido do movimento. */
function addSlideArrow(out: OpeningPlanPath[], m: OpeningModel): void {
  const moving = m.parts.find((p) => p.role === 'leaf' && p.motion?.kind === 'slide' && p.motion.travel > 0)?.motion;
  const dir = moving && moving.kind === 'slide' && moving.dt !== 0 ? Math.sign(moving.dt) : 1;
  const hw = m.width / 2;
  const s = (m.core.s0 + m.core.s1) / 2;
  const a = { t: -hw * 0.6, s };
  const b = { t: hw * 0.6, s };
  const from = dir >= 0 ? a : b;
  const tip = dir >= 0 ? b : a;
  out.push(line([from, tip], 'arrow', 'ink', 0.8));
  const back = hw * 0.15;
  const head = hw * 0.08;
  out.push(line([{ t: tip.t - dir * back, s: s + head }, tip, { t: tip.t - dir * back, s: s - head }], 'arrow', 'ink', 0.8));
}

/** Vão livre: as duas bordas nas faces da parede, tracejadas (sem X, como na decisão 0024 §3). */
function addVoid(out: OpeningPlanPath[], m: OpeningModel): void {
  const hw = m.width / 2;
  out.push(line([{ t: -hw, s: -m.thickness / 2 }, { t: hw, s: -m.thickness / 2 }], 'mark', 'soft', 0.7, [6, 3]));
  out.push(line([{ t: -hw, s: m.thickness / 2 }, { t: hw, s: m.thickness / 2 }], 'mark', 'soft', 0.7, [6, 3]));
}

/** Janela fixa/maxim-ar/basculante: arco tracejado (maxim-ar) ou V (basculante) do lado de `flipFacing`. */
function addWindowOpening(out: OpeningPlanPath[], m: OpeningModel, o: LeafOpening): void {
  const hw = m.width / 2;
  const s = (m.core.s0 + m.core.s1) / 2;
  const anchor: OpeningPlanAnchor = { t: -hw, s, refT: hw };
  if (o.kind === 'top') {
    const pts: OpeningPlanPoint[] = [];
    const steps = 18;
    for (let i = 0; i <= steps; i++) {
      const t = -hw + (2 * hw * i) / steps;
      pts.push({ t, s: s + o.side * hw * 0.5 * (1 - (t / hw) ** 2) });
    }
    out.push(line(pts, 'swing', 'soft', 0.8, [4, 3], anchor));
    return;
  }
  if (o.kind === 'bottom') {
    out.push(line([{ t: -hw, s }, { t: 0, s: s + o.side * hw * 0.5 }, { t: hw, s }], 'swing', 'soft', 0.8, undefined, anchor));
  }
}

/** Basculante: a folha em corte aparece como linha inclinada em torno do centro do eixo, com `angle2d` e sem arco. */
function addTiltPlan(out: OpeningPlanPath[], m: OpeningModel, o: LeafOpening, angle: number): void {
  const box = leafBox(m, o.leaf);
  if (!box) return;
  const center = { t: (box.t0 + box.t1) / 2, s: (box.s0 + box.s1) / 2 };
  const half = (box.t1 - box.t0) / 2;
  const side = o.side || 1;
  const dt = half * Math.cos(angle);
  const ds = half * Math.sin(angle) * side;
  out.push(line([{ t: center.t - dt, s: center.s - ds }, { t: center.t + dt, s: center.s + ds }], 'leaf', 'ink', 1, undefined, center));
}

/** Desenho de uma porta (giro, dupla, pivotante, correr e vão livre) nos níveis baixo/médio/alto. */
function doorPaths(out: OpeningPlanPath[], m: OpeningModel, opts: OpeningPlanOptions): void {
  const level = opts.planDisplay === 'projected' ? 'high' : opts.detail;
  if (m.void) {
    addVoid(out, m);
    return;
  }
  if (addNewDoorPlan(out, m, opts)) return;
  addFrameCut(out, m, opts.cutZ);
  if (level !== 'low') addThresholdPlan(out, m);
  const sliding = m.openings.some((o) => o.kind === 'slide');
  if (sliding) {
    // Correr mantém o desenho próprio (folhas fechadas + pistas + seta).
    for (const o of m.openings) {
      const box = leafBox(m, o.leaf);
      if (box) out.push(polygon(boxRing(box), 'leaf', 'cut', 1));
    }
    addTracks(out, m);
    addSlideArrow(out, m);
  } else {
    // Folhas de giro: só a folha ABERTA, em todos os níveis (spec E3 §6); a fechada não é desenhada.
    for (const o of m.openings) {
      const box = leafBox(m, o.leaf);
      if (!box) continue;
      const motion = leafMotion(m, o.leaf);
      const anchor: OpeningPlanAnchor = {
        t: o.pivot.t,
        s: o.pivot.s,
        ...(o.kind === 'pivot' ? {} : { refT: o.latchT }),
      };
      out.push(polygon(transformedRing(box, motion, opts.angle), 'leaf', 'cut', 1, undefined, anchor));
      if (!opts.showSwing) continue;
      const sign = openingSign(o, motion);
      const center = { t: o.pivot.t, s: o.pivot.s };
      if (o.kind === 'pivot') {
        addOpeningArc(out, center, { t: box.t0, s: o.pivot.s }, sign * opts.angle, opts.swingStyle, anchor);
        addOpeningArc(out, center, { t: box.t1, s: o.pivot.s }, sign * opts.angle, opts.swingStyle, anchor);
      } else {
        addOpeningArc(out, center, { t: o.latchT, s: o.pivot.s }, sign * opts.angle, opts.swingStyle, anchor);
      }
    }
  }
  if (level === 'high') addHighExtras(out, m, opts.cutZ);
}

/** Desenho de uma janela (fixa, maxim-ar, basculante, correr e vão livre) nos níveis baixo/médio/alto. */
function windowPaths(out: OpeningPlanPath[], m: OpeningModel, opts: OpeningPlanOptions): void {
  const level = opts.planDisplay === 'projected' ? 'high' : opts.detail;
  if (m.void) {
    addVoid(out, m);
    return;
  }
  const hung = m.openings.some((o) => o.kind === 'slide' && o.slideAxis === 'z');
  if (level === 'low') {
    if (hung) addHungLines(out, m);
    else addWindowLines(out, m);
    return;
  }
  addFrameCut(out, m, opts.cutZ);
  if (hung) {
    addHungLines(out, m);
    if (level === 'high') addHighExtras(out, m, opts.cutZ);
    return;
  }
  addWindowLines(out, m);
  if (m.openings.some((o) => o.kind === 'louver')) {
    addLouverPlan(out, m);
    if (level === 'high') addHighExtras(out, m, opts.cutZ);
    return;
  }
  if (m.openings.some((o) => o.kind === 'side')) {
    addHingedPlan(out, m, opts);
    if (level === 'high') addHighExtras(out, m, opts.cutZ);
    return;
  }
  if (m.openings.some((o) => o.kind === 'pivot')) {
    addPivotWinPlan(out, m, opts);
    if (level === 'high') addHighExtras(out, m, opts.cutZ);
    return;
  }
  if (m.openings.some((o) => o.kind === 'tilt')) {
    for (const o of m.openings) if (o.kind === 'tilt') addTiltPlan(out, m, o, opts.angle);
    if (level === 'high') addHighExtras(out, m, opts.cutZ);
    return;
  }
  const sliding = m.openings.some((o) => o.kind === 'slide');
  const opening = m.openings.find((o) => o.kind === 'top' || o.kind === 'bottom');
  if (sliding) {
    for (const o of m.openings) {
      const box = leafBox(m, o.leaf);
      if (box) out.push(polygon(boxRing(box), 'leaf', 'cut', 1));
    }
    addTracks(out, m);
    addSlideArrow(out, m);
  } else if (opening) {
    // Maxim-ar/basculante: só o símbolo de abertura, sem a folha fechada (spec E3 §6).
    addWindowOpening(out, m, opening);
  } else if (level === 'high') {
    for (const o of m.openings) {
      const box = leafBox(m, o.leaf);
      if (box) out.push(polygon(boxRing(box), 'leaf', 'cut', 1));
    }
  }
  if (level === 'high') addHighExtras(out, m, opts.cutZ);
}

function basePaths(m: OpeningModel, opts: OpeningPlanOptions): OpeningPlanPath[] {
  const out: OpeningPlanPath[] = [];
  if (m.kind === 'door') doorPaths(out, m, opts);
  else windowPaths(out, m, opts);
  return out;
}

const chave = (p: OpeningPlanPath): string => p.pts.map((q) => `${machineNumber(q.t, 4)},${machineNumber(q.s, 4)}`).join(';');

/**
 * Planta da esquadria a partir do modelo único (spec E §4.1), em coordenadas locais do vão. `low` mostra as três
 * linhas da janela (e a linha da folha das famílias que correm), `mid` corta os perfis e abre a folha com o arco, e
 * `high` acrescenta alizar, peitoril, verga e o vidro duplo. `planDisplay = 'projected'` força o nível alto.
 * `leafPlan` escolhe a folha: 'open' (padrão) só a aberta, 'closed' só a fechada, 'both' as duas.
 */
export function openingPlanPaths(m: OpeningModel, opts: OpeningPlanOptions): OpeningPlanPath[] {
  const modo = opts.leafPlan ?? 'open';
  if (modo === 'open' || m.void) return basePaths(m, opts);
  // Fechada = a mesma planta com a folha em 0° e sem o arco; as folhas dela se somam (both) ou substituem (closed).
  const fechada = basePaths(m, { ...opts, angle: 0, showSwing: false });
  const folhas = fechada.filter((p) => p.role === 'leaf' && p.closed);
  const extras: OpeningPlanPath[] = [];
  const nivel = opts.planDisplay === 'projected' ? 'high' : opts.detail;
  if (nivel !== 'low') {
    for (const o of m.openings) {
      const box = leafBox(m, o.leaf);
      const nova = box ? polygon(boxRing(box), 'leaf', 'cut', 1) : null;
      if (nova && !folhas.some((p) => chave(p) === chave(nova))) extras.push(nova);
    }
  }
  if (modo === 'closed') return [...fechada, ...extras];
  const aberta = basePaths(m, opts);
  const vistas = new Set(aberta.filter((p) => p.role === 'leaf' && p.closed).map(chave));
  return [...aberta, ...[...folhas, ...extras].filter((p) => !vistas.has(chave(p)))];
}
