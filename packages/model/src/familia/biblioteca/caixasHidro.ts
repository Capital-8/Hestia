import type { Familia } from '../tipos.ts';
import { FAMILIA_CAIXA_CIRCULAR, FAMILIA_CAIXA_QUADRADA } from './caixasHidroInspecao.ts';
import { FAMILIA_CAIXA_GORDURA_DUPLA, FAMILIA_CAIXA_GORDURA_SIMPLES, FAMILIA_CAIXA_SIFONADA } from './caixasHidroGordura.ts';
import { FAMILIA_RALO_SECO, FAMILIA_RALO_SIFONADO } from './caixasHidroRalo.ts';

/*
 * Caixas e ralos hidrossanitários (ficha F3): seis famílias da categoria `reservatorio`. Exportadas aqui e registradas na
 * biblioteca MEP (`biblioteca/index.ts`), fora de BIBLIOTECA_BASE pelo mesmo motivo da F1.
 */

/** Caixas de inspeção, de gordura (simples, dupla e sifonada) e ralos (seco e sifonado), nesta ordem. */
export const CAIXAS_HIDRO: Familia[] = [
  FAMILIA_CAIXA_QUADRADA,
  FAMILIA_CAIXA_CIRCULAR,
  FAMILIA_CAIXA_GORDURA_SIMPLES,
  FAMILIA_CAIXA_GORDURA_DUPLA,
  FAMILIA_CAIXA_SIFONADA,
  FAMILIA_RALO_SECO,
  FAMILIA_RALO_SIFONADO,
];
