import type { ElementDiscipline } from './discipline.ts';
import type { GraphicsCategory } from './graphics.ts';

/**
 * Registro único de categorias gráficas (decisão 0060, adendo 3, §2): para cada `GraphicsCategory`, a disciplina de
 * origem padrão. O `Record<GraphicsCategory, ...>` é exaustivo: uma categoria nova em `GRAPHICS_CATEGORIES` sem
 * entrada aqui quebra o `tsc` (checklist `docs/disciplinas/06-checklist-novo-elemento.md`).
 *
 * O configurador, os rótulos e os predefinidos nascem deste registro; nenhuma tela é editada para incluir categoria.
 * A disciplina de um elemento continua derivada por `DISCIPLINE_OF_KIND` (`discipline.ts`): disciplina e categoria
 * são eixos ortogonais, como no Revit (ADR §1.2).
 */
export const CATEGORY_REGISTRY: Record<GraphicsCategory, { disciplina: ElementDiscipline }> = {
  wall: { disciplina: 'arquitetura' },
  door: { disciplina: 'arquitetura' },
  window: { disciplina: 'arquitetura' },
  floor: { disciplina: 'arquitetura' },
  slab: { disciplina: 'estrutura' },
  roof: { disciplina: 'arquitetura' },
  stair: { disciplina: 'arquitetura' },
  railing: { disciplina: 'arquitetura' },
  mass: { disciplina: 'arquitetura' },
  site: { disciplina: 'geral' },
  lot: { disciplina: 'geral' },
  room: { disciplina: 'arquitetura' },
  annotation: { disciplina: 'geral' },
  generic: { disciplina: 'geral' },
  column: { disciplina: 'estrutura' },
  beam: { disciplina: 'estrutura' },
  footing: { disciplina: 'estrutura' },
  ceiling: { disciplina: 'arquitetura' },
  ramp: { disciplina: 'arquitetura' },
  component: { disciplina: 'arquitetura' },
  plumbingFixture: { disciplina: 'hidrossanitario' },
  electricalFixture: { disciplina: 'eletrico' },
  mechanicalEquipment: { disciplina: 'hvac' },
};

/** Disciplina de origem padrão de uma categoria gráfica, lida do registro único. */
export function disciplinaDaCategoria(c: GraphicsCategory): ElementDiscipline {
  return CATEGORY_REGISTRY[c].disciplina;
}
