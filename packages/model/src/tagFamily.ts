import { textFor, type Lang } from './i18n.ts';
import type { ElementTag, Id, ProjectSettings } from './types.ts';

/**
 * Família de etiqueta (Revit: Tag Type; ArchiCAD: Label Style): como o rótulo é MONTADO (parâmetros do elemento
 * entre chaves), a forma do contorno e o tamanho do texto em mm de papel. Escolhida ao etiquetar e trocável depois.
 *
 * Compatibilidade: sem famílias gravadas valem as predefinidas; etiquetas antigas (sem `familyId`) continuam lendo
 * `ElementTag.property`. Campos opcionais, sem migração.
 */
export type TagShape = 'none' | 'circle' | 'hexagon' | 'rect';

export interface TagFamily {
  id: Id;
  name: string;
  /** Modelo do rótulo: `{mark}`, `{type}`, `{name}`, `{width}`, `{height}`, `{level}`; `\n` quebra a linha. */
  format: string;
  shape: TagShape;
  /** Altura do texto em mm de papel. */
  textMm: number;
  /** Fundo opaco (cor do papel) sob o rótulo: evita se perder sobre hachuras. */
  fill?: boolean;
}

export const TAG_TOKENS = ['mark', 'type', 'name', 'width', 'height', 'level'] as const;
export type TagToken = (typeof TAG_TOKENS)[number];
export const TAG_SHAPES: readonly TagShape[] = ['none', 'circle', 'hexagon', 'rect'];
export const TAG_FAMILY_NAME_MAX = 40;
export const TAG_FORMAT_MAX = 80;
export const TAG_TEXT_MM_MIN = 1;
export const TAG_TEXT_MM_MAX = 6;

/** Id da família implícita: o comportamento de antes das famílias (código do tipo, sem contorno). */
export const TAG_FAMILY_PADRAO: Id = 'tagfam_padrao';

/** Famílias predefinidas, na ordem da lista. */
export function tagPresets(lang: Lang = 'pt'): TagFamily[] {
  return [
    { id: TAG_FAMILY_PADRAO, name: textFor(lang, 'Padrão', 'Default'), format: '{type}', shape: 'none', textMm: 1.6 },
    { id: 'tagfam_marca', name: textFor(lang, 'Marca em círculo', 'Mark in circle'), format: '{mark}', shape: 'circle', textMm: 1.6, fill: true },
    { id: 'tagfam_esquadria', name: textFor(lang, 'Marca e medidas', 'Mark and size'), format: '{mark}\n{width}×{height}', shape: 'rect', textMm: 1.6, fill: true },
    { id: 'tagfam_tipo', name: textFor(lang, 'Tipo em hexágono', 'Type in hexagon'), format: '{type}', shape: 'hexagon', textMm: 1.6, fill: true },
  ];
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Família completa a partir de uma parcial (tolera arquivo antigo/intermediário). */
function complete(f: Partial<TagFamily> & { id: Id; name: string }): TagFamily {
  return {
    id: f.id,
    name: f.name,
    format: typeof f.format === 'string' ? f.format : '{type}',
    shape: TAG_SHAPES.includes(f.shape as TagShape) ? (f.shape as TagShape) : 'none',
    textMm: finite(f.textMm) ? f.textMm : 1.6,
    ...(f.fill === true ? { fill: true } : {}),
  };
}

/** Famílias do projeto já resolvidas: as gravadas ou, sem nenhuma, as predefinidas. */
export function tagFamiliesOf(settings: Partial<ProjectSettings> | undefined, lang: Lang = 'pt'): TagFamily[] {
  const saved = settings?.tagFamilies;
  if (Array.isArray(saved) && saved.length > 0) {
    return saved.filter((f): f is TagFamily => !!f && typeof f.id === 'string' && f.id !== '' && typeof f.name === 'string').map(complete);
  }
  return tagPresets(lang);
}

export function defaultTagFamilyIdOf(settings: Partial<ProjectSettings> | undefined): Id {
  const list = tagFamiliesOf(settings);
  const wanted = settings?.defaultTagFamilyId;
  if (wanted && list.some((f) => f.id === wanted)) return wanted;
  return list[0]!.id;
}

/** Família das etiquetas de esquadria: a escolhida no projeto ou, sem escolha, a marca em círculo (padrão do Revit: Mark). */
export function openingTagFamilyId(settings: Partial<ProjectSettings> | undefined): Id {
  const list = tagFamiliesOf(settings);
  if (settings?.defaultTagFamilyId && list.some((f) => f.id === settings.defaultTagFamilyId)) return settings.defaultTagFamilyId;
  return list.find((f) => f.id === 'tagfam_marca')?.id ?? list[0]!.id;
}

/** Família pelo id; ausente cai na padrão do projeto. */
export function tagFamilyOf(settings: Partial<ProjectSettings> | undefined, id: Id | undefined): TagFamily {
  const list = tagFamiliesOf(settings);
  return (id ? list.find((f) => f.id === id) : undefined) ?? list.find((f) => f.id === defaultTagFamilyIdOf(settings)) ?? list[0]!;
}

/** Família efetiva de UMA etiqueta; sem `familyId` ela vira a família equivalente ao `property` de antes. */
export function tagFamilyFor(settings: Partial<ProjectSettings> | undefined, tag: Pick<ElementTag, 'familyId' | 'property'>): TagFamily {
  if (tag.familyId) return tagFamilyOf(settings, tag.familyId);
  return { id: `legacy_${tag.property}`, name: tag.property, format: `{${tag.property}}`, shape: 'none', textMm: 1.6 };
}

/** Preenche o modelo com os valores; chave desconhecida fica como escrita. Linhas vazias somem. */
export function expandTagFormat(format: string, values: Partial<Record<TagToken, string>>): string {
  const out = format.replace(/\{(\w+)\}/g, (all, k: string) => (k in values ? (values[k as TagToken] ?? '') : all));
  return out.split('\n').map((l) => l.trim()).filter((l) => l !== '' && l !== '×').join('\n');
}

/** Tokens citados no modelo (para a interface avisar de chave inválida). */
export function tagFormatUnknownTokens(format: string): string[] {
  const bad = new Set<string>();
  for (const m of format.matchAll(/\{(\w*)\}/g)) if (!(TAG_TOKENS as readonly string[]).includes(m[1]!)) bad.add(m[1]!);
  return [...bad];
}

/** Motivo de recusa de uma família, ou null. */
export function tagFamilyIssue(family: Partial<TagFamily>, others: readonly TagFamily[] = [], lang: Lang = 'pt'): string | null {
  const name = typeof family.name === 'string' ? family.name.trim() : '';
  const locale = lang === 'pt' ? 'pt-BR' : 'en';
  if (!name) return textFor(lang, 'Informe o nome da família de etiqueta.', 'Enter the tag family name.');
  if (name.length > TAG_FAMILY_NAME_MAX) return textFor(lang, `O nome passa de ${TAG_FAMILY_NAME_MAX} caracteres.`, `The name is longer than ${TAG_FAMILY_NAME_MAX} characters.`);
  if (others.some((o) => o.id !== family.id && o.name.trim().toLocaleLowerCase(locale) === name.toLocaleLowerCase(locale))) {
    return textFor(lang, 'Já existe uma família de etiqueta com esse nome.', 'A tag family with that name already exists.');
  }
  const fmt = family.format;
  if (typeof fmt !== 'string' || fmt.trim() === '') return textFor(lang, 'O modelo do rótulo não pode ficar vazio.', 'The label format cannot be empty.');
  if (fmt.length > TAG_FORMAT_MAX) return textFor(lang, `O modelo passa de ${TAG_FORMAT_MAX} caracteres.`, `The format is longer than ${TAG_FORMAT_MAX} characters.`);
  const bad = tagFormatUnknownTokens(fmt);
  if (bad.length > 0) return textFor(lang, `Parâmetro desconhecido no modelo: {${bad[0]}}.`, `Unknown parameter in the format: {${bad[0]}}.`);
  if (!TAG_SHAPES.includes(family.shape as TagShape)) return textFor(lang, 'Forma de etiqueta desconhecida.', 'Unknown tag shape.');
  if (!finite(family.textMm) || family.textMm < TAG_TEXT_MM_MIN || family.textMm > TAG_TEXT_MM_MAX) {
    return textFor(lang, `A altura do texto deve ficar entre ${TAG_TEXT_MM_MIN} e ${TAG_TEXT_MM_MAX} mm.`, `Text height must be between ${TAG_TEXT_MM_MIN} and ${TAG_TEXT_MM_MAX} mm.`);
  }
  return null;
}

/** Grava a família (substitui pelo id; parte das predefinidas quando ainda não havia lista gravada). */
export function writeTagFamily(settings: ProjectSettings, family: TagFamily): ProjectSettings {
  const list = tagFamiliesOf(settings);
  const index = list.findIndex((f) => f.id === family.id);
  if (index >= 0) list[index] = family;
  else list.push(family);
  return { ...settings, tagFamilies: list };
}

/** Lista sem a família pedida (a última restante não sai) e com o padrão revalidado. */
export function removeTagFamilyFrom(settings: ProjectSettings, id: Id): ProjectSettings {
  const list = tagFamiliesOf(settings).filter((f) => f.id !== id);
  if (list.length === 0) return settings;
  const next: ProjectSettings = { ...settings, tagFamilies: list };
  if (settings.defaultTagFamilyId === id) delete next.defaultTagFamilyId;
  return next;
}

/** Rascunho de família nova a partir de outra, com nome único. */
export function tagFamilyDraft(settings: Partial<ProjectSettings> | undefined, base?: Partial<TagFamily>, lang: Lang = 'pt'): TagFamily {
  const list = tagFamiliesOf(settings, lang);
  const root = base?.name ? textFor(lang, `${base.name} (cópia)`, `${base.name} (copy)`) : textFor(lang, 'Nova etiqueta', 'New tag');
  const taken = new Set(list.map((f) => f.name.toLocaleLowerCase()));
  let name = root;
  let n = 1;
  while (taken.has(name.toLocaleLowerCase())) { n += 1; name = `${root} ${n}`; }
  return { ...complete({ id: `tagfam_${Math.random().toString(36).slice(2, 10)}`, name, ...(base ?? {}) }), id: `tagfam_${Math.random().toString(36).slice(2, 10)}`, name };
}
