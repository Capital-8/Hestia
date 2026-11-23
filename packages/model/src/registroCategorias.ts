import { presetTone, type Discipline, type ElementDiscipline, type Tone } from './discipline.ts';
import { DISCIPLINES } from './planView.ts';
import { GRAPHICS_CATEGORIES, type GraphicsCategory } from './graphics.ts';

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

/**
 * Ordem das disciplinas para o configurador (adendo 3, decisões 2 e 4): as cinco embutidas das plantas, na ordem de
 * `DISCIPLINES`, e `geral` no fim. O grupo `geral` existe porque há categorias sem disciplina de trabalho (terreno,
 * lote, anotação, genérico), que o configurador mostra como bloco próprio.
 */
export const DISCIPLINE_ORDER: readonly ElementDiscipline[] = [...DISCIPLINES, 'geral'];

/**
 * Categorias agrupadas por disciplina de origem, na ordem de `DISCIPLINE_ORDER` (adendo 3, decisão 2): o configurador
 * percorre esta lista e não conhece categoria nenhuma. Cada categoria aparece exatamente uma vez e a ordem dentro do
 * grupo é a de `GRAPHICS_CATEGORIES` (nada reordenado). Disciplinas sem categoria são omitidas.
 */
export function categoriasPorDisciplina(): Array<{ disciplina: ElementDiscipline; categorias: GraphicsCategory[] }> {
  return DISCIPLINE_ORDER.map((disciplina) => ({
    disciplina,
    categorias: GRAPHICS_CATEGORIES.filter((c) => disciplinaDaCategoria(c) === disciplina),
  })).filter((grupo) => grupo.categorias.length > 0);
}

/**
 * Tom predefinido de uma categoria na planta de `trabalho` (adendo 3, decisão 4): o da disciplina de origem da
 * categoria, pela tabela §4.2 das embutidas ou pela regra de fallback (`mesma = normal`, `outra = meio-tom`) para as
 * disciplinas criadas pelo usuário. `geral` **nunca** recebe tom (§4.1): fica sempre em `normal`.
 */
export function tomPredefinidoDaCategoria(trabalho: Discipline, categoria: GraphicsCategory): Tone {
  const d = disciplinaDaCategoria(categoria);
  return d === 'geral' ? 'normal' : presetTone(trabalho, d);
}
