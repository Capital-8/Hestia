import { embutirNaCortina, type DimensionStyle, type OpeningType, type Project } from '@hestia/model';
import { t as traduzir, useI18n, type Lang } from '../editor/i18n.ts';
import { familyName, openingFamilyName } from './typeFamilies.ts';
import type { TypeOption } from './TypeSelector.tsx';

/** Opções do seletor de tipo de cada categoria: a lista, a família de agrupamento e o que a prévia desenha. */

/** Paredes: o grupo é "Parede básica" ou "Parede cortina", conforme a família do tipo (decisão 0056, §4.7). */
export function wallOptions(p: Project, lang: Lang = useI18n.getState().lang): TypeOption[] {
  return Object.values(p.wallTypes).map((t) => ({
    id: t.id,
    name: t.name,
    code: t.code,
    family: t.family === 'curtain' ? traduzir(lang, 'pct_fam_curtain') : familyName('wall', lang),
    subject: { kind: 'wall', type: t, materials: p.materials },
  }));
}

export function floorOptions(p: Project, lang: Lang = useI18n.getState().lang): TypeOption[] {
  return Object.values(p.floorTypes).map((t) => ({ id: t.id, name: t.name, code: t.code, family: familyName('floor', lang), subject: { kind: 'floor', type: t, materials: p.materials } }));
}

export function slabOptions(p: Project, lang: Lang = useI18n.getState().lang): TypeOption[] {
  return Object.values(p.slabTypes).map((t) => ({ id: t.id, name: t.name, code: t.code, family: familyName('slab', lang), subject: { kind: 'slab', type: t, materials: p.materials } }));
}

export function ceilingOptions(p: Project, lang: Lang = useI18n.getState().lang): TypeOption[] {
  return Object.values(p.ceilingTypes).map((t) => ({ id: t.id, name: t.name, code: t.code, family: familyName('ceiling', lang), subject: { kind: 'ceiling', type: t, materials: p.materials } }));
}

export function roofOptions(p: Project, lang: Lang = useI18n.getState().lang): TypeOption[] {
  return Object.values(p.roofTypes).map((t) => ({ id: t.id, name: t.name, code: t.code, family: familyName('roof', lang), subject: { kind: 'roof', type: t, materials: p.materials } }));
}

export function stairOptions(p: Project, lang: Lang = useI18n.getState().lang): TypeOption[] {
  return Object.values(p.stairTypes).map((t) => ({ id: t.id, name: t.name, code: t.code, family: familyName('stair', lang), subject: { kind: 'stair', type: t } }));
}

export function rampOptions(p: Project, lang: Lang = useI18n.getState().lang): TypeOption[] {
  return Object.values(p.rampTypes).map((t) => ({ id: t.id, name: t.name, code: t.code, family: familyName('stair', lang), subject: { kind: 'ramp', type: t } }));
}

/** Portas (kind `door`) ou janelas (`window`), com a família do símbolo de planta (Porta de giro, Janela de correr…). */
export function openingOptions(p: Project, kind: 'door' | 'window', lang: Lang = useI18n.getState().lang, aceita: (t: OpeningType) => boolean = () => true): TypeOption[] {
  return Object.values(p.openingTypes)
    .filter((t) => t.kind === kind && aceita(t))
    .map((t) => ({ id: t.id, name: t.name, code: t.code ?? '', family: openingFamilyName(t, lang), subject: { kind, type: t } }));
}

/** Esquadrias oferecidas numa célula de parede cortina: sem as de embutir (a cavidade de parede não existe na cortina). */
export function openingOptionsDaCortina(p: Project, kind: 'door' | 'window', lang: Lang = useI18n.getState().lang): TypeOption[] {
  return openingOptions(p, kind, lang, (t) => !embutirNaCortina(t));
}

/** Tipos de guarda-corpo: a lista do seletor, todos no grupo `family` (o rótulo vem de quem chama, no idioma ativo). */
export function guardaCorpoOptions(p: Project, family: string): TypeOption[] {
  return Object.values(p.tiposGuardaCorpo ?? {}).map((t) => ({ id: t.id, name: t.name, code: t.code, family, subject: { kind: 'railing', type: t } }));
}

/** Famílias de cota (a Padrão inclusa): a lista do seletor, todas no grupo da categoria `family`. */
export function dimensionOptions(familias: ReadonlyArray<{ id: string; name: string } & DimensionStyle>, family: string): TypeOption[] {
  return familias.map((f) => ({ id: f.id, name: f.name, code: '', family, subject: { kind: 'dimension', style: f } }));
}

/** Tipos de estrutura (pilar, viga, fundação): a lista do seletor, com a família de agrupamento dada por `family` (idioma ativo). */
export function estrOptions<T extends { id: string; name: string; code: string }>(tipos: readonly T[], family: (tp: T) => string): TypeOption[] {
  return tipos.map((tp) => ({ id: tp.id, name: tp.name, code: tp.code, family: family(tp), subject: { kind: 'estr', type: { code: tp.code } } }));
}
