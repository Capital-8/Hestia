import type { DimensionStyle, Project } from '@hestia/model';
import { useI18n, type Lang } from '../editor/i18n.ts';
import { familyName, openingFamilyName } from './typeFamilies.ts';
import type { TypeOption } from './TypeSelector.tsx';

/** Opções do seletor de tipo de cada categoria: a lista, a família de agrupamento e o que a prévia desenha. */

export function wallOptions(p: Project, lang: Lang = useI18n.getState().lang): TypeOption[] {
  return Object.values(p.wallTypes).map((t) => ({ id: t.id, name: t.name, code: t.code, family: familyName('wall', lang), subject: { kind: 'wall', type: t, materials: p.materials } }));
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
export function openingOptions(p: Project, kind: 'door' | 'window', lang: Lang = useI18n.getState().lang): TypeOption[] {
  return Object.values(p.openingTypes)
    .filter((t) => t.kind === kind)
    .map((t) => ({ id: t.id, name: t.name, code: t.code ?? '', family: openingFamilyName(t, lang), subject: { kind, type: t } }));
}

/** Famílias de cota (a Padrão inclusa): a lista do seletor, todas no grupo da categoria `family`. */
export function dimensionOptions(familias: ReadonlyArray<{ id: string; name: string } & DimensionStyle>, family: string): TypeOption[] {
  return familias.map((f) => ({ id: f.id, name: f.name, code: '', family, subject: { kind: 'dimension', style: f } }));
}
