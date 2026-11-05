import { isWall, type Id, type Project, type ProjectStore } from '@hestia/model';
import { useUi } from './state.ts';

/** Nível logo acima do nível `levelId` (a menor cota maior que a dele); null se ele é o mais alto. */
export function proximoNivelAcima(p: Project, levelId: Id): Id | null {
  const cota = p.levels.find((l) => l.id === levelId)?.elevation;
  if (cota === undefined) return null;
  const acima = p.levels.filter((l) => l.elevation > cota).sort((a, b) => a.elevation - b.elevation);
  return acima[0]?.id ?? null;
}

/** Liga ou desliga a base anexada ao piso ou laje do nível (uma passagem de desfazer). */
export function setBaseNoPiso(store: ProjectStore, ids: Id[], on: boolean): void {
  store.exec({ type: 'updateElements', ids, patch: { attachBottomToFloor: on } }, on ? 'edc_undo_attach_base' : 'edc_undo_detach_base');
}

/**
 * Liga ou desliga o topo anexado ao piso ou laje do nível de topo, em uma passagem de desfazer. Ao ligar, cada parede sem
 * nível de topo usa o nível logo acima dela. Devolve as paredes que não têm nível acima (o topo não é ligado nelas).
 */
export function setTopoNoPiso(store: ProjectStore, ids: Id[], on: boolean): Id[] {
  const semNivel: Id[] = [];
  store.transaction(on ? 'edc_undo_attach_top' : 'edc_undo_detach_top', () => {
    for (const id of ids) {
      const w = store.project.elements[id];
      if (!isWall(w)) continue;
      if (!on) {
        store.exec({ type: 'updateElements', ids: [id], patch: { attachTopToFloor: false } });
        continue;
      }
      const topo = w.topLevelId ?? proximoNivelAcima(store.project, w.levelId);
      if (!topo) {
        semNivel.push(id);
        continue;
      }
      store.exec({ type: 'updateElements', ids: [id], patch: { attachTopToFloor: true, topLevelId: topo } });
    }
  });
  return semNivel;
}

/** Aviso de barra de status para o topo que não pôde ser ligado (parede no nível mais alto, sem nível de topo). */
export function avisoSemNivelAcima(ids: Id[]): void {
  useUi.setState({ status: { key: ids.length === 1 ? 'edc_top_not_attached_one' : 'edc_top_not_attached_many' } });
}
