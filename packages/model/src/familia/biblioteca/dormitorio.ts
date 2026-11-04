import type { Familia } from '../tipos.ts';
import { FAMILIA_CAMA_BAU } from './dormitorioCamaBau.ts';
import { FAMILIA_COMODA } from './dormitorioComoda.ts';
import { FAMILIA_CRIADO_MUDO } from './dormitorioCriadoMudo.ts';
import { FAMILIA_GUARDA_ROUPA_CONJUNTO, FAMILIA_GUARDA_ROUPA_MODULO } from './dormitorioGuardaRoupa.ts';
import { FAMILIA_PAINEL_TV } from './dormitorioPainelTv.ts';
import { comEscolhas } from './escolhas.ts';

/*
 * Grupo DORMITÓRIO da biblioteca base (FICHA E7-dormitorio): guarda-roupa (módulo e conjunto), cômoda, criado-mudo, cama com
 * baú e painel de TV. Cada família vive em seu arquivo de apoio com o prefixo `dormitorio`.
 */
export const DORMITORIO: Familia[] = [
  FAMILIA_GUARDA_ROUPA_MODULO,
  FAMILIA_GUARDA_ROUPA_CONJUNTO,
  FAMILIA_COMODA,
  FAMILIA_CRIADO_MUDO,
  FAMILIA_CAMA_BAU,
  FAMILIA_PAINEL_TV,
].map(comEscolhas);
