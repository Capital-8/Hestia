import type { Id, Level, Project } from '@hestia/model';

/**
 * Remapeamento dos vínculos de topo do colar alinhado (ver docs/colar-niveis/CONTRATO.md).
 *
 * A regra é o DELTA DE ÍNDICE entre os níveis ordenados por elevação: uma parede que vai do nível `i` ao `i + 2`
 * continua indo do `j` ao `j + 2` no destino. Se o índice de topo cair fora da lista (passou do último nível ou
 * ficou abaixo do primeiro), o vínculo é limpo e quem chama usa a altura explícita.
 */

/** Níveis do projeto em ordem crescente de elevação; empate mantém a ordem de `p.levels`. */
export function levelsByElevation(p: Project): Level[] {
  return [...p.levels].sort((a, b) => a.elevation - b.elevation);
}

/** Índice do nível na lista ordenada, ou -1 quando o id não existe. */
export function levelIndex(levels: readonly Level[], levelId: Id): number {
  return levels.findIndex((l) => l.id === levelId);
}

export interface TopRemap {
  /** Nível de topo no destino; null quando o vínculo não pôde ser preservado (ou já era null). */
  topLevelId: Id | null;
  /** true quando havia um nível de topo e ele caiu fora da lista de níveis do destino. */
  overflow: boolean;
}

/** Remapeia `topLevelId` por delta de índice entre os níveis ordenados por elevação. */
export function remapTopLevel(p: Project, srcLevelId: Id, topLevelId: Id | null, destLevelId: Id): TopRemap {
  if (topLevelId === null) return { topLevelId: null, overflow: false };
  const levels = levelsByElevation(p);
  const src = levelIndex(levels, srcLevelId);
  const top = levelIndex(levels, topLevelId);
  const dest = levelIndex(levels, destLevelId);
  // Nível de origem/topo inexistente (arquivo inconsistente): não há delta confiável.
  if (src < 0 || top < 0 || dest < 0) return { topLevelId: null, overflow: true };
  const next = dest + (top - src);
  if (next < 0 || next >= levels.length) return { topLevelId: null, overflow: true };
  return { topLevelId: levels[next]!.id, overflow: false };
}

/**
 * Altura explícita que reproduz a cota de topo da origem quando o vínculo de nível não pode ser preservado:
 * (elevação do nível de topo + `topOffset`) − (elevação do nível de origem + `baseOffset`). Devolve null quando
 * algum nível não existe ou quando o resultado não é positivo (aí quem chama mantém a altura já gravada).
 */
export function explicitTopHeight(
  p: Project,
  srcLevelId: Id,
  topLevelId: Id,
  topOffset: number,
  baseOffset: number,
): number | null {
  const base = p.levels.find((l) => l.id === srcLevelId);
  const top = p.levels.find((l) => l.id === topLevelId);
  if (!base || !top) return null;
  const h = top.elevation + topOffset - (base.elevation + baseOffset);
  return h > 0 ? h : null;
}
