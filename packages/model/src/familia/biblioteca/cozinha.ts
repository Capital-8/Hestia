import type { Familia } from '../tipos.ts';
import { FAMILIA_AEREO, FAMILIA_AEREO_BASCULANTE } from './cozinhaAereos.ts';
import { FAMILIA_BASE_COOKTOP, FAMILIA_BASE_GAVETAS, FAMILIA_BASE_PIA } from './cozinhaBases.ts';
import { FAMILIA_CANTO_L } from './cozinhaCanto.ts';
import { FAMILIA_PANELEIRO, FAMILIA_TORRE_FORNO } from './cozinhaTorres.ts';

/* FICHA E7-cozinha: famílias autorais da biblioteca base para cozinha (ver IDS_OBRIGATORIOS em index.ts). */
export const COZINHA: Familia[] = [
  FAMILIA_BASE_GAVETAS,
  FAMILIA_BASE_PIA,
  FAMILIA_BASE_COOKTOP,
  FAMILIA_AEREO,
  FAMILIA_AEREO_BASCULANTE,
  FAMILIA_TORRE_FORNO,
  FAMILIA_PANELEIRO,
  FAMILIA_CANTO_L,
];
