import { dot, len, sub, type Vec2 } from '@hestia/geom';
import {
  DIM_MIN_LENGTH,
  type Dimension,
  isOpening,
  isWall,
  openingHeight,
  openingSill,
  openingType,
  sectionAnnotationsOf,
  wallBaseElevation,
  type Command,
  type Id,
  type Project,
  type ProjectStore,
  type SectionAnnotations,
} from '@hestia/model';
import type { SectionResult } from '@hestia/engine';
import { pickSectionDimensionGrip, pickSectionHandle, sectionDimensionPoints, type SectionDimensionGrip, type SectionHandle } from '@hestia/render';
import { useUi } from './state.ts';

/** Alça de abertura sob o ponto, restrita à seleção quando ela existe. */
export function sectionHandleAt(result: SectionResult, point: { x: number; y: number }, tolerance: number, selected: readonly Id[]): SectionHandle | null {
  const selectedOpening = selected.find((id) => result.openings.some((o) => o.openingId === id));
  if (!selectedOpening) return null;
  const handle = pickSectionHandle(result, point, tolerance, selectedOpening);
  // As alças laterais ficam para o movimento horizontal (SectionMoveTool); o arraste direto aqui é vertical.
  return handle && (handle.kind === 'sill' || handle.kind === 'head') ? handle : null;
}

/**
 * Converte a posição vertical (z absoluto) da alça em um patch de abertura. Só peitoril/topo; as laterais ficam para o
 * movimento horizontal, que precisa da direção da parede. Devolve null quando a alça não altera o modelo.
 */
export function sectionHandleCommand(p: Project, handle: SectionHandle, z: number): Command | null {
  const opening = p.elements[handle.openingId];
  if (!isOpening(opening)) return null;
  const wall = p.elements[opening.hostId];
  if (!isWall(wall)) return null;
  const type = openingType(p, opening);
  const base = wallBaseElevation(p, wall);
  if (handle.kind === 'sill') {
    if (opening.kind !== 'window') return null;
    return { type: 'updateElements', ids: [opening.id], patch: { sillOverride: Math.max(0, Math.round((z - base) * 1000) / 1000) } };
  }
  if (handle.kind === 'head') {
    const sill = openingSill(type, opening);
    const height = Math.max(0.1, Math.round((z - base - sill) * 1000) / 1000);
    return { type: 'updateElements', ids: [opening.id], patch: { heightOverride: height } };
  }
  return null;
}

/** Altura efetiva e peitoril atuais, para a barra de status/prévia. */
export function sectionOpeningValues(p: Project, openingId: Id): { sill: number; height: number } | null {
  const opening = p.elements[openingId];
  if (!isOpening(opening)) return null;
  const type = openingType(p, opening);
  return { sill: openingSill(type, opening), height: openingHeight(type, opening) };
}

/** Ids de todas as anotações de todas as vistas de corte/elevação (cotas, textos, detalhes e etiquetas). */
export function sectionAnnotationIdsIn(p: Project): Set<Id> {
  const ids = new Set<Id>();
  for (const v of p.views) {
    const a = sectionAnnotationsOf(v);
    for (const list of [a.dimensions, a.texts, a.detailLines, a.detailRegions, a.tags]) for (const x of list) ids.add(x.id);
  }
  return ids;
}

/** Alça de cota no corte sob o ponto (só com uma cota selecionada). */
export function sectionDimensionGripAt(p: Project, sectionId: Id | null, selected: readonly Id[], point: Vec2, tolerance: number, textTolerance: number): SectionDimensionGrip | null {
  const view = p.views.find((v) => v.id === sectionId);
  return pickSectionDimensionGrip(sectionAnnotationsOf(view), selected, point, tolerance, textTolerance);
}

/**
 * Comando que grava a alça arrastada até `point` (em `(t,z)`): o meio da linha muda o `offset` (distância com sinal da
 * linha de cota ao ponto, no lado do cursor) e o texto muda o `textAt`. Grava o conjunto inteiro da vista, então um
 * arrasto é um único passo de desfazer. Null quando o arrasto não altera nada (cota degenerada ou offset nulo).
 */
export function sectionDimensionGripCommand(p: Project, sectionId: Id, grip: SectionDimensionGrip, point: Vec2): Command | null {
  const view = p.views.find((v) => v.id === sectionId);
  if (!view) return null;
  const annotations = sectionAnnotationsOf(view);
  const d = annotations.dimensions.find((x) => x.id === grip.id);
  if (!d) return null;
  let next: Dimension;
  if (grip.kind === 'text') next = { ...d, textAt: point };
  else {
    if (d.angular) return null;
    const { a, b } = sectionDimensionPoints(d);
    const dir = sub(b, a);
    const l = len(dir);
    if (l < DIM_MIN_LENGTH) return null;
    const n: Vec2 = { x: -dir.y / l, y: dir.x / l };
    const offset = dot(sub(point, a), n);
    if (Math.abs(offset) < DIM_MIN_LENGTH) return null;
    next = { ...d, offset };
  }
  const annotationsNext: SectionAnnotations = { ...annotations, dimensions: annotations.dimensions.map((x) => (x.id === d.id ? next : x)) };
  return { type: 'setSectionAnnotations', sectionId, annotations: annotationsNext };
}

/**
 * Exclui da vista de corte as anotações da seleção (cotas, textos, detalhes e etiquetas) num único passo de desfazer.
 * Devolve quantos ids da seleção sobram (os de elementos, que o chamador exclui pelo caminho comum). Fora do corte, ou
 * sem anotação na seleção, não mexe em nada e devolve o tamanho da seleção.
 */
export function deleteSectionAnnotationsIn(store: ProjectStore): number {
  const st = useUi.getState();
  const sel = st.selection;
  if (st.view !== 'section' || !st.sectionId || sel.length === 0) return sel.length;
  const sectionId = st.sectionId;
  const view = store.project.views.find((v) => v.id === sectionId);
  const a = sectionAnnotationsOf(view);
  const want = new Set(sel);
  const annotations: SectionAnnotations = {
    dimensions: a.dimensions.filter((x) => !want.has(x.id)),
    texts: a.texts.filter((x) => !want.has(x.id)),
    detailLines: a.detailLines.filter((x) => !want.has(x.id)),
    detailRegions: a.detailRegions.filter((x) => !want.has(x.id)),
    tags: a.tags.filter((x) => !want.has(x.id)),
  };
  const removed = new Set<Id>();
  for (const list of [a.dimensions, a.texts, a.detailLines, a.detailRegions, a.tags]) for (const x of list) if (want.has(x.id)) removed.add(x.id);
  if (removed.size === 0) return sel.length;
  store.exec({ type: 'setSectionAnnotations', sectionId, annotations }, 'Excluir');
  const rest = sel.filter((id) => !removed.has(id));
  useUi.setState({ selection: rest, status: 'Anotações excluídas do corte. Ctrl+Z desfaz.' });
  return rest.length;
}
