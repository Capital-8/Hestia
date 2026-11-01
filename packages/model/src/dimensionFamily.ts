import { DEFAULT_DIMENSION_STYLE, dimensionStyleOf } from './dimensionStyle.ts';
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
/** Nome da família implícita. */
export const DIM_FAMILY_PADRAO_NAME = 'Padrão';
/** Limite de tamanho do nome da família. */
export const DIM_FAMILY_NAME_MAX = 40;

/** Convenções de leitura oferecidas na interface, na ordem. */
export const DIM_READ_CONVENTION_OPTIONS: ReadonlyArray<{ value: DimReadConvention; label: string }> = [
  { value: 'aligned', label: 'Acompanha a cota (legível por baixo)' },
  { value: 'upright', label: 'Acompanha a cota (nunca de cabeça para baixo)' },
  { value: 'horizontal', label: 'Sempre horizontal' },
];

/** Comportamento do valor quando não cabe no trecho, na ordem da interface. */
export const DIM_TEXT_FIT_OPTIONS: ReadonlyArray<{ value: DimTextFit; label: string }> = [
  { value: 'leader', label: 'Afastar com linha de chamada' },
  { value: 'inside', label: 'Manter dentro do trecho' },
  { value: 'outside', label: 'Sempre fora, com linha de chamada' },
];

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
export function dimensionFamiliesOf(settings: Partial<ProjectSettings> | undefined): DimensionFamily[] {
  const saved = settings?.dimensionFamilies;
  if (Array.isArray(saved) && saved.length > 0) {
    return saved
      .filter((f): f is DimensionFamily => !!f && typeof f.id === 'string' && f.id !== '' && typeof f.name === 'string')
      .map((f) => ({ id: f.id, name: f.name, ...dimensionFamilyStyle(f) }));
  }
  return [{ id: DIM_FAMILY_PADRAO, name: DIM_FAMILY_PADRAO_NAME, ...dimensionStyleOf(settings) }];
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
export function dimensionFamilyDraft(settings: Partial<ProjectSettings> | undefined, base?: Partial<DimensionFamily>): DimensionFamily {
  const style = base ? dimensionFamilyStyle(base) : dimensionStyleOf(settings);
  const list = dimensionFamiliesOf(settings);
  let name = base?.name ? `${base.name} (cópia)` : 'Nova família';
  let n = 1;
  const taken = new Set(list.map((f) => f.name.toLocaleLowerCase('pt-BR')));
  while (taken.has(name.toLocaleLowerCase('pt-BR'))) {
    n += 1;
    name = base?.name ? `${base.name} (cópia ${n})` : `Nova família ${n}`;
  }
  return { id: `fam_${Math.random().toString(36).slice(2, 10)}`, name, ...style };
}

/**
 * Motivo de recusa de uma família, ou null. `others` são as demais famílias do projeto (nome único, sem diferenciar
 * maiúsculas). Medidas em mm de papel com faixas plausíveis: um valor absurdo é recusado em vez de virar desenho torto.
 */
export function dimensionFamilyIssue(family: Partial<DimensionFamily>, others: readonly DimensionFamily[] = []): string | null {
  const name = typeof family.name === 'string' ? family.name.trim() : '';
  if (!name) return 'A família de cotas precisa de nome.';
  if (name.length > DIM_FAMILY_NAME_MAX) return `O nome da família deve ter até ${DIM_FAMILY_NAME_MAX} caracteres.`;
  if (others.some((o) => o.id !== family.id && o.name.trim().toLocaleLowerCase('pt-BR') === name.toLocaleLowerCase('pt-BR'))) {
    return 'Já existe uma família de cotas com esse nome.';
  }
  const nums: Array<[keyof DimensionStyle, string, number, number]> = [
    ['tickSize', 'tamanho do marcador', 0.5, 10],
    ['textHeight', 'altura do texto', 0.5, 15],
    ['extensionGap', 'folga da linha de extensão', 0, 10],
    ['extensionOvershoot', 'ultrapassagem da linha de extensão', 0, 10],
    ['textGap', 'folga do texto', 0, 10],
    ['stackSpacing', 'espaçamento entre cotas empilhadas', 1, 50],
  ];
  for (const [key, label, min, max] of nums) {
    const v = family[key];
    if (!finite(v)) return `Informe o ${label} em mm.`;
    if (v < min || v > max) return `O ${label} deve ficar entre ${min} e ${max} mm.`;
  }
  if (typeof family.font !== 'string' || family.font.trim() === '') return 'Informe a fonte do texto da cota.';
  if (family.tick !== undefined && !['slash', 'arrow', 'dot', 'arrow-open', 'arrow-filled'].includes(family.tick)) return 'Marcador de cota desconhecido.';
  if (family.textPlacement !== undefined && family.textPlacement !== 'above' && family.textPlacement !== 'centered') return 'Posição do texto da cota desconhecida.';
  if (family.readConvention !== undefined && !isReadConvention(family.readConvention)) return 'Convenção de leitura desconhecida.';
  if (family.textFit !== undefined && !isTextFit(family.textFit)) return 'Comportamento do texto fora do trecho desconhecido.';
  if (family.unit !== undefined && !['project', 'm', 'cm', 'mm'].includes(family.unit)) return 'Unidade da cota desconhecida.';
  if (family.precision !== undefined && ![0, 1, 2, 3].includes(family.precision)) return 'Precisão da cota fora de 0 a 3.';
  if (typeof family.prefix === 'string' && family.prefix.length > 12) return 'O prefixo da cota deve ter até 12 caracteres.';
  if (typeof family.suffix === 'string' && family.suffix.length > 12) return 'O sufixo da cota deve ter até 12 caracteres.';
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
