import {
  add,
  equal,
  validateSketch,
  type SketchDraft,
  type SketchIssue,
  type SketchResult,
  type SketchSeg,
  type SketchTarget,
  type Vec2,
} from '@hestia/geom';
import type { Id } from '@hestia/model';
import { fitRing } from './perimeterArcFit.ts';
import { weldMicroSegs } from './perimeterModifyDraft.ts';
import { sideSegs } from './perimeterSessionEdges.ts';

/**
 * De onde veio o esboço, para o vínculo do contorno: `walls` quando foi montado por "Por perímetro" (caixa sobre as
 * paredes); `roomId` quando um lado veio do contorno de um ambiente ("Por ambiente"). Só a ferramenta sabe.
 */
export interface SketchOrigin {
  walls?: boolean;
  roomId?: Id;
}

/** Flags de inclinação/balanço de uma linha (só telhado as usa). Ausente = padrão do rascunho. */
export interface SegFlags {
  definesSlope?: boolean;
  slopePct?: number;
  overhang?: number;
}

/** Alteração de flags: `undefined` mantém, `null` apaga o valor próprio (volta ao padrão). */
export type SegFlagsPatch = { [K in keyof SegFlags]?: SegFlags[K] | null };

/** Flags por lado, na ordem do anel (após remover ponto de fechamento repetido). */
export interface EditFlags {
  outer?: SegFlags[];
  holes?: SegFlags[][];
}

export type NewSeg = Omit<SketchSeg, 'id'>;

export type DraftDefaults = SketchDraft['defaults'];

export type EffectiveSeg = SketchSeg & { definesSlope: boolean; slopePct: number; overhang: number };

export interface FinishEdge {
  segId: string;
  definesSlope: boolean;
  slopePct: number;
  overhang: number;
}

export type FinishResult =
  | { ok: true; outer: Vec2[]; holes: Vec2[][]; edges: FinishEdge[] }
  | { ok: false; issues: SketchIssue[] };

export const SKETCH_DEFAULTS: Readonly<DraftDefaults> = Object.freeze({ definesSlope: true, slopePct: 30, overhang: 0.5 });

const EMPTY_ISSUE: SketchIssue = { code: 'empty', message: 'Esboço vazio.', segIds: [] };

function mergeDefaults(base: DraftDefaults, p: Partial<DraftDefaults>): DraftDefaults {
  return {
    definesSlope: p.definesSlope ?? base.definesSlope,
    slopePct: p.slopePct ?? base.slopePct,
    overhang: p.overhang ?? base.overhang,
  };
}

/** Próximo id `sN` livre; registra o id em `taken`. */
function nextId(taken: Set<string>): string {
  let k = 1;
  while (taken.has(`s${k}`)) k++;
  const id = `s${k}`;
  taken.add(id);
  return id;
}

function numbered(segs: NewSeg[], taken: Set<string>): SketchSeg[] {
  return segs.map((s) => ({ ...s, id: nextId(taken) }));
}

function withFlags(seg: SketchSeg, f?: SegFlags): SketchSeg {
  if (f?.definesSlope !== undefined) seg.definesSlope = f.definesSlope;
  if (f?.slopePct !== undefined) seg.slopePct = f.slopePct;
  if (f?.overhang !== undefined) seg.overhang = f.overhang;
  return seg;
}

/** Anel sem o ponto de fechamento repetido. */
function openRing(ring: Vec2[]): Vec2[] {
  const n = ring.length;
  return n > 1 && equal(ring[0]!, ring[n - 1]!) ? ring.slice(0, -1) : ring.slice();
}

/** Lados de um anel, com arcos recuperados (sequências sobre um círculo viram um arco com flecha; ver `fitRing`). */
function sidesOf(elementId: string, tag: string, ring: Vec2[], flags?: SegFlags[]): SketchSeg[] {
  const pts = openRing(ring);
  if (pts.length < 2) return [];
  return fitRing(pts, flags ?? []).map((f, i) => withFlags({ id: `${elementId}:${tag}${i}`, a: f.a, b: f.b, ...(f.sag ? { sag: f.sag } : {}) }, f.flags));
}

function assignFlag<K extends keyof SegFlags>(out: SketchSeg, k: K, v: SegFlagsPatch[K]): void {
  if (v === undefined) return;
  if (v === null) delete out[k];
  else (out as SegFlags)[k] = v as SegFlags[K];
}

function patchSeg(s: SketchSeg, p: SegFlagsPatch): SketchSeg {
  const out: SketchSeg = { ...s };
  assignFlag(out, 'definesSlope', p.definesSlope);
  assignFlag(out, 'slopePct', p.slopePct);
  assignFlag(out, 'overhang', p.overhang);
  return out;
}

/** Rascunho vazio, criando um elemento do alvo dado. */
export function newDraft(target: SketchTarget, defaults: Partial<DraftDefaults> = {}): SketchDraft {
  return { target, segs: [], selected: [], defaults: mergeDefaults(SKETCH_DEFAULTS, defaults) };
}

/**
 * Rascunho para "Editar perímetro": cada lado do anel externo e de cada furo vira uma linha.
 * Ids estáveis: `<elementId>:o<i>` para o externo e `<elementId>:h<j>.<i>` para o furo j.
 */
export function editDraft(
  target: SketchTarget,
  elementId: string,
  outer: Vec2[],
  holes: Vec2[][] = [],
  segFlags?: EditFlags,
): SketchDraft {
  const segs = [
    ...sidesOf(elementId, 'o', outer, segFlags?.outer),
    ...holes.flatMap((h, j) => sidesOf(elementId, `h${j}.`, h, segFlags?.holes?.[j])),
  ];
  return { target, segs, selected: [], editing: elementId, defaults: { ...SKETCH_DEFAULTS } };
}

/** Acrescenta uma linha; o id é gerado. */
export function addSeg(d: SketchDraft, seg: NewSeg): SketchDraft {
  return addSegs(d, [seg]);
}

/** Acrescenta linhas na ordem dada; os ids são gerados. */
export function addSegs(d: SketchDraft, segs: NewSeg[]): SketchDraft {
  const taken = new Set(d.segs.map((s) => s.id));
  return { ...d, segs: [...d.segs, ...numbered(segs, taken)] };
}

/** Remove linhas (e da seleção). Ids desconhecidos são ignorados. */
export function removeSegs(d: SketchDraft, ids: string[]): SketchDraft {
  const gone = new Set(ids);
  return {
    ...d,
    segs: d.segs.filter((s) => !gone.has(s.id)),
    selected: d.selected.filter((id) => !gone.has(id)),
  };
}

/**
 * Remove `removeIds` e põe `add` no lugar da primeira removida (ou no fim). Usado por aparar, estender e dividir.
 */
export function replaceSegs(d: SketchDraft, removeIds: string[], add: NewSeg[]): SketchDraft {
  const gone = new Set(removeIds);
  const at = d.segs.findIndex((s) => gone.has(s.id));
  const kept = d.segs.filter((s) => !gone.has(s.id));
  const pos = at < 0 ? kept.length : d.segs.slice(0, at).filter((s) => !gone.has(s.id)).length;
  const added = numbered(add, new Set(kept.map((s) => s.id)));
  return {
    ...d,
    segs: [...kept.slice(0, pos), ...added, ...kept.slice(pos)],
    selected: d.selected.filter((id) => !gone.has(id)),
  };
}

/** Desloca as pontas das linhas indicadas por `delta`. */
export function moveSegs(d: SketchDraft, ids: string[], delta: Vec2): SketchDraft {
  const sel = new Set(ids);
  return {
    ...d,
    segs: d.segs.map((s) => (sel.has(s.id) ? { ...s, a: add(s.a, delta), b: add(s.b, delta) } : s)),
  };
}

/** Como um clique ou uma janela mexe na seleção: substitui, soma (Shift) ou subtrai (Ctrl). */
export type SelectionMode = 'replace' | 'add' | 'subtract';

/** Seleciona linhas com o modo dado. Ids desconhecidos são ignorados. */
export function selectSegsMode(d: SketchDraft, ids: string[], mode: SelectionMode = 'replace'): SketchDraft {
  const known = new Set(d.segs.map((s) => s.id));
  const picked = new Set(ids.filter((id) => known.has(id)));
  const base = mode === 'replace' ? [] : mode === 'add' ? d.selected : d.selected.filter((id) => !picked.has(id));
  return { ...d, selected: [...new Set([...base, ...(mode === 'subtract' ? [] : [...picked])])] };
}

/** Seleciona linhas. `additive` soma à seleção atual; senão substitui. Ids desconhecidos são ignorados. */
export function selectSegs(d: SketchDraft, ids: string[], additive = false): SketchDraft {
  return selectSegsMode(d, ids, additive ? 'add' : 'replace');
}

/** Seleciona todas as linhas do esboço (Ctrl+A). */
export function selectAllSegs(d: SketchDraft): SketchDraft {
  return selectSegsMode(d, d.segs.map((s) => s.id));
}

/** Ajusta flags próprios de uma linha (telhado). */
export function setSegSlope(d: SketchDraft, id: string, patch: SegFlagsPatch): SketchDraft {
  return { ...d, segs: d.segs.map((s) => (s.id === id ? patchSeg(s, patch) : s)) };
}

/** Altera os padrões do rascunho; campos ausentes em `partial` ficam como estão. */
export function setDefaults(d: SketchDraft, partial: Partial<DraftDefaults>): SketchDraft {
  return { ...d, defaults: mergeDefaults(d.defaults, partial) };
}

/** Linha com os valores efetivos (próprio ou padrão do rascunho). */
export function effectiveSeg(d: SketchDraft, seg: SketchSeg): EffectiveSeg {
  return {
    ...seg,
    definesSlope: seg.definesSlope ?? d.defaults.definesSlope,
    slopePct: seg.slopePct ?? d.defaults.slopePct,
    overhang: seg.overhang ?? d.defaults.overhang,
  };
}

/** Agrupa as linhas em laços e valida o esboço. */
export function closeAnalysis(d: SketchDraft): SketchResult {
  // Degraus micro (menos de 1 cm) entre duas linhas se soldam antes de validar (ver `weldMicroSegs`).
  return validateSketch(weldMicroSegs(d).segs);
}

/** Concluir só fica habilitado com um laço externo e nenhum problema. */
export function canFinish(d: SketchDraft): boolean {
  const r = closeAnalysis(d);
  return r.ok && r.loops.some((l) => l.role === 'outer');
}

function edgeOf(d: SketchDraft, seg: SketchSeg): FinishEdge {
  if (d.target !== 'roof') return { segId: seg.id, definesSlope: false, slopePct: 0, overhang: 0 };
  const e = effectiveSeg(d, seg);
  return { segId: e.id, definesSlope: e.definesSlope, slopePct: e.slopePct, overhang: e.overhang };
}

/**
 * Conclui o esboço. `edges` segue a ordem dos lados do anel externo; arcos amostrados repetem o seg.
 * Só telhado usa as flags de inclinação/balanço; nos outros alvos elas vêm neutras.
 */
export function finish(d: SketchDraft): FinishResult {
  const r = closeAnalysis(d);
  const outerLoop = r.loops.find((l) => l.role === 'outer');
  if (!r.ok || !outerLoop) {
    return { ok: false, issues: r.issues.length > 0 ? r.issues : [EMPTY_ISSUE] };
  }
  return {
    ok: true,
    outer: outerLoop.ring.slice(),
    holes: r.loops.filter((l) => l.role === 'hole').map((l) => l.ring.slice()),
    edges: sideSegs(outerLoop).map((s) => edgeOf(d, s)),
  };
}

/** Cancela o esboço: não há rascunho depois disso. */
export function cancel(_d: SketchDraft): null {
  return null;
}
