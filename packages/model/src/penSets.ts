import {
  DEFAULT_CATEGORY_STYLES,
  DEFAULT_LINE_WEIGHTS,
  GRAPHICS_CATEGORIES,
  graphicsIssues,
  graphicsOf,
  type CategoryLineStyle,
  type GraphicsCategory,
  type ProjectGraphics,
} from './graphics.ts';
import { t, type Lang } from './i18n.ts';
import type { Id } from './types.ts';

/**
 * Conjuntos de penas prontos (plano de estilo de prancha, regra 5): pesos de linha e estilos por categoria. São dados
 * embutidos: aplicar um conjunto copia os valores para o projeto (sem esquema novo no arquivo). O campo `estiloPrancha`
 * fica no tipo só para abrir arquivos já salvos; o estilo de prancha não existe mais como opção.
 */
export interface PenSet {
  id: 'standard' | 'light' | 'heavy';
  nameKey: string;
  descKey: string;
  lineWeights: ProjectGraphics['lineWeights'];
  categories: Record<GraphicsCategory, CategoryLineStyle>;
  estiloPrancha: boolean;
}

/** Conjunto de penas guardado pelo usuário no projeto (EP-10). Opcional no arquivo; não muda SCHEMA_VERSION. */
export interface UserPenSet {
  id: Id;
  name: string;
  lineWeights: ProjectGraphics['lineWeights'];
  categories: Record<GraphicsCategory, CategoryLineStyle>;
  estiloPrancha: boolean;
}

/** Cópia profunda da tabela de pesos, sem compartilhar referência com o padrão. */
const cloneLineWeights = (): ProjectGraphics['lineWeights'] =>
  DEFAULT_LINE_WEIGHTS.map((row) => [row[0], row[1], row[2]] as const);

/** Cópia profunda dos estilos por categoria, sem compartilhar referência com o padrão. */
const cloneCategories = (): Record<GraphicsCategory, CategoryLineStyle> => {
  const out = {} as Record<GraphicsCategory, CategoryLineStyle>;
  for (const c of GRAPHICS_CATEGORIES) out[c] = { ...DEFAULT_CATEGORY_STYLES[c] };
  return out;
};

/** Monta os estilos por categoria a partir do padrão, aplicando o ajuste em cada cópia. */
const adjustedCategories = (adjust: (style: CategoryLineStyle) => CategoryLineStyle): Record<GraphicsCategory, CategoryLineStyle> => {
  const out = {} as Record<GraphicsCategory, CategoryLineStyle>;
  for (const c of GRAPHICS_CATEGORIES) out[c] = adjust({ ...DEFAULT_CATEGORY_STYLES[c] });
  return out;
};

/** Anteprojeto: corte e projeção um nível mais leves, com mínimo 1. */
const lightCategories = (): Record<GraphicsCategory, CategoryLineStyle> =>
  adjustedCategories((s) => ({
    cutWeight: Math.max(1, s.cutWeight - 1),
    projectionWeight: Math.max(1, s.projectionWeight - 1),
  }));

/** Executivo: corte um nível mais forte (máximo 8); projeção igual ao padrão. */
const heavyCategories = (): Record<GraphicsCategory, CategoryLineStyle> =>
  adjustedCategories((s) => ({
    cutWeight: Math.min(8, s.cutWeight + 1),
    projectionWeight: s.projectionWeight,
  }));

export const PEN_SETS: readonly PenSet[] = [
  {
    id: 'standard',
    nameKey: 'pens_set_standard_name',
    descKey: 'pens_set_standard_desc',
    lineWeights: cloneLineWeights(),
    categories: cloneCategories(),
    estiloPrancha: false,
  },
  {
    id: 'light',
    nameKey: 'pens_set_light_name',
    descKey: 'pens_set_light_desc',
    lineWeights: cloneLineWeights(),
    categories: lightCategories(),
    estiloPrancha: false,
  },
  {
    id: 'heavy',
    nameKey: 'pens_set_heavy_name',
    descKey: 'pens_set_heavy_desc',
    lineWeights: cloneLineWeights(),
    categories: heavyCategories(),
    estiloPrancha: false,
  },
];

/** Conjunto pelo id, ou `undefined` quando o id não existe. */
export function penSetById(id: string): PenSet | undefined {
  return PEN_SETS.find((s) => s.id === id);
}

/**
 * Problemas de um conjunto do usuário, no idioma pedido: nome vazio (depois de `trim`) ou com mais de 60 caracteres,
 * id sem o prefixo `ps_` ou igual ao de um conjunto embutido, e pesos/categorias inválidos (mesma validação dos gráficos).
 */
export function userPenSetIssues(s: UserPenSet, lang: Lang = 'pt'): string[] {
  const out: string[] = [];
  const name = typeof s.name === 'string' ? s.name.trim() : '';
  if (name === '' || name.length > 60) out.push(t(lang, 'md_penset_name_invalid'));
  if (typeof s.id !== 'string' || !s.id.startsWith('ps_') || PEN_SETS.some((p) => p.id === s.id)) {
    out.push(t(lang, 'md_penset_id_invalid'));
  }
  out.push(...graphicsIssues({ ...graphicsOf({}), lineWeights: s.lineWeights, categories: s.categories }, lang));
  return out;
}

/** Comparação profunda de dados simples (arrays, objetos e escalares). */
function sameData(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  const ra = a as Record<string, unknown>;
  const rb = b as Record<string, unknown>;
  return ka.every((k) => sameData(ra[k], rb[k]));
}

/**
 * Id do primeiro conjunto cujos pesos de linha e estilos por categoria são iguais aos gráficos dados (comparação
 * profunda); `null` quando nenhum conjunto corresponde.
 */
export function penSetMatching(g: ProjectGraphics): PenSet['id'] | null {
  const found = PEN_SETS.find((s) => sameData(s.lineWeights, g.lineWeights) && sameData(s.categories, g.categories));
  return found?.id ?? null;
}
