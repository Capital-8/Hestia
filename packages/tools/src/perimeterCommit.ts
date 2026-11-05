import type { SketchDraft } from '@hestia/geom';
import { followsRoom, isCeiling, isFloor, isRoof, isSlab, type Id, type Project } from '@hestia/model';
import { editDraft, finish, SKETCH_DEFAULTS } from './perimeterSession.ts';
import { areaSides, commitArea } from './perimeterCommitArea.ts';
import { commitRoof, roofSides } from './perimeterCommitRoof.ts';
import { refuse as refuseBase, withDefaults } from './perimeterCommitShared.ts';
import type { CommitPerimeterOptions, CommitPerimeterResult, PerimeterBarOptions } from './perimeterCommitTypes.ts';
import { t as translate, type Lang } from './i18n.ts';

export type { CommitPerimeterOptions, CommitPerimeterResult, PerimeterBarOptions } from './perimeterCommitTypes.ts';
export { OUTLINE_LOCKED_MSG } from './outlineEdit.ts';

/** Valor mais frequente (empate: o que aparece primeiro). Undefined para lista vazia. */
function mostCommon(values: number[]): number | undefined {
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: number | undefined;
  let bestN = 0;
  for (const [v, n] of counts) {
    if (n > bestN) {
      best = v;
      bestN = n;
    }
  }
  return best;
}

/**
 * Opções iniciais da barra de perímetro para o elemento: balanço (o mais comum entre as arestas do telhado), inclinação
 * padrão (a do telhado), estender até o núcleo, deslocamento do nível, vínculo às paredes (piso e laje) e acompanhar o
 * ambiente (forro). Null quando o id não é um elemento de contorno.
 */
export function perimeterOptionsOf(project: Project, elementId: Id): PerimeterBarOptions | null {
  const el = project.elements[elementId];
  if (isRoof(el)) {
    return {
      overhang: mostCommon(el.edgeOverhangs) ?? SKETCH_DEFAULTS.overhang,
      slopePct: el.slopePercent,
      extendToCore: false,
      heightOffset: el.heightOffset,
    };
  }
  if (isFloor(el) || isSlab(el)) {
    const linkToWalls = !!el.outlineSource?.linked;
    return { overhang: SKETCH_DEFAULTS.overhang, slopePct: SKETCH_DEFAULTS.slopePct, extendToCore: el.outlineSource?.extend === 'core', heightOffset: el.heightOffset, linkToWalls };
  }
  if (isCeiling(el)) {
    return { overhang: SKETCH_DEFAULTS.overhang, slopePct: SKETCH_DEFAULTS.slopePct, extendToCore: false, heightOffset: el.heightOffset, followRoom: followsRoom(el) };
  }
  return null;
}

/**
 * Rascunho de "Editar perímetro" para o elemento: telhado (pegada como laço externo, furos, e uma linha por lado com a
 * inclinação e o balanço próprios), piso, laje ou forro (contorno e furos). Null quando o id não existe ou a forma não
 * é editável por perímetro (telhado livre ou por extrusão).
 */
export function draftFromElement(project: Project, elementId: Id): SketchDraft | null {
  const el = project.elements[elementId];
  const opts = perimeterOptionsOf(project, elementId);
  if (!el || !opts) return null;
  const defaults = { definesSlope: true, slopePct: opts.slopePct, overhang: opts.overhang };
  if (isRoof(el)) {
    const sides = roofSides(el);
    if (!sides) return null;
    return { ...editDraft('roof', el.id, sides.outer, sides.holes, sides.flags), defaults };
  }
  if (isFloor(el) || isSlab(el) || isCeiling(el)) {
    const { outer, holes } = areaSides(project, el);
    return { ...editDraft(el.kind, el.id, outer, holes), defaults };
  }
  return null;
}

/**
 * Conclui o rascunho. Sem `draft.editing`, cria o elemento do alvo (um comando de criação); com ele, altera o existente
 * preservando id, tipo, nível e demais propriedades (só vão no patch os campos que o perímetro mudou ou que as opções
 * pediram). Telhado: as arestas viram `edgeSlopes`/`edgeOverhangs`, e o motor precisa gerar águas; senão recusa e não
 * gera comando. Piso, laje e forro: contorno e furos, com o furo dentro do contorno. Recusa devolve o motivo em `message`.
 */
export function commitPerimeter(project: Project, draft: SketchDraft, opts: CommitPerimeterOptions = {}, lang: Lang = 'pt'): CommitPerimeterResult {
  const d = withDefaults(draft, opts);
  const r = finish(d);
  if (!r.ok) {
    const first = r.issues[0];
    return { ok: false, message: translate(lang, 'tl_msg_perimeter_incomplete', { reason: first?.message ?? translate(lang, 'tl_msg_empty_sketch') }), issues: r.issues };
  }
  if (d.editing) {
    const el = project.elements[d.editing];
    if (!el || el.kind !== d.target) return refuseBase(translate(lang, 'tl_msg_editing_not_found'));
  }
  if (d.target === 'roof') {
    return commitRoof(project, { editing: d.editing, slopeDefault: d.defaults.slopePct }, r.outer, r.holes, r.edges, opts, d.segs, lang);
  }
  return commitArea(project, { target: d.target, editing: d.editing }, r.outer, r.holes, opts, lang);
}
