/**
 * Lógica pura do seletor de tipo da paleta de propriedades (Type Selector do Revit): busca por texto e agrupamento
 * por família. Sem React e sem o modelo, para ser testada direto.
 */

/** Campos de um tipo que a lista usa: a busca olha família, nome e código; o agrupamento usa a família. */
export interface TypeChoice {
  id: string;
  name: string;
  code: string;
  family: string;
  /** Aberturas: forma do vão (`rect`, `round`, `gable`...); ausente nas outras categorias. É um atributo filtrável. */
  shape?: string;
  /** Aberturas: nome da forma no idioma ativo, que entra na busca por texto ("arco", "empena"). */
  shapeLabel?: string;
}

export interface TypeChoiceGroup<T extends TypeChoice> {
  family: string;
  items: T[];
}

/** Título do grupo dos favoritos (aberturas), sempre no topo da lista. */
export const FAVORITES_LABEL = '★ Favoritos';

/** Verdadeiro quando o texto aparece na família, no nome ou no código (sem diferença de maiúsculas). Busca vazia casa tudo. */
export function matchesTypeQuery(t: TypeChoice, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return `${t.family} ${t.name} ${t.code} ${t.shapeLabel ?? ''}`.toLowerCase().includes(needle);
}

/** Valor do filtro de forma que não restringe nada. */
export const SHAPE_ALL = '';

/**
 * Tipos que casam com a busca, na ordem original. `shape` (opcional) restringe à forma do vão (`SHAPE_ALL` ou ausente: todas);
 * tipo sem `shape` conta como retangular.
 */
export function filterTypeChoices<T extends TypeChoice>(items: readonly T[], query: string, shape: string = SHAPE_ALL): T[] {
  return items.filter((t) => matchesTypeQuery(t, query) && (shape === SHAPE_ALL || (t.shape ?? 'rect') === shape));
}

/**
 * Formas do vão presentes na lista, para o filtro "Forma do vão". Só há filtro quando existe mais de uma forma (lista só
 * de retangulares não mostra o campo): devolve [] nesse caso. A ordem segue `order` (a ordem das formas do modelo).
 */
export function shapesPresent(items: readonly TypeChoice[], order: readonly string[]): string[] {
  const present = new Set(items.map((t) => t.shape ?? 'rect'));
  return present.size > 1 ? order.filter((k) => present.has(k)) : [];
}

/**
 * Agrupa por família, na ordem em que cada família aparece. Os favoritos saem das suas famílias e formam o grupo do
 * topo (como no seletor da barra de opções). Grupo sem tipo não aparece.
 */
export function groupTypeChoices<T extends TypeChoice>(items: readonly T[], favoriteIds: readonly string[] = []): TypeChoiceGroup<T>[] {
  const fav = new Set(favoriteIds);
  const favorites = items.filter((t) => fav.has(t.id));
  const byFamily = new Map<string, T[]>();
  for (const t of items) {
    if (fav.has(t.id)) continue;
    const list = byFamily.get(t.family);
    if (list) list.push(t);
    else byFamily.set(t.family, [t]);
  }
  const groups: TypeChoiceGroup<T>[] = [];
  if (favorites.length) groups.push({ family: FAVORITES_LABEL, items: favorites });
  for (const [family, list] of byFamily) groups.push({ family, items: list });
  return groups;
}
