import { floorViewId, isOpening, isWall, newId, viewAnnotationsOf, type Element, type ElementTag, type Id, type Project } from '@hestia/model';
import { editor } from './controller.ts';
import { useUi } from './state.ts';

function levelOf(p: Project, element: Element): Id | null {
  if ('levelId' in element) return element.levelId;
  if (isOpening(element)) { const host = p.elements[element.hostId]; return isWall(host) ? host.levelId : null; }
  return null;
}

function center(p: Project, element: Element): { x: number; y: number } {
  if (isWall(element)) return { x: (element.a.x + element.b.x) / 2, y: (element.a.y + element.b.y) / 2 };
  if (isOpening(element)) {
    const host = p.elements[element.hostId];
    if (isWall(host)) { const dx = host.b.x - host.a.x; const dy = host.b.y - host.a.y; const len = Math.hypot(dx, dy) || 1; return { x: host.a.x + dx * element.offset / len, y: host.a.y + dy * element.offset / len }; }
  }
  if (element.kind === 'room') return element.point;
  if ('boundary' in element && element.boundary.length) return { x: element.boundary.reduce((s, q) => s + q.x, 0) / element.boundary.length, y: element.boundary.reduce((s, q) => s + q.y, 0) / element.boundary.length };
  return { x: 0, y: 0 };
}

/** Equivalente a Tag All Not Tagged: cria etiquetas associativas, uma por elemento ainda sem etiqueta na vista. */
export function tagAllNotTagged(): number {
  const p = editor.project;
  const levelId = useUi.getState().levelId;
  // Etiquetas de elemento da planta de piso do nível (onde `addTag` sem `viewId` grava).
  const existing = new Set(viewAnnotationsOf(p, floorViewId(levelId)).tags.map((x) => x.hostId));
  const property = useUi.getState().options.tagProperty ?? 'type';
  const orientation = useUi.getState().options.tagOrientation ?? 'horizontal';
  const items: ElementTag[] = Object.values(p.elements)
    .filter((e) => levelOf(p, e) === levelId && !existing.has(e.id))
    .map((e) => ({ id: newId('tag'), hostId: e.id, at: center(p, e), property, orientation, leader: false }));
  if (!items.length) { useUi.setState({ status: { key: 'edc_all_tagged' } }); return 0; }
  editor.store.transaction('edc_undo_tag_all', () => {
    for (const item of items) editor.store.exec({ type: 'addTag', levelId, item });
  });
  const key = items.length === 1 ? 'edc_tags_created_one' : 'edc_tags_created_many';
  useUi.setState({ status: { key, args: { n: items.length } } });
  return items.length;
}
