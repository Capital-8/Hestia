import { aneisDaMassaNoNivel, massasNaCaixaDaPlanta, pickMassaAt } from '@hestia/engine';
import { isMass, type Id, type Project } from '@hestia/model';
import type { Vec2 } from '@hestia/geom';

/**
 * Seleção da massa na planta, no padrão de `railingPick.ts`. A geometria clicável (anel cortado do kernel, ou o contorno da base sem
 * kernel) e as regras de clique e de janela moram no motor (`massaPlanta.ts`), porque `tools` não importa de `render`; aqui só se
 * escolhe o que a ferramenta de seleção usa. Nenhuma geometria nova é calculada em TypeScript (A.5).
 */

/** Massas dentro da seleção (o que o `transform` move, gira, espelha e copia). */
export const selectedMasses = (p: Project, ids: readonly Id[]): Id[] => ids.filter((id) => isMass(p.elements[id]));

/** Massa sob o ponto da planta (dentro do anel cortado ou a até 4 px do traço); oculta na vista não é alvo. */
export function pickMassAt(p: Project, levelId: Id, at: Vec2, mpp: number, hidden?: ReadonlySet<Id>): Id | null {
  return pickMassaAt(p, levelId, at, mpp, hidden);
}

/** Massas cujo anel cortado cabe inteiro na janela de seleção (arrastada de `a` a `b`). Oculta na vista não entra. */
export function massIdsInBox(p: Project, levelId: Id, a: Vec2, b: Vec2, hidden?: ReadonlySet<Id>): Id[] {
  const caixa = { minX: Math.min(a.x, b.x), minY: Math.min(a.y, b.y), maxX: Math.max(a.x, b.x), maxY: Math.max(a.y, b.y) };
  return massasNaCaixaDaPlanta(p, levelId, caixa, hidden);
}

/** Anéis (cortados, ou a base sem kernel) de uma massa no nível dela: o fantasma do mover e as feições do Alinhar partem deles. */
export function massRings(p: Project, massId: Id): Vec2[][] {
  const m = p.elements[massId];
  if (!isMass(m)) return [];
  return aneisDaMassaNoNivel(p, m.levelId).get(massId) ?? [];
}
