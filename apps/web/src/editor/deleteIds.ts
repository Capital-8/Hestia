import { annotationRemovals, areaPlanOf, isRoom, levelRoomSeparators, planAnnotationsOf, projectGrids, viewRemovals, type Command, type Id, type ProjectStore } from '@hestia/model';
import { areaMergePreview, removesCircuit, roomsToRemove } from './areaMerge.ts';
import { pedirConfirmacaoAreaMerge } from './areaMergePrompt.ts';
import { useUi } from './state.ts';

/**
 * Executa as remoções num passo de desfazer. A regra de áreas só entra quando `areaMergePreview` encontra uma fusão;
 * sem fusão, a exclusão continua síncrona (o Delete responde na hora, como nas demais vistas).
 */
function executar(store: ProjectStore, commands: readonly Command[]): void {
  store.transaction('eds_undo_delete', () => {
    for (const c of commands) store.exec(c);
  });
  useUi.setState({ selection: [] });
}

/**
 * Na planta de área, a exclusão alcança as anotações da vista (cotas, textos, detalhes e etiquetas), os ambientes
 * (áreas) e as linhas de separação de ambiente/área. Paredes, portas, pisos e demais elementos de modelo continuam
 * bloqueados nela.
 */
function deletePlanSelectionIn(store: ProjectStore, planId: Id, ids: Id[]): void | Promise<void> {
  const plan = areaPlanOf(store.project, planId);
  if (!plan) return;
  const want = new Set(ids);
  const a = planAnnotationsOf(plan);
  const next = {
    dimensions: a.dimensions.filter((x) => !want.has(x.id)),
    texts: a.texts.filter((x) => !want.has(x.id)),
    detailLines: a.detailLines.filter((x) => !want.has(x.id)),
    detailRegions: a.detailRegions.filter((x) => !want.has(x.id)),
    tags: a.tags.filter((x) => !want.has(x.id)),
  };
  const annotationIds = new Set<Id>([
    ...a.dimensions.map((x) => x.id),
    ...a.texts.map((x) => x.id),
    ...a.detailLines.map((x) => x.id),
    ...a.detailRegions.map((x) => x.id),
    ...a.tags.map((x) => x.id),
  ]);
  const removedAnnotations = annotationIds.size - (next.dimensions.length + next.texts.length + next.detailLines.length + next.detailRegions.length + next.tags.length);
  // Etiquetas de ambiente (RoomTag) são da vista e ficam em `plan.tags`, fora de `annotations`.
  const tags = plan.tags.filter((t) => want.has(t.id)).map((t) => t.id);
  const rooms = ids.filter((id) => isRoom(store.project.elements[id]));
  const separators = levelRoomSeparators(store.project, plan.levelId).filter((r) => want.has(r.id)).map((r) => r.id);
  if (removedAnnotations === 0 && tags.length === 0 && rooms.length === 0 && separators.length === 0) {
    useUi.setState({ status: { key: 'eds_msg_area_delete_blocked' } });
    return;
  }
  const commands: Command[] = [];
  if (removedAnnotations > 0) commands.push({ type: 'updateAreaPlan', id: planId, patch: { annotations: next } });
  for (const id of tags) commands.push({ type: 'removeRoomTag', planId, id });
  if (rooms.length > 0) commands.push({ type: 'deleteElements', ids: rooms });
  for (const id of separators) commands.push({ type: 'removeRoomSeparator', levelId: plan.levelId, id });
  const preview = areaMergePreview(store.project, plan.levelId, commands, removesCircuit(store.project, plan.levelId, ids));
  if (!preview) {
    executar(store, commands);
    useUi.setState({
      status: rooms.length > 0
        ? { key: 'eds_msg_area_deleted_room' }
        : separators.length > 0
          ? { key: 'eds_msg_area_deleted_separator' }
          : tags.length > 0
            ? { key: 'eds_msg_area_deleted_tag' }
            : { key: 'eds_msg_area_deleted_annotations' },
    });
    return;
  }
  return (async () => {
    if (!(await pedirConfirmacaoAreaMerge(preview))) return;
    const extras = roomsToRemove(preview);
    const allRooms = [...new Set([...rooms, ...extras])];
    const finalCommands = commands.filter((c) => c.type !== 'deleteElements') as Command[];
    if (allRooms.length > 0) finalCommands.push({ type: 'deleteElements', ids: allRooms });
    executar(store, finalCommands);
    useUi.setState({ status: { key: 'eds_msg_area_merged_deleted' } });
  })();
}

/**
 * Exclui a seleção: elementos por `deleteElements`; cotas e textos de anotação (decisão 0019) e linhas de separação de
 * ambiente (guardados no nível, fora de project.elements) pelos próprios comandos. Tudo num único passo de desfazer.
 */
export function deleteSelectionIn(store: ProjectStore): void | Promise<void> {
  const { selection: ids, levelId, view, planKind, areaPlanId } = useUi.getState();
  if (!ids.length) return;
  if (view === 'plan' && planKind === 'area' && areaPlanId) return deletePlanSelectionIn(store, areaPlanId, ids);
  const notes = annotationRemovals(store.project, levelId, ids);
  const views = viewRemovals(store.project, ids);
  const separators = levelRoomSeparators(store.project, levelId).filter((r) => ids.includes(r.id)).map((r) => r.id);
  // Grades pertencem ao projeto (fora de project.elements e dos níveis): removeGrid.
  const grids = projectGrids(store.project).filter((g) => ids.includes(g.id)).map((g) => g.id);
  const gridIds = new Set(grids);
  const noteIds = new Set(notes.map((c) => c.id));
  const viewIds = new Set(views.map((c) => c.id));
  const sepIds = new Set(separators);
  const elems = ids.filter((id) => !noteIds.has(id) && !viewIds.has(id) && !sepIds.has(id) && !gridIds.has(id));
  const commands: Command[] = [
    ...notes,
    ...(elems.length ? [{ type: 'deleteElements' as const, ids: elems }] : []),
    ...views,
    ...separators.map((id): Command => ({ type: 'removeRoomSeparator', levelId, id })),
    ...grids.map((id): Command => ({ type: 'removeGrid', id })),
  ];
  const preview = areaMergePreview(store.project, levelId, commands, removesCircuit(store.project, levelId, ids));
  if (!preview) {
    executar(store, commands);
    useUi.setState({ status: { key: 'eds_msg_selection_deleted' } });
    return;
  }
  return (async () => {
    if (!(await pedirConfirmacaoAreaMerge(preview))) return;
    const extras = roomsToRemove(preview);
    const allElems = [...new Set([...elems, ...extras])];
    const finalCommands = commands.filter((c) => c.type !== 'deleteElements') as Command[];
    if (allElems.length > 0) finalCommands.push({ type: 'deleteElements', ids: allElems });
    executar(store, finalCommands);
    useUi.setState({ status: { key: 'eds_msg_selection_deleted_merged' } });
  })();
}
