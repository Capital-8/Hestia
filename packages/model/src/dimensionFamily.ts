import { DEFAULT_DIMENSION_STYLE, dimensionStyleOf } from './dimensionStyle.ts';
import { t, type Lang } from './i18n.ts';
import type { DimReadConvention, DimTextFit, DimensionStyle } from './dimensionContract.ts';
import type { Dimension, Id, ProjectSettings } from './types.ts';

/**
 * Família de cotas (Revit: Dimension Type; ArchiCAD: Dimension Marker/Text): a aparência de cota com **nome**, escolhida
 * na criação e trocável depois. Substitui o conjunto de campos soltos que a barra de opções gravava cota por cota.
 *
 * Compatibilidade: sem famílias gravadas, o projeto continua usando o estilo global (`settings.dimensionStyle`, decisão
 * 0037 §3); a família implícita `Padrão` é o próprio estilo global. Nada de migração nem `SCHEMA_VERSION` novo: os
 * campos são opcionais e arquivos antigos leem como “só a família Padrão”.
 */
export interface DimensionFamily extends DimensionStyle {
  id: Id;
  /** Nome mostrado na barra de opções, no painel e no diálogo (único no projeto). */
  name: string;
}

/** Id da família implícita: o estilo do projeto de antes das famílias (não é gravado em `dimensionFamilies`). */
export const DIM_FAMILY_PADRAO: Id = 'fam_padrao';
/** Nome da família implícita no idioma pedido. */
export function dimFamilyDefaultName(lang: Lang = 'pt'): string {
  return t(lang, 'md_dim_family_default');
}
/** Nome da família implícita em PT (compatibilidade). */
export const DIM_FAMILY_PADRAO_NAME = dimFamilyDefaultName('pt');
/** Limite de tamanho do nome da família. */
export const DIM_FAMILY_NAME_MAX = 40;

/** Convenções de leitura oferecidas na interface, na ordem, no idioma pedido. */
export function dimReadConventionOptions(lang: Lang = 'pt'): ReadonlyArray<{ value: DimReadConvention; label: string }> {
  return [
    { value: 'aligned', label: t(lang, 'md_dim_read_aligned') },
    { value: 'upright', label: t(lang, 'md_dim_read_upright') },
    { value: 'horizontal', label: t(lang, 'md_dim_read_horizontal') },
  ];
}

/** Comportamento do valor quando não cabe no trecho, na ordem da interface, no idioma pedido. */
export function dimTextFitOptions(lang: Lang = 'pt'): ReadonlyArray<{ value: DimTextFit; label: string }> {
  return [
    { value: 'leader', label: t(lang, 'md_dim_fit_leader') },
    { value: 'inside', label: t(lang, 'md_dim_fit_inside') },
    { value: 'outside', label: t(lang, 'md_dim_fit_outside') },
  ];
}

/** Convenções em PT (compatibilidade); use `dimReadConventionOptions(lang)` para o idioma ativo. */
export const DIM_READ_CONVENTION_OPTIONS: ReadonlyArray<{ value: DimReadConvention; label: string }> = dimReadConventionOptions('pt');

/** Ajuste de texto em PT (compatibilidade); use `dimTextFitOptions(lang)` para o idioma ativo. */
export const DIM_TEXT_FIT_OPTIONS: ReadonlyArray<{ value: DimTextFit; label: string }> = dimTextFitOptions('pt');

const isReadConvention = (v: unknown): v is DimReadConvention => DIM_READ_CONVENTION_OPTIONS.some((o) => o.value === v);
const isTextFit = (v: unknown): v is DimTextFit => DIM_TEXT_FIT_OPTIONS.some((o) => o.value === v);

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Estilo de uma família: os campos gravados sobre o padrão (tolera família parcial de arquivo antigo/intermediário). */
export function dimensionFamilyStyle(family: Partial<DimensionFamily>): DimensionStyle {
  const { id: _id, name: _name, ...rest } = family;
  void _id; void _name;
  return { ...DEFAULT_DIMENSION_STYLE, ...rest };
}

/**
 * Famílias do projeto já resolvidas. Sem nenhuma gravada, devolve a família implícita `Padrão` com o estilo global do
 * projeto — é o que o diálogo mostra e o que a criação usa por padrão.
 */
export function dimensionFamiliesOf(settings: Partial<ProjectSettings> | undefined, lang: Lang = 'pt'): DimensionFamily[] {
  const saved = settings?.dimensionFamilies;
  if (Array.isArray(saved) && saved.length > 0) {
    return saved
      .filter((f): f is DimensionFamily => !!f && typeof f.id === 'string' && f.id !== '' && typeof f.name === 'string')
      .map((f) => ({ id: f.id, name: f.name, ...dimensionFamilyStyle(f) }));
  }
  return [{ id: DIM_FAMILY_PADRAO, name: dimFamilyDefaultName(lang), ...dimensionStyleOf(settings) }];
}

/** Id da família padrão: a escolhida no projeto, senão a família implícita. */
export function defaultDimensionFamilyIdOf(settings: Partial<ProjectSettings> | undefined): Id {
  const list = dimensionFamiliesOf(settings);
  const wanted = settings?.defaultDimensionFamilyId;
  if (wanted && list.some((f) => f.id === wanted)) return wanted;
  return list[0]!.id;
}

/** Família pelo id (resolvida); ausente/inválida devolve `undefined`. */
export function dimensionFamilyOf(settings: Partial<ProjectSettings> | undefined, id: Id | undefined): DimensionFamily | undefined {
  if (!id) return undefined;
  return dimensionFamiliesOf(settings).find((f) => f.id === id);
}

/** Estilo de uma família pelo id; sem id ou id inexistente cai na família padrão. */
export function dimensionFamilyStyleOf(settings: Partial<ProjectSettings> | undefined, id: Id | undefined): DimensionStyle {
  const list = dimensionFamiliesOf(settings);
  const family = (id ? list.find((f) => f.id === id) : undefined) ?? list.find((f) => f.id === defaultDimensionFamilyIdOf(settings)) ?? list[0]!;
  return dimensionFamilyStyle(family);
}

/**
 * Estilo efetivo de UMA cota: a família gravada nela (`Dimension.familyId`) ou, sem família, o estilo global do projeto
 * (comportamento antigo). Os campos de estilo da própria cota continuam sobrepondo no desenho (`effectiveDimStyle`).
 */
export function dimensionStyleFor(settings: Partial<ProjectSettings> | undefined, d: Pick<Dimension, 'familyId'>): DimensionStyle {
  if (!d.familyId) return dimensionStyleOf(settings);
  const family = dimensionFamilyOf(settings, d.familyId);
  return family ? dimensionFamilyStyle(family) : dimensionStyleOf(settings);
}

/** Família nova (rascunho) a partir de outra família ou do padrão do projeto; nome único garantido pelo chamador. */
export function dimensionFamilyDraft(settings: Partial<ProjectSettings> | undefined, base?: Partial<DimensionFamily>, lang: Lang = 'pt'): DimensionFamily {
  const style = base ? dimensionFamilyStyle(base) : dimensionStyleOf(settings);
  const list = dimensionFamiliesOf(settings, lang);
  const locale = lang === 'en' ? 'en' : 'pt-BR';
  let name = base?.name
    ? t(lang, 'md_dim_family_copy', { name: base.name })
    : t(lang, 'md_dim_family_new');
  let n = 1;
  const taken = new Set(list.map((f) => f.name.toLocaleLowerCase(locale)));
  while (taken.has(name.toLocaleLowerCase(locale))) {
    n += 1;
    name = base?.name
      ? t(lang, 'md_dim_family_copy_n', { name: base.name, n })
      : t(lang, 'md_dim_family_new_n', { n });
  }
  return { id: `fam_${Math.random().toString(36).slice(2, 10)}`, name, ...style };
}

/**
 * Motivo de recusa de uma família, ou null. `others` são as demais famílias do projeto (nome único, sem diferenciar
 * maiúsculas). Medidas em mm de papel com faixas plausíveis: um valor absurdo é recusado em vez de virar desenho torto.
 */
export function dimensionFamilyIssue(family: Partial<DimensionFamily>, others: readonly DimensionFamily[] = [], lang: Lang = 'pt'): string | null {
  const name = typeof family.name === 'string' ? family.name.trim() : '';
  const locale = lang === 'en' ? 'en' : 'pt-BR';
  if (!name) return t(lang, 'md_dim_name_required');
  if (name.length > DIM_FAMILY_NAME_MAX) return t(lang, 'md_dim_name_max', { n: DIM_FAMILY_NAME_MAX });
  if (others.some((o) => o.id !== family.id && o.name.trim().toLocaleLowerCase(locale) === name.toLocaleLowerCase(locale))) {
    return t(lang, 'md_dim_name_duplicate');
  }
  const nums: Array<[keyof DimensionStyle, string, number, number]> = [
    ['tickSize', t(lang, 'md_dim_tick_size'), 0.5, 10],
    ['textHeight', t(lang, 'md_dim_text_height'), 0.5, 15],
    ['extensionGap', t(lang, 'md_dim_extension_gap'), 0, 10],
    ['extensionOvershoot', t(lang, 'md_dim_extension_overshoot'), 0, 10],
    ['textGap', t(lang, 'md_dim_text_gap'), 0, 10],
    ['stackSpacing', t(lang, 'md_dim_stack_spacing'), 1, 50],
  ];
  for (const [key, label, min, max] of nums) {
    const v = family[key];
    if (!finite(v)) return t(lang, 'md_dim_value_mm', { label });
    if (v < min || v > max) return t(lang, 'md_dim_value_range', { label, min, max });
  }
  if (typeof family.font !== 'string' || family.font.trim() === '') return t(lang, 'md_dim_font_required');
  if (family.tick !== undefined && !['slash', 'arrow', 'dot', 'arrow-open', 'arrow-filled'].includes(family.tick)) return t(lang, 'md_dim_tick_unknown');
  if (family.textPlacement !== undefined && family.textPlacement !== 'above' && family.textPlacement !== 'centered') return t(lang, 'md_dim_placement_unknown');
  if (family.readConvention !== undefined && !isReadConvention(family.readConvention)) return t(lang, 'md_dim_read_unknown');
  if (family.textFit !== undefined && !isTextFit(family.textFit)) return t(lang, 'md_dim_fit_unknown');
  if (family.unit !== undefined && !['project', 'm', 'cm', 'mm'].includes(family.unit)) return t(lang, 'md_dim_unit_unknown');
  if (family.precision !== undefined && ![0, 1, 2, 3].includes(family.precision)) return t(lang, 'md_dim_precision_range');
  if (typeof family.prefix === 'string' && family.prefix.length > 12) return t(lang, 'md_dim_prefix_max');
  if (typeof family.suffix === 'string' && family.suffix.length > 12) return t(lang, 'md_dim_suffix_max');
  return null;
}

/**
 * Grava a família na lista de `settings.dimensionFamilies` (substituindo pelo id quando já existe). Mantém o estilo
 * global antigo intacto: cotas sem `familyId` continuam lendo `settings.dimensionStyle`.
 */
export function writeDimensionFamily(settings: ProjectSettings, family: DimensionFamily): ProjectSettings {
  const list = Array.isArray(settings.dimensionFamilies) ? [...settings.dimensionFamilies] : [];
  // A família implícita `Padrão` não é gravada: ela é o próprio estilo global (mesma fonte de verdade de antes).
  if (family.id === DIM_FAMILY_PADRAO) {
    const { id: _id, name: _name, ...style } = family;
    void _id; void _name;
    return { ...settings, dimensionStyle: { ...(settings.dimensionStyle ?? {}), ...style } };
  }
  const index = list.findIndex((f) => f.id === family.id);
  if (index >= 0) list[index] = family;
  else list.push(family);
  return { ...settings, dimensionFamilies: list };
}

/** Lista sem a família pedida (a implícita `Padrão` não removível) e com o padrão do projeto revalidado. */
export function removeDimensionFamilyFrom(settings: ProjectSettings, id: Id): ProjectSettings {
  if (id === DIM_FAMILY_PADRAO) return settings;
  const list = (settings.dimensionFamilies ?? []).filter((f) => f.id !== id);
  const rest: ProjectSettings = { ...settings };
  if (list.length > 0) rest.dimensionFamilies = list;
  else delete rest.dimensionFamilies;
  if (settings.defaultDimensionFamilyId === id) delete rest.defaultDimensionFamilyId;
  return rest;
}
