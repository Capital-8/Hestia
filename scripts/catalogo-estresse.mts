// Catálogo de aberturas que os geradores de estresse sorteiam. Os geradores escolhem tipos por ÍNDICE (`tipos[floor(r() * n)]`):
// acrescentar um tipo ao catálogo de produção muda o tamanho de `n` e, com isso, toda a sequência aleatória de cada semente.
// Para que as sequências das semeaduras fiquem fixas, o sorteio usa somente os tipos que já existiam quando as sementes foram
// fixadas: a lista `IDS_TIPOS_ABERTURA_ANTIGOS` abaixo (130 ids, na ordem do catálogo de então).
//
// Os 24 tipos acrescentados depois são as portas de alumínio, PVC e vidro temperado de `packages/model/src/catalogoPortas.ts`
// (ff5f3267): todos os ids novos terminam em `_alu`, `_pvc` ou `_vid` e nenhum dos 130 antigos termina assim (conferido contra o
// catálogo de `ff5f3267^`, que tem 130 tipos, e o de HEAD, que tem 154). Esses 24 continuam no projeto e podem ser escolhidos
// à mão; só não entram no sorteio. Mudar esta lista muda as sequências dos testes de estresse: faça-o de propósito.
// Teste de sanidade: `tests/kernel-a3b-referencia.test.ts` ("tipos de abertura novos").

import type { OpeningType, Project } from '@hestia/model';

/** Os 130 ids do catálogo de aberturas anterior ao acréscimo de portas alu/pvc/vid (ordem original). */
export const IDS_TIPOS_ABERTURA_ANTIGOS: ReadonlySet<string> = new Set([
  'ot_p70', 'ot_p80', 'ot_p90', 'ot_p160', 'ot_pc160', 'ot_pp80', 'ot_vao90', 'ot_pvv90', 'ot_pe80', 'ot_pd120',
  'ot_ps90', 'ot_pg300', 'ot_j120', 'ot_j150', 'ot_j60', 'ot_j200', 'ot_jfixa60', 'ot_j240', 'ot_jv120', 'ot_ja120',
  'ot_jg90', 'ot_jp80', 'ot_jv80', 'ot_jb80', 'ot_pgiro60', 'ot_pgiro70', 'ot_pgiro80', 'ot_pgiro90', 'ot_pgiro100', 'ot_pgiro2_120',
  'ot_pgiro2_140', 'ot_pgiro2_160', 'ot_pgiro2_180', 'ot_pbalcao120', 'ot_pbalcao150', 'ot_pbalcao200', 'ot_pcorrer160', 'ot_pcorrer180', 'ot_pembutir80', 'ot_pembutir90',
  'ot_ppiv100', 'ot_ppiv120', 'ot_pcamarao2_160', 'ot_pcamarao4_240', 'ot_pvai80', 'ot_pvai90', 'ot_pvai100', 'ot_psanf60', 'ot_psanf70', 'ot_psanf80',
  'ot_psanf90', 'ot_pvid72_8', 'ot_pvid72_10', 'ot_pvid82_8', 'ot_pvid82_10', 'ot_pvid92_8', 'ot_pvid92_10', 'ot_pf30_80', 'ot_pf30_90', 'ot_pf60_80',
  'ot_pf60_90', 'ot_pf90_80', 'ot_pf90_90', 'ot_pf120_80', 'ot_pf120_90', 'ot_pbasc250', 'ot_penrol280', 'ot_jc2_120x100', 'ot_jc2_150x120', 'ot_jc2_120x150',
  'ot_jc3_150x100', 'ot_jc3_200x120', 'ot_jc4_200x100', 'ot_jc4_200x120', 'ot_jc4_240x120', 'ot_jm_40x40', 'ot_jm_50x50', 'ot_jm_80x60', 'ot_jm_80x80', 'ot_jm_100x100',
  'ot_jb_40x40', 'ot_jb_60x40', 'ot_jb_80x40', 'ot_jb_100x40', 'ot_jb_60x60', 'ot_jb_80x60', 'ot_jb_100x60', 'ot_jb_100x100', 'ot_jpv_60x60', 'ot_jpv_80x80',
  'ot_jpv_100x100', 'ot_jpv_120x120', 'ot_jg_60x120', 'ot_jg_80x120', 'ot_jg_100x150', 'ot_jab_60x60', 'ot_jab_80x80', 'ot_jab_100x100', 'ot_jab2_150x120', 'ot_jf_80x60',
  'ot_jf_120x120', 'ot_jven_120x100', 'ot_jven_150x100', 'ot_jban_90x40', 'ot_jban_90x60', 'ot_jbanh_100x50', 'ot_pband40_90', 'ot_pband60_90', 'ot_plat40e_80', 'ot_plat40d_80',
  'ot_plat40e_90', 'ot_plat40d_90', 'ot_plat2_80', 'ot_plat2_90', 'ot_pband_lat2_90', 'ot_ppainel_90', 'ot_pbalcao_band120', 'ot_pcorrer_band160', 'ot_pband40_alu_90', 'ot_pband40_pvc_90',
  'ot_plat2_alu_90', 'ot_jcomb_fa150x120', 'ot_jcomb_fc180x120', 'ot_jabr_fa160x120', 'ot_jband_100x150', 'ot_jcorrer_band200x150', 'ot_jalta_80x210', 'ot_jcomb_madeira_150x120', 'ot_jcomb_pvc_150x120', 'ot_jalta_madeira_80x210',
]);

/**
 * Tipos de abertura que um gerador de estresse pode sortear, na ordem do catálogo do projeto, sem os acrescentados depois de
 * `IDS_TIPOS_ABERTURA_ANTIGOS`. Os tipos continuam no projeto; só saem do sorteio.
 */
export function tiposDeAberturaParaSorteio(p: Pick<Project, 'openingTypes'>): OpeningType[] {
  return Object.values(p.openingTypes).filter((t) => IDS_TIPOS_ABERTURA_ANTIGOS.has(t.id));
}
