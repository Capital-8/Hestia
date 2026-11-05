import { openingFamilyOf, type OpeningType } from '@hestia/model';
import { t, useI18n, type Lang } from '../editor/i18n.ts';

export type FamilyKind = 'wall' | 'floor' | 'slab' | 'ceiling' | 'roof' | 'stair';

const FAMILY_KEY = {
  wall: 'prc_fam_wall',
  floor: 'prc_fam_floor',
  slab: 'prc_fam_slab',
  ceiling: 'prc_fam_ceiling',
  roof: 'prc_fam_roof',
  stair: 'prc_fam_stair',
} as const;

/** Família exibida no seletor de tipo e no cabeçalho do diálogo: cada categoria tem uma família única. */
export function familyName(kind: FamilyKind, lang: Lang): string {
  return t(lang, FAMILY_KEY[kind]);
}

/**
 * Leitura da família no idioma ativo por acesso (`FAMILY.wall`): os consumidores que ainda não recebem `lang`
 * continuam funcionando e já exibem o texto traduzido. Código novo deve chamar `familyName(kind, lang)`.
 */
export const FAMILY: Record<FamilyKind, string> = {
  get wall() { return familyName('wall', useI18n.getState().lang); },
  get floor() { return familyName('floor', useI18n.getState().lang); },
  get slab() { return familyName('slab', useI18n.getState().lang); },
  get ceiling() { return familyName('ceiling', useI18n.getState().lang); },
  get roof() { return familyName('roof', useI18n.getState().lang); },
  get stair() { return familyName('stair', useI18n.getState().lang); },
};

/** Família de uma abertura (Porta de giro, Janela de correr…); tipo sem família válida cai em "Outros". */
export function openingFamilyName(tp: Pick<OpeningType, 'kind' | 'plan' | 'leaves'>, lang: Lang = useI18n.getState().lang): string {
  return openingFamilyOf(tp, lang)?.name ?? t(lang, 'prc_fam_other');
}
