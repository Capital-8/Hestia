import type { Familia } from '../tipos.ts';
import { HVAC_DUTOS } from './hvacDutos.ts';
import { HVAC_TERMINAIS } from './hvacTerminais.ts';

/*
 * HVAC (ficha F8, ADR 0061): dutos de ar e terminais. Fora de BIBLIOTECA_BASE (é a lista MEP, como a tubulação). Os ids são
 * fam_duto_*, fam_difusor_*, fam_grelha e fam_split_evaporadora. Cada família tem disciplina `hvac` e domínios de ar ou de
 * refrigerante nas ligações.
 */

/** Famílias de HVAC: dutos (retangular, redondo, duas curvas, redução), difusores, grelha e split. */
export const HVAC: Familia[] = [...HVAC_DUTOS, ...HVAC_TERMINAIS];
