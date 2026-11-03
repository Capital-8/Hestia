import type { Familia } from '../tipos.ts';
import { FAMILIA_ARMARIO } from '../exemplos.ts';
import { COZINHA } from './cozinha.ts';
import { DORMITORIO } from './dormitorio.ts';
import { GERAL } from './geral.ts';
import { SALA_AREAS } from './salaAreas.ts';
import { FAMILIA_GAVETA } from './gaveta.ts';

/*
 * Biblioteca base de famílias AUTORAIS do Hestia (ADR 0049 §3.3: nenhum ativo de terceiros). Cada grupo vive em seu arquivo; este
 * registro só junta. Medidas em mm; as regras de montagem e as folgas são PROPOSTAS do Hestia, a validar com marceneiro ou fabricante.
 * Uma família pode aninhar `fam_gaveta` e `fam_armario_baixo` (o teste de biblioteca entrega a lista toda como `biblioteca`).
 */

export { FAMILIA_GAVETA };
export const BIBLIOTECA_BASE: readonly Familia[] = [FAMILIA_ARMARIO, FAMILIA_GAVETA, ...COZINHA, ...DORMITORIO, ...SALA_AREAS, ...GERAL];

/** Ids que cada grupo TEM de conter (o teste confere). */
export const IDS_OBRIGATORIOS = {
  cozinha: ['fam_base_gavetas', 'fam_base_pia', 'fam_base_cooktop', 'fam_aereo', 'fam_aereo_basculante', 'fam_torre_forno', 'fam_paneleiro', 'fam_canto_l'],
  dormitorio: ['fam_guarda_roupa_modulo', 'fam_guarda_roupa_conjunto', 'fam_comoda', 'fam_criado_mudo', 'fam_cama_bau', 'fam_painel_tv'],
  salaAreas: ['fam_rack', 'fam_estante', 'fam_mesa_gaveteiro', 'fam_gabinete_banheiro', 'fam_armario_lavanderia', 'fam_escrivaninha'],
  geral: ['fam_modulo_branco', 'fam_bloco_livre', 'fam_mesa', 'fam_banco', 'fam_prateleira', 'fam_painel_ripado'],
} as const;

export function familiaDaBiblioteca(id: string): Familia | undefined {
  return BIBLIOTECA_BASE.find((f) => f.id === id);
}
