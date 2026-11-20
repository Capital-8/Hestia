import { junctionLevel, resolveFloors, resolveRampsOnLevel, resolveRooms, resolveRoofs, resolveSlabs, resolveStairsOnLevel, type ResolvedFloor, type ResolvedRamp, type ResolvedRoof, type ResolvedRoom, type ResolvedSlab, type ResolvedStair } from '@hestia/engine';
import { isOpening, wallsOfPlan, type Id, type Opening, type Project, type Wall } from '@hestia/model';
import { projetoDaJuncao } from './viewContext.ts';

/**
 * Resoluções do projeto que a planta refaz a cada quadro e que não dependem do zoom, da vista nem da seleção: pisos,
 * lajes, telhados, ambientes, escadas, junção do nível, paredes e aberturas por parede. Cada uma sai do mesmo projeto
 * sempre igual, então é memorizada por projeto e chave (o projeto é imutável: cada edição cria outro objeto, como em
 * `view.ts`). Um zoom ou um pan não refaz o que já foi resolvido; uma edição, sim, porque o objeto é outro.
 */
const memo = new WeakMap<Project, Map<string, unknown>>();

/** Valor de `calcula` para o projeto e a chave; a primeira chamada calcula e as seguintes reaproveitam. */
export function memoDoProjeto<T>(p: Project, chave: string, calcula: () => T): T {
  let porChave = memo.get(p);
  if (!porChave) {
    porChave = new Map();
    memo.set(p, porChave);
  }
  if (porChave.has(chave)) return porChave.get(chave) as T;
  const valor = calcula();
  porChave.set(chave, valor);
  return valor;
}

export const pisosDoNivel = (p: Project, levelId: Id): ResolvedFloor[] => memoDoProjeto(p, `pisos|${levelId}`, () => resolveFloors(p, levelId));
export const lajesDoNivel = (p: Project, levelId: Id): ResolvedSlab[] => memoDoProjeto(p, `lajes|${levelId}`, () => resolveSlabs(p, levelId));
export const telhadosDoNivel = (p: Project, levelId: Id): ResolvedRoof[] => memoDoProjeto(p, `telhados|${levelId}`, () => resolveRoofs(p, levelId));
export const ambientesDoNivel = (p: Project, levelId: Id): ResolvedRoom[] => memoDoProjeto(p, `ambientes|${levelId}`, () => resolveRooms(p, levelId));
export const escadasDoNivel = (p: Project, levelId: Id): ResolvedStair[] => memoDoProjeto(p, `escadas|${levelId}`, () => resolveStairsOnLevel(p, levelId));
export const rampasDoNivel = (p: Project, levelId: Id): ResolvedRamp[] => memoDoProjeto(p, `rampas|${levelId}`, () => resolveRampsOnLevel(p, levelId));
export const juncaoDoNivel = (p: Project, levelId: Id): ReturnType<typeof junctionLevel> => memoDoProjeto(p, `juncao|${levelId}`, () => junctionLevel(projetoDaJuncao(p, levelId), levelId));
export const paredesDoNivel = (p: Project, levelId: Id): Wall[] => memoDoProjeto(p, `paredes|${levelId}`, () => wallsOfPlan(p, levelId));

/** Aberturas do projeto por parede hospedeira, na ordem de `p.elements` (a mesma de `openingsOfWall`), numa só passada. */
function aberturasPorParede(p: Project): Map<Id, Opening[]> {
  return memoDoProjeto(p, 'aberturasPorParede', () => {
    const porParede = new Map<Id, Opening[]>();
    for (const e of Object.values(p.elements)) {
      if (!isOpening(e)) continue;
      const lista = porParede.get(e.hostId);
      if (lista) lista.push(e);
      else porParede.set(e.hostId, [e]);
    }
    return porParede;
  });
}

/** Aberturas que hospedam a parede `wallId`: o mesmo que `openingsOfWall(p, wallId)`, sem varrer o projeto a cada parede. */
export function aberturasDaParede(p: Project, wallId: Id): Opening[] {
  return aberturasPorParede(p).get(wallId) ?? [];
}
