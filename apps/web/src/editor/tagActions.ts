import { areaPlanOf, defaultTagFamilyIdOf, duplicateMarks, isOpening, isWall, markAssignments, newId, planAnnotationsOf, sectionAnnotationsOf, TAG_FAMILY_PADRAO, tagFamiliesOf, type Element, type ElementTag, type Id, type Project } from '@hestia/model';
import { levelFrames, openingTagPoint, pointAt } from '@hestia/engine';
import { editor } from './controller.ts';
import { useUi } from './state.ts';

function levelOf(p: Project, element: Element): Id | null {
  if ('levelId' in element) return element.levelId;
  if (isOpening(element)) { const host = p.elements[element.hostId]; return isWall(host) ? host.levelId : null; }
  return null;
}

function center(p: Project, element: Element): { x: number; y: number } {
  if (isWall(element)) {
    if (Math.abs(element.sag) > 1e-4) {
      const f = levelFrames(p, element.levelId).find((x) => x.wall.id === element.id);
      if (f) return pointAt(f, f.length / 2, f.sMid);
    }
    return { x: (element.a.x + element.b.x) / 2, y: (element.a.y + element.b.y) / 2 };
  }
  if (isOpening(element)) {
    const host = p.elements[element.hostId];
    if (isWall(host)) {
      const f = levelFrames(p, host.levelId).find((x) => x.wall.id === host.id);
      if (f) return pointAt(f, element.offset, f.sMid);
      const dx = host.b.x - host.a.x; const dy = host.b.y - host.a.y; const len = Math.hypot(dx, dy) || 1; return { x: host.a.x + dx * element.offset / len, y: host.a.y + dy * element.offset / len };
    }
  }
  if (element.kind === 'room') return element.point;
  if ('boundary' in element && element.boundary.length) return { x: element.boundary.reduce((s, q) => s + q.x, 0) / element.boundary.length, y: element.boundary.reduce((s, q) => s + q.y, 0) / element.boundary.length };
  return { x: 0, y: 0 };
}

/** Ponto inicial da etiqueta: esquadria no lugar inteligente (fora do arco); o resto, no centro do elemento. */
function tagStart(p: Project, element: Element): { x: number; y: number } {
  return (isOpening(element) ? openingTagPoint(p, element.id) : null) ?? center(p, element);
}

export interface TagAllOptions {
  categories?: ReadonlySet<string>;
  familiesByCategory?: Readonly<Record<string, Id>>;
  orientation?: 'horizontal' | 'vertical';
  leader?: boolean;
}

function activeViewTagContext(p: Project): { levelId: Id; planId?: Id; sectionId?: Id; existing: Set<Id> } {
  const st = useUi.getState();
  const levelId = st.levelId;
  const planId = st.planKind === 'area' && st.areaPlanId ? st.areaPlanId : undefined;
  const sectionId = st.view === 'section' && st.sectionId ? st.sectionId : undefined;
  const currentTags = sectionId
    ? sectionAnnotationsOf(p.views.find((v) => v.id === sectionId)).tags
    : planId
      ? (areaPlanOf(p, planId) ? planAnnotationsOf(areaPlanOf(p, planId)!).tags : [])
      : (p.levels.find((x) => x.id === levelId)?.tags ?? []);
  return { levelId, planId, sectionId, existing: new Set(currentTags.map((x) => x.hostId)) };
}

/** Quantidade de elementos ainda sem etiqueta por categoria (`element.kind`) na vista ativa. */
export function untaggedCountsByCategory(): Record<string, number> {
  const p = editor.project;
  const { levelId, existing } = activeViewTagContext(p);
  const counts: Record<string, number> = {};
  for (const e of Object.values(p.elements)) {
    if (e.kind === 'room' || levelOf(p, e) !== levelId || existing.has(e.id)) continue;
    counts[e.kind] = (counts[e.kind] ?? 0) + 1;
  }
  return counts;
}

/** Equivalente a Tag All Not Tagged: cria etiquetas associativas, uma por elemento ainda sem etiqueta na vista. */
export function tagAllNotTagged(opts?: TagAllOptions): number {
  const p = editor.project;
  const st = useUi.getState();
  const { levelId, planId, sectionId, existing } = activeViewTagContext(p);
  const property = st.options.tagProperty ?? 'type';
  const orientation = opts?.orientation ?? st.options.tagOrientation ?? 'horizontal';
  const leader = opts?.leader ?? false;
  const baseFamilyId = st.options.tagFamilyId ?? defaultTagFamilyIdOf(p.settings);
  const fams = tagFamiliesOf(p.settings);
  const openingFallback = fams.some((f) => f.id === 'tagfam_marca') ? 'tagfam_marca' : baseFamilyId;
  const items: ElementTag[] = Object.values(p.elements)
    .filter((e) => e.kind !== 'room' && levelOf(p, e) === levelId && !existing.has(e.id) && (!opts?.categories || opts.categories.has(e.kind)))
    .map((e) => {
      const familyId = opts?.familiesByCategory?.[e.kind]
        ?? (isOpening(e) && baseFamilyId === TAG_FAMILY_PADRAO ? openingFallback : baseFamilyId);
      return { id: newId('tag'), hostId: e.id, at: tagStart(p, e), property, familyId, orientation, leader };
    });
  if (!items.length) { useUi.setState({ status: { key: 'edc_all_tagged' } }); return 0; }
  editor.store.transaction('edc_undo_tag_all', () => {
    for (const item of items) editor.store.exec({ type: 'addTag', levelId, ...(planId ? { planId } : {}), ...(sectionId ? { sectionId } : {}), item });
  });
  const key = items.length === 1 ? 'edc_tags_created_one' : 'edc_tags_created_many';
  useUi.setState({ status: { key, args: { n: items.length } } });
  return items.length;
}

/** Numera marcas (P01, J01…) de portas e janelas sem marca e avisa caso existam marcas repetidas. */
export function numberOpeningMarks(renumber = false): number {
  const p = editor.project;
  const assignments = markAssignments(p, { onlyEmpty: !renumber });
  if (assignments.length > 0) {
    editor.store.exec({ type: 'setMarks', assignments }, 'Numerar marcas');
  }
  const dups = duplicateMarks(editor.project);
  if (dups.size > 0) {
    useUi.setState({ status: { key: 'tg_msg_marks_duplicates', args: { marks: [...dups.keys()].join(', ') } } });
    return assignments.length;
  }
  if (assignments.length === 0) {
    useUi.setState({ status: { key: 'tg_msg_marks_none' } });
    return 0;
  }
  useUi.setState({ status: { key: renumber ? 'tg_msg_marks_renumbered' : 'tg_msg_marks_done', args: { n: assignments.length } } });
  return assignments.length;
}
