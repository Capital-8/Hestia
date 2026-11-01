import type { Vec2 } from '@hestia/geom';
import { sectionAnnotationsOf, type Id, type Project } from '@hestia/model';
import { annotationAt, viewAnnotationsOf } from '@hestia/tools';

/** Janela (ms) e distância (px) entre dois cliques para valer como duplo clique. */
export const DUPLO_CLIQUE_MS = 400;
export const DUPLO_CLIQUE_PX = 5;

export interface CliqueAnterior { t: number; x: number; y: number }

/** O clique `agora` completa um duplo clique com o `anterior`? */
export function ehDuploClique(anterior: CliqueAnterior | null, agora: CliqueAnterior): boolean {
  if (!anterior) return false;
  return agora.t - anterior.t <= DUPLO_CLIQUE_MS && Math.hypot(agora.x - anterior.x, agora.y - anterior.y) <= DUPLO_CLIQUE_PX;
}

export type AlvoDeCota =
  | { vista: 'plan'; levelId: Id; planId?: Id; mpp: number }
  | { vista: 'section'; sectionId: Id | null; hitId: Id | null };

/**
 * Id da cota linear permanente sob o ponto, ou null (outro elemento, vazio ou cota angular, que a edição de valor
 * recusa). Na planta usa o mesmo hit test do Selecionar; no corte, o id já escolhido pelo pick da vista.
 */
export function cotaParaEditar(p: Project, alvo: AlvoDeCota, world: Vec2): Id | null {
  if (alvo.vista === 'plan') {
    const hit = annotationAt(p, alvo.levelId, world, alvo.mpp, alvo.planId);
    if (!hit || hit.kind !== 'dimension') return null;
    const d = viewAnnotationsOf(p, alvo.levelId, alvo.planId).dimensions.find((x) => x.id === hit.id);
    return d && !d.angular ? d.id : null;
  }
  if (!alvo.hitId) return null;
  const view = p.views.find((v) => v.id === alvo.sectionId);
  const d = sectionAnnotationsOf(view).dimensions.find((x) => x.id === alvo.hitId);
  return d && !d.angular ? d.id : null;
}
