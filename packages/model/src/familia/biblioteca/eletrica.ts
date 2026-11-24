import type { Familia } from '../tipos.ts';
import { CAIXAS_ELETRICAS } from './eletricaCaixas.ts';
import { CALHAS } from './eletricaCalhas.ts';
import { DISPOSITIVOS_ELETRICOS } from './eletricaDispositivos.ts';
import { ELETRODUTOS } from './eletricaEletrodutos.ts';

/*
 * Elétrica (ficha F5): eletrodutos, eletrocalhas, caixas e dispositivos (tomada e interruptor). Exportada aqui e registrada na
 * biblioteca MEP (`biblioteca/index.ts`), fora de BIBLIOTECA_BASE pelo mesmo motivo da F1 e da F3.
 */

/** Famílias elétricas, na ordem: eletrodutos, eletrocalhas, caixas e dispositivos. */
export const ELETRICA: Familia[] = [...ELETRODUTOS, ...CALHAS, ...CAIXAS_ELETRICAS, ...DISPOSITIVOS_ELETRICOS];
